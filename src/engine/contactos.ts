import type { Era } from './eras';

/**
 * A contact sheet of the journey (debug only): renders the film at many beats into one image (the
 * film and its plate), so the whole journey can be reviewed at a glance. Waits at each beat for the
 * eras it needs to arrive from the workers; uses message-channel yields, not timers, so it runs at
 * full speed in a background tab. With a path, it also saves the sheet into the project (dev only).
 */

export interface SheetHost {
  freeze(beat: number | null): void;
  held(): number | null;
  step(now: number): void;
  eras: Era[];
  canvases: HTMLCanvasElement[];
  labelOf(beat: number): string;
}

const tick = () =>
  new Promise<void>((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(0);
  });

export function contactSheet(host: SheetHost) {
  let shown: HTMLElement | null = null;
  return async (beats: number[], cols = 5, width = 1600, path?: string) => {
    await document.fonts?.ready;
    const [film] = host.canvases;
    const tw = Math.floor(width / cols);
    const th = Math.round((tw * film.height) / film.width);
    const out = document.createElement('canvas');
    out.width = cols * tw;
    out.height = Math.ceil(beats.length / cols) * th;
    const g = out.getContext('2d')!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, out.width, out.height);
    const before = host.held();
    for (const [k, b] of beats.entries()) {
      host.freeze(b);
      const t0 = performance.now();
      // Step until no era is on its way, then a few more frames with the arrival fades skipped
      // (ambient motion settles: trails, flows).
      for (let i = 0; performance.now() - t0 < 20000; i++) {
        host.step(performance.now());
        if (i > 1 && !host.eras.some((e) => e.pending)) break;
        const until = performance.now() + 40;
        while (performance.now() < until) await tick();
      }
      for (const e of host.eras) e.born = -1e9;
      for (let i = 0; i < 30; i++) host.step(performance.now() + i * 16.7);
      const x = (k % cols) * tw;
      const y = Math.floor(k / cols) * th;
      for (const c of host.canvases) g.drawImage(c, x, y, tw, th);
      g.font = `${Math.round(tw / 40)}px monospace`;
      g.fillStyle = '#000a';
      g.fillRect(x, y, tw * 0.3, tw / 28);
      g.fillStyle = '#fff';
      g.fillText(`${b.toFixed(1)} ${host.labelOf(b)}`, x + 4, y + tw / 36);
      g.strokeStyle = '#333';
      g.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
    }
    host.freeze(before);
    if (path) {
      const blob = await new Promise<Blob>((res) => out.toBlob((bb) => res(bb!), 'image/jpeg', 0.88));
      await fetch(`/__guardar?f=${encodeURIComponent(path)}`, { method: 'POST', body: blob });
      return path;
    }
    shown?.remove();
    const img = document.createElement('img');
    img.src = out.toDataURL('image/jpeg', 0.85);
    img.style.cssText = 'position:fixed;inset:0;width:100vw;height:auto;z-index:999;background:#000';
    img.onclick = () => img.remove();
    document.body.append(img);
    shown = img;
    return beats.length;
  };
}

/**
 * A continuous clip (debug only, for the README): `n` frames from beat `b0` to `b1`, each a thirtieth
 * of a second after the last, saved as JPG into `dir` (dev only). The film alone by default (no
 * plate), so the README can set its own words beside it.
 */
export function pelicula(host: SheetHost) {
  return async (b0: number, b1: number, n: number, dir: string, plate = false) => {
    await document.fonts?.ready;
    const [film] = host.canvases;
    const out = document.createElement('canvas');
    out.width = film.width;
    out.height = film.height;
    const g = out.getContext('2d')!;
    const before = host.held();
    let now = performance.now();
    // Arrive at the first beat and let everything load and settle.
    host.freeze(b0);
    for (let i = 0; i < 500; i++) {
      host.step((now += 1000 / 30));
      if (i > 1 && !host.eras.some((e) => e.pending)) break;
      const until = performance.now() + 40;
      while (performance.now() < until) await tick();
    }
    for (const e of host.eras) e.born = -1e9;
    for (let i = 0; i < 45; i++) host.step((now += 1000 / 30));
    for (let k = 0; k < n; k++) {
      host.freeze(b0 + ((b1 - b0) * k) / Math.max(1, n - 1));
      // An era arriving mid-clip: wait for it rather than let it pop in.
      for (let w = 0; w < 400 && host.eras.some((e) => e.pending); w++) {
        const until = performance.now() + 25;
        while (performance.now() < until) await tick();
      }
      for (const e of host.eras) if (e.born > -1e8) e.born = -1e9;
      host.step((now += 1000 / 30));
      g.fillStyle = '#000';
      g.fillRect(0, 0, out.width, out.height);
      g.drawImage(film, 0, 0, out.width, out.height);
      if (plate) for (const c of host.canvases.slice(1)) g.drawImage(c, 0, 0, out.width, out.height);
      const blob = await new Promise<Blob>((res) => out.toBlob((bb) => res(bb!), 'image/jpeg', 0.93));
      await fetch(`/__guardar?f=${encodeURIComponent(`${dir}/${String(k).padStart(4, '0')}.jpg`)}`, { method: 'POST', body: blob });
    }
    host.freeze(before);
    return n;
  };
}
