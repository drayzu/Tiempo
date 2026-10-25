/**
 * The colour of a body at temperature T: Planck's law weighed by the eye's colour matching
 * functions (CIE 1931 2°, in Wyman, Sloan and Shirley's 2013 multi-lobe fit), to linear sRGB
 * (D65 white). Nothing chosen by hand: 3 000 K comes out orange, 6 500 K white, hotter bluish.
 *
 * Two readings:
 * - `bbColor(T)`: the hue, brightest channel 1.
 * - `bbVisible(T)`: how bright it looks, 0..1, to an eye adapted to the dark. The visible light of a
 *   body falls by tens of orders of magnitude as it cools (Wien's tail), so the eye's response is
 *   logarithmic: about 800 K (the Draper point, where hot iron starts to glow in a dark room) is
 *   barely seen, about 4 000 K is blinding.
 */

const H = 6.62607015e-34;
const C = 2.99792458e8;
const K = 1.380649e-23;

const lobe = (l: number, mu: number, s1: number, s2: number) => {
  const t = (l - mu) / (l < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
};

function cmf(l: number): [number, number, number] {
  return [
    1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2),
    0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1),
    1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8),
  ];
}

/** Spectral radiance (W · sr⁻¹ · m⁻³) at wavelength `nm`. */
export function planck(nm: number, T: number) {
  const l = nm * 1e-9;
  return (2 * H * C * C) / (l ** 5 * Math.expm1((H * C) / (l * K * T)));
}

/** XYZ of a blackbody at T (luminance Y in arbitrary but consistent units). */
function xyz(T: number): [number, number, number] {
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let nm = 380; nm <= 780; nm += 5) {
    const b = planck(nm, T);
    const [x, y, z] = cmf(nm);
    X += b * x;
    Y += b * y;
    Z += b * z;
  }
  return [X, Y, Z];
}

/** A table from 400 K to 10⁷ K, log spaced (hotter is the same bluish white). */
const T_MIN = 400;
const T_MAX = 1e7;
const STEPS = 600;
const table = (() => {
  const rgb = new Float32Array((STEPS + 1) * 3);
  const logY = new Float64Array(STEPS + 1);
  for (let i = 0; i <= STEPS; i++) {
    const T = T_MIN * Math.pow(T_MAX / T_MIN, i / STEPS);
    const [X, Y, Z] = xyz(T);
    let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
    let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
    let b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
    r = Math.max(r, 0);
    g = Math.max(g, 0);
    b = Math.max(b, 0);
    const m = Math.max(r, g, b) || 1;
    rgb[i * 3] = r / m;
    rgb[i * 3 + 1] = g / m;
    rgb[i * 3 + 2] = b / m;
    logY[i] = Math.log10(Math.max(Y, 1e-300));
  }
  return { rgb, logY };
})();

function at(T: number) {
  const x = (Math.log(Math.min(Math.max(T, T_MIN), T_MAX) / T_MIN) / Math.log(T_MAX / T_MIN)) * STEPS;
  const i = Math.min(Math.floor(x), STEPS - 1);
  return { i, f: x - i };
}

/** Linear sRGB hue of a blackbody at T, brightest channel 1. */
export function bbColor(T: number, out: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 }) {
  const { i, f } = at(T);
  const c = table.rgb;
  out.r = c[i * 3] * (1 - f) + c[i * 3 + 3] * f;
  out.g = c[i * 3 + 1] * (1 - f) + c[i * 3 + 4] * f;
  out.b = c[i * 3 + 2] * (1 - f) + c[i * 3 + 5] * f;
  return out;
}

/** log10 of the visible luminance (arbitrary units): for comparisons between temperatures. */
export function bbLogLuminance(T: number) {
  if (T < T_MIN) return table.logY[0] - (T_MIN / T - 1) * 11;
  const { i, f } = at(T);
  return table.logY[i] * (1 - f) + table.logY[i + 1] * f;
}

const DRAPER = bbLogLuminance(760);
const BLINDING = bbLogLuminance(4200);

/** How bright a blackbody at T looks to a dark-adapted eye, 0 (unseen) .. 1 (blinding). */
export function bbVisible(T: number) {
  const x = (bbLogLuminance(T) - DRAPER) / (BLINDING - DRAPER);
  const t = Math.min(Math.max(x, 0), 1);
  // The eye's response: steep at first (a faint glow is noticed at once), saturating when blinding.
  return Math.pow(t, 1.6);
}

/** Wavelength of the peak of the spectrum (Wien), nm. */
export const wienPeak = (T: number) => 2.897771955e6 / T;
