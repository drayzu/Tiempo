import { clamp } from '../lib/math';

/**
 * Sound: made in the browser, with no files (adapted from Potencias). Off until asked for. No
 * music: the journey's own sounds only.
 *
 * - Wind: filtered noise that rises with the speed of time (orders of magnitude per second).
 * - A soft bell when a name appears, pitched by the temperature of the universe: high and glassy in
 *   the plasma, lower as it cools (the redshift heard), and by each era's chord.
 * - «El universo sonaba»: while the universe is an opaque plasma it rings with real sound waves
 *   (the baryon acoustic oscillations). Heard here some fifty octaves up: a roar whose overtones sit
 *   at the ratios of the acoustic peaks of the microwave background, falling in pitch as the
 *   universe expands and cools, breathing with the plasma, and gone when the light breaks free.
 *   (If the universe falls back, it rings again, rising.)
 * - The silence: in the far future the sound empties out (the `silencio` track); each ending's last
 *   light is the last bell.
 * - Everything through a long generated reverb.
 */

/** Open voicings (semitones over the root), one per world in turn: the bell takes a note from it. */
const CHORDS = [
  [0, 7, 12, 19],
  [0, 5, 12, 17],
  [0, 7, 14, 19],
  [0, 3, 10, 15],
  [0, 7, 12, 16],
  [0, 5, 10, 15],
];

/**
 * The acoustic peaks of the microwave background (multipoles ℓ ≈ 220, 537, 810, 1120, 1420) as
 * overtones of the fundamental, with their weights.
 */
const PEAKS: [number, number][] = [
  [1, 1],
  [2.44, 0.7],
  [3.68, 0.45],
  [5.09, 0.28],
  [6.45, 0.16],
];

const LEVEL = 0.6;
/**
 * How loud the plasma is at its fullest: measured offline, its narrow bands give ~0.21 RMS at 56 Hz
 * and grow as √f (constant Q); this brings it to ~0.09 at any pitch, a little above the wind.
 */
const plasmaLevel = (f0: number) => 0.43 * Math.sqrt(56 / f0);

function impulse(ctx: BaseAudioContext, seconds: number, decay: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function noise(ctx: BaseAudioContext, seconds: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** The bell's root for the temperature of the universe (log10 K): high when hot, low when cold. */
const rootOf = (logT: number) => clamp(110 * Math.pow(2, (logT - 3) * 0.1), 45, 880);

/** The plasma's fundamental: its waves stretch as it cools (about a third of an octave a decade). */
export const plasmaRoot = (logT: number) => clamp(55 * Math.pow(2, (logT - 3.47) * 0.34), 40, 520);

interface Graph {
  ctx: BaseAudioContext;
  master: GainNode;
  /** Where sounds go: dry and into the reverb. */
  bus: GainNode;
  wind: GainNode;
  windBand: BiquadFilterNode;
  plasma: GainNode;
  bands: BiquadFilterNode[];
  hum: OscillatorNode;
}

/** The whole graph, on any context (an offline one renders it for a check). */
export function buildSound(ctx: BaseAudioContext): Graph {
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 5, 3);
  const wet = ctx.createGain();
  wet.gain.value = 0.7;
  reverb.connect(wet).connect(master);
  const bus = ctx.createGain();
  bus.connect(master);
  bus.connect(reverb);

  // Wind.
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, 2);
  src.loop = true;
  const windBand = ctx.createBiquadFilter();
  windBand.type = 'bandpass';
  windBand.frequency.value = 500;
  windBand.Q.value = 0.8;
  const wind = ctx.createGain();
  wind.gain.value = 0;
  src.connect(windBand).connect(wind).connect(bus);
  src.start();

  // The plasma: noise through narrow bands at the acoustic peaks, and a low hum under them.
  const pSrc = ctx.createBufferSource();
  pSrc.buffer = noise(ctx, 4);
  pSrc.loop = true;
  const plasma = ctx.createGain();
  plasma.gain.value = 0;
  const soft = ctx.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = 2200;
  plasma.connect(soft).connect(bus);
  const bands = PEAKS.map(([ratio, weight]) => {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 9;
    f.frequency.value = 55 * ratio;
    const a = ctx.createGain();
    a.gain.value = weight * 9;
    pSrc.connect(f).connect(a).connect(plasma);
    return f;
  });
  const hum = ctx.createOscillator();
  hum.frequency.value = 55;
  const humGain = ctx.createGain();
  humGain.gain.value = 0.05;
  hum.connect(humGain).connect(plasma);
  hum.start();
  pSrc.start();

  return { ctx, master, bus, wind, windBand, plasma, bands, hum };
}

export interface SoundFrame {
  /** The temperature of the universe (log10 K). */
  logT: number;
  /** Orders of magnitude per second. */
  speed: number;
  /** The era's index. */
  era: number;
  /** How much the universe is a ringing plasma (0..1). */
  plasma: number;
  /** The plasma's breathing (its acoustic phase). */
  wave: number;
  /** 0: all the sound; 1: the silence at the end. */
  silencio: number;
}

export function createSound() {
  let g: Graph | null = null;
  let actx: AudioContext | null = null;
  let on = false;
  let chord = -1;
  let last = 0;
  let root = rootOf(3);
  let quiet = 0;

  const glide = (p: AudioParam, v: number, t: number) => g && p.setTargetAtTime(v, g.ctx.currentTime, t);

  document.addEventListener('visibilitychange', () => {
    if (!actx || !on) return;
    if (document.hidden) actx.suspend();
    else actx.resume();
  });

  /** A bell: partials of a struck bar (ratios 1, 2.76, 5.4) at frequency `f`. */
  const bell = (f: number, level: number, decay: number) => {
    if (!g) return;
    const { ctx } = g;
    const t = ctx.currentTime;
    for (const [mult, lv, dk] of [
      [1, 1, 1],
      [2.76, 0.36, 0.5],
      [5.4, 0.16, 0.25],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = Math.min(f * mult, 9000);
      const a = ctx.createGain();
      a.gain.setValueAtTime(0, t);
      a.gain.linearRampToValueAtTime(level * lv, t + 0.02);
      a.gain.exponentialRampToValueAtTime(0.0001, t + decay * dk);
      o.connect(a).connect(g.bus);
      o.start(t);
      o.stop(t + decay * dk + 0.1);
    }
  };

  return {
    get on() {
      return on;
    },
    /** For debugging: the audio context, once built. */
    get context() {
      return actx;
    },
    toggle() {
      on = !on;
      if (on) {
        actx ??= new AudioContext();
        g ??= buildSound(actx);
        actx.resume();
        glide(g.master.gain, LEVEL, 0.6);
      } else if (g && actx) {
        glide(g.master.gain, 0, 0.3);
        const ctx = actx;
        setTimeout(() => {
          if (!on) ctx.suspend();
        }, 1600);
      }
      return on;
    },
    update(f: SoundFrame) {
      if (!g || !on) return;
      const now = performance.now();
      if (now - last < 50) return;
      last = now;
      root = rootOf(f.logT);
      chord = f.era % CHORDS.length;
      quiet = clamp(f.silencio, 0, 1);
      const left = 1 - quiet;
      const s = Math.abs(f.speed);
      glide(g.wind.gain, Math.pow(clamp(s / 6, 0, 1), 1.4) * 0.32 * left, 0.15);
      glide(g.windBand.frequency, 350 + clamp(s, 0, 10) * 220, 0.2);
      // The plasma rings, breathing with its sound waves; its pitch follows the temperature.
      const breathe = 0.78 + 0.22 * Math.sin(f.wave * 2.2);
      const f0 = plasmaRoot(f.logT);
      glide(g.plasma.gain, clamp(f.plasma, 0, 1) * breathe * plasmaLevel(f0) * left, 0.12);
      g.bands.forEach((b, i) => glide(b.frequency, f0 * PEAKS[i][0], 0.25));
      glide(g.hum.frequency, f0, 0.25);
    },
    /** A soft bell, tuned to the chord, when a world arrives (none once the silence has come). */
    chime() {
      if (!g || !on || quiet > 0.9) return;
      const f = root * 4 * Math.pow(2, CHORDS[Math.max(chord, 0)][2] / 12);
      bell(f, 0.05 * (1 - quiet * 0.7), 3.2);
    },
    /** The last bell: low and long, when the last light goes out. */
    ultima() {
      if (!g || !on) return;
      bell(rootOf(3) * 2, 0.09, 11);
      bell(rootOf(3) * 3, 0.03, 7);
    },
  };
}
