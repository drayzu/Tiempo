import { tx } from '../i18n';
/**
 * A choreography over scroll progress, measured in beats. Every value the scene needs (scale
 * exponent, camera, per-world animation) is a named track of keyframes; reading a track at any
 * progress gives its value, so the whole journey is reversible by construction.
 *
 * Authoring is sequential, like an animation script:
 *   tl.set({ e: -9.5 });                    // values at the cursor
 *   tl.to(2, { e: -8.2, yaw: 1 });          // tween to these over 2 beats; cursor advances
 *   tl.with(1, { roll: 0.3 });              // tween in parallel; cursor stays
 *
 * By default tracks *flow*: values pass through their keys without stopping (monotone cubic
 * interpolation, so nothing overshoots). Motion only comes to rest where a track actually rests
 * or turns around. Pass an explicit ease to shape a single segment instead.
 */

export type Ease = (t: number) => number;

export const EASE = {
  linear: (t: number) => t,
  in: (t: number) => t * t * t,
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  /** Gentle: for long camera moves. */
  sine: (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t),
} satisfies Record<string, Ease>;

interface Key {
  p: number;
  v: number;
  /** Ease of the segment that ends at this key; null flows through the keys. */
  ease: Ease | null;
}

/** A moment's own name and sentence, shown instead of the world's while it lasts. */
export interface Caption {
  from: number;
  to: number;
  name: string;
  fact: string;
}

export class Timeline {
  private tracks = new Map<string, Key[]>();
  private captions: Caption[] = [];
  private defaults: Record<string, number>;
  private labels = new Map<string, number>();
  private slopes = new Map<string, number[]>();
  private cursor = 0;
  length = 0;

  constructor(defaults: Record<string, number> = {}) {
    this.defaults = defaults;
  }

  set(values: Record<string, number>) {
    for (const [name, v] of Object.entries(values)) this.key(name, this.cursor, v, EASE.linear);
    return this;
  }

  to(dur: number, values: Record<string, number>, ease: Ease | null = null) {
    this.with(dur, values, ease);
    this.cursor += dur;
    this.length = Math.max(this.length, this.cursor);
    return this;
  }

  with(dur: number, values: Record<string, number>, ease: Ease | null = null) {
    for (const [name, v] of Object.entries(values)) {
      // Hold the previous value until the tween starts (keeping a key that already ends here intact).
      const keys = this.tracks.get(name);
      if (!keys?.some((k) => Math.abs(k.p - this.cursor) < 1e-9)) this.key(name, this.cursor, this.get(name, this.cursor), EASE.linear);
      this.key(name, this.cursor + dur, v, ease);
    }
    this.length = Math.max(this.length, this.cursor + dur);
    return this;
  }

  wait(dur: number) {
    this.cursor += dur;
    this.length = Math.max(this.length, this.cursor);
    return this;
  }

  /** Names the moment starting at the cursor and lasting `dur` beats (the cursor stays). */
  caption(dur: number, name: string, fact: string) {
    this.captions.push({ from: this.cursor, to: this.cursor + dur, name: tx(name), fact: tx(fact) });
    return this;
  }

  captionAt(p: number): Caption | null {
    return this.captions.find((c) => p >= c.from && p <= c.to) ?? null;
  }

  label(name: string) {
    this.labels.set(name, this.cursor);
    return this;
  }

  at(label: string) {
    return this.labels.get(label) ?? 0;
  }

  get(name: string, p: number): number {
    const keys = this.tracks.get(name);
    if (!keys || keys.length === 0) return this.defaults[name] ?? 0;
    if (p <= keys[0].p) return keys[0].v;
    const last = keys[keys.length - 1];
    if (p >= last.p) return last.v;
    let i = 0;
    while (keys[i + 1].p <= p) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const h = b.p - a.p;
    const t = h > 0 ? (p - a.p) / h : 1;
    if (b.ease) return a.v + (b.v - a.v) * b.ease(t);
    // Cubic Hermite with monotone slopes.
    const m = this.slopesOf(name, keys);
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a.v + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * b.v + (t3 - t2) * h * m[i + 1];
  }

  /** Fritsch–Butland slopes: smooth through keys, zero where the track rests or turns around. */
  private slopesOf(name: string, keys: Key[]) {
    let m = this.slopes.get(name);
    if (m) return m;
    const n = keys.length;
    m = new Array<number>(n).fill(0);
    for (let k = 1; k < n - 1; k++) {
      const h0 = keys[k].p - keys[k - 1].p;
      const h1 = keys[k + 1].p - keys[k].p;
      if (h0 <= 0 || h1 <= 0) continue;
      const d0 = (keys[k].v - keys[k - 1].v) / h0;
      const d1 = (keys[k + 1].v - keys[k].v) / h1;
      if (d0 * d1 <= 0) continue;
      const w1 = 2 * h1 + h0;
      const w2 = h1 + 2 * h0;
      m[k] = (w1 + w2) / (w1 / d0 + w2 / d1);
    }
    this.slopes.set(name, m);
    return m;
  }

  private key(name: string, p: number, v: number, ease: Ease | null) {
    this.slopes.delete(name);
    let keys = this.tracks.get(name);
    if (!keys) {
      keys = [];
      this.tracks.set(name, keys);
    }
    // Replace a key at the same progress; keep the list sorted.
    const same = keys.findIndex((k) => Math.abs(k.p - p) < 1e-9);
    if (same >= 0) keys[same] = { p, v, ease };
    else {
      keys.push({ p, v, ease });
      keys.sort((a, b) => a.p - b.p);
    }
  }
}
