import { clamp, damp } from '../lib/math';

/**
 * Native page scroll drives the journey: trackpads, touch, keyboard and the scrollbar all work,
 * however long the page gets. A spacer gives the document its length; progress (in beats) glides
 * after the scroll position.
 */

// How much page one beat takes: smaller, each turn of the wheel or swipe carries further.
const PX_PER_BEAT = 460;

export function createScroll(spacer: HTMLElement, length: number) {
  spacer.style.height = `${length * PX_PER_BEAT + innerHeight}px`;
  let target = 0;
  let p = 0;
  let autoplay = false;

  const read = () => (target = clamp(scrollY / PX_PER_BEAT, 0, length));
  addEventListener('scroll', read, { passive: true });
  addEventListener('resize', () => (spacer.style.height = `${length * PX_PER_BEAT + innerHeight}px`));
  // Any manual input takes over from autoplay (keys only when they move the page: turning on the
  // sound or the plate must not stop the film).
  addEventListener('wheel', () => (autoplay = false), { passive: true });
  // A tap on the buttons is not a scroll (or tapping "play" could never pause).
  addEventListener('touchstart', (ev) => !(ev.target as Element | null)?.closest?.('.chips') && (autoplay = false), { passive: true });
  const MOVES = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
  addEventListener('keydown', (ev) => {
    if (MOVES.has(ev.key)) autoplay = false;
  });

  const params = new URLSearchParams(location.search);
  // ?ver=6 freezes the journey at beat 6 without scrolling the page (for reviewing a moment).
  let frozen = params.has('ver') ? clamp(Number(params.get('ver')), 0, length) : null;
  if (params.has('p')) {
    const start = clamp(Number(params.get('p')), 0, length);
    // Wait a frame so the spacer has its height.
    requestAnimationFrame(() => {
      scrollTo(0, start * PX_PER_BEAT);
      p = target = start;
    });
  }

  return {
    length,
    get progress() {
      return p;
    },
    get playing() {
      return autoplay;
    },
    jump(beat: number) {
      autoplay = false;
      scrollTo({ top: clamp(beat, 0, length) * PX_PER_BEAT, behavior: 'smooth' });
    },
    togglePlay() {
      if (!autoplay && target >= length - 0.05) {
        scrollTo(0, 0);
        p = target = 0;
      }
      autoplay = !autoplay;
    },
    /** Holds the journey at a beat (null lets the scroll drive it again). */
    freeze(beat: number | null) {
      frozen = beat === null ? null : clamp(beat, 0, length);
    },
    get held() {
      return frozen;
    },
    /** Returns the progress for this frame. */
    update(dt: number, beatsPerSecond = 0.55) {
      if (frozen !== null) return (p = frozen);
      if (autoplay) {
        const next = Math.min(length, target + dt * beatsPerSecond);
        scrollTo(0, next * PX_PER_BEAT);
        target = next;
        if (next >= length) autoplay = false;
      }
      read();
      // Follows the hand closely (a long glide reads as lag), still smoothing a wheel's steps.
      p = damp(p, target, 4.6, dt);
      return p;
    },
  };
}
