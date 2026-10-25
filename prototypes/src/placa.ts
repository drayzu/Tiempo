import * as THREE from 'three';
import { clamp, smoothstep } from '../../src/lib/math';
import { AGE, LY, YEAR, cosmicCalendar, patchRadius, temperature } from '../../src/lib/cosmo';
import { bbColor, bbVisible } from '../../src/lib/cuerpo-negro';
import type { Frame, Lectura } from './tipos';

/**
 * The plate: everything drawn in 2D over the film, in device pixels, so a capture holds it too.
 * - The three clocks (bottom left): the time as a power of ten, then «so long after the beginning
 *   · so long ago», the temperature and the size of our patch of universe, and Sagan's cosmic
 *   calendar.
 * - The cone of time (right): the whole journey, narrow at the beginning and widening; filled with
 *   the colour of the universe at each moment; solid where observed, dashed where theory, dotted
 *   where speculation; the endings fork near the bottom.
 * - Notes: a dot on the thing, a leader, a label (Potencias' plate).
 */

export const FONT = {
  serif: (px: number) => `${px}px "Instrument Serif"`,
  italic: (px: number) => `italic ${px}px "Instrument Serif"`,
  mono: (px: number) => `500 ${px}px "Geist Mono Variable"`,
  sans: (px: number) => `500 ${px}px "Geist Variable"`,
};

export const ACCENT = '#8fb4ff';
const LIGHT = [236, 231, 219];
const DARK = [26, 21, 16];

/** Interface ink for `t` (0 light ink on dark film .. 1 dark ink on bright film). */
export function ink(t: number, a = 1) {
  const c = LIGHT.map((v, i) => Math.round(v + (DARK[i] - v) * t));
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
const halo = (t: number, a: number) => (t < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,246,232,${a * 0.8})`);

// ---------------------------------------------------------------- numbers, in Spanish

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
export const sup = (n: number) => [...String(n)].map((ch) => SUP[ch] ?? ch).join('');

const group = (n: number) => {
  const s = String(Math.round(n));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};
const sig = (v: number, digits = 2) => {
  if (v === 0) return '0';
  const k = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - digits + 1);
  const r = Math.round(v / k) * k;
  return r >= 1000 ? group(r) : String(Number(r.toPrecision(digits))).replace('.', ',');
};

/** A span of years in words: «380 000 años», «150 millones de años», «10¹⁴ años». */
export function anios(y: number, digits = 2): string {
  const s = y * YEAR;
  if (s < 60) return plural(s, 'segundo');
  if (s < 3600) return plural(s / 60, 'minuto');
  if (s < 86400) return plural(s / 3600, 'hora');
  if (y < 1) return plural(y * 365.25, 'día');
  if (y < 1e6) return plural(roundSig(y, digits), 'año');
  if (y < 1e12) {
    const m = roundSig(y / 1e6, digits);
    if (m === 1) return '1 millón de años';
    return `${m >= 1000 ? group(m) : String(m).replace('.', ',')} millones de años`;
  }
  return `10${sup(Math.floor(Math.log10(y)))} años`;
}
/** Rounded to `d` significant digits (never below units). */
function roundSig(v: number, d: number) {
  const k = Math.pow(10, Math.floor(Math.log10(v)) - d + 1);
  return k >= 1 ? Math.round(v / k) * k : Number(v.toPrecision(d));
}
function plural(v: number, w: string) {
  const r = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  const s = r >= 1000 ? group(r) : String(r).replace('.', ',');
  return `${s} ${w}${r === 1 ? '' : 's'}`;
}

export function kelvin(T: number) {
  if (T >= 1e5) return `10${sup(Math.floor(Math.log10(T)))} K`;
  if (T >= 100) return `${group(Number(sig(T, 3).replace(/ /g, '')))} K`;
  return `${sig(T, 2)} K`;
}

/** A length in the unit a reader would use. */
export function largo(m: number) {
  const units: [number, string][] = [
    [LY * 1e9, 'mil millones de años luz'],
    [LY * 1e6, 'millones de años luz'],
    [LY, 'años luz'],
    [1.496e11, 'UA'],
    [1e3, 'km'],
    [1, 'm'],
  ];
  const [u, name] = units.find(([u]) => m >= u) ?? [1, 'm'];
  if (m < 1e-3) return `10${sup(Math.floor(Math.log10(m)))} m`;
  return `${sig(m / u, 2)} ${name}`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function calendario(t: number) {
  const { day, secondOfDay } = cosmicCalendar(t);
  let d = Math.min(day, 364);
  let m = 0;
  while (d >= DIAS_MES[m]) d -= DIAS_MES[m++];
  const hh = Math.floor(secondOfDay / 3600);
  const mm = Math.floor((secondOfDay % 3600) / 60);
  const ss = Math.floor(secondOfDay % 60);
  const two = (n: number) => String(n).padStart(2, '0');
  const clock = day >= 364 && hh >= 20 ? `${two(hh)}:${two(mm)}:${two(ss)}` : `${two(hh)}:${two(mm)}`;
  return `${d + 1} de ${MESES[m]}, ${clock}`;
}

// ---------------------------------------------------------------- drawing helpers

export function proyectar(v: THREE.Vector3, camera: THREE.Camera, W: number, H: number, out = { x: 0, y: 0, z: 0 }) {
  const p = v.clone().project(camera);
  out.x = ((p.x + 1) / 2) * W;
  out.y = ((1 - p.y) / 2) * H;
  out.z = p.z;
  return out;
}

/** A power of ten with its exponent raised: returns the width drawn. */
function potencia(g: CanvasRenderingContext2D, x: number, y: number, exp: number, unit: string, px: number, inkT: number, prefix = '') {
  let cx = x;
  if (prefix) {
    g.font = FONT.italic(px * 0.42);
    g.fillStyle = ink(inkT, 0.6);
    g.fillText(prefix, cx, y);
    cx += g.measureText(prefix).width + px * 0.14;
  }
  g.font = FONT.serif(px);
  g.fillStyle = ink(inkT);
  g.fillText('10', cx, y);
  cx += g.measureText('10').width + px * 0.02;
  g.font = FONT.serif(px * 0.52);
  const e = String(exp).replace('-', '−');
  g.fillText(e, cx, y - px * 0.42);
  cx += g.measureText(e).width + px * 0.12;
  g.font = FONT.serif(px * 0.4);
  g.fillStyle = ink(inkT, 0.6);
  g.fillText(unit, cx, y);
  return cx + g.measureText(unit).width - x;
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** A note: a dot on the thing, a leader out to (x + dx, y + dy), and its label. */
export function nota(g: CanvasRenderingContext2D, u: number, x: number, y: number, text: string, dx: number, dy: number, inkT = 0, alpha = 1, accent = ACCENT) {
  if (alpha <= 0.01) return;
  g.save();
  g.globalAlpha = alpha;
  const lx = x + dx * u;
  const ly = y + dy * u;
  g.strokeStyle = ink(inkT, 0.55);
  g.lineWidth = Math.max(1, u * 0.9);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(lx, ly);
  g.stroke();
  g.fillStyle = accent;
  g.beginPath();
  g.arc(x, y, 2.4 * u, 0, Math.PI * 2);
  g.fill();
  g.font = FONT.mono(10.5 * u);
  g.letterSpacing = `${1.1 * u}px`;
  const label = text.toUpperCase();
  const w = g.measureText(label).width;
  const left = dx >= 0;
  const tx = left ? lx + 6 * u : lx - 6 * u - w;
  g.fillStyle = inkT < 0.5 ? 'rgba(4,4,8,0.5)' : 'rgba(255,248,236,0.45)';
  g.fillRect(tx - 5 * u, ly - 9 * u, w + 10 * u, 17 * u);
  g.fillStyle = ink(inkT, 0.92);
  g.textBaseline = 'middle';
  g.fillText(label, tx, ly + 0.5 * u);
  g.restore();
}

/** A label alone (no leader), centred on (x, y). */
export function rotulo(g: CanvasRenderingContext2D, u: number, x: number, y: number, text: string, px = 10.5, inkT = 0, alpha = 1, upper = true, color?: string) {
  if (alpha <= 0.01) return;
  g.save();
  g.globalAlpha = alpha;
  g.font = FONT.mono(px * u);
  g.letterSpacing = upper ? `${1.1 * u}px` : '0px';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = halo(inkT, 0.9);
  g.shadowBlur = 8 * u;
  g.fillStyle = color ?? ink(inkT, 0.85);
  g.fillText(upper ? text.toUpperCase() : text, x, y);
  g.restore();
}

/** A centred label «pre 10^exp post», the exponent drawn raised (mono fonts lack ⁴–⁹). */
export function rotuloPot(g: CanvasRenderingContext2D, u: number, x: number, y: number, pre: string, exp: number, post: string, px = 11, inkT = 0, alpha = 1) {
  if (alpha <= 0.01) return;
  g.save();
  g.globalAlpha = alpha;
  g.letterSpacing = '0px';
  g.textBaseline = 'middle';
  g.shadowColor = halo(inkT, 0.9);
  g.shadowBlur = 8 * u;
  const big = FONT.mono(px * u);
  const small = FONT.mono(px * 0.68 * u);
  const e = String(exp).replace('-', '−');
  g.font = big;
  const a = `${pre}10`;
  const wa = g.measureText(a).width;
  const wc = g.measureText(post).width;
  g.font = small;
  const wb = g.measureText(e).width;
  let cx = x - (wa + wb + wc + 2 * u) / 2;
  g.fillStyle = ink(inkT, 0.85);
  g.font = big;
  g.fillText(a, cx, y);
  cx += wa + 1 * u;
  g.font = small;
  g.fillText(e, cx, y - px * 0.38 * u);
  cx += wb + 1 * u;
  g.font = big;
  g.fillText(post, cx, y);
  g.restore();
}

// ---------------------------------------------------------------- the journey, for the cone

export type Certeza = 'O' | 'T' | 'E';
/** The journey's eras: where they sit on it (0..1), their span of time (log10 s), their certainty. */
export const ERAS: { nombre: string; s0: number; s1: number; lt0: number; lt1: number; c: Certeza }[] = [
  { nombre: 'Antes del tiempo', s0: 0, s1: 0.03, lt0: -46, lt1: -43.3, c: 'E' },
  { nombre: 'El primer segundo', s0: 0.03, s1: 0.15, lt0: -43.3, lt1: 0, c: 'T' },
  { nombre: 'La niebla', s0: 0.15, s1: 0.27, lt0: 0, lt1: 13.08, c: 'O' },
  { nombre: 'Oscuridad y amanecer', s0: 0.27, s1: 0.4, lt0: 13.08, lt1: 16.5, c: 'O' },
  { nombre: 'Nosotros', s0: 0.4, s1: 0.62, lt0: 16.5, lt1: Math.log10(AGE), c: 'O' },
  { nombre: 'El futuro cercano', s0: 0.62, s1: 0.75, lt0: Math.log10(AGE), lt1: 21.5, c: 'T' },
  { nombre: 'El largo final', s0: 0.75, s1: 0.9, lt0: 21.5, lt1: 107.5, c: 'T' },
  { nombre: 'Después del tiempo', s0: 0.9, s1: 1, lt0: 107.5, lt1: 120, c: 'E' },
];

/** Where time t (s) sits on the journey. */
export function viajeDe(lt: number) {
  for (const e of ERAS) if (lt <= e.lt1) return e.s0 + ((clamp(lt, e.lt0, e.lt1) - e.lt0) / (e.lt1 - e.lt0)) * (e.s1 - e.s0);
  return 1;
}

const tmp = { r: 0, g: 0, b: 0 };
function colorAt(s: number) {
  const e = ERAS.find((x) => s <= x.s1) ?? ERAS[ERAS.length - 1];
  if (e.c === 'E' && e.s0 === 0) return null;
  const lt = e.lt0 + ((s - e.s0) / (e.s1 - e.s0)) * (e.lt1 - e.lt0);
  const T = temperature(Math.pow(10, Math.min(lt, 19)));
  const v = bbVisible(T);
  bbColor(T, tmp);
  const k = 0.12 + 0.75 * v;
  const gam = (x: number) => Math.round(255 * Math.pow(Math.min(1, x * k), 1 / 2.2));
  return v > 0.002 ? `rgba(${gam(tmp.r)},${gam(tmp.g)},${gam(tmp.b)},${0.25 + 0.6 * v})` : 'rgba(143,180,255,0.05)';
}

let coneGrad: { H: number; grad: CanvasGradient } | null = null;

/** The cone of time at the right; `s` is where we are (0..1). */
export function cono(g: CanvasRenderingContext2D, f: Frame, s: number, inkT: number, nombreEra = true) {
  const { u, W, H } = f;
  const cx = W - 70 * u;
  const y0 = 0.15 * H;
  const y1 = 0.85 * H;
  const half = (q: number) => 1.5 * u + 30 * u * Math.pow(q, 0.75);
  const yAt = (q: number) => y0 + q * (y1 - y0);
  g.save();

  // The fill: the colour of the universe along the journey.
  if (!coneGrad || coneGrad.H !== H) {
    const grad = g.createLinearGradient(0, y0, 0, y1);
    for (let k = 0; k <= 80; k++) {
      const q = k / 80;
      grad.addColorStop(q, colorAt(q) ?? 'rgba(0,0,0,0)');
    }
    coneGrad = { H, grad };
  }
  g.beginPath();
  for (let k = 0; k <= 60; k++) {
    const q = k / 60;
    g.lineTo(cx - half(q), yAt(q));
  }
  for (let k = 60; k >= 0; k--) {
    const q = k / 60;
    g.lineTo(cx + half(q), yAt(q));
  }
  g.closePath();
  g.fillStyle = coneGrad.grad;
  g.globalAlpha = 0.55;
  g.fill();
  g.globalAlpha = 1;

  // The edges, era by era: solid observed, dashed theory, dotted speculation.
  g.lineWidth = Math.max(1, u);
  for (const e of ERAS) {
    g.setLineDash(e.c === 'O' ? [] : e.c === 'T' ? [5 * u, 4 * u] : [1.2 * u, 3.4 * u]);
    g.strokeStyle = ink(inkT, 0.42);
    for (const side of [-1, 1]) {
      g.beginPath();
      for (let k = 0; k <= 12; k++) {
        const q = e.s0 + ((e.s1 - e.s0) * k) / 12;
        g.lineTo(cx + side * half(q), yAt(q));
      }
      g.stroke();
    }
    // A thin band line at each era's start.
    g.setLineDash([]);
    g.strokeStyle = ink(inkT, 0.16);
    g.beginPath();
    g.moveTo(cx - half(e.s0), yAt(e.s0));
    g.lineTo(cx + half(e.s0), yAt(e.s0));
    g.stroke();
  }
  // The endings fork: two dotted branches leave the cone where physics stops being sure.
  g.setLineDash([1.2 * u, 3.4 * u]);
  g.strokeStyle = ink(inkT, 0.32);
  const qf = 0.74;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + side * half(qf), yAt(qf));
    g.bezierCurveTo(cx + side * (half(qf) + 10 * u), yAt(qf + 0.04), cx + side * (half(qf) + 24 * u), yAt(qf + 0.08), cx + side * (half(qf) + 30 * u), yAt(qf + 0.15));
    g.stroke();
  }
  g.setLineDash([]);

  // Where we are: the accent across the cone.
  const ym = yAt(s);
  const hw = half(s);
  g.strokeStyle = ACCENT;
  g.shadowColor = ACCENT;
  g.shadowBlur = 10 * u;
  g.lineWidth = Math.max(1, 1.2 * u);
  g.beginPath();
  g.moveTo(cx - hw - 8 * u, ym);
  g.lineTo(cx + hw + 4 * u, ym);
  g.stroke();
  g.fillStyle = ACCENT;
  g.beginPath();
  g.arc(cx + hw + 4 * u, ym, 3.2 * u, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;

  if (nombreEra) {
    const e = ERAS.find((x) => s <= x.s1) ?? ERAS[ERAS.length - 1];
    g.font = FONT.mono(9.5 * u);
    g.letterSpacing = `${1.4 * u}px`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    g.shadowColor = halo(inkT, 0.9);
    g.shadowBlur = 8 * u;
    g.fillStyle = ink(inkT, 0.7);
    g.fillText(e.nombre.toUpperCase(), cx - hw - 14 * u, ym);
  }
  g.restore();
}

// ---------------------------------------------------------------- the three clocks

interface Shown {
  key: string;
  name: string;
  fact: string;
  since: number;
}
let shown: Shown = { key: '', name: '', fact: '', since: 0 };
let leaving: Shown | null = null;

const reloj = new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const loaded = performance.now();

export function hud(g: CanvasRenderingContext2D, f: Frame, l: Lectura, inkT: number, now: number) {
  const { u, H } = f;
  const x = 42 * u;
  let y = H - 40 * u;
  g.save();
  g.textBaseline = 'alphabetic';
  g.shadowColor = halo(inkT, 0.85);
  g.shadowBlur = 12 * u;

  // Bottom up: the calendar, the temperature and size, the human reading, the power of ten.
  const mono = (text: string, a: number) => {
    g.font = FONT.mono(11.5 * u);
    g.letterSpacing = `${0.4 * u}px`;
    g.fillStyle = ink(inkT, a);
    g.fillText(text, x, y);
    y -= 19 * u;
  };
  const T = temperature(l.t);
  if (l.now) {
    const age = (now - loaded) / 1000;
    mono(`calendario cósmico: 31 de diciembre, 24:00`, 0.42);
    mono(`edad del universo: 13 787 000 000 años y ${Math.floor(age)} s  (± 20 millones de años)`, 0.62);
    mono(`ahora: ${reloj.format(new Date())}`, 0.85);
  } else if (l.ago !== null) {
    mono(`calendario cósmico: ${calendario(l.t)}`, 0.42);
    mono(`${anios(l.t / YEAR, 5)} después del inicio`, 0.62);
    mono(`hace ${anios(l.ago, 2)}`, 0.85);
  } else if (l.ahead !== null) {
    mono(`calendario cósmico: el año siguiente`, 0.42);
    mono(`${kelvin(T)}`, 0.62);
    mono(`dentro de ${anios(l.ahead, 2)}`, 0.85);
  } else {
    mono(`calendario cósmico: ${calendario(l.t)}`, 0.42);
    mono(`${kelvin(T)}  ·  nuestro universo medía ${largo(2 * patchRadius(l.t))}`, 0.62);
    const since = l.t / YEAR;
    mono(`${anios(since, 2)} después del inicio  ·  hace ${anios((AGE - l.t) / YEAR, 5)}`, 0.85);
  }

  // The power of ten.
  y -= 6 * u;
  const big = 76 * u;
  if (l.now) {
    g.font = FONT.serif(big);
    g.fillStyle = ink(inkT);
    g.fillText('Ahora', x, y);
  } else if (l.ago !== null) {
    // Within the last year the years' exponent goes negative: count seconds instead.
    // (the order of magnitude: 420 million years ago reads «hace 10⁸ años»)
    if (l.ago >= 1) potencia(g, x, y, Math.floor(Math.log10(l.ago) + 1e-9), 'años', big, inkT, 'hace');
    else potencia(g, x, y, Math.floor(Math.log10(Math.max(l.ago * YEAR, 1e-3)) + 1e-9), 's', big, inkT, 'hace');
  } else if (l.ahead !== null) {
    if (l.ahead >= 1) potencia(g, x, y, Math.floor(Math.log10(l.ahead) + 1e-9), 'años', big, inkT, 'dentro de');
    else potencia(g, x, y, Math.floor(Math.log10(Math.max(l.ahead * YEAR, 1e-3)) + 1e-9), 's', big, inkT, 'dentro de');
  } else {
    potencia(g, x, y, Math.round(Math.log10(l.t)), 's', big, inkT, 't =');
  }
  y -= big + 14 * u;

  // The moment's name and its one sentence (fading as they change).
  const cap = f.tl.captionAt(f.p);
  const key = cap ? cap.name : '';
  if (key !== shown.key) {
    leaving = shown.key ? { ...shown, since: now } : null;
    shown = { key, name: cap?.name ?? '', fact: cap?.fact ?? '', since: now + 250 };
  }
  const drawCap = (c: Shown, a: number) => {
    if (a <= 0.01 || !c.key) return;
    g.save();
    g.globalAlpha = a;
    g.font = FONT.serif(19 * u);
    g.letterSpacing = '0px';
    const lines = wrap(g, c.fact, 470 * u);
    let yy = y - (lines.length - 1) * 24 * u;
    g.fillStyle = ink(inkT, 0.62);
    lines.forEach((ln, i) => g.fillText(ln, x, yy + i * 24 * u));
    yy -= 30 * u;
    g.font = FONT.italic(30 * u);
    g.fillStyle = ink(inkT);
    g.fillText(c.name, x, yy + (1 - a) * 6 * u);
    g.restore();
  };
  if (leaving) {
    const a = 1 - smoothstep(0, 250, now - leaving.since);
    drawCap(leaving, a);
    if (a <= 0) leaving = null;
  }
  drawCap(shown, smoothstep(0, 600, now - shown.since));
  g.restore();
}
