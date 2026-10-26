import * as THREE from 'three';
import { gauss } from '../lib/math';
import { YEAR } from '../lib/cosmo';
import { marcar, provisional, type Builder } from './provisional';

/**
 * The provisional eras of phase 1: the whole time axis, end to end, before each era gets its own
 * module. Shapes and colours already follow the biblia (and the figures will be checked when each
 * era is built for real).
 */

const LT = (years: number) => Math.log10(years * YEAR);
const INK = 0xece7db;

/** Points along a circle (a plate's line drawn with particles). */
function circulo(b: Builder, cx: number, cy: number, cz: number, R: number, n: number, hex: number, light: number, tilt = 0) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    b.push(cx + Math.cos(a) * R, cy + Math.sin(a) * R * Math.cos(tilt), cz + Math.sin(a) * R * Math.sin(tilt), hex, 0.05, light);
  }
}

/** A cloud filling a box around the camera's path (first person: matter all around). */
function volumen(b: Builder, n: number, half: [number, number, number], fill: (x: number, y: number, z: number) => void) {
  const r = b.r;
  for (let k = 0; k < n; k++) fill((r() * 2 - 1) * half[0], (r() * 2 - 1) * half[1], (r() * 2 - 1) * half[2]);
}

export const antes = provisional({
    id: 'antes',
    acto: 'Antes del tiempo',
    certeza: 'E',
    name: 'Antes del tiempo',
    fact: 'Nadie sabe qué hubo antes. Hipótesis: burbujas de una inflación eterna, el final de un universo anterior, un rebote.',
    ficha: ['la física conocida empieza en el tiempo de Planck: 5,4 × 10⁻⁴⁴ s', 'antes de eso no hay datos: solo modelos', 'ninguno se ha comprobado'],
    label: 'antes',
    unitExp: -35,
    frame: 14,
    tint: INK,
    // Three hypotheses as plate figures: bubbles, a previous aeon, a bounce.
    forma: (b) => hipotesis(b),
    arrive: 0,
    stay: 4.2,
    reloj: { reloj: 4, from: -46, to: -44 },
    fondo: 0,
    // The first gesture already moves: the figures turn and come closer.
    e: [0, -0.28],
    turn: [0.32, 0.12],
    spin: 0.015,
});

export const inflacion = marcar(
  provisional({
    id: 'inflacion',
    acto: 'El primer segundo',
    certeza: 'T',
    name: 'Inflación',
    fact: 'En menos tiempo del que la luz tarda en cruzar un protón, el espacio crece unas 10²⁶ veces. Sus arrugas cuánticas quedan estiradas: serán las galaxias.',
    ficha: ['dura unos 10⁻³² s (según el modelo)', 'el espacio crece al menos 10²⁶ veces', 'sus arrugas: 1 parte en 100 000 en el fondo de microondas'],
    label: 'inflación',
    unitExp: -35,
    frame: 10,
    tint: INK,
    forma(b) {
      // Ripples at every scale (the fluctuations inflation stretches and freezes).
      const r = b.r;
      for (let k = 0; k < 26000; k++) {
        const x = (r() * 2 - 1) * 30;
        const y = (r() * 2 - 1) * 18;
        const z = -r() * 30;
        const w = Math.sin(x * 0.7 + Math.sin(y * 0.5)) * Math.cos(y * 0.6 - Math.sin(x * 0.3)) + 0.5 * Math.sin(x * 2.3 + y * 1.7);
        if (r() > 0.25 + 0.6 * Math.abs(w)) continue;
        b.push(x, y, z, w > 0 ? 0xcfd8ff : 0xece7db, 0.09, 0.7);
      }
    },
    arrive: 2.6,
    stay: 4.4,
    reloj: { reloj: 0, from: -36, to: -32 },
    fondo: 0,
    e: [0.1, 0.9],
    fadeE: [-6, -4, 18, 20],
    fov: 60,
  }),
);

export const quarks = marcar(
  provisional({
    id: 'quarks',
    acto: 'El primer segundo',
    certeza: 'T',
    name: 'El plasma de quarks',
    fact: 'Quarks y gluones sueltos a billones de grados. Hacia la millonésima de segundo quedan presos de a tres: nace nuestro protón.',
    ficha: ['plasma de quarks y gluones: sobre 2 × 10¹² K', 'se recrea en choques de núcleos en el LHC y en RHIC', 'los protones se forman hacia 10⁻⁵ s'],
    label: 'quarks',
    unitExp: -15,
    frame: 30,
    tint: 0xff9ac0,
    forma(b) {
      const cols = [0xff4a5e, 0x4aff9a, 0x4a8cff];
      volumen(b, 24000, [30, 20, 30], (x, y, z) => b.push(x, y, z, b.r() < 0.75 ? cols[Math.floor(b.r() * 3)] : 0xffe6b0, 0.12, 0.5, { drift: 0.3 }));
    },
    proton: [1.2, -0.4, -4],
    arrive: 3.2,
    stay: 4.6,
    reloj: { reloj: 0, from: -11, to: -5.3 },
    fondo: 1,
    e: [-0.1, 0.1],
    fov: 62,
    spin: 0.02,
  }),
);

export const aniquilacion = marcar(
  provisional({
    id: 'aniquilacion',
    acto: 'El primer segundo',
    certeza: 'O',
    name: 'Una de cada mil millones',
    fact: 'La materia y la antimateria se aniquilan en un destello. Sobra una partícula de cada mil millones: todo lo que existe es ese sobrante.',
    ficha: ['por cada 10⁹ antiprotones había 10⁹ + 1 protones', 'por qué sobró materia sigue sin explicarse', 'electrones y positrones: entre 1 y 10 segundos'],
    label: 'aniquilación',
    unitExp: -13,
    frame: 30,
    tint: 0xfff0d0,
    forma(b) {
      volumen(b, 20000, [30, 20, 30], (x, y, z) => b.push(x, y, z, b.r() < 0.02 ? 0xfff1dc : 0x8f8a80, 0.1, b.r() < 0.02 ? 1.2 : 0.12, { drift: 0.15 }));
    },
    proton: [1.0, -0.3, -4],
    arrive: 2.6,
    stay: 3.4,
    reloj: { reloj: 0, from: -5, to: 0.3 },
    fondo: 1,
    fov: 60,
  }),
);

export const nucleos = marcar(
  provisional({
    id: 'nucleos',
    acto: 'La niebla',
    certeza: 'O',
    name: 'Veinte minutos de cocina',
    fact: 'Se forman los núcleos de helio. Queda, en masa, tres cuartos de hidrógeno y un cuarto de helio, como hoy.',
    ficha: ['entre 3 y 20 minutos, a ~10⁹ K', '≈ 75 % hidrógeno y ≈ 25 % helio, en masa', 'más trazas de deuterio y de litio'],
    label: 'núcleos',
    unitExp: -10,
    frame: 30,
    tint: 0xffcf6a,
    forma(b) {
      volumen(b, 22000, [30, 20, 30], (x, y, z) => {
        const he = b.r() < 0.08;
        b.push(x, y, z, he ? 0xffcf6a : 0xfff1dc, he ? 0.16 : 0.1, he ? 0.9 : 0.6, { drift: 0.1 });
      });
    },
    proton: [1.0, -0.3, -4],
    arrive: 2.6,
    stay: 3.4,
    reloj: { reloj: 0, from: 0.6, to: 3.1 },
    fondo: 1,
    fov: 58,
  }),
);

export const oscura = marcar(
  provisional({
    id: 'oscura',
    acto: 'Oscuridad y amanecer',
    certeza: 'O',
    name: 'El gas se enfría',
    fact: 'Ya no hay luz que ver. El gas, frío y casi uniforme, guarda arrugas diminutas: las que estiró la inflación.',
    label: 'gas frío',
    unitExp: 8,
    frame: 30,
    tint: 0x6f86b0,
    forma(b) {
      const r = b.r;
      for (let k = 0; k < 20000; k++) {
        const x = (r() * 2 - 1) * 30;
        const y = (r() * 2 - 1) * 20;
        const z = (r() * 2 - 1) * 30;
        const w = Math.sin(x * 0.35 + Math.sin(z * 0.3)) * Math.cos(y * 0.4 - Math.sin(x * 0.2)) * Math.sin(z * 0.27 + y * 0.2);
        if (r() > 0.3 + 0.7 * Math.max(w, 0)) continue;
        b.push(x, y, z, 0x8ea6c8, 0.1, 0.18);
      }
    },
    proton: [0.4, -0.2, -3],
    arrive: 3.4,
    stay: 3.0,
    reloj: { reloj: 0, from: LT(5e6), to: LT(5e7) },
    fondo: 1,
    fov: 55,
    fadeE: [-12, -10, 10, 12],
  }),
);

export const galaxias = marcar(
  provisional({
    id: 'galaxias',
    acto: 'Oscuridad y amanecer',
    certeza: 'O',
    name: 'Las burbujas se tocan',
    fact: 'La luz de las primeras galaxias ioniza burbujas de gas que crecen y se funden, como un queso suizo. El JWST ve galaxias a menos de 300 millones de años del inicio.',
    ficha: ['reionización: hasta ~1 000 millones de años', 'JWST: galaxias a z ≈ 14, unos 290 millones de años', 'el gas entre galaxias sigue ionizado hasta hoy'],
    label: 'galaxias',
    unitExp: 21.5,
    frame: 30,
    tint: 0xa8c4ff,
    forma(b) {
      const r = b.r;
      for (let g = 0; g < 60; g++) {
        const c = new THREE.Vector3((r() * 2 - 1) * 26, (r() * 2 - 1) * 16, (r() * 2 - 1) * 26);
        const R = 1 + r() * 3.5;
        for (let k = 0; k < 40; k++) b.push(c.x + gauss(r) * 0.25, c.y + gauss(r) * 0.25, c.z + gauss(r) * 0.25, 0xa8c4ff, 0.18, 1.2, { star: true });
        for (let k = 0; k < 220; k++) {
          const [x, y, z] = b.onSphere();
          b.push(c.x + x * R, c.y + y * R, c.z + z * R, 0xff6f8f, 0.2, 0.12);
        }
      }
    },
    proton: [0, 0, 0],
    arrive: 3.0,
    stay: 3.4,
    reloj: { reloj: 0, from: LT(2.6e8), to: LT(1e9) },
    fondo: 1,
    fov: 52,
  }),
);

export const viaLactea = marcar(
  provisional({
    id: 'via-lactea',
    acto: 'Nosotros',
    certeza: 'O',
    name: 'La Vía Láctea',
    fact: 'Nuestra galaxia se arma con fusiones de galaxias más pequeñas. Nuestro protón viaja en el gas del disco.',
    ficha: ['~100 000 años luz de diámetro', 'entre 100 000 y 400 000 millones de estrellas', 'el Sol, a ~26 000 años luz del centro'],
    label: 'Vía Láctea',
    unitExp: 20,
    frame: 14,
    tint: 0xffe2b0,
    forma(b) {
      const r = b.r;
      for (let k = 0; k < 40000; k++) {
        const arm = k % 2;
        const s = Math.pow(r(), 0.7) * 5;
        const th = arm * Math.PI + s * 1.25 + gauss(r) * 0.35;
        const x = Math.cos(th) * s;
        const z = Math.sin(th) * s;
        const y = gauss(r) * 0.08 * (1 + s * 0.1);
        const warm = s < 1.2 ? 0xffe2b0 : r() < 0.6 ? 0xb8ccff : 0xffe6c8;
        b.push(x, y, z, warm, 0.02, s < 1.2 ? 0.5 : 0.32);
      }
    },
    proton: [2.52, 0, 0],
    arrive: 3.0,
    stay: 4.0,
    reloj: { reloj: 0, from: LT(1e9), to: LT(9.19e9) },
    fondo: 1,
    e: [0, 0.2],
    turn: [0.5, 0.35],
    spin: 0.03,
  }),
);

export const sol = marcar(
  provisional({
    id: 'sol',
    acto: 'Nosotros',
    certeza: 'O',
    name: 'Nace el Sol',
    fact: 'Una nube de gas, con restos de estrellas muertas, colapsa en un disco. En el centro se enciende el Sol; nuestro protón cae con el agua del disco.',
    ficha: ['hace 4 567 millones de años (los meteoritos más antiguos)', 'el disco que formó los planetas: ~100 UA', 'la Tierra tardó decenas de millones de años en formarse'],
    label: 'el Sol',
    unitExp: 11,
    frame: 6,
    anchor: [2.52, 0, 0],
    tint: 0xffd890,
    forma(b) {
      const r = b.r;
      for (let k = 0; k < 400; k++) b.push(gauss(r) * 0.03, gauss(r) * 0.03, gauss(r) * 0.03, 0xfff0c0, 0.2, 1.1, { star: true });
      for (let k = 0; k < 30000; k++) {
        const s = 0.2 + Math.pow(r(), 0.8) * 5.5;
        const th = r() * Math.PI * 2;
        b.push(Math.cos(th) * s, gauss(r) * 0.05 * s, Math.sin(th) * s, s < 1.6 ? 0xffc890 : 0x9fb0d0, 0.025, 0.35);
      }
    },
    proton: [1.496, 0, 0],
    arrive: 3.0,
    stay: 3.4,
    reloj: { reloj: 0, from: LT(9.19e9), to: LT(9.24e9) },
    fondo: 1,
    turn: [0.4, 0.4],
    spin: 0.05,
    fadeE: [-1.6, -0.8, 2.6, 4],
  }),
);

export const futuro = marcar(
  provisional({
    id: 'futuro',
    acto: 'El futuro cercano',
    certeza: 'T',
    name: 'El Sol se apaga',
    fact: 'En unos cinco mil millones de años el Sol se hinchará como gigante roja y quedará como enana blanca. Andrómeda, quizá, se habrá fundido con nosotros.',
    ficha: ['el Sol brilla ~10 % más cada 1 000 millones de años', 'gigante roja: en ~5 000 millones de años, ~200 veces su radio', 'queda una enana blanca de ~0,5 masas solares'],
    label: 'futuro',
    unitExp: 11,
    frame: 8,
    anchor: [-149600, 0, 0],
    tint: 0xff8a5a,
    forma(b) {
      const r = b.r;
      for (let k = 0; k < 24000; k++) {
        const [x, y, z] = b.onSphere();
        const R = 1.6 * Math.cbrt(r());
        b.push(x * R, y * R, z * R, 0xff7a4a, 0.06, 0.25);
      }
      for (let k = 0; k < 60; k++) b.push(gauss(r) * 0.01, gauss(r) * 0.01, gauss(r) * 0.01, 0xe8ecff, 0.1, 2, { star: true });
    },
    arrive: 3.0,
    stay: 4.0,
    reloj: { reloj: 3, from: 0.5, to: 14 },
    fondo: 1,
    turn: [0.3, 0.2],
    fadeE: [-2.2, -1.2, 2.6, 4],
  }),
);

export const final = marcar(
  provisional({
    id: 'final',
    acto: 'El largo final',
    certeza: 'T',
    name: 'El largo final',
    fact: 'Las estrellas se apagan una a una; quedan enanas negras y agujeros negros, que se evaporan. La última luz, hacia los 10¹⁰⁰ años.',
    label: 'final',
    unitExp: 21,
    frame: 20,
    tint: 0x8a6a5a,
    forma(b) {
      const r = b.r;
      for (let k = 0; k < 6000; k++) b.push((r() * 2 - 1) * 20, (r() * 2 - 1) * 12, (r() * 2 - 1) * 20, r() < 0.5 ? 0xff6a4a : 0x6f6f78, 0.04, 0.12);
      for (let h = 0; h < 6; h++) circulo(b, (r() * 2 - 1) * 12, (r() * 2 - 1) * 6, (r() * 2 - 1) * 8, 0.6 + r(), 300, 0xffd8a0, 0.5, 1.2);
    },
    arrive: 3.0,
    stay: 4.0,
    reloj: { reloj: 3, from: 14, to: 100 },
    fondo: 1,
    turn: [0.4, 0.1],
  }),
);

/** The cover's three figures (bubbles, a previous aeon, a bounce): the end draws them again, and loops. */
function hipotesis(b: Builder) {
  const r = b.r;
  for (let k = 0; k < 9; k++) circulo(b, -5 + gauss(r) * 1.4, 1.6 + gauss(r) * 1.1, gauss(r), 0.4 + r() * 1.1, 260, INK, 0.5);
  circulo(b, 0, -1.2, 0, 2.2, 700, 0x8fb4ff, 0.6);
  circulo(b, 0, -1.2, 0, 1.7, 500, INK, 0.35);
  for (let k = 0; k < 900; k++) {
    const t = (k / 900) * 2 - 1;
    const w = 0.25 + 1.4 * t * t;
    const a = r() * Math.PI * 2;
    b.push(5 + Math.cos(a) * w, 0.6 + t * 2.4, Math.sin(a) * w, INK, 0.045, 0.45);
  }
}

export const despues = provisional({
  id: 'despues',
  acto: 'Después del tiempo',
  certeza: 'E',
  name: 'Después del tiempo',
  fact: 'Hipótesis: si se espera lo suficiente, todo vuelve a pasar; quizá nacen universos de otros; quizá el final es un comienzo.',
  ficha: ['cosmología cíclica conforme (Penrose): el final como un nuevo Big Bang', 'rebotes, universos que nacen de otros', 'ninguna se ha comprobado'],
  label: 'después',
  unitExp: -35,
  frame: 14,
  tint: INK,
  forma: hipotesis,
  arrive: 3.6,
  stay: 5.2,
  reloj: { reloj: 4, from: -46, to: -46 },
  fondo: 0,
  e: [0.4, 0],
  fadeE: [-60, -58, 70, 72],
  turn: [0, 0],
  spin: 0.04,
});
