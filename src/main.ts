import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './style.css';
import * as THREE from 'three';
import { clamp, damp, smoothstep } from './lib/math';
import { AGE, R_OBS, YEAR, logScaleFactor, logTemperature } from './lib/cosmo';
import { bbColor, bbVisible } from './lib/cuerpo-negro';
import { Eras, type Era, type EraData, type EraFrame } from './engine/eras';
import { Timeline } from './engine/timeline';
import { createPost } from './engine/post';
import { createScroll } from './engine/scroll';
import { createScaleDust } from './engine/polvo';
import { createSound } from './engine/sonido';
import { createFondo } from './engine/fondo';
import { createProtagonista } from './engine/protagonista';
import { anillo, cono, hud, nota, proyectar, rotulo, CONO, type Cono, type Lectura } from './engine/placa';
import { contactSheet } from './engine/contactos';
import { crearEras, FINALES, type Final } from './eras';
import { lang, switchLang, tx } from './i18n';

/**
 * Tiempo. The journey is a chain of eras in the order they are lived; each brings its own
 * choreography and together they form one timeline that the page scroll moves through. The camera
 * lives in our place, in first person; time passes over it.
 *
 * Main tracks: `era` (where we are in the chain), `e` (log10 of the metres seen), `lt` (log10 of the
 * seconds since the beginning), the clocks' mode `reloj` with `lb` (years back from now) and `ah`
 * (years ahead), the camera (`yaw`, `pitch`, `roll`, `fov`, and each era's `<id>.fx/fy/fz` to fly
 * through it), and the background (`fondo`: its gain; `horno`: full-bleed light).
 */

const params = new URLSearchParams(location.search);
/** The ending chosen at the fork (`?final=`); the cold, the most likely, by default. */
const FINAL: Final = (FINALES as string[]).includes(params.get('final') ?? '') ? (params.get('final') as Final) : 'frio';
const MODULES = crearEras(FINAL);
const VIEW_H = 2;

const post = createPost(document.querySelector<HTMLCanvasElement>('#scene')!);
const { renderer, scene, camera } = post;
const root = new THREE.Group();
scene.add(root);

/** Two workers generate the eras off the main thread; without them, eras are generated in place. */
function workshop(): ((id: string) => Promise<EraData>) | undefined {
  try {
    const pending = new Map<number, { resolve: (d: EraData) => void; reject: (e: unknown) => void }>();
    const workers = [0, 1].map(() => {
      const w = new Worker(new URL('./engine/taller.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev: MessageEvent<{ ticket: number; data?: EraData; error?: string }>) => {
        const job = pending.get(ev.data.ticket);
        pending.delete(ev.data.ticket);
        if (ev.data.error !== undefined) job?.reject(ev.data.error);
        else job?.resolve(ev.data.data!);
      };
      w.onerror = () => {
        for (const job of pending.values()) job.reject('worker');
        pending.clear();
      };
      return w;
    });
    let ticket = 0;
    return (id) =>
      new Promise((resolve, reject) => {
        const t = ++ticket;
        pending.set(t, { resolve, reject });
        workers[t % workers.length].postMessage({ id, ticket: t });
      });
  } catch {
    return undefined;
  }
}

const eras = new Eras(
  MODULES.map((m) => m.spec),
  root,
  workshop(),
);
// The eras' words in the visitor's language (and the page's own copy).
for (const e of eras.list) {
  e.name = tx(e.name);
  e.fact = tx(e.fact);
  e.label = tx(e.label);
  e.acto = tx(e.acto);
  for (const n of e.notes ?? []) n.text = tx(n.text);
}
document.documentElement.lang = lang;
for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
  const text = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
  if (text) text.textContent = tx(text.textContent!.trim());
}
for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-label]')) el.setAttribute('aria-label', tx(el.getAttribute('aria-label')!));
document.querySelector('meta[name="description"]')?.setAttribute('content', tx(document.querySelector('meta[name="description"]')!.getAttribute('content')!));
const langBtn = document.querySelector<HTMLButtonElement>('#lang')!;
langBtn.querySelector('.chip-t')!.textContent = lang === 'en' ? 'Español' : 'English';
langBtn.querySelector('.chip-k')!.textContent = lang === 'en' ? 'ES' : 'EN';
langBtn.setAttribute('aria-label', lang === 'en' ? 'Ver en español' : 'View in English');
langBtn.addEventListener('click', switchLang);

// ---------------------------------------------------------------- the choreography

const tl = new Timeline({ era: 0, e: eras.list[0].home, lt: -45, lb: 9.6, ah: 0, reloj: 4, yaw: 0, pitch: 0, roll: 0, fov: 50, fondo: 0, horno: 0, bloom: 0.7, umbral: 0.12, silencio: 0 });
const starts = new Map<string, number>();
MODULES.forEach((m, i) => {
  starts.set(eras.list[i].id, tl.length);
  m.choreo(tl, eras.list[i]);
});
// A last breath on the final era, for the closing line.
tl.wait(1.2);

const scroll = createScroll(document.querySelector<HTMLElement>('#spacer')!, tl.length);
const sound = createSound();
const fondo = createFondo();
scene.add(fondo.mesh);
const dust = createScaleDust(post.dpr);
scene.add(dust.points);
const proton = createProtagonista();
root.add(proton.points);

/** What the clocks read at beat p. */
function lecturaAt(p: number): Lectura {
  const reloj = Math.round(tl.get('reloj', p));
  let lt = tl.get('lt', p);
  let logYears = 0;
  let logT: number;
  let logSize: number;
  if (reloj === 1 || reloj === 3) {
    logYears = tl.get(reloj === 1 ? 'lb' : 'ah', p);
    // Far ahead the years themselves overflow (10¹⁰⁰ and beyond): work in logarithms.
    const years = Math.pow(10, Math.min(logYears, 300));
    const t = reloj === 1 ? AGE : AGE + years * YEAR;
    lt = Math.log10(t);
    if (logYears > 300) {
      // Exponential expansion: log10 a grows linearly with time, and the temperature falls with it.
      const logA = logScaleFactor(AGE + 1e300 * YEAR) * Math.pow(10, logYears - 300);
      logT = Math.log10(2.7255) - logA;
      logSize = Math.log10(2 * R_OBS) + logA;
    } else {
      logT = logTemperature(t);
      logSize = Math.log10(2 * R_OBS) + logScaleFactor(t);
    }
  } else {
    const t = reloj === 2 ? AGE : Math.pow(10, lt);
    if (reloj === 2) lt = Math.log10(AGE);
    logT = logTemperature(t);
    logSize = Math.log10(2 * R_OBS) + logScaleFactor(t);
  }
  return { reloj, lt, logYears, years: Math.pow(10, Math.min(logYears, 300)), logT, logSize };
}

// The cone: one tick per era, and the colour of the universe along the whole journey.
const conoData: Cono = (() => {
  const ticks = eras.list.map((e) => ({ beat: tl.at(e.id), label: e.label, acto: e.acto, certeza: e.certeza }));
  const colors: string[] = [];
  const bb = { r: 0, g: 0, b: 0 };
  for (let k = 0; k <= 120; k++) {
    const p = (k / 120) * tl.length;
    const l = lecturaAt(p);
    const T = Math.pow(10, Math.min(l.logT, 30));
    const v = bbVisible(T) * tl.get('fondo', p);
    bbColor(T, bb);
    const kk = 0.12 + 0.75 * v;
    const gam = (x: number) => Math.round(255 * Math.pow(Math.min(1, x * kk), 1 / 2.2));
    colors.push(v > 0.002 ? `rgba(${gam(bb.r)},${gam(bb.g)},${gam(bb.b)},${0.25 + 0.6 * v})` : 'rgba(143,180,255,0.05)');
  }
  return { length: tl.length, ticks, colors, fork: tl.at('bifurcacion') / tl.length };
})();

// The cone's eras as buttons: they jump, and they tell the canvas what the pointer is on.
const ruler = document.querySelector<HTMLElement>('#ruler')!;
let hovered: number | null = null;
conoData.ticks.forEach((t, i) => {
  const b = document.createElement('button');
  b.style.top = `${(t.beat / tl.length) * 100}%`;
  b.setAttribute('aria-label', `${t.label}`);
  b.addEventListener('click', () => scroll.jump(t.beat));
  b.addEventListener('pointerenter', () => (hovered = i));
  b.addEventListener('pointerleave', () => (hovered = null));
  b.addEventListener('focus', () => (hovered = i));
  b.addEventListener('blur', () => (hovered = null));
  ruler.appendChild(b);
});

// ---------------------------------------------------------------- the chrome

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const intro = $('#intro');
const outro = $('#outro');
const leer = $('#leer');
const playBtn = $<HTMLButtonElement>('#play');
const soundBtn = $<HTMLButtonElement>('#sound');
const plateBtn = $<HTMLButtonElement>('#plate');
let plateOn = params.has('lamina');
const showToggle = (b: HTMLButtonElement, on: boolean) => {
  b.classList.toggle('is-on', on);
  b.setAttribute('aria-pressed', String(on));
};
showToggle(plateBtn, plateOn);
playBtn.addEventListener('click', () => scroll.togglePlay());
soundBtn.addEventListener('click', () => showToggle(soundBtn, sound.toggle()));
plateBtn.addEventListener('click', () => showToggle(plateBtn, (plateOn = !plateOn)));
addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const k = ev.key.toLowerCase();
  if (k === 'a') scroll.togglePlay();
  if (k === 's') showToggle(soundBtn, sound.toggle());
  if (k === 'i') showToggle(plateBtn, (plateOn = !plateOn));
  if (k === 'l') switchLang();
});

// The fork: from here on physics is not sure; the visitor chooses how it ends (kept in the URL).
const finales = $('#finales');
const forkAt = tl.at('bifurcacion');
for (const b of finales.querySelectorAll<HTMLButtonElement>('button[data-final]')) {
  b.classList.toggle('is-on', b.dataset.final === FINAL);
  b.addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.set('final', b.dataset.final!);
    url.searchParams.set('p', (forkAt + 4.4).toFixed(2));
    location.href = url.toString();
  });
}

const plate = $<HTMLCanvasElement>('#placa');
const g = plate.getContext('2d')!;

/** Portrait screens show a little more, so eras are not cropped at the sides. */
let fit = 1;
const refit = () => {
  fit = Math.max(1, Math.min(1.7, 0.78 / (innerWidth / innerHeight)));
};
refit();
addEventListener('resize', () => {
  post.resize();
  refit();
});

const mouse = new THREE.Vector2();
const mouseTarget = new THREE.Vector2();
addEventListener('pointermove', (ev) => mouseTarget.set((ev.clientX / innerWidth) * 2 - 1, -((ev.clientY / innerHeight) * 2 - 1)));
const calm = matchMedia('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------- the frame

const travel = new THREE.Vector3();
const orbit = new THREE.Quaternion();
const look = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const tint = new THREE.Color();
const tintB = new THREE.Color();
const alphas = new Map<string, number>();
const alphaOf = (id: string) => alphas.get(id) ?? 0;
const protonAt = new THREE.Vector3();
const tmp = new THREE.Vector3();

let last = performance.now();
let prevE = tl.get('e', 0);
let prevLt = tl.get('lt', 0);
let speakTimer = 0;
let atEnd = 0;
let lastSilencio = 0;
let lastP = 0;

function step(now: number) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const time = calm.matches ? 0 : now / 1000;
  const p = scroll.update(dt);
  const e = tl.get('e', p);
  const eraT = tl.get('era', p);
  const l = lecturaAt(p);
  const zoomSpeed = (e - prevE) / Math.max(dt, 1e-3);
  const timeSpeed = (l.lt - prevLt) / Math.max(dt, 1e-3);
  prevE = e;
  prevLt = l.lt;

  // Camera: dolly zoom as in Potencias (the field of view changes, the scale at the focus does not).
  const fov = tl.get('fov', p);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  camera.fov = fov;
  camera.position.set(0, 0, VIEW_H / 2 / tanHalf);
  camera.far = Math.max(400, camera.position.z * 40);
  camera.near = Math.max(0.0005, camera.position.z * 1e-4);
  camera.updateProjectionMatrix();

  eras.place(
    eraT,
    e,
    VIEW_H / fit,
    (i) => {
      const id = eras.list[i].id;
      travel.set(tl.get(`${id}.fx`, p), tl.get(`${id}.fy`, p), tl.get(`${id}.fz`, p));
      return travel.lengthSq() > 0 ? travel : null;
    },
    (i) => tl.get(`${eras.list[i].id}.keep`, p),
  );
  eras.warm();

  // The view: the choreography's angles, and a little of the pointer.
  mouse.x = damp(mouse.x, mouseTarget.x, 3, dt);
  mouse.y = damp(mouse.y, mouseTarget.y, 3, dt);
  orbit.setFromEuler(euler.set(tl.get('pitch', p), tl.get('yaw', p), tl.get('roll', p), 'YXZ'));
  look.setFromEuler(euler.set(calm.matches ? 0 : -mouse.y * 0.1, calm.matches ? 0 : mouse.x * 0.16, 0, 'YXZ'));
  root.quaternion.copy(look).multiply(orbit);
  root.updateMatrixWorld();
  camera.updateMatrixWorld();

  // The background: the temperature of the universe (or what an era says it is: the crunch heats it).
  const eraNow = eras.list[eras.segment + (eras.blend > 0.5 ? 1 : 0)];
  const over0 = eraNow.content?.lectura?.(({ tl, p, e, alpha: eraNow.alpha } as unknown) as EraFrame);
  const cielo = over0?.logTCielo ?? over0?.logT;
  fondo.update(l.lt, dt, time, camera, tl.get('fondo', p), tl.get('horno', p), { logT: cielo !== undefined && Number.isFinite(cielo) ? cielo : undefined, clear: over0?.claro });

  // Eras.
  const W = renderer.domElement.width;
  const H = renderer.domElement.height;
  const focal = H / 2 / tanHalf;
  for (const era of eras.list) alphas.set(era.id, era.alpha);
  const frames = new Map<string, EraFrame>();
  const frameOf = (era: Era): EraFrame => {
    let f = frames.get(era.id);
    if (!f) {
      f = { time, dt, p, tl, lt: l.lt, T: fondo.state.T, e, home: era.home, alpha: era.alpha, alphaOf, into: era.into, out: era.out, camera, focal, dpr: post.dpr, W, H };
      frames.set(era.id, f);
    }
    return f;
  };
  let eraInk = 0;
  for (const era of eras.list) {
    if (!era.content || !era.group.visible) continue;
    for (const c of era.content.clouds) {
      c.u.uTime.value = time;
      c.u.uFocal.value = focal;
      c.u.uMinPx.value = 1.6 * post.dpr;
      c.u.uMaxPx.value = 26 * post.dpr;
      c.u.uAlpha.value = era.alpha;
      c.u.uCamDist.value = camera.position.z;
    }
    const f = frameOf(era);
    era.content.update?.(f);
    eraInk = Math.max(eraInk, (era.content.tinta?.(f) ?? 0) * era.alpha);
  }
  const inkT = Math.max(fondo.state.tinta, eraInk);

  // Our proton.
  const pr = eras.proton(frameOf, protonAt);
  proton.update(pr, post.dpr, inkT, dt);

  const a = eras.list[eras.segment];
  const b = eras.list[eras.segment + 1];
  tint.setHex(a.tint).lerp(tintB.setHex(b.tint), eras.blend);
  dust.update(e, zoomSpeed, innerWidth / innerHeight, tint);

  // Over a bright full-bleed sky the bloom would fill in every dark speck: it gives way.
  const bright = fondo.state.bgL;
  post.bloom.strength = tl.get('bloom', p) * (1 - 0.75 * Math.min(1, bright * 1.5));
  post.bloom.threshold = tl.get('umbral', p) + 1.6 * bright;
  post.render(time, zoomSpeed);

  // ---- the plate
  if (plate.width !== W || plate.height !== H) {
    plate.width = W;
    plate.height = H;
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  const u = H / 860;
  const toScreen = (era: Era) => (v: THREE.Vector3) => proyectar(tmp.copy(v).applyMatrix4(era.group.matrixWorld), camera, W, H);
  for (const era of eras.list) {
    if (!era.content || !era.group.visible) continue;
    era.content.placa?.(g, { ...frameOf(era), u }, plateOn, toScreen(era));
    if (era.alpha < 0.45) continue;
    // Its notes (plate layer), leaders pointing away from the centre.
    for (const n of era.notes ?? []) {
      if (!plateOn && !n.always) continue;
      if (n.when && tl.get(n.when, p) < 0.5) continue;
      const s = toScreen(era)(tmp.set(...n.at));
      if (s.z > 1 || s.x < 24 * u || s.x > W - 140 * u || s.y < 24 * u || s.y > H - 24 * u) continue;
      const dx = s.x - W / 2;
      const dy = s.y - H / 2;
      const len = Math.hypot(dx, dy) || 1;
      nota(g, u, s.x, s.y, n.text, (dx / len) * 40 + (dx >= 0 ? 8 : -8), (dy / len) * 30 - 8, inkT, era.alpha);
    }
  }
  if (pr && proton.visible) {
    const s = proyectar(tmp.copy(protonAt).applyMatrix4(root.matrixWorld), camera, W, H);
    if (s.z < 1) anillo(g, u, s.x, s.y, proton.alpha);
  }
  // Provisional eras say so (phase 1: the skeleton of the journey).
  const cur = eras.list[eras.segment + (eras.blend > 0.5 ? 1 : 0)];
  // Where the standard history does not apply (inflation), the era says what the clocks read.
  const over = cur.content?.lectura?.(frameOf(cur));
  if (over?.logSize !== undefined) l.logSize = over.logSize;
  if (over?.logT !== undefined) l.logT = over.logT;
  if ((cur as Era & { provisional?: boolean }).provisional) rotulo(g, u, W / 2, 26 * u, tx('era provisional'), 9.5, inkT, 0.5);

  let here = 0;
  conoData.ticks.forEach((t, i) => {
    if (t.beat <= p + 1e-6) here = i;
  });
  const introOut = Math.min(1, Math.max(0, (p - 0.05) / 0.55));
  cono(g, u, W, H, conoData, p, inkT, hovered, here, introOut);
  const named = tl.captionAt(p) ?? (cur ? { name: cur.name, fact: cur.fact } : null);
  if (hud(g, u, H, l, named, inkT, now, introOut)) {
    sound.chime();
    clearTimeout(speakTimer);
    speakTimer = window.setTimeout(() => (leer.textContent = named ? `${named.name}. ${named.fact}` : ''), 400);
  }

  intro.style.opacity = String(1 - introOut);
  intro.style.transform = `translateY(${-introOut * 40}px)`;
  ruler.style.opacity = String(introOut);
  outro.classList.toggle('is-in', p > tl.length - 0.6);
  finales.classList.toggle('is-in', p > forkAt - 0.3 && p < forkAt + 4.4);
  // The loop: the end draws the cover again; a moment there, and the journey begins anew.
  if (p > tl.length - 0.03 && scroll.held === null) {
    atEnd += dt;
    if (atEnd > 1.8) {
      atEnd = 0;
      scroll.restart();
    }
  } else atEnd = 0;
  playBtn.classList.toggle('is-on', scroll.playing);
  // The plasma rings while the universe is opaque (from its first seconds); the end falls silent,
  // and the moment the silence arrives is the last bell.
  const silencio = tl.get('silencio', p);
  if (silencio >= 0.9 && lastSilencio < 0.9 && p > lastP) sound.ultima();
  lastSilencio = silencio;
  lastP = p;
  sound.update({
    logT: Number.isNaN(l.logT) ? -2 : l.logT,
    speed: timeSpeed + zoomSpeed,
    era: eras.segment + (eras.blend > 0.5 ? 1 : 0),
    plasma: (1 - fondo.state.clear) * smoothstep(-1, 2, l.lt) * Math.min(1, tl.get('fondo', p)),
    wave: fondo.state.wave,
    silencio,
  });
}

/** Adaptive quality, as in Potencias: fewer pixels when frames run slow, more when there is room. */
let quality = 1;
let avg = 1 / 60;
let slow = 0;
let fast = 0;
let lastRaw = performance.now();
function adapt(now: number) {
  const raw = (now - lastRaw) / 1000;
  lastRaw = now;
  if (now < 4000 || raw > 0.1 || document.visibilityState !== 'visible') return;
  avg += (raw - avg) * 0.05;
  if (avg > 1 / 40) {
    slow += raw;
    fast = 0;
  } else if (avg < 1 / 57) {
    fast += raw;
    slow = 0;
  } else slow = fast = 0;
  if (slow > 2 && quality > 0.6) {
    quality = Math.max(0.6, quality * 0.85);
    post.setQuality(quality);
    slow = 0;
    avg = 1 / 50;
  } else if (fast > 8 && quality < 1) {
    quality = Math.min(1, quality * 1.12);
    post.setQuality(quality);
    fast = 0;
  }
}

function frame(now: number) {
  adapt(now);
  step(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// `?debug`: the eras and timeline in the console, and `tiempo.sheet([beats], cols, width, path?)`.
if (params.has('debug')) {
  const sheet = contactSheet({
    freeze: (b) => scroll.freeze(b),
    held: () => scroll.held,
    step,
    eras: eras.list,
    canvases: [renderer.domElement, plate],
    labelOf: (b) => {
      let id = '';
      for (const e of eras.list) if (tl.at(e.id) <= b + 1e-6) id = e.id;
      return id;
    },
  });
  // Shaders that failed to compile (an era whose GLSL clashes would otherwise just not show).
  const errores = () =>
    (renderer.info.programs ?? [])
      .filter((pr) => (pr as unknown as { diagnostics?: { runnable: boolean } }).diagnostics?.runnable === false)
      .map((pr) => (pr as unknown as { name: string; diagnostics: { vertexShader: { log: string } } }).diagnostics.vertexShader.log.slice(0, 300));
  Object.assign(window, { tiempo: { eras, tl, camera, root, sound, post, renderer, sheet, step, errores, seek: (b: number | null) => scroll.freeze(b), at: (id: string) => tl.at(id), clamp } });
}
