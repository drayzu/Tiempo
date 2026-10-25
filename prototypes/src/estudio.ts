import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './style.css';
import * as THREE from 'three';
import { clamp, damp } from '../../src/lib/math';
import { createStage, liberar } from './stage';
import { FONDOS } from './pantalla';
import { cono, hud, viajeDe } from './placa';
import type { Escena, Frame, Instancia, Lectura } from './tipos';
import { luz } from './escenas/luz';
import { estrella } from './escenas/estrella';
import { ahora } from './escenas/ahora';

/**
 * Tiempo's style study: three key moments (the light set free, the first star, now), each in
 * three ways. The page scroll is time passing; nothing else moves the camera.
 *
 * URL: ?m=luz|estrella|ahora &s=1..3 (style) &p=beat (start there) &ver=beat (freeze) &cap=1600x900
 * (render at that size, for captures) &clean (no chrome). `?debug` exposes `estudio` in the console,
 * with `estudio.hoja(...)` to save contact sheets into docs/estudio/.
 */

const ESCENAS: Escena[] = [luz, estrella, ahora];
const PX_PER_BEAT = 460;

const params = new URLSearchParams(location.search);
const capMatch = /^(\d+)x(\d+)$/.exec(params.get('cap') ?? '');
const fixed = capMatch ? { w: Number(capMatch[1]), h: Number(capMatch[2]) } : null;
if (fixed) document.body.classList.add('is-cap');
if (params.has('clean')) document.body.classList.add('is-clean');

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const plate = document.querySelector<HTMLCanvasElement>('#placa')!;
const g = plate.getContext('2d')!;
const stage = createStage(canvas, fixed);
const spacer = document.querySelector<HTMLElement>('#spacer')!;
const momentos = document.querySelector<HTMLElement>('#momentos')!;
const estilos = document.querySelector<HTMLElement>('#estilos')!;
const blurb = document.querySelector<HTMLElement>('#blurb')!;

let escena = ESCENAS.find((e) => e.id === params.get('m')) ?? ESCENAS[0];
let estilo = clamp(Number(params.get('s') ?? 1) - 1, 0, 2);
let inst: Instancia | null = null;

function fitPlate() {
  if (plate.width !== stage.W || plate.height !== stage.H) {
    plate.width = stage.W;
    plate.height = stage.H;
  }
}

function tabs() {
  momentos.replaceChildren(
    ...ESCENAS.map((e, i) => {
      const b = document.createElement('button');
      b.className = `tab${e === escena ? ' is-on' : ''}`;
      b.innerHTML = `<span class="tab-k">${i + 1}</span>${e.nombre}`;
      b.addEventListener('click', () => montar(e, estilo, 0));
      return b;
    }),
  );
  estilos.replaceChildren(
    ...escena.estilos.map((s, i) => {
      const b = document.createElement('button');
      b.className = `tab${i === estilo ? ' is-on' : ''}`;
      b.innerHTML = `<span class="tab-k">${s.key}</span>${s.nombre}`;
      b.addEventListener('click', () => montar(escena, i, p));
      return b;
    }),
  );
  blurb.textContent = escena.estilos[estilo].nota;
}

let p = 0;
let target = 0;
let autoplay = false;
let frozen: number | null = params.has('ver') ? Number(params.get('ver')) : null;

function montar(e: Escena, s: number, at: number) {
  if (inst) inst.dispose();
  for (const c of [...stage.root.children]) liberar(c);
  FONDOS.length = 0;
  stage.reset();
  escena = e;
  estilo = s;
  inst = e.montar(stage, s);
  spacer.style.height = `${inst.tl.length * PX_PER_BEAT + innerHeight}px`;
  p = target = clamp(at, 0, inst.tl.length);
  scrollTo(0, p * PX_PER_BEAT);
  const url = new URL(location.href);
  url.searchParams.set('m', e.id);
  url.searchParams.set('s', String(s + 1));
  history.replaceState(null, '', url);
  tabs();
}

montar(escena, estilo, params.has('p') ? Number(params.get('p')) : 0);

addEventListener('scroll', () => {
  if (!inst) return;
  target = clamp(scrollY / PX_PER_BEAT, 0, inst.tl.length);
});
addEventListener('wheel', () => (autoplay = false), { passive: true });
addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const k = ev.key.toLowerCase();
  if (k === 'a') autoplay = !autoplay;
  const n = Number(k);
  if (n >= 1 && n <= 3) montar(escena, n - 1, p);
});

const mouse = new THREE.Vector2();
const mouseTarget = new THREE.Vector2();
addEventListener('pointermove', (ev) => mouseTarget.set((ev.clientX / innerWidth) * 2 - 1, -((ev.clientY / innerHeight) * 2 - 1)));
const calm = matchMedia('(prefers-reduced-motion: reduce)');

/** One frame at progress `at` (beats), ambient time `now` (ms), step `dt` (s). */
function step(now: number, dt: number, at: number) {
  if (!inst) return;
  const { camera } = stage;
  const W = stage.W;
  const H = stage.H;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const f: Frame = {
    time: calm.matches ? 0 : now / 1000,
    dt,
    p: at,
    tl: inst.tl,
    W,
    H,
    u: H / 860,
    dpr: stage.dpr,
    focal: H / 2 / tanHalf,
    camera,
  };
  inst.update(f);
  // The camera stays: the pointer only leans the view a little.
  if (!fixed && !calm.matches) {
    mouse.x = damp(mouse.x, mouseTarget.x, 3, dt);
    mouse.y = damp(mouse.y, mouseTarget.y, 3, dt);
    camera.rotateY(-mouse.x * 0.025);
    camera.rotateX(mouse.y * 0.018);
  }
  camera.updateMatrixWorld();
  f.focal = H / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  for (const s of FONDOS) {
    s.seguir(camera);
    s.u.uTime.value = f.time;
    (s.u.uRes.value as THREE.Vector2).set(W, H);
  }
  stage.render(f.time);

  fitPlate();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  const inkT = inst.tinta?.(f) ?? 0;
  inst.placa?.(g, f);
  const l: Lectura = inst.lectura?.(f) ?? { t: Math.pow(10, inst.tl.get('lt', at)), ago: null, ahead: null, now: false };
  cono(g, f, inst.viaje(f), inkT);
  hud(g, f, l, inkT, now);
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (inst) {
    if (autoplay) {
      const next = Math.min(inst.tl.length, target + dt * 0.55);
      scrollTo(0, next * PX_PER_BEAT);
      target = next;
      if (next >= inst.tl.length) autoplay = false;
    }
    p = frozen ?? damp(p, target, 4.6, dt);
  }
  step(now, dt, p);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- captures (?debug)

async function save(path: string, c: HTMLCanvasElement, q = 0.9) {
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', q));
  await fetch(`/__guardar?f=${encodeURIComponent(path)}`, { method: 'POST', body: blob });
}

/** Renders one frame at beat `b` into a 2D canvas (film + plate), after `warm` simulated frames. */
function shot(b: number, warm = 90) {
  const t0 = performance.now();
  for (let k = 0; k < warm; k++) step(t0 + k * 16.7, 1 / 60, b);
  const out = document.createElement('canvas');
  out.width = stage.W;
  out.height = stage.H;
  const o = out.getContext('2d')!;
  o.drawImage(canvas, 0, 0);
  o.drawImage(plate, 0, 0);
  return out;
}

/** A tile's caption: which moment and style, and when. */
function rotular(o: CanvasRenderingContext2D, x: number, y: number, text: string, scale: number) {
  o.save();
  o.font = `500 ${Math.round(13 * scale)}px "Geist Mono Variable"`;
  o.letterSpacing = `${1.2 * scale}px`;
  const w = o.measureText(text).width;
  o.fillStyle = 'rgba(0,0,0,0.62)';
  o.fillRect(x + 8 * scale, y + 8 * scale, w + 16 * scale, 24 * scale);
  o.fillStyle = '#ece7db';
  o.textBaseline = 'middle';
  o.fillText(text, x + 16 * scale, y + 20.5 * scale);
  o.restore();
}

const api = {
  stage,
  get inst() {
    return inst;
  },
  ESCENAS,
  viajeDe,
  seek(b: number | null) {
    frozen = b;
  },
  montar(m: string, s: number, b = 0) {
    montar(ESCENAS.find((e) => e.id === m) ?? escena, s - 1, b);
  },
  /** Saves one frame: `estudio.foto('docs/estudio/luz-a.jpg', 6)`. */
  async foto(path: string, b: number) {
    await document.fonts.ready;
    const was = frozen;
    frozen = b;
    const c = shot(b);
    frozen = was;
    await save(path, c);
    return path;
  },
  /**
   * A contact sheet of this moment: rows are styles, columns the beats given, each frame `tw`
   * wide. Saved to `path`.
   */
  async hoja(path: string, styles: number[], beats: number[], tw = 640, labels = false) {
    await document.fonts.ready;
    const was = frozen;
    const th = Math.round((tw * stage.H) / stage.W);
    const out = document.createElement('canvas');
    out.width = beats.length * tw;
    out.height = styles.length * th;
    const o = out.getContext('2d')!;
    for (const [r, s] of styles.entries()) {
      montar(escena, s - 1, beats[0]);
      // Some scenes load data after mounting (the Earth's land).
      await new Promise((res) => setTimeout(res, 1500));
      for (const [cI, b] of beats.entries()) {
        frozen = b;
        o.drawImage(shot(b), cI * tw, r * th, tw, th);
        if (labels && cI === 0) rotular(o, 0, r * th, `${escena.estilos[s - 1].key} · ${escena.estilos[s - 1].nombre}`, tw / 640);
      }
    }
    frozen = was;
    await save(path, out, 0.88);
    return [out.width, out.height];
  },
  /** Frames from any moment and style, in a grid: items are [moment, style (1..3), beat, label]. */
  async mosaico(path: string, items: [string, number, number, string][], cols: number, tw = 640) {
    await document.fonts.ready;
    const was = frozen;
    const th = Math.round((tw * stage.H) / stage.W);
    const out = document.createElement('canvas');
    out.width = cols * tw;
    out.height = Math.ceil(items.length / cols) * th;
    const o = out.getContext('2d')!;
    let mounted = '';
    for (const [k, [m, s, b, label]] of items.entries()) {
      if (mounted !== `${m}${s}`) {
        montar(ESCENAS.find((e) => e.id === m)!, s - 1, b);
        mounted = `${m}${s}`;
        await new Promise((res) => setTimeout(res, 1500));
      }
      frozen = b;
      const x = (k % cols) * tw;
      const y = Math.floor(k / cols) * th;
      o.drawImage(shot(b), x, y, tw, th);
      if (label) rotular(o, x, y, label, tw / 640);
    }
    frozen = was;
    await save(path, out, 0.9);
    return [out.width, out.height];
  },
};
if (params.has('debug')) Object.assign(window, { estudio: api });
