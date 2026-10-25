import { clamp } from '../lib/math';

/**
 * Sound: made in the browser, with no files (adapted from Potencias). Off until asked for. No
 * music: the journey's own sounds only.
 *
 * - Wind: filtered noise that rises with the speed of time (orders of magnitude per second).
 * - A soft bell when a name appears, pitched by the temperature of the universe: high and glassy in
 *   the plasma, lower as it cools (the redshift heard), and by each era's chord.
 * - Both through a long generated reverb.
 * Phase 5 adds the sound of the plasma (the acoustic oscillations, transposed) and the silence at
 * the end.
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

const LEVEL = 0.6;

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

interface Graph {
  ctx: BaseAudioContext;
  master: GainNode;
  /** Where sounds go: dry and into the reverb. */
  bus: GainNode;
  wind: GainNode;
  windBand: BiquadFilterNode;
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

  return { ctx, master, bus, wind, windBand };
}

export function createSound() {
  let g: Graph | null = null;
  let actx: AudioContext | null = null;
  let on = false;
  let chord = -1;
  let last = 0;
  let root = rootOf(3);

  const glide = (p: AudioParam, v: number, t: number) => g && p.setTargetAtTime(v, g.ctx.currentTime, t);

  document.addEventListener('visibilitychange', () => {
    if (!actx || !on) return;
    if (document.hidden) actx.suspend();
    else actx.resume();
  });

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
    /** `logT`: the temperature (log10 K); `speed`: orders of magnitude per second; `era`: its index. */
    update(logT: number, speed: number, era: number) {
      if (!g || !on) return;
      const now = performance.now();
      if (now - last < 50) return;
      last = now;
      root = rootOf(logT);
      chord = era % CHORDS.length;
      const s = Math.abs(speed);
      glide(g.wind.gain, Math.pow(clamp(s / 6, 0, 1), 1.4) * 0.32, 0.15);
      glide(g.windBand.frequency, 350 + clamp(s, 0, 10) * 220, 0.2);
    },
    /** A soft bell, tuned to the chord, when a world arrives. */
    chime() {
      if (!g || !on) return;
      const { ctx } = g;
      const t = ctx.currentTime;
      const f = root * 4 * Math.pow(2, CHORDS[Math.max(chord, 0)][2] / 12);
      for (const [mult, level, decay] of [
        [1, 0.05, 3.2],
        [2.76, 0.018, 1.6],
        [5.4, 0.008, 0.8],
      ]) {
        const o = ctx.createOscillator();
        o.frequency.value = Math.min(f * mult, 9000);
        const a = ctx.createGain();
        a.gain.setValueAtTime(0, t);
        a.gain.linearRampToValueAtTime(level, t + 0.02);
        a.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        o.connect(a).connect(g.bus);
        o.start(t);
        o.stop(t + decay + 0.1);
      }
    },
  };
}
