/**
 * The universe's clock: how old, how hot and how big it is at each moment.
 *
 * ΛCDM with Planck 2018's parameters (TT,TE,EE+lowE+lensing+BAO): H0 = 67.66 km/s/Mpc,
 * Ωm = 0.3111, ΩΛ = 0.6889, radiation (photons + three neutrinos) Ωr h² ≈ 4.18 × 10⁻⁵. With these
 * the age comes out at 13.787 billion years (Planck 2018: 13.787 ± 0.020).
 *
 * - After the first minutes (electrons and positrons gone), the scale factor `a` comes from
 *   integrating Friedmann's equation, and the photons' temperature is T₀ / a.
 * - Before that, the radiation era's own relation, t ≈ 2.42 g*^(-1/2) (kT / 1 MeV)⁻² s, with the
 *   number of particle species in the bath (g*) stepping down as the universe cools: 106.75 above the
 *   electroweak scale, 61.75 above the quark–hadron transition, 10.75 above the e± annihilation,
 *   3.36 after. Rough at the steps, but right in its powers of ten, which is what the readout shows.
 *
 * Times are in seconds unless named otherwise (`years` = Julian years).
 */

export const H0 = 67.66;
export const OMEGA_M = 0.3111;
export const OMEGA_R = 4.18e-5 / (H0 / 100) ** 2;
export const OMEGA_L = 1 - OMEGA_M - OMEGA_R;
/** Temperature of the microwave background today, K (Fixsen 2009). */
export const T0 = 2.7255;
export const YEAR = 365.25 * 86400;
/** Planck time, s. */
export const T_PLANCK = 5.391e-44;
/** Comoving radius of the observable universe today, m (≈ 46.5 billion light-years). */
export const R_OBS = 4.4e26;
export const LY = 9.4607e15;

const MPC = 3.0857e22;
/** Hubble rate today, 1/s. */
const H0_S = (H0 * 1000) / MPC;

const hubble = (a: number) => H0_S * Math.sqrt(OMEGA_R / a ** 4 + OMEGA_M / a ** 3 + OMEGA_L);

/** Table of ln a against ln t, from a = e⁻³⁰ to a = e³ (well into the future). */
const LN_A0 = -30;
const LN_A1 = 3;
const N = 6000;
const lnT = new Float64Array(N + 1);
(() => {
  const h = (LN_A1 - LN_A0) / N;
  // Deep in the radiation era t = a² / (2 H0 √Ωr).
  const a0 = Math.exp(LN_A0);
  let t = (a0 * a0) / (2 * H0_S * Math.sqrt(OMEGA_R));
  lnT[0] = Math.log(t);
  // dt = d ln a / H, integrated with Simpson's rule on each step.
  for (let i = 1; i <= N; i++) {
    const x0 = LN_A0 + (i - 1) * h;
    const f = (x: number) => 1 / hubble(Math.exp(x));
    t += (h / 6) * (f(x0) + 4 * f(x0 + h / 2) + f(x0 + h));
    lnT[i] = Math.log(t);
  }
})();

/** Age of the universe today, s. */
export const AGE = (() => {
  // ln a = 0 sits between table entries.
  const x = (0 - LN_A0) / ((LN_A1 - LN_A0) / N);
  const i = Math.floor(x);
  return Math.exp(lnT[i] + (lnT[i + 1] - lnT[i]) * (x - i));
})();

/** Scale factor at time t (a = 1 today). Beyond the table, the Λ era's exponential expansion. */
export function scaleFactor(t: number): number {
  const lt = Math.log(t);
  if (lt <= lnT[0]) return Math.sqrt(2 * H0_S * Math.sqrt(OMEGA_R) * t);
  if (lt >= lnT[N]) {
    const HL = H0_S * Math.sqrt(OMEGA_L);
    return Math.exp(LN_A1 + HL * (t - Math.exp(lnT[N])));
  }
  let lo = 0;
  let hi = N;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lnT[mid] <= lt) lo = mid;
    else hi = mid;
  }
  const f = (lt - lnT[lo]) / (lnT[hi] - lnT[lo]);
  const h = (LN_A1 - LN_A0) / N;
  return Math.exp(LN_A0 + (lo + f) * h);
}

/** Redshift of light emitted at time t and seen today. */
export const redshift = (t: number) => 1 / scaleFactor(t) - 1;

/** Effective number of relativistic species in the bath at temperature T (K). */
function gStar(T: number) {
  const mev = T / 1.1605e10;
  if (mev > 1e5) return 106.75;
  if (mev > 170) return 61.75;
  if (mev > 0.5) return 10.75;
  return 3.36;
}

/** Temperature of the radiation at time t, K. */
export function temperature(t: number): number {
  // After the e± annihilation (a few minutes), the photons simply cool as the universe grows.
  if (t > 300) return T0 / scaleFactor(t);
  // Before: the radiation era's relation, iterating g* once or twice.
  let T = 1e10;
  for (let k = 0; k < 4; k++) {
    const mev = Math.sqrt(2.42 / (t * Math.sqrt(gStar(T))));
    T = mev * 1.1605e10;
  }
  return T;
}

/**
 * Radius, today's units scaled back, of the patch of universe that is now our observable
 * universe (m). Meaningful from the end of inflation on.
 */
export const patchRadius = (t: number) => R_OBS * scaleFactor(t);

/** Seconds after the beginning, for a time that many years before today. */
export const agoToT = (years: number) => AGE - years * YEAR;

/**
 * Carl Sagan's cosmic calendar: the whole history squeezed into one year. Returns the day of the
 * year (0-based) and the time of day for time t.
 */
export function cosmicCalendar(t: number) {
  const f = Math.min(1, Math.max(0, t / AGE));
  const seconds = f * 365 * 86400;
  const day = Math.floor(seconds / 86400);
  return { day, secondOfDay: seconds - day * 86400 };
}

/**
 * log10 of the scale factor, valid at any time, also in the far future where `a` itself overflows
 * (the Λ era grows it exponentially: after 10¹⁴ years a ≈ 10²⁶⁰⁰).
 */
export function logScaleFactor(t: number): number {
  const tEnd = Math.exp(lnT[N]);
  if (t <= tEnd) return Math.log10(scaleFactor(t));
  const HL = H0_S * Math.sqrt(OMEGA_L);
  return (LN_A1 + HL * (t - tEnd)) / Math.LN10;
}

/** log10 of the temperature of the radiation, K, at any time. */
export function logTemperature(t: number): number {
  if (t <= 300) return Math.log10(temperature(t));
  return Math.log10(T0) - logScaleFactor(t);
}

/**
 * Fraction of electrons still free at redshift z: a logistic fit around recombination (to check
 * against RECFAST): 0.5 near z ≈ 1 180, about 0.2 at the peak of last scattering (z ≈ 1 090),
 * freezing out near 2 × 10⁻⁴.
 */
export const freeFraction = (z: number) => 2e-4 + (1 - 2e-4) / (1 + Math.exp(-(z - 1180) / 60));

/**
 * How far light gets between collisions with free electrons, in arbitrary units (1 ≈ the scale at
 * which the studies show it): ∝ 1 / (x_e n_e), and n_e ∝ (1 + z)³.
 */
export const meanFreePath = (z: number) => (0.07 / freeFraction(z)) * Math.pow(1100 / (1 + z), 3);

/**
 * How clear the universe is to its own light, 0 (an opaque glowing fog: everything before
 * recombination) .. 1 (light flies freely: after about 400 000 years, for ever).
 */
export function transparency(t: number): number {
  if (t < 2e12) return 0;
  const mfp = meanFreePath(redshift(t));
  const x = (Math.log10(mfp) - Math.log10(0.4)) / (Math.log10(30) - Math.log10(0.4));
  const k = Math.min(Math.max(x, 0), 1);
  return k * k * (3 - 2 * k);
}
