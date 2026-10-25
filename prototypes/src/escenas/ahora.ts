import * as THREE from 'three';
import { Timeline } from '../../../src/engine/timeline';
import { clamp, gauss, rng, smoothstep } from '../../../src/lib/math';
import { AGE, YEAR } from '../../../src/lib/cosmo';
import { enfocar, materia, materiaBuilder } from '../materia';
import { ACCENT, FONT, anios, calendario, ink, nota, proyectar, rotulo, rotuloPot } from '../placa';
import type { Escena, Frame, Instancia, Lectura } from '../tipos';
import type { Stage } from '../stage';

/**
 * «Ahora»: the time zoom, the time counterpart of Potencias' dolly zoom. Arriving at today, the axis
 * stops counting from the beginning and counts back from now, also in powers of ten: a billion
 * years ago, a million, ten thousand, a hundred, a year, a second… now (the visitor's own clock).
 * Then «este protón está en ti», and the axis opens again towards the future.
 *
 * Three versions of what is seen while it happens:
 * 1. Túnel: a ring at every power of ten passes over the camera (Potencias' desert), with the
 *    milestones on its walls; at the end of the tunnel, our proton.
 * 2. Tierra: our place is a planet. Going forward in time its continents settle into today's shape,
 *    the ice ages come and go, days blur into bands and slow into one day; at now, the Sun lights it
 *    as it does at this very moment, and you are marked on it.
 * 3. Regla: Sagan's calendar (linear: all of human history is a hair at the end) against the
 *    logarithmic ruler (where it takes half the page), drawn as a plate with a magnifier between them.
 */

const LOADED = performance.now();
const NOW_MS = Date.now();
/** The calendar year now, with its fraction. */
const nowYear = () => 1970 + (NOW_MS + (performance.now() - LOADED)) / 1000 / YEAR;

interface Hito {
  /** Years before now. */
  L: () => number;
  texto: string;
}
const ago = (y: number) => () => nowYear() - y;
const fixed = (L: number) => () => L;
const HITOS: Hito[] = [
  { L: fixed(2.4e9), texto: 'el aire se llena de oxígeno' },
  { L: fixed(1.0e9), texto: 'las primeras algas multicelulares' },
  { L: fixed(5.39e8), texto: 'la explosión del Cámbrico' },
  { L: fixed(3.75e8), texto: 'los primeros animales salen del agua' },
  { L: fixed(2.3e8), texto: 'los primeros dinosaurios' },
  { L: fixed(6.6e7), texto: 'el asteroide: fin de los dinosaurios' },
  { L: fixed(7e6), texto: 'los primeros homínidos' },
  { L: fixed(3.3e6), texto: 'las primeras herramientas de piedra' },
  { L: fixed(3.0e5), texto: 'Homo sapiens' },
  { L: fixed(2.1e4), texto: 'el último máximo glacial' },
  { L: fixed(1.17e4), texto: 'termina la glaciación; nace la agricultura' },
  { L: fixed(5.2e3), texto: 'la escritura' },
  { L: ago(1543.4), texto: 'Copérnico: la Tierra gira alrededor del Sol' },
  { L: ago(1929.2), texto: 'Hubble: el universo se expande' },
  { L: ago(1965.4), texto: 'se descubre la luz más antigua' },
  { L: ago(1969.55), texto: 'llegamos a la Luna' },
  { L: ago(2015.7), texto: 'se oyen ondas gravitacionales' },
  { L: fixed(1), texto: 'hace un año, hoy' },
  { L: fixed(1 / 365.25), texto: 'ayer a esta hora' },
  { L: fixed(1 / 365.25 / 24), texto: 'hace una hora' },
  { L: () => Math.max((performance.now() - LOADED) / 1000 / YEAR, 2 / YEAR), texto: 'llegaste a esta página' },
];

const LB0 = 9.4;
const LB1 = -7.6;

const ESTILOS = [
  { key: '1', nombre: 'Túnel', nota: 'Un anillo por cada potencia de diez pasa sobre la cámara, como el desierto de Potencias, con los hitos en sus paredes. Al fondo del túnel, nuestro protón.' },
  { key: '2', nombre: 'Tierra', nota: 'Nuestro lugar es un planeta: los continentes se asientan, las edades de hielo van y vienen, los días se vuelven bandas y luego un solo día. Al llegar, el Sol lo ilumina como ahora mismo.' },
  { key: '3', nombre: 'Regla', nota: 'Lámina: el calendario cósmico (lineal: la historia humana es un pelo al final) contra la regla logarítmica (donde ocupa la página), con una lupa entre ambas.' },
];

/** The time zoom's choreography, the same for the three versions. */
function coreografia() {
  const tl = new Timeline({ lb: LB0, now: 0, fut: 0, ah: LB1, cam: 0 });
  tl.set({ lb: LB0, now: 0, fut: 0, ah: LB1, cam: 0 });
  tl.caption(10.6, 'Hacia ahora', 'Cada gesto, diez veces menos tiempo: mil millones de años, un millón, mil, un año, un segundo.');
  tl.to(4.4, { lb: 3.0 });
  tl.to(3.0, { lb: -2.6 });
  tl.to(3.2, { lb: LB1 });
  tl.label('ahora');
  tl.caption(4.4, 'Este protón está en ti', 'Nació en la primera millonésima de segundo. Hoy es parte del agua de tu cuerpo.');
  tl.to(0.8, { now: 1, cam: 1 });
  tl.wait(3.6);
  tl.caption(3.2, 'Y el tiempo sigue', 'Desde aquí el eje se abre de nuevo, hacia el futuro.');
  tl.to(0.5, { now: 0, fut: 1, cam: 0.3 });
  tl.to(2.7, { ah: 1.5 });
  tl.wait(0.4);
  return tl;
}

function lectura(f: Frame): Lectura {
  const now = f.tl.get('now', f.p) > 0.5;
  const fut = f.tl.get('fut', f.p) > 0.5;
  if (now) return { t: AGE, ago: null, ahead: null, now: true };
  if (fut) return { t: AGE, ago: null, ahead: Math.pow(10, f.tl.get('ah', f.p)), now: false };
  const L = Math.pow(10, f.tl.get('lb', f.p));
  return { t: AGE - L * YEAR, ago: L, ahead: null, now: false };
}
const viaje = (f: Frame) => 0.6 + 0.02 * clamp((LB0 - f.tl.get('lb', f.p)) / (LB0 - LB1), 0, 1) + 0.006 * f.tl.get('fut', f.p);

/** The water molecule our proton is in: drawn as a plate figure around a point. */
function agua(g: CanvasRenderingContext2D, u0: number, x: number, y: number, k: number, inkT = 0, scale = 1) {
  if (k <= 0.01) return;
  const u = u0 * scale;
  g.save();
  g.globalAlpha = k;
  const s = 46 * u;
  const half = (104.5 / 2) * (Math.PI / 180);
  // Our proton is one of the hydrogens; the oxygen sits beside it.
  const ox = x + Math.sin(half) * s;
  const oy = y + Math.cos(half) * s;
  const hx = ox + Math.sin(half) * s;
  const hy = oy - Math.cos(half) * s;
  g.strokeStyle = ink(inkT, 0.6);
  g.lineWidth = Math.max(1, u);
  g.setLineDash([3 * u, 3 * u]);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(ox, oy);
  g.lineTo(hx, hy);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(255,74,74,0.9)';
  g.beginPath();
  g.arc(ox, oy, 15 * u, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = ink(inkT, 0.85);
  g.beginPath();
  g.arc(hx, hy, 6 * u, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = ink(inkT, 0.5);
  g.beginPath();
  g.arc(ox, oy, s * 0.42, -Math.PI / 2 - half, -Math.PI / 2 + half);
  g.stroke();
  rotulo(g, u, ox, oy + 28 * u, 'O', 10, inkT, 0.85);
  rotulo(g, u, hx + 14 * u, hy, 'H', 10, inkT, 0.85);
  rotulo(g, u, ox, oy - s * 0.55, '104,5°', 9, inkT, 0.6, false);
  g.restore();
}

/** The proton's own mark: a blue point with a ring. */
function proton(g: CanvasRenderingContext2D, u0: number, x: number, y: number, a = 1, scale = 1) {
  const u = u0 * scale;
  g.save();
  g.globalAlpha = a;
  g.shadowColor = ACCENT;
  g.shadowBlur = 16 * u;
  g.fillStyle = ACCENT;
  g.beginPath();
  g.arc(x, y, 5 * u, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = ACCENT;
  g.lineWidth = Math.max(1, u);
  g.beginPath();
  g.arc(x, y, 13 * u, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

/** «hace 10ⁿ años» for a power of ten (in years, or in words below a year). */
function powLabel(g: CanvasRenderingContext2D, u: number, x: number, y: number, n: number, fut: boolean, px: number, alpha: number, bare = false) {
  const pre = bare ? '' : fut ? 'dentro de ' : 'hace ';
  if (n >= 0) rotuloPot(g, u, x, y, pre, n, ' años', px, 0, alpha);
  else rotulo(g, u, x, y, `${pre}${anios(Math.pow(10, n), 1)}`, px, 0, alpha, false);
}

// ================================================================ 1 · Túnel

function tunel(stage: Stage): Instancia {
  const { root, camera } = stage;
  const SP = 3.2;
  const RAD = 2.3;
  const tl = coreografia();

  // Rings: one per power of ten (and fainter ones at 2 and 5), points of the plate's ink.
  const POW: number[] = [];
  for (let n = 10; n >= -9; n--) POW.push(n, n + Math.log10(5) - 1, n + Math.log10(2) - 1);
  const rb = materiaBuilder(501);
  POW.forEach((v, i) => {
    const major = Math.abs(v - Math.round(v)) < 1e-6;
    const N = major ? 900 : 360;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      rb.push(Math.cos(a) * RAD, Math.sin(a) * RAD, 0, major ? 0xece7db : 0x8f8a80, major ? 0.03 : 0.02, major ? 0.8 : 0.35, { kind: i });
    }
  });
  const rings = materia(rb.data(), {
    pre: 'uniform float uLb, uFut, uAh;\nuniform float uPow[60];',
    move: /* glsl */ `
      float v = uPow[int(aKind + 0.5)];
      // Back from now: the ring for 10^v sits (lb - v) steps ahead; forward: (v - ah) steps.
      float ahead = mix(uLb - v, v - uAh, uFut);
      p.z = -ahead * ${SP.toFixed(2)};
      float seen = smoothstep(-0.3, 0.6, ahead) * (1.0 - smoothstep(4.5, 6.5, ahead));
      em *= seen;
    `,
    uniforms: { uLb: { value: LB0 }, uFut: { value: 0 }, uAh: { value: LB1 }, uPow: { value: [...POW, ...new Array(60 - POW.length).fill(0)] } },
  });
  root.add(rings.points);

  // Dust streaming with the zoom (how fast time passes, made visible).
  const db = materiaBuilder(502);
  const r = db.r;
  for (let k = 0; k < 2600; k++) {
    const a = r() * Math.PI * 2;
    const rr = RAD * (0.25 + 0.95 * Math.sqrt(r()));
    db.push(Math.cos(a) * rr, Math.sin(a) * rr, -r() * SP * 6, 0x9fb4d8, 0.016, 0.55, { kind: r() });
  }
  const dust = materia(db.data(), {
    pre: 'uniform float uLb, uFut, uAh;',
    move: /* glsl */ `
      float flow = mix(uLb, -uAh, uFut) * ${SP.toFixed(2)};
      float L = ${(SP * 6).toFixed(2)};
      p.z = -mod(-position.z - flow, L);
      em *= smoothstep(0.0, 1.5, -p.z) * (1.0 - smoothstep(L - 4.0, L, -p.z));
    `,
    uniforms: { uLb: { value: LB0 }, uFut: { value: 0 }, uAh: { value: LB1 } },
  });
  root.add(dust.points);

  const tmp = new THREE.Vector3();
  const PROTON_Z = -5.5 * SP;
  return {
    tl,
    viaje,
    lectura,
    update(f) {
      const lb = f.tl.get('lb', f.p);
      const fut = f.tl.get('fut', f.p);
      const ah = f.tl.get('ah', f.p);
      const cam = f.tl.get('cam', f.p);
      for (const n of [rings, dust]) {
        enfocar(n, f.focal, f.dpr, f.time);
        n.u.uLb.value = lb;
        n.u.uFut.value = fut;
        n.u.uAh.value = ah;
      }
      // Arriving at now, the camera moves down the tunnel to our proton.
      const z = -cam * (Math.abs(PROTON_Z) - 2.6);
      camera.position.set(1.15 * (1 - cam), 0.7 * (1 - cam), z);
      camera.lookAt(0, 0, PROTON_Z - 4 * (1 - cam));
      camera.fov = 50;
      camera.updateProjectionMatrix();
    },
    placa(g, f) {
      const { u, W, H, camera: cam } = f;
      const lb = f.tl.get('lb', f.p);
      const fut = f.tl.get('fut', f.p);
      const ah = f.tl.get('ah', f.p);
      const now = f.tl.get('now', f.p);
      // Each major ring says its power, on top of it.
      for (let n = 10; n >= -9; n--) {
        const ahead = fut > 0.5 ? n - ah : lb - n;
        if (ahead < -0.2 || ahead > 5) continue;
        const z = -ahead * SP;
        if (z > camera.position.z - 0.5) continue;
        const top = proyectar(tmp.set(0, RAD, z), cam, W, H);
        const a = smoothstep(-0.2, 0.5, ahead) * (1 - smoothstep(3.2, 5, ahead)) * (1 - now);
        powLabel(g, u, top.x, top.y - 12 * u, n, fut > 0.5, 12.5, a * 0.9);
      }
      // Milestones on the walls, where their time is.
      if (fut < 0.5) {
        HITOS.forEach((h, i) => {
          const v = Math.log10(h.L());
          const ahead = lb - v;
          if (ahead < -0.1 || ahead > 3.4) return;
          const ang = (i % 2 ? 0.35 : Math.PI - 0.35) + ((i * 0.37) % 0.5) - 0.25;
          const z = -ahead * SP;
          if (z > camera.position.z - 0.5) return;
          const P = proyectar(tmp.set(Math.cos(ang) * RAD, Math.sin(ang) * RAD * 0.6, z), cam, W, H);
          const a = smoothstep(-0.1, 0.35, ahead) * (1 - smoothstep(2.4, 3.4, ahead)) * (1 - now);
          nota(g, u, P.x, P.y, `${h.texto}`, i % 2 ? 30 : -30, -18, 0, a);
        });
      }
      // At the end of the tunnel: our proton; at now, the water it is in.
      const pp = proyectar(tmp.set(0, 0, PROTON_Z), cam, W, H);
      // Arriving, the end of the tunnel comes close: our proton, and the water it is in.
      const big = 1 + 1.6 * now;
      proton(g, u, pp.x, pp.y, 0.5 + 0.5 * smoothstep(0, 1, 1 - lb / LB0), big);
      agua(g, u, pp.x, pp.y, now, 0, big);
    },
    dispose() {},
  };
}

// ================================================================ 2 · Tierra

/** Where the visitor probably is, from their time zone (no permission needed). */
function dondeEstas(): { lat: number; lon: number; lugar: string } {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  const known: Record<string, [number, number]> = {
    'America/Santiago': [-33.45, -70.67],
    'America/Argentina/Buenos_Aires': [-34.6, -58.38],
    'America/Buenos_Aires': [-34.6, -58.38],
    'America/Lima': [-12.05, -77.04],
    'America/Bogota': [4.71, -74.07],
    'America/Mexico_City': [19.43, -99.13],
    'America/Caracas': [10.48, -66.9],
    'America/Montevideo': [-34.9, -56.16],
    'America/Sao_Paulo': [-23.55, -46.63],
    'America/New_York': [40.71, -74.0],
    'America/Chicago': [41.88, -87.63],
    'America/Denver': [39.74, -104.99],
    'America/Los_Angeles': [34.05, -118.24],
    'Europe/Madrid': [40.42, -3.7],
    'Europe/London': [51.51, -0.13],
    'Europe/Paris': [48.86, 2.35],
    'Europe/Berlin': [52.52, 13.4],
    'Asia/Tokyo': [35.68, 139.69],
    'Australia/Sydney': [-33.87, 151.21],
  };
  const k = known[tz];
  if (k) return { lat: k[0], lon: k[1], lugar: tz.split('/').pop()!.replace(/_/g, ' ') };
  const off = -new Date().getTimezoneOffset() / 60;
  return { lat: tz.startsWith('America') ? 0 : tz.startsWith('Australia') ? -30 : 40, lon: off * 15, lugar: '' };
}

/** The Sun right now: declination and the longitude where it is overhead (degrees). */
function solAhora(ms: number) {
  const d = new Date(ms);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const doy = (ms - start) / 86400000;
  const decl = 23.44 * Math.sin(((2 * Math.PI) / 365.25) * (doy - 80));
  const utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const lon = -15 * (utcH - 12);
  return { decl, lon, doy };
}

/**
 * The ice ages, roughly: ice sheets grow slowly (about 90 000 years) and melt fast (about 10 000)
 * on a 100 000-year beat for the last million years, on 41 000 before, none before 2.6 million
 * years. 0 = today's ice, 1 = the last glacial maximum. A sketch to be checked, not data.
 */
function hielo(L: number) {
  if (L < 11700 || L > 2.6e6) return 0;
  const P = L < 1.2e6 ? 100000 : 41000;
  const amp = L < 1.2e6 ? 1 : 0.55;
  const x = (L - 11700) % P;
  const rise = P * 0.093;
  if (x < rise) return amp * (x / rise);
  if (x < P * 0.94) return amp * (1 - (x - rise) / (P * 0.94 - rise));
  return 0;
}

const EARTH_MOVE = /* glsl */ `
  // The surface turns under a fixed Sun; fast, its days blur into bands (a long exposure).
  float lon = aLL.y + uRot + (seed - 0.5) * 6.2832 * uBlur;
  float lat = aLL.x;
  // Further back, the continents were elsewhere: the whole surface drifts, coherently.
  // (whole multiples of the longitude, so the field has no seam at the antimeridian)
  float dl = sin(aLL.x * 1.6 + aLL.y + 1.3) * cos(aLL.y * 2.0 - aLL.x * 1.1 + 0.4);
  float dp = cos(aLL.x * 1.3 - aLL.y * 2.0 + 0.8) * sin(aLL.y + 1.1);
  // (gentle enough that the surface never folds over itself: folds pile points into bright arcs)
  lon += uDrift * 0.3 * dl;
  lat = clamp(lat + uDrift * 0.18 * dp * cos(lat), -1.55, 1.55);
  vec3 n = vec3(cos(lat) * cos(lon), sin(lat), -cos(lat) * sin(lon));
  p = n * (1.0 + aLand * 0.004);
  // Ice: the northern sheets reach down to ~46° at the glacial maximum; Antarctica since 34 Myr.
  float iceN = aLand * step(radians(72.0 - 26.0 * uIce), aLL.x) * (1.0 - uDrift);
  float iceS = aLand * step(aLL.x, radians(-62.0)) * uAntarctic * (1.0 - uDrift);
  float seaIce = (1.0 - aLand) * step(radians(78.0 - 14.0 * uIce), abs(aLL.x)) * 0.7 * (1.0 - uDrift);
  em = mix(em, vec3(0.86, 0.9, 0.96) * 0.62, clamp(iceN + iceS + seaIce, 0.0, 1.0));
  // Continents that are no longer where they are now blur into a common colour.
  em = mix(em, vec3(0.16, 0.26, 0.42), uDrift * 0.55);
  // Sunlight, with a soft terminator; a faint earthshine on the night side.
  float ndl = dot(n, uSun);
  em *= 0.025 + 0.975 * smoothstep(-0.06, 0.28, ndl);
  // Facing away from the camera: hidden by the planet itself.
  vec3 toCam = normalize(cameraPosition - p);
  float facing = dot(n, toCam);
  em *= smoothstep(-0.02, 0.12, facing);
`;

function tierra(stage: Stage): Instancia {
  const { root, camera } = stage;
  const tl = coreografia();
  stage.bloom.threshold = 0.4;
  stage.bloom.strength = 0.45;
  const here = dondeEstas();
  const sol = solAhora(NOW_MS);
  const D2R = Math.PI / 180;
  const sunDir = new THREE.Vector3(1, 0, 0);
  const uni = {
    uRot: { value: 0 },
    uBlur: { value: 0 },
    uDrift: { value: 0 },
    uIce: { value: 0 },
    uAntarctic: { value: 1 },
    uSun: { value: sunDir },
  };
  let earth: ReturnType<typeof materia> | null = null;
  let atmo: THREE.Mesh | null = null;

  // The land, from Natural Earth (via world-atlas), drawn into an equirectangular mask.
  void (async () => {
    const [topo, { feature }] = await Promise.all([import('world-atlas/land-50m.json'), import('topojson-client')]);
    const t = (topo as { default: unknown }).default as Parameters<typeof feature>[0];
    const land = feature(t, (t as unknown as { objects: { land: Parameters<typeof feature>[1] } }).objects.land) as unknown as GeoJSON.FeatureCollection | GeoJSON.Feature;
    const MW = 2048;
    const MH = 1024;
    const c = document.createElement('canvas');
    c.width = MW;
    c.height = MH;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.fillStyle = '#000';
    x.fillRect(0, 0, MW, MH);
    x.fillStyle = '#fff';
    const feats = 'features' in land ? land.features : [land];
    for (const ft of feats) {
      const geo = ft.geometry;
      const polys = geo.type === 'MultiPolygon' ? geo.coordinates : geo.type === 'Polygon' ? [geo.coordinates] : [];
      for (const poly of polys) {
        x.beginPath();
        for (const ring of poly) {
          ring.forEach(([lo, la], i) => {
            const px = ((lo + 180) / 360) * MW;
            const py = ((90 - la) / 180) * MH;
            if (i === 0) x.moveTo(px, py);
            else x.lineTo(px, py);
          });
          x.closePath();
        }
        x.fill('evenodd');
      }
    }
    const mask = x.getImageData(0, 0, MW, MH).data;
    const isLand = (la: number, lo: number) => {
      const px = Math.min(MW - 1, Math.max(0, Math.floor(((lo + 180) / 360) * MW)));
      const py = Math.min(MH - 1, Math.max(0, Math.floor(((90 - la) / 180) * MH)));
      return mask[(py * MW + px) * 4] > 127;
    };
    // Points evenly over the sphere (Fibonacci), coloured by what is there.
    const N = 220000;
    const b = materiaBuilder(601);
    const ll: number[] = [];
    const landA: number[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      // (jittered within its cell, so the lattice never shows as a pattern)
      const yv = clamp(1 - (2 * (i + 0.2 + 0.6 * b.r())) / N, -1, 1);
      const la = Math.asin(yv) / D2R;
      const lo = (((((i * golden) / D2R + (b.r() - 0.5) * 0.5) % 360) + 360) % 360) - 180;
      const L = isLand(la, lo);
      const al = Math.abs(la);
      if (L) {
        // Deserts in the subtropics, green elsewhere, tundra and ice towards the poles.
        const desert = smoothstep(12, 20, al) * (1 - smoothstep(30, 38, al));
        col.setRGB(0.32, 0.42, 0.2).lerp(new THREE.Color(0.72, 0.6, 0.4), desert * 0.85);
        if (al > 60) col.lerp(new THREE.Color(0.55, 0.52, 0.45), smoothstep(60, 72, al));
        if (la < -62 || (la > 60 && lo > -75 && lo < -10)) col.setRGB(0.53, 0.56, 0.6);
      } else col.setRGB(0.05, 0.14, 0.32);
      b.push(0, 0, 0, col, 0.0085, L ? 0.62 : 0.5);
      ll.push(la * D2R, lo * D2R);
      landA.push(L ? 1 : 0);
    }
    earth = materia(b.data(), {
      pre: 'attribute vec2 aLL;\nattribute float aLand;\nuniform float uRot, uBlur, uDrift, uIce, uAntarctic;\nuniform vec3 uSun;',
      move: EARTH_MOVE,
      uniforms: uni,
      extra: { aLL: [new Float32Array(ll), 2], aLand: [new Float32Array(landA), 1] },
    });
    root.add(earth.points);
    // A thin blue limb (the atmosphere), lit on the day side.
    atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.025, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: { uSun: { value: sunDir } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: 'uniform vec3 uSun; varying vec3 vN; varying vec3 vV; void main(){ float rim = pow(1.0 - max(dot(vN, vV), 0.0), 3.0); float day = smoothstep(-0.25, 0.4, dot(vN, uSun)); gl_FragColor = vec4(vec3(0.35, 0.6, 1.0) * rim * day * 0.9, 1.0); }',
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    root.add(atmo);
  })();

  // Stars far behind (fixed: the camera does not turn).
  const sb = materiaBuilder(602);
  for (let k = 0; k < 2500; k++) {
    const [x, y, z] = sb.onSphere();
    sb.push(x * 80, y * 80, z * 80, 0xdfe6ff, 0.12, 0.25 + Math.pow(sb.r(), 6) * 2.5);
  }
  const stars = materia(sb.data());
  root.add(stars.points);

  // Where the camera looks from: a three-quarter view of your side and the day side, at now.
  const rotNow = -(sol.lon * D2R);
  const locNow = new THREE.Vector3();
  const dirOf = (latD: number, lonD: number, rot: number, out: THREE.Vector3) => {
    const la = latD * D2R;
    const lo = lonD * D2R + rot;
    return out.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
  };
  sunDir.copy(dirOf(sol.decl, 0, 0, new THREE.Vector3()));
  dirOf(here.lat, here.lon, rotNow, locNow);
  const viewDir = locNow.clone().multiplyScalar(1).add(sunDir.clone().multiplyScalar(0.75)).normalize();

  let prevL = Math.pow(10, LB0);
  let st = { L: prevL, ice: 0, drift: 0, blur: 0, now: 0 };
  const tmp = new THREE.Vector3();
  const loc = new THREE.Vector3();
  return {
    tl,
    viaje,
    lectura,
    update(f) {
      const lb = f.tl.get('lb', f.p);
      const now = f.tl.get('now', f.p);
      const fut = f.tl.get('fut', f.p);
      const cam = f.tl.get('cam', f.p);
      const L = fut > 0.5 ? -Math.pow(10, f.tl.get('ah', f.p)) : Math.pow(10, lb);
      // How fast time runs on screen decides what blurs (days, seasons, ice ages).
      const rate = Math.abs(L - prevL) / Math.max(f.dt, 1e-3);
      prevL = L;
      const daysPerSec = rate * 365.25;
      const blur = smoothstep(0.4, 4, daysPerSec);
      const iceRate = rate / 100000;
      const ice = hielo(Math.max(L, 0)) * (1 - smoothstep(0.3, 3, iceRate)) + 0.4 * smoothstep(0.3, 3, iceRate) * (L > 11700 && L < 2.6e6 ? 1 : 0);
      const drift = smoothstep(6.6, 8.9, lb) * (fut > 0.5 ? 0 : 1);
      const frac = (((L * 365.2422) % 1) + 1) % 1;
      uni.uRot.value = rotNow - 2 * Math.PI * frac;
      uni.uBlur.value = blur;
      uni.uDrift.value = drift;
      uni.uIce.value = ice;
      uni.uAntarctic.value = 1 - smoothstep(33e6, 35e6, L);
      // Seasons: the Sun's height swings over a year; fast, it averages out.
      const doy = sol.doy - L * 365.2422;
      const decl = 23.44 * Math.sin(((2 * Math.PI) / 365.25) * (doy - 80)) * (1 - smoothstep(0.3, 3, rate));
      sunDir.copy(dirOf(decl, 0, 0, tmp));

      const dist = 3.3 - 0.75 * cam;
      camera.position.copy(viewDir).multiplyScalar(dist);
      // At now the frame leans towards you.
      dirOf(here.lat, here.lon, uni.uRot.value, loc);
      camera.up.set(0, 1, 0);
      camera.lookAt(tmp.copy(loc).multiplyScalar(0.2 * cam));
      camera.fov = 40;
      camera.updateProjectionMatrix();
      if (earth) enfocar(earth, f.focal, f.dpr, f.time);
      enfocar(stars, f.focal, f.dpr, f.time);
      st = { L, ice, drift, blur, now };
    },
    placa(g, f) {
      const { u, W, H, camera: cam } = f;
      const now = f.tl.get('now', f.p);
      const lb = f.tl.get('lb', f.p);
      const fut = f.tl.get('fut', f.p);
      // You, on the planet (only on the side facing us).
      const facing = loc.dot(tmp.copy(cam.position).normalize());
      const P = proyectar(loc, cam, W, H);
      const near = smoothstep(1.2, -1.5, lb) * smoothstep(0.05, 0.25, facing);
      if (near > 0.01) {
        proton(g, u, P.x, P.y, near);
        nota(g, u, P.x + 10 * u, P.y - 10 * u, now > 0.5 ? `tú, ahora${here.lugar ? ' · ' + here.lugar : ''}` : 'aquí', 40, -34, 0, near);
      }
      agua(g, u, P.x, P.y, now * smoothstep(0.05, 0.25, facing));
      // The milestone of this moment, written beside the planet.
      if (fut < 0.5) {
        let best: Hito | null = null;
        let bd = 0.45;
        for (const h of HITOS) {
          const d = Math.abs(Math.log10(h.L()) - lb);
          if (d < bd) {
            bd = d;
            best = h;
          }
        }
        if (best) rotulo(g, u, W * 0.5, H * 0.115, `hace ${anios(best.L(), 2)} · ${best.texto}`, 11, 0, (1 - bd / 0.45) * (1 - now), false);
        if (st.ice > 0.25 && lb > 3.9 && lb < 6.5) rotulo(g, u, W * 0.5, H * 0.115 + 20 * u, 'edad de hielo', 9.5, 0, smoothstep(0.25, 0.6, st.ice) * 0.8);
        if (st.drift > 0.3) rotulo(g, u, W * 0.5, H * 0.115 + 20 * u, 'los continentes estaban en otro lugar', 9.5, 0, smoothstep(0.3, 0.7, st.drift) * 0.7);
      }
    },
    dispose() {},
  };
}

// ================================================================ 3 · Regla

function regla(stage: Stage): Instancia {
  const tl = coreografia();
  stage.bloom.strength = 0.3;
  // A faint field of matter behind the plate (the universe is still there).
  const b = materiaBuilder(701);
  const r = rng(702);
  for (let k = 0; k < 2500; k++) b.push((r() * 2 - 1) * 14, (r() * 2 - 1) * 8, -6 - r() * 20, 0xcfd6e8, 0.03, 0.12 + Math.pow(r(), 8) * 1.4);
  const field = materia(b.data());
  stage.root.add(field.points);
  void gauss;

  const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const CAL: [number, string][] = [
    [13.787e9, 'el inicio'],
    [13.4e9, 'primeras galaxias'],
    [4.6e9, 'el Sol'],
    [3.8e9, 'la vida'],
    [5.39e8, 'el Cámbrico'],
    [6.6e7, 'el asteroide'],
  ];
  return {
    tl,
    viaje,
    lectura,
    update(f) {
      enfocar(field, f.focal, f.dpr, f.time);
      stage.camera.position.set(0, 0, 0);
      stage.camera.lookAt(0, 0, -1);
    },
    placa(g, f) {
      const { u, W, H } = f;
      const lb = f.tl.get('lb', f.p);
      const now = f.tl.get('now', f.p);
      const fut = f.tl.get('fut', f.p);
      const ah = f.tl.get('ah', f.p);
      const x0 = 0.1 * W;
      const x1 = W - 190 * u;
      const yA = 0.24 * H;
      const yB = 0.5 * H;
      const span = x1 - x0;
      g.save();
      g.lineWidth = Math.max(1, u);

      // ---- the cosmic calendar: linear, the whole history in one year
      g.strokeStyle = ink(0, 0.75);
      g.beginPath();
      g.moveTo(x0, yA);
      g.lineTo(x1, yA);
      g.stroke();
      for (let m = 0; m <= 12; m++) {
        const x = x0 + (span * m) / 12;
        g.beginPath();
        g.moveTo(x, yA - 5 * u);
        g.lineTo(x, yA + 5 * u);
        g.stroke();
        if (m < 12) rotulo(g, u, x + span / 24, yA + 16 * u, MESES[m], 9, 0, 0.55);
      }
      rotulo(g, u, x0 + span / 2, yA - 34 * u, 'el calendario cósmico: toda la historia en un año', 10, 0, 0.75);
      CAL.forEach(([L, t], i) => {
        const x = x0 + span * (1 - L / 13.787e9);
        g.fillStyle = ink(0, 0.8);
        g.beginPath();
        g.arc(x, yA, 2.4 * u, 0, Math.PI * 2);
        g.fill();
        rotulo(g, u, x, yA - (i % 2 ? 24 : 12) * u, t, 8.5, 0, 0.65, false);
      });
      // The magnifier: the stretch of the calendar the lower ruler shows (from 10^(lb+2) years ago
      // to now), and lines down to it. It narrows to less than a hair.
      const shownL = Math.pow(10, lb + 2.2);
      const wx = x0 + span * (1 - Math.min(shownL, 13.787e9) / 13.787e9);
      const lupa = 1 - now;
      g.save();
      g.globalAlpha = lupa;
      g.strokeStyle = ACCENT;
      g.fillStyle = 'rgba(143,180,255,0.18)';
      g.fillRect(wx, yA - 8 * u, Math.max(x1 - wx, 1), 16 * u);
      g.beginPath();
      g.moveTo(wx, yA + 8 * u);
      g.lineTo(x0, yB - 34 * u);
      g.moveTo(x1, yA + 8 * u);
      g.lineTo(x1, yB - 34 * u);
      g.setLineDash([3 * u, 4 * u]);
      g.stroke();
      g.setLineDash([]);
      const widthPx = (span * shownL) / 13.787e9;
      const wtxt =
        widthPx >= 1 ? `${Math.round(widthPx)} px` : widthPx > 1e-3 ? `${widthPx.toFixed(3).replace('.', ',')} px` : widthPx > 1e-6 ? `${Math.round(widthPx * 1e6)} millonésimas de píxel` : 'menos de una millonésima de píxel';
      rotulo(g, u, Math.min(wx, x1 - 60 * u) - 4 * u, yA + 28 * u, `esta lupa: ${wtxt} del calendario`, 8.5, 0, 0.75, false, ACCENT);
      g.restore();

      // ---- the logarithmic ruler: powers of ten back from now, flowing as time comes closer
      const DEC = span / 5.2;
      const xOf = (v: number) => x0 + span * 0.55 - (v - lb) * DEC;
      g.strokeStyle = ink(0, 0.75);
      g.beginPath();
      g.moveTo(x0, yB);
      g.lineTo(x1, yB);
      g.stroke();
      const showB = 1 - now;
      g.save();
      g.globalAlpha = showB * (1 - fut);
      g.beginPath();
      g.rect(x0 - 2 * u, yB - 160 * u, span + 4 * u, 320 * u);
      g.clip();
      for (let n = 11; n >= -10; n--) {
        for (const m of [1, 2, 5]) {
          const v = n + Math.log10(m);
          const x = xOf(v);
          if (x < x0 - 10 || x > x1 + 10) continue;
          const major = m === 1;
          g.strokeStyle = ink(0, major ? 0.8 : 0.35);
          g.beginPath();
          g.moveTo(x, yB - (major ? 7 : 4) * u);
          g.lineTo(x, yB + (major ? 7 : 4) * u);
          g.stroke();
          if (major) powLabel(g, u, x, yB + 20 * u, n, false, 9.5, 0.7, true);
        }
      }
      // Milestones above, alternating heights so they never collide.
      HITOS.forEach((h, i) => {
        const v = Math.log10(h.L());
        const x = xOf(v);
        if (x < x0 || x > x1) return;
        const lift = (30 + (i % 4) * 19) * u;
        g.strokeStyle = ink(0, 0.35);
        g.beginPath();
        g.moveTo(x, yB - 4 * u);
        g.lineTo(x, yB - lift + 6 * u);
        g.stroke();
        g.fillStyle = ink(0, 0.9);
        g.beginPath();
        g.arc(x, yB, 2.6 * u, 0, Math.PI * 2);
        g.fill();
        rotulo(g, u, x, yB - lift, h.texto, 9, 0, 0.85, false);
      });
      g.restore();
      // The end of the ruler is now (a logarithmic ruler never reaches it: it is always beyond).
      g.fillStyle = ink(0, 0.85);
      g.beginPath();
      g.moveTo(x1 + 10 * u, yB);
      g.lineTo(x1, yB - 5 * u);
      g.lineTo(x1, yB + 5 * u);
      g.closePath();
      g.fill();
      rotulo(g, u, x1 + 34 * u, yB, 'ahora', 10, 0, 0.85);
      rotulo(g, u, x0 + span / 2, yB + 52 * u, fut > 0.5 ? 'la regla logarítmica, hacia el futuro' : 'la regla logarítmica: cada marca, diez veces más cerca de ahora', 10, 0, 0.75 * (1 - now));
      // You are here: our proton on the ruler.
      const px = fut > 0.5 ? x0 + span * 0.55 : xOf(lb);
      if (now < 0.5) proton(g, u, px, yB, 1);
      if (fut > 0.5) {
        for (let n = -7; n <= 3; n++) {
          const x = x0 + span * 0.55 + (n - ah) * DEC;
          if (x < x0 || x > x1) continue;
          g.strokeStyle = ink(0, 0.6);
          g.beginPath();
          g.moveTo(x, yB - 6 * u);
          g.lineTo(x, yB + 6 * u);
          g.stroke();
          powLabel(g, u, x, yB + 20 * u, n, true, 9.5, 0.7, true);
        }
      }
      // Now: the calendar's last instant, the water you are made of.
      if (now > 0.01) {
        rotulo(g, u, x1, yA + 46 * u, `${calendario(AGE)} · aquí estás`, 10, 0, now, false, ACCENT);
        proton(g, u, W * 0.5, yB, now);
        agua(g, u, W * 0.5, yB, now);
      }
      g.restore();
      void FONT;
    },
    dispose() {},
  };
}

export const ahora: Escena = {
  id: 'ahora',
  nombre: 'Ahora',
  estilos: ESTILOS,
  montar(stage, estilo) {
    return estilo === 0 ? tunel(stage) : estilo === 1 ? tierra(stage) : regla(stage);
  },
};
