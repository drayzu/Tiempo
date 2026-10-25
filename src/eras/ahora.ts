import * as THREE from 'three';
import { clamp, smoothstep } from '../lib/math';
import { YEAR } from '../lib/cosmo';
import { materia, materiaBuilder, type MateriaData } from '../engine/materia';
import type { EraModule } from '../engine/eras';
import { ink, nota, rotulo, rotuloPot } from '../engine/placa';

/**
 * Ahora: the time zoom (the time counterpart of Potencias' dolly zoom), chosen in phase 0 as the
 * Earth entered through the tunnel of years. 1 unit = 1 000 km.
 *
 * Arriving at today, the clocks stop counting from the beginning and count back from now, in powers
 * of ten. The camera flies, first person, through a ring for every power of ten (the milestones on
 * their walls) towards the Earth: its continents settle into today's shape, the ice ages come and
 * go, its days blur into bands (a long exposure) and slow into one day. At now the Sun lights it as
 * it does at this very moment, the camera goes down to where you are, and our proton is in the water
 * of your body. Then the axis opens towards the future.
 */

const LOADED = typeof performance !== 'undefined' ? performance.now() : 0;
const NOW_MS = Date.now();
const nowYear = () => 1970 + (NOW_MS + ((typeof performance !== 'undefined' ? performance.now() : 0) - LOADED)) / 1000 / YEAR;
const R = 6.371;
const D2R = Math.PI / 180;
const LB0 = 9.66;
const LB1 = -7.6;

interface Hito {
  L: () => number;
  texto: string;
}
const ago = (y: number) => () => nowYear() - y;
const fixed = (L: number) => () => L;
/** Milestones, years before now (to verify, see ESTADO.md). */
const HITOS: Hito[] = [
  { L: fixed(4.54e9), texto: 'se forma la Tierra' },
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
  { L: () => Math.max(((typeof performance !== 'undefined' ? performance.now() : 0) - LOADED) / 1000 / YEAR, 2 / YEAR), texto: 'llegaste a esta página' },
];

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
  return { decl, lon: -15 * (utcH - 12), doy };
}

/**
 * The ice ages, roughly: sheets grow slowly (~90 000 years) and melt fast (~10 000) on a 100 000-year
 * beat for the last million years, 41 000 before, none before 2.6 million. A sketch, not data.
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

const dirOf = (latD: number, lonD: number, rot: number, out: THREE.Vector3) => {
  const la = latD * D2R;
  const lo = lonD * D2R + rot;
  return out.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
};

// At now: where you are and where the Sun is; the planet is turned so the camera (on +z) sees
// your side and the day side, three-quarters.
const HERE = dondeEstas();
const SOL = solAhora(NOW_MS);
const ROT_NOW = -(SOL.lon * D2R);
const SUN0 = dirOf(SOL.decl, 0, 0, new THREE.Vector3());
const LOC_NOW = dirOf(HERE.lat, HERE.lon, ROT_NOW, new THREE.Vector3());
const VIEW = LOC_NOW.clone().add(SUN0.clone().multiplyScalar(0.75)).normalize();
const TURN = new THREE.Quaternion().setFromUnitVectors(VIEW, new THREE.Vector3(0, 0, 1));
/** You, at now, in the era's units (on the surface). */
const YOU = LOC_NOW.clone().applyQuaternion(TURN).multiplyScalar(R * 1.004);

const EARTH_MOVE = /* glsl */ `
  // The surface turns under a fixed Sun; fast, its days blur into bands (a long exposure).
  float lon = aLL.y + uRot + (seed - 0.5) * 6.2832 * uBlur;
  float lat = aLL.x;
  // Further back, the continents were elsewhere: the whole surface drifts, gently and coherently
  // (whole multiples of the longitude: no seam; gentle: the surface never folds over itself).
  float dl = sin(aLL.x * 1.6 + aLL.y + 1.3) * cos(aLL.y * 2.0 - aLL.x * 1.1 + 0.4);
  float dp = cos(aLL.x * 1.3 - aLL.y * 2.0 + 0.8) * sin(aLL.y + 1.1);
  lon += uDrift * 0.3 * dl;
  lat = clamp(lat + uDrift * 0.18 * dp * cos(lat), -1.55, 1.55);
  vec3 n = vec3(cos(lat) * cos(lon), sin(lat), -cos(lat) * sin(lon));
  p = n * ${R.toFixed(3)} * (1.0 + aLand * 0.004);
  float iceN = aLand * step(radians(72.0 - 26.0 * uIce), aLL.x) * (1.0 - uDrift);
  float iceS = aLand * step(aLL.x, radians(-62.0)) * uAntarctic * (1.0 - uDrift);
  float seaIce = (1.0 - aLand) * step(radians(78.0 - 14.0 * uIce), abs(aLL.x)) * 0.7 * (1.0 - uDrift);
  em = mix(em, vec3(0.86, 0.9, 0.96) * 0.62, clamp(iceN + iceS + seaIce, 0.0, 1.0));
  em = mix(em, vec3(0.16, 0.26, 0.42), uDrift * 0.55);
  float ndl = dot(n, uSun);
  em *= 0.025 + 0.975 * smoothstep(-0.06, 0.28, ndl);
  // The far side is hidden by the planet itself.
  vec3 nV = normalize(normalMatrix * n);
  vec3 pV = (modelViewMatrix * vec4(p, 1.0)).xyz;
  em *= smoothstep(-0.02, 0.12, dot(nV, normalize(-pV)));
`;

/** The rings of the tunnel live in camera space: they pass over the camera, whatever it looks at. */
const RING_VERT = /* glsl */ `
  attribute float aAng, aPow, aMajor;
  uniform float uLb, uAlpha, uPx, uSP, uRad;
  varying float vA;
  void main() {
    float ahead = uLb - aPow;
    vec3 p = vec3(cos(aAng) * uRad, sin(aAng) * uRad * 0.82, -0.25 - ahead * uSP);
    gl_Position = projectionMatrix * vec4(p, 1.0);
    gl_PointSize = uPx * (aMajor > 0.5 ? 1.0 : 0.7) * clamp(2.0 / max(-p.z, 0.2), 0.6, 3.0);
    vA = uAlpha * smoothstep(-0.05, 0.5, ahead) * (1.0 - smoothstep(3.0, 5.0, ahead)) * (aMajor > 0.5 ? 0.85 : 0.35);
    if (vA < 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;
const RING_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    gl_FragColor = vec4(vec3(0.93, 0.91, 0.86) * exp(-dot(c, c) * 14.0) * vA, 1.0);
  }
`;
const SP = 1.6;
const RAD = 1.15;
const LOG_YEAR_S = Math.log10(YEAR);
/** The rings: powers of ten of years (10¹⁰ … 1), then of seconds (10⁷ s … 1 s); `lb` in log10 years. */
const RINGS: { lb: number; n: number; unit: 'años' | 's' }[] = [
  ...Array.from({ length: 11 }, (_, i) => ({ lb: 10 - i, n: 10 - i, unit: 'años' as const })),
  ...Array.from({ length: 8 }, (_, i) => ({ lb: 7 - i - LOG_YEAR_S, n: 7 - i, unit: 's' as const })),
];

export function ahora(): EraModule {
  return {
    spec: {
      id: 'ahora',
      acto: 'Nosotros',
      certeza: 'O',
      name: 'Ahora',
      fact: 'Cada gesto, diez veces menos tiempo: mil millones de años, un millón, mil, un año, un segundo.',
      label: 'ahora',
      unitExp: 6,
      frame: 19,
      anchor: new THREE.Vector3(1.496, 0, 0),
      frameCenter: new THREE.Vector3(),
      fade: [0.55, 0.5],
      tint: 0x8fb4ff,
      async generate() {
        // The land, from Natural Earth (via world-atlas), drawn into an equirectangular mask.
        const [topo, { feature }] = await Promise.all([import('world-atlas/land-50m.json'), import('topojson-client')]);
        const t = (topo as { default: unknown }).default as Parameters<typeof feature>[0];
        const land = feature(t, (t as unknown as { objects: { land: Parameters<typeof feature>[1] } }).objects.land) as unknown as GeoJSON.FeatureCollection | GeoJSON.Feature;
        const MW = 2048;
        const MH = 1024;
        const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(MW, MH) : Object.assign(document.createElement('canvas'), { width: MW, height: MH });
        const x = c.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
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
        const N = 220000;
        const b = materiaBuilder(601);
        const ll: number[] = [];
        const landA: number[] = [];
        const golden = Math.PI * (3 - Math.sqrt(5));
        const col = new THREE.Color();
        const desertC = new THREE.Color(0.72, 0.6, 0.4);
        const tundra = new THREE.Color(0.55, 0.52, 0.45);
        for (let i = 0; i < N; i++) {
          // Fibonacci, jittered within its cell so the lattice never shows as a pattern.
          const yv = clamp(1 - (2 * (i + 0.2 + 0.6 * b.r())) / N, -1, 1);
          const la = Math.asin(yv) / D2R;
          const lo = (((((i * golden) / D2R + (b.r() - 0.5) * 0.5) % 360) + 360) % 360) - 180;
          const L = isLand(la, lo);
          const al = Math.abs(la);
          if (L) {
            const desert = smoothstep(12, 20, al) * (1 - smoothstep(30, 38, al));
            col.setRGB(0.32, 0.42, 0.2).lerp(desertC, desert * 0.85);
            if (al > 60) col.lerp(tundra, smoothstep(60, 72, al));
            if (la < -62 || (la > 60 && lo > -75 && lo < -10)) col.setRGB(0.53, 0.56, 0.6);
          } else col.setRGB(0.05, 0.14, 0.32);
          b.push(0, 0, 0, col, 0.0085 * R, L ? 0.62 : 0.5);
          ll.push(la * D2R, lo * D2R);
          landA.push(L ? 1 : 0);
        }
        // Stars far behind.
        const sb = materiaBuilder(602);
        for (let k = 0; k < 2500; k++) {
          const [sx, sy, sz] = sb.onSphere();
          sb.push(sx * 900, sy * 900, sz * 900, 0xdfe6ff, 0.8, 0.25 + Math.pow(sb.r(), 6) * 2.5, { star: true });
        }
        // The tunnel's rings (camera space): one per power of ten (years down to one year, then
        // seconds, as the big clock counts), fainter ones at 2 and 5.
        const ang: number[] = [];
        const pw: number[] = [];
        const major: number[] = [];
        for (const v of RINGS)
          for (const m of [1, 2, 5]) {
            const N2 = m === 1 ? 700 : 260;
            for (let k = 0; k < N2; k++) {
              ang.push((k / N2) * Math.PI * 2);
              pw.push(v.lb + Math.log10(m));
              major.push(m === 1 ? 1 : 0);
            }
          }
        return { earth: b.data(), ll: new Float32Array(ll), land: new Float32Array(landA), stars: sb.data(), ang: new Float32Array(ang), pw: new Float32Array(pw), major: new Float32Array(major) };
      },
      assemble(data) {
        const uni = {
          uRot: { value: 0 },
          uBlur: { value: 0 },
          uDrift: { value: 0 },
          uIce: { value: 0 },
          uAntarctic: { value: 1 },
          uSun: { value: SUN0.clone() },
        };
        const earth = materia(data.earth as MateriaData, {
          pre: 'attribute vec2 aLL;\nattribute float aLand;\nuniform float uRot, uBlur, uDrift, uIce, uAntarctic;\nuniform vec3 uSun;',
          move: EARTH_MOVE,
          uniforms: uni,
          extra: { aLL: [data.ll as Float32Array, 2], aLand: [data.land as Float32Array, 1] },
        });
        const stars = materia(data.stars as MateriaData);
        const sunWorld = { value: new THREE.Vector3() };
        const atmo = new THREE.Mesh(
          new THREE.SphereGeometry(R * 1.025, 96, 64),
          new THREE.ShaderMaterial({
            uniforms: { uSun: sunWorld, uAlpha: { value: 1 } },
            vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
            fragmentShader: 'uniform vec3 uSun; uniform float uAlpha; varying vec3 vN; varying vec3 vV; void main(){ float rim = pow(1.0 - max(dot(vN, vV), 0.0), 3.0); float day = smoothstep(-0.25, 0.4, dot(vN, uSun)); gl_FragColor = vec4(vec3(0.35, 0.6, 1.0) * rim * day * 0.5 * uAlpha, 1.0); }',
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const planet = new THREE.Group();
        planet.quaternion.copy(TURN);
        planet.add(earth.points, atmo);

        const rgeo = new THREE.BufferGeometry();
        rgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((data.ang as Float32Array).length * 3), 3));
        rgeo.setAttribute('aAng', new THREE.BufferAttribute(data.ang as Float32Array, 1));
        rgeo.setAttribute('aPow', new THREE.BufferAttribute(data.pw as Float32Array, 1));
        rgeo.setAttribute('aMajor', new THREE.BufferAttribute(data.major as Float32Array, 1));
        const ru = { uLb: { value: LB0 }, uAlpha: { value: 0 }, uPx: { value: 3 }, uSP: { value: SP }, uRad: { value: RAD } };
        const rings = new THREE.Points(rgeo, new THREE.ShaderMaterial({ vertexShader: RING_VERT, fragmentShader: RING_FRAG, uniforms: ru, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
        rings.frustumCulled = false;

        const object = new THREE.Group();
        object.add(stars.points, planet, rings);
        let prevL = Math.pow(10, LB0);
        const st = { L: prevL, ice: 0, drift: 0, lb: LB0, reloj: 1, tunel: 0 };
        const you = new THREE.Vector3();
        const tmp = new THREE.Vector3();
        const q = new THREE.Quaternion();
        return {
          object,
          clouds: [earth, stars],
          update(f) {
            const reloj = Math.round(f.tl.get('reloj', f.p));
            const lb = f.tl.get('lb', f.p);
            const L = reloj === 1 ? Math.pow(10, lb) : reloj === 3 ? -Math.pow(10, f.tl.get('ah', f.p)) : 0;
            // How fast time runs on screen decides what blurs (days, seasons, ice ages).
            const rate = Math.abs(L - prevL) / Math.max(f.dt, 1e-3);
            prevL = L;
            const blur = smoothstep(0.4, 4, rate * 365.25);
            const fastIce = smoothstep(0.3, 3, rate / 100000);
            const ice = hielo(Math.max(L, 0)) * (1 - fastIce) + 0.4 * fastIce * (L > 11700 && L < 2.6e6 ? 1 : 0);
            const drift = reloj === 1 ? smoothstep(6.6, 8.9, lb) : 0;
            const frac = (((L * 365.2422) % 1) + 1) % 1;
            uni.uRot.value = ROT_NOW - 2 * Math.PI * frac;
            uni.uBlur.value = blur;
            uni.uDrift.value = drift;
            uni.uIce.value = ice;
            uni.uAntarctic.value = 1 - smoothstep(33e6, 35e6, L);
            const doy = SOL.doy - L * 365.2422;
            const decl = 23.44 * Math.sin(((2 * Math.PI) / 365.25) * (doy - 80)) * (1 - smoothstep(0.3, 3, rate));
            dirOf(decl, 0, 0, uni.uSun.value);
            planet.getWorldQuaternion(q);
            sunWorld.value.copy(uni.uSun.value).applyQuaternion(q);
            (atmo.material as THREE.ShaderMaterial).uniforms.uAlpha.value = f.alpha;
            const tunel = f.tl.get('ahora.tunel', f.p);
            ru.uLb.value = lb;
            ru.uAlpha.value = tunel * f.alpha;
            ru.uPx.value = 3.2 * f.dpr;
            // You, on the turning planet.
            dirOf(HERE.lat, HERE.lon, uni.uRot.value, you).applyQuaternion(TURN).multiplyScalar(R * 1.004);
            Object.assign(st, { L, ice, drift, lb, reloj, tunel });
          },
          proton: () => you,
          placa(g, f, on, toScreen) {
            const { u, W, H, camera } = f;
            const now = f.tl.get('reloj', f.p) > 1.5 && f.tl.get('reloj', f.p) < 2.5 ? 1 : 0;
            // The rings say their power of ten; the milestones sit on the walls, at their time.
            if (st.tunel > 0.01 && st.reloj === 1) {
              const proj = (x: number, y: number, z: number) => {
                const v = tmp.set(x, y, z).applyMatrix4(camera.projectionMatrix);
                return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
              };
              for (const v of RINGS) {
                const ahead = st.lb - v.lb;
                if (ahead < -0.05 || ahead > 4) continue;
                const top = proj(0, RAD * 0.82, -0.25 - ahead * SP);
                const a = smoothstep(-0.05, 0.4, ahead) * (1 - smoothstep(2.6, 4, ahead)) * st.tunel * f.alpha;
                rotuloPot(g, u, top.x, top.y - 12 * u, 'hace ', v.n, ` ${v.unit}`, 12, 0, a * 0.9);
              }
              HITOS.forEach((h, i) => {
                const ahead = st.lb - Math.log10(h.L());
                if (ahead < -0.05 || ahead > 2.8) return;
                const angle = (i % 2 ? 0.35 : Math.PI - 0.35) + ((i * 0.37) % 0.5) - 0.25;
                const P = proj(Math.cos(angle) * RAD, Math.sin(angle) * RAD * 0.82 * 0.6, -0.25 - ahead * SP);
                const a = smoothstep(-0.05, 0.3, ahead) * (1 - smoothstep(2.0, 2.8, ahead)) * st.tunel * f.alpha;
                nota(g, u, P.x, P.y, h.texto, i % 2 ? 30 : -30, -18, 0, a);
              });
              if (st.ice > 0.25 && st.lb > 3.9 && st.lb < 6.5) rotulo(g, u, W * 0.5, H * 0.1, 'edad de hielo', 9.5, 0, smoothstep(0.25, 0.6, st.ice) * 0.8 * f.alpha);
              if (st.drift > 0.3) rotulo(g, u, W * 0.5, H * 0.1, 'los continentes estaban en otro lugar', 9.5, 0, smoothstep(0.3, 0.7, st.drift) * 0.7 * f.alpha);
            }
            // At now: you, and the water our proton is in.
            const P = toScreen(you);
            if (P.z < 1) {
              const near = smoothstep(1.2, -1.5, st.lb) * f.alpha;
              if (now > 0 || st.reloj === 3) nota(g, u, P.x + 10 * u, P.y - 10 * u, `tú, ahora${HERE.lugar ? ' · ' + HERE.lugar : ''}`, 40, -34, 0, near);
              agua(g, u, P.x, P.y, now * f.alpha, 0, 1.4);
            }
            void on;
            void ink;
          },
        };
      },
    },
    choreo(tl, era) {
      // From the Sun's disk down to the young Earth; the clocks now count back from today.
      tl.with(0.02, { reloj: 1 });
      tl.set({ 'ahora.tunel': 0, 'ahora.cam': 0 });
      tl.to(3.4, { era: era.index, e: era.home + 0.35, lb: LB0 - 0.25, fov: 52, yaw: 0, pitch: 0, roll: 0, fondo: 1, horno: 0, 'ahora.tunel': 1, bloom: 0.45, umbral: 0.4 });
      tl.label('ahora');
      tl.caption(10.6, 'Hacia ahora', 'Cada gesto, diez veces menos tiempo: mil millones de años, un millón, mil, un año, un segundo.');
      tl.to(4.4, { lb: 3.0, e: era.home + 0.15 });
      tl.to(3.0, { lb: -2.6, e: era.home + 0.02 });
      tl.to(3.2, { lb: LB1, e: era.home });
      // Now: down to where you are.
      tl.with(0.02, { reloj: 2 });
      tl.caption(4.4, 'Este protón está en ti', 'Nació en la primera millonésima de segundo. Hoy es parte del agua de tu cuerpo.');
      tl.to(1.2, { 'ahora.tunel': 0, 'ahora.fx': YOU.x * 0.85, 'ahora.fy': YOU.y * 0.85, 'ahora.fz': YOU.z * 0.85, e: era.home - 0.36, fov: 46 });
      tl.wait(3.2);
      // And time goes on: the axis opens towards the future.
      tl.set({ ah: LB1 });
      tl.with(0.02, { reloj: 3 });
      tl.caption(3.2, 'Y el tiempo sigue', 'Desde aquí el eje se abre de nuevo, hacia el futuro.');
      tl.to(3.2, { ah: 0.3, 'ahora.fx': 0, 'ahora.fy': 0, 'ahora.fz': 0, e: era.home + 0.1, fov: 50, bloom: 0.7, umbral: 0.12 });
    },
  };
}

/** The water molecule our proton is in: a plate figure around it (it is one of the hydrogens). */
function agua(g: CanvasRenderingContext2D, u0: number, x: number, y: number, k: number, inkT = 0, scale = 1) {
  if (k <= 0.01) return;
  const u = u0 * scale;
  g.save();
  g.globalAlpha = k;
  const s = 46 * u;
  const half = (104.5 / 2) * D2R;
  const ox = x + Math.sin(half) * s;
  const oy = y + Math.cos(half) * s;
  const hx = ox + Math.sin(half) * s;
  const hy = oy - Math.cos(half) * s;
  g.strokeStyle = ink(inkT, 0.6);
  g.lineWidth = Math.max(1, u0);
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
  rotulo(g, u0, ox, oy + 28 * u, 'O', 10, inkT, 0.85);
  rotulo(g, u0, hx + 14 * u, hy, 'H', 10, inkT, 0.85);
  rotulo(g, u0, ox, oy - s * 0.55, '104,5°', 9, inkT, 0.6, false);
  g.restore();
}
