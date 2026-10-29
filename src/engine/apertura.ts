import * as THREE from 'three';
import { smoothstep } from '../lib/math';
import { AGE, YEAR } from '../lib/cosmo';
import type { Timeline } from './timeline';
import { ACCENT } from './protagonista';
import { rotulo } from './placa';
import { HITOS, type Hito } from '../eras/ahora';

/**
 * The opening (GUION.md 1–4). Black, and a teal point that breathes: you, the same point and colour
 * as Infinito's «tú», while the clock counts how long ago you arrived. «Llegaste aquí hace un
 * momento.» Out of you comes a blue point, your proton (the journey's thread), and the clock runs
 * backwards: the milestones of «Ahora» pass in reverse over it. Past the Sun and the Earth the clock
 * counts from the beginning towards zero, and the sky lights up around the proton as the universe
 * did, in reverse: dark red, orange, yellow, the white of the Horno, where the proton melts away
 * (before a hundred-thousandth of a second there are no protons). Only then the title; and the light
 * goes out (before the fire, inflation was cold and dark) into the cover, «t = ?».
 *
 * Tracks: `velo` (1 hides every era), `titulo` (0 → 1 the title comes, 1 → 2 it goes), `cromo` (the
 * brand, the cone, the plate), `ap.tu` (you), `ap.sale` (the proton steps out of you), `ap.queda`
 * (you stay behind), `ap.proton` (the proton), `ap.hitos` (the milestones).
 */

/** Infinito's «tú» (infinito/estudios/comun.ts, TU). */
const TU = new THREE.Color(0.45, 1.0, 0.85);

/** log10 of the years in `s` seconds. */
const LB = (s: number) => Math.log10(s / YEAR);
/** log10 of the seconds since the beginning, `years` before now. */
const LT_HACE = (years: number) => Math.log10(AGE - years * YEAR);

/** The milestones that pass on the way back (a few of «Ahora»'s, and the Sun with the Earth: 27 million years apart, one blur at this pace). */
const PASAN = ['llegaste a esta página', 'hace una hora', 'ayer a esta hora', 'hace un año, hoy', 'llegamos a la Luna', 'la escritura', 'Homo sapiens', 'los primeros dinosaurios'];
const HITOS_ATRAS: Hito[] = [...HITOS.filter((h) => PASAN.includes(h.texto)), { L: () => 4.55e9, texto: 'nacen el Sol y la Tierra' }];

/** The opening's part of the journey, before the first era. Returns the beat where it ends. */
export function aperturaChoreo(tl: Timeline) {
  tl.set({ reloj: 5, lb: LB(2), lt: LT_HACE(4.79e9), fondo: 0, horno: 0, velo: 1, titulo: 0, cromo: 0, 'ap.tu': 1, 'ap.sale': 0, 'ap.queda': 0, 'ap.proton': 0, 'ap.hitos': 0, yaw: 0, pitch: 0, roll: 0, fov: 50 });
  tl.label('apertura');
  // 1. You, now; the clock counts since you arrived.
  tl.caption(2.8, 'Llegaste', 'Llegaste aquí hace un momento.');
  tl.wait(2.8);
  // 2. Out of you, your proton. You stay behind; the clock runs back over the milestones.
  tl.caption(4.8, 'Más viejo que tú', 'En una gota de agua de tu cuerpo hay un protón. Es mucho más viejo que tú.');
  tl.with(1.2, { 'ap.proton': 1, 'ap.sale': 1 });
  tl.wait(1.0);
  // (a step: a longer blend from 5 to 1 would pass through the other clocks)
  tl.with(0.001, { reloj: 1 });
  tl.with(1.8, { 'ap.queda': 1, 'ap.tu': 0 });
  tl.with(0.6, { 'ap.hitos': 1 });
  // (each milestone a key: the clock flows through them)
  tl.to(0.8, { lb: LB(3600) });
  tl.to(0.6, { lb: LB(86400) });
  tl.to(0.6, { lb: 0 });
  tl.to(0.6, { lb: Math.log10(57) });
  tl.to(0.7, { lb: Math.log10(5200) });
  tl.to(0.6, { lb: Math.log10(3e5) });
  // 3. Older than the Earth and the Sun: from here the clock counts from the beginning, towards zero,
  // and the sky is the temperature of the universe again, running backwards.
  tl.caption(5.2, 'Hacia atrás', 'Más viejo que la Tierra y que el Sol. Vamos a buscar dónde empezó.');
  tl.to(0.7, { lb: Math.log10(2.3e8) });
  tl.to(0.9, { lb: Math.log10(4.55e9) });
  tl.with(0.6, { 'ap.hitos': 0 });
  tl.to(0.4, { lb: Math.log10(4.79e9) });
  tl.with(0.02, { reloj: 0 });
  tl.with(0.5, { fondo: 1 });
  tl.to(1.1, { lt: 14.3 });
  tl.with(1.6, { horno: 1 });
  tl.to(0.9, { lt: 13.1 });
  tl.to(0.9, { lt: 11.5 });
  // 4. The fire: the screen is white light and the proton melts into it. Only then the title.
  tl.with(1.0, { 'ap.proton': 0 });
  tl.to(0.8, { lt: 9 });
  tl.with(1.4, { titulo: 1 });
  tl.to(1.0, { lt: 6 });
  tl.to(1.6, { lt: 2 });
  // Before the fire, inflation was cold and dark: the light goes out, and the chrome comes in.
  tl.with(1.6, { fondo: 0, horno: 0 });
  tl.to(0.6, { lt: 0 });
  tl.with(1.2, { cromo: 1 });
  tl.to(0.6, { lt: -2 });
  // The clock runs down to the Planck time; the cover takes over with «t = ?» (the first era sets
  // its clock right here: hold this one until then, or the step would turn into a blend).
  tl.with(1.4, { titulo: 2 });
  tl.with(1.4, { velo: 0 });
  tl.with(1.399, { reloj: 0 });
  tl.to(1.4, { lt: -43.5 });
  tl.label('apertura-fin');
  return tl.length;
}

const VERT = /* glsl */ `
  uniform float uPx;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uPx;
  }
`;
/** The protagonist's point (protagonista.ts): a core and a soft halo, with a dark core over bright light. */
const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha, uInk;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c);
    float core = exp(-d2 * 90.0);
    float halo = exp(-d2 * 14.0) * 0.35;
    float f = (core + halo) * uAlpha;
    gl_FragColor = vec4(uColor * f, core * uInk * uAlpha);
  }
`;

function punto(color: THREE.Color) {
  const u = { uPx: { value: 16 }, uColor: { value: color }, uAlpha: { value: 0 }, uInk: { value: 0 } };
  const points = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)),
    new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: u,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    }),
  );
  points.frustumCulled = false;
  points.renderOrder = 60;
  return { points, u };
}

export function createApertura(scene: THREE.Scene) {
  const group = new THREE.Group();
  scene.add(group);
  const tu = punto(TU.clone().multiplyScalar(1.8));
  const proton = punto(new THREE.Color(ACCENT).multiplyScalar(2.2));
  group.add(tu.points, proton.points);
  const at = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  return {
    /**
     * Per frame. `time` in seconds (0 when the visitor asks for less motion: the point holds its
     * breath); `ink` (0..1) gives the proton a dark core over bright light.
     */
    update(tl: Timeline, p: number, time: number, dpr: number, ink: number) {
      const aTu = tl.get('ap.tu', p);
      const aPr = tl.get('ap.proton', p);
      group.visible = aTu > 0.002 || aPr > 0.002;
      if (!group.visible) return;
      const sale = tl.get('ap.sale', p);
      const queda = tl.get('ap.queda', p);
      // You breathe, as in Infinito. The proton steps out above you; you fall behind, and it comes
      // back to the centre (the camera follows it now).
      const respira = 0.86 + 0.14 * Math.sin(time * 1.5);
      tu.points.position.set(0, -0.035 * sale - 0.24 * smoothstep(0, 1, queda), 0);
      tu.u.uAlpha.value = aTu * respira;
      tu.u.uPx.value = 22 * dpr * (0.97 + 0.03 * respira);
      proton.points.position.set(0, 0.05 * smoothstep(0, 1, sale) * (1 - smoothstep(0, 1, queda)), 0);
      proton.u.uAlpha.value = aPr;
      proton.u.uInk.value = ink;
      proton.u.uPx.value = 15 * dpr;
    },
    /** Where the proton is on screen (device px), for the milestones above it. */
    protonEn(camera: THREE.Camera, W: number, H: number) {
      tmp.copy(proton.points.position).applyMatrix4(group.matrixWorld).project(camera);
      return at.set(((tmp.x + 1) / 2) * W, ((1 - tmp.y) / 2) * H, 0);
    },
    /** The milestone nearest `lb` (log10 of the years back), faint, over the proton. */
    placa(g: CanvasRenderingContext2D, u: number, tl: Timeline, p: number, lb: number, camera: THREE.Camera, W: number, H: number, inkT: number) {
      const k = tl.get('ap.hitos', p);
      if (k < 0.01) return;
      let best: Hito | null = null;
      let bd = 0.9;
      for (const h of HITOS_ATRAS) {
        const d = Math.abs(Math.log10(h.L()) - lb);
        if (d < bd) {
          bd = d;
          best = h;
        }
      }
      if (!best) return;
      const s = this.protonEn(camera, W, H);
      rotulo(g, u, s.x, s.y - 34 * u, best.texto, 12, inkT, 0.6 * k * (1 - smoothstep(0.35, 0.9, bd)), false);
    },
  };
}
