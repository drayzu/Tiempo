import * as THREE from 'three';
import { smoothstep } from '../lib/math';
import { AGE, LY, YEAR, cosmicCalendar } from '../lib/cosmo';
import { lang, tx as tr } from '../i18n';
import type { Certeza } from './eras';

/**
 * The plate: everything drawn in 2D over the film, in device pixels (so a capture holds it too).
 * - The three clocks (bottom left): the time as a power of ten; then «so long after the beginning ·
 *   so long ago», the temperature and the size of our patch of universe; then Sagan's cosmic
 *   calendar. At now: the visitor's own clock.
 * - The cone of time (right): the whole journey, narrow at the beginning and widening; filled with
 *   the colour of the universe along the way; solid where observed, dashed where theory, dotted
 *   where speculation; the endings fork near the bottom.
 * - Notes (plate layer, key I): a dot on the thing, a leader, a label.
 */

const EN = lang === 'en';

export const FONT = {
  serif: (px: number) => `${px}px "Instrument Serif"`,
  italic: (px: number) => `italic ${px}px "Instrument Serif"`,
  mono: (px: number) => `500 ${px}px "Geist Mono Variable"`,
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

// ---------------------------------------------------------------- numbers, in words

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
export const sup = (n: number) => [...String(n)].map((ch) => SUP[ch] ?? ch).join('');
const SEP = EN ? ',' : ' ';
const DEC = EN ? '.' : ',';
const group = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, SEP);
const num = (v: number) => (v >= 1000 ? group(v) : String(v).replace('.', DEC));

/** Rounded to `d` significant digits (never below units). */
function roundSig(v: number, d: number) {
  const k = Math.pow(10, Math.floor(Math.log10(v)) - d + 1);
  return k >= 1 ? Math.round(v / k) * k : Number(v.toPrecision(d));
}
function plural(v: number, es: string, en: string) {
  const r = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  const w = EN ? en : es;
  return `${num(r)} ${w}${r === 1 ? '' : 's'}`;
}

/** A span of years in words: «380 000 años», «150 millones de años», «10¹⁴ años». */
export function anios(y: number, digits = 2): string {
  const s = y * YEAR;
  if (s < 60) return plural(s, 'segundo', 'second');
  if (s < 3600) return plural(s / 60, 'minuto', 'minute');
  if (s < 86400) return plural(s / 3600, 'hora', 'hour');
  if (y < 1) return plural(y * 365.25, 'día', 'day');
  if (y < 1e6) return plural(roundSig(y, digits), 'año', 'year');
  if (EN) {
    if (y < 1e9) return `${num(roundSig(y / 1e6, digits))} million years`;
    if (y < 1e12) return `${num(roundSig(y / 1e9, Math.max(digits - 1, 2)))} billion years`;
    return `10${sup(Math.floor(Math.log10(y)))} years`;
  }
  if (y < 1e12) {
    const m = roundSig(y / 1e6, digits);
    return m === 1 ? '1 millón de años' : `${num(m)} millones de años`;
  }
  return `10${sup(Math.floor(Math.log10(y)))} años`;
}

/** A temperature from its log10 (it spans 10³² K to far below 10⁻¹⁰⁰ K). */
/**
 * A power whose exponent is itself huge (the far future: 10^(−2,7 × 10¹⁷)), written as a power of a
 * power, as Potencias does at its end.
 */
function potPot(log: number, unit: string) {
  const sign = log < 0 ? '−' : '';
  const e = Math.floor(Math.log10(Math.abs(log)));
  const m = Math.abs(log) / Math.pow(10, e);
  return `10^(${sign}${m.toFixed(1).replace('.', DEC)}·10${sup(e)}) ${unit}`;
}

export function kelvin(logT: number) {
  if (Number.isNaN(logT)) return EN ? 'temperature ≈ 0' : 'temperatura ≈ 0';
  if (!Number.isFinite(logT) || Math.abs(logT) > 1e300) return EN ? 'temperature → 0' : 'temperatura → 0';
  if (Math.abs(logT) >= 1e4) return potPot(logT, 'K');
  if (logT >= 5 || logT < -2) return `10${sup(Math.floor(logT))} K`;
  const T = Math.pow(10, logT);
  if (T >= 100) return `${group(roundSig(T, 3))} K`;
  return `${String(Number(T.toPrecision(2))).replace('.', DEC)} K`;
}

/** A length from its log10 in metres, in the unit a reader would use. */
export function largo(logM: number) {
  const units: [number, string, string][] = [
    [Math.log10(LY * 1e9), 'mil millones de años luz', 'billion light-years'],
    [Math.log10(LY * 1e6), 'millones de años luz', 'million light-years'],
    [Math.log10(LY), 'años luz', 'light-years'],
    [Math.log10(1.496e11), 'UA', 'AU'],
    [3, 'km', 'km'],
    [0, 'm', 'm'],
  ];
  if (!Number.isFinite(logM) || Math.abs(logM) > 1e300) return '→ ∞';
  if (Math.abs(logM) >= 1e4) return potPot(logM, 'm');
  if (logM < -3 || logM > Math.log10(LY * 1e9) + 4) return `10${sup(Math.floor(logM))} m`;
  const [lu, es, en] = units.find(([u]) => logM >= u) ?? units[units.length - 1];
  const v = Math.pow(10, logM - lu);
  return `${num(roundSig(v, 2))} ${EN ? en : es}`;
}

const MESES = EN
  ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  : ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
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
  return EN ? `${MESES[m]} ${d + 1}, ${clock}` : `${d + 1} de ${MESES[m]}, ${clock}`;
}

// ---------------------------------------------------------------- drawing helpers

/** A power of ten with its exponent raised, in the serif; returns the width drawn. */
function potencia(g: CanvasRenderingContext2D, x: number, y: number, exp: number | string, unit: string, px: number, inkT: number, prefix = '') {
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

/**
 * A power of a power: 10^(10^n), when even the exponent has too many digits to write (the very far
 * future, the recurrence). The numbers become the spectacle, as at the end of Potencias.
 */
function potenciaDoble(g: CanvasRenderingContext2D, x: number, y: number, logV: number, unit: string, px: number, inkT: number, prefix = '') {
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
  g.fillText('10', cx, y - px * 0.42);
  cx += g.measureText('10').width + px * 0.02;
  g.font = FONT.serif(px * 0.3);
  const e = String(Math.floor(Math.log10(logV)));
  g.fillText(e, cx, y - px * 0.72);
  cx += g.measureText(e).width + px * 0.14;
  g.font = FONT.serif(px * 0.4);
  g.fillStyle = ink(inkT, 0.6);
  g.fillText(unit, cx, y);
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number) {
  const lines: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** A note: a dot on the thing, a leader out to (x + dx, y + dy) in layout units, and its label. */
export function nota(g: CanvasRenderingContext2D, u: number, x: number, y: number, text: string, dx: number, dy: number, inkT = 0, alpha = 1, accent = ACCENT) {
  if (alpha <= 0.01) return;
  text = tr(text);
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
  const label = /[⁰¹²³⁴⁵⁶⁷⁸⁹]|\d\s*(m|K|s)\b/.test(text) ? text : text.toUpperCase();
  const w = g.measureText(label).width;
  const right = dx >= 0;
  const tx = right ? lx + 6 * u : lx - 6 * u - w;
  g.fillStyle = inkT < 0.5 ? 'rgba(4,4,8,0.5)' : 'rgba(255,248,236,0.45)';
  g.fillRect(tx - 5 * u, ly - 9 * u, w + 10 * u, 17 * u);
  g.fillStyle = ink(inkT, 0.92);
  g.textBaseline = 'middle';
  g.fillText(label, tx, ly + 0.5 * u);
  g.restore();
}

/** A label alone, centred on (x, y). */
export function rotulo(g: CanvasRenderingContext2D, u: number, x: number, y: number, text: string, px = 10.5, inkT = 0, alpha = 1, upper = true, color?: string) {
  if (alpha <= 0.01) return;
  text = tr(text);
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

/** A centred label «pre 10^exp post», the exponent raised by hand (mono fonts lack ⁴–⁹). */
export function rotuloPot(g: CanvasRenderingContext2D, u: number, x: number, y: number, pre: string, exp: number, post: string, px = 11, inkT = 0, alpha = 1) {
  if (alpha <= 0.01) return;
  pre = tr(pre);
  post = tr(post);
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

/** Our proton's ring on the plate. */
export function anillo(g: CanvasRenderingContext2D, u: number, x: number, y: number, a: number) {
  if (a <= 0.01) return;
  g.save();
  g.globalAlpha = a * 0.85;
  g.strokeStyle = ACCENT;
  g.lineWidth = Math.max(1, u);
  g.beginPath();
  g.arc(x, y, 13 * u, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

// ---------------------------------------------------------------- the cone of time

export interface ConoTick {
  beat: number;
  label: string;
  acto: string;
  certeza: Certeza;
}

export interface Cono {
  length: number;
  ticks: ConoTick[];
  /** The universe's colour along the journey (CSS colours, evenly spaced in beats). */
  colors: string[];
  /** Where the endings fork (0..1 of the journey), if they do. */
  fork?: number;
}

export const CONO = { top: 0.15, bottom: 0.85, right: 70 };
const half = (u: number, q: number) => 1.5 * u + 30 * u * Math.pow(Math.max(q, 0), 0.75);

let gradCache: { key: string; grad: CanvasGradient } | null = null;

export function cono(g: CanvasRenderingContext2D, u: number, W: number, H: number, c: Cono, p: number, inkT: number, hovered: number | null, here: number, fade = 1) {
  const cx = W - CONO.right * u;
  const y0 = CONO.top * H;
  const y1 = CONO.bottom * H;
  const yAt = (q: number) => y0 + q * (y1 - y0);
  const qOf = (beat: number) => Math.min(Math.max(beat / c.length, 0), 1);
  if (fade <= 0.01) return;
  g.save();
  g.globalAlpha = fade;

  // The fill: the colour of the universe along the way.
  const key = `${H}|${c.colors.length}`;
  if (!gradCache || gradCache.key !== key) {
    const grad = g.createLinearGradient(0, y0, 0, y1);
    c.colors.forEach((col, k) => grad.addColorStop(k / (c.colors.length - 1), col));
    gradCache = { key, grad };
  }
  g.beginPath();
  for (let k = 0; k <= 60; k++) g.lineTo(cx - half(u, k / 60), yAt(k / 60));
  for (let k = 60; k >= 0; k--) g.lineTo(cx + half(u, k / 60), yAt(k / 60));
  g.closePath();
  g.fillStyle = gradCache.grad;
  g.globalAlpha = 0.55 * fade;
  g.fill();
  g.globalAlpha = fade;

  // The edges, era by era: solid observed, dashed theory, dotted speculation.
  g.lineWidth = Math.max(1, u);
  c.ticks.forEach((t, i) => {
    const q0 = i === 0 ? 0 : qOf(t.beat);
    const q1 = i === c.ticks.length - 1 ? 1 : qOf(c.ticks[i + 1].beat);
    g.setLineDash(t.certeza === 'O' ? [] : t.certeza === 'T' ? [5 * u, 4 * u] : [1.2 * u, 3.4 * u]);
    g.strokeStyle = ink(inkT, 0.42);
    for (const side of [-1, 1]) {
      g.beginPath();
      for (let k = 0; k <= 10; k++) {
        const q = q0 + ((q1 - q0) * k) / 10;
        g.lineTo(cx + side * half(u, q), yAt(q));
      }
      g.stroke();
    }
    // A fine line where each act begins.
    if (i > 0 && c.ticks[i - 1].acto !== t.acto) {
      g.setLineDash([]);
      g.strokeStyle = ink(inkT, 0.2);
      g.beginPath();
      g.moveTo(cx - half(u, q0), yAt(q0));
      g.lineTo(cx + half(u, q0), yAt(q0));
      g.stroke();
    }
  });
  // The endings fork where physics stops being sure.
  if (c.fork !== undefined) {
    const qf = c.fork;
    g.setLineDash([1.2 * u, 3.4 * u]);
    g.strokeStyle = ink(inkT, 0.32);
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + side * half(u, qf), yAt(qf));
      g.bezierCurveTo(cx + side * (half(u, qf) + 10 * u), yAt(qf + 0.04), cx + side * (half(u, qf) + 24 * u), yAt(qf + 0.08), cx + side * (half(u, qf) + 30 * u), yAt(qf + 0.15));
      g.stroke();
    }
  }
  g.setLineDash([]);

  // Each era, a short tick on the left edge.
  g.strokeStyle = ink(inkT, 0.5);
  for (const t of c.ticks) {
    const q = qOf(t.beat);
    g.beginPath();
    g.moveTo(cx - half(u, q) - 5 * u, yAt(q));
    g.lineTo(cx - half(u, q), yAt(q));
    g.stroke();
  }

  // Where we are: the accent across the cone.
  const qm = qOf(p);
  const ym = yAt(qm);
  const hw = half(u, qm);
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

  // Names: where you are, and what the pointer is on.
  g.font = FONT.mono(9.5 * u);
  g.letterSpacing = `${1.4 * u}px`;
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  g.shadowColor = halo(inkT, 0.9);
  g.shadowBlur = 8 * u;
  if (here >= 0) {
    g.fillStyle = ink(inkT, hovered !== null && hovered !== here ? 0.3 : 0.75);
    g.fillText(c.ticks[here].label.toUpperCase(), cx - hw - 14 * u, ym);
  }
  if (hovered !== null && hovered !== here) {
    const q = qOf(c.ticks[hovered].beat);
    g.fillStyle = ink(inkT, 0.95);
    g.fillText(c.ticks[hovered].label.toUpperCase(), cx - half(u, q) - 14 * u, yAt(q));
  }
  g.restore();
}

// ---------------------------------------------------------------- the three clocks

/** What the clocks read. */
export interface Lectura {
  /** 0: since the beginning; 1: back from now; 2: now; 3: ahead of now; 4: before time (t = ?). */
  reloj: number;
  /** log10 of seconds since the beginning. */
  lt: number;
  /** Years back from now (reloj 1) or ahead (reloj 3), and their log10 (which does not overflow). */
  years: number;
  logYears: number;
  /** log10 of the temperature (K) and of our patch's diameter (m). */
  logT: number;
  logSize: number;
}

interface Shown {
  key: string;
  name: string;
  fact: string;
  since: number;
}
let shown: Shown = { key: '', name: '', fact: '', since: 0 };
let leaving: Shown | null = null;

const reloj = new Intl.DateTimeFormat(EN ? 'en-GB' : 'es-CL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const loaded = performance.now();

/**
 * The name and sentence of what is on screen (a moment's caption or the era's), then the clocks.
 * Returns true when a new name has just appeared (for the chime).
 */
export function hud(g: CanvasRenderingContext2D, u: number, H: number, l: Lectura, named: { name: string; fact: string } | null, inkT: number, now: number, fade = 1, velo = 0) {
  const x = 42 * u;
  let y = H - 40 * u;
  let arrived = false;
  g.save();
  g.globalAlpha = fade;
  // Over a glowing sky that is not yet bright enough for dark ink, a soft shade behind the words.
  if (velo > 0.01) {
    g.save();
    g.translate(x + 170 * u, H - 120 * u);
    g.scale(1.7, 1);
    const sh = g.createRadialGradient(0, 0, 0, 0, 0, 190 * u);
    sh.addColorStop(0, `rgba(0,0,0,${0.5 * velo})`);
    sh.addColorStop(0.6, `rgba(0,0,0,${0.3 * velo})`);
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh;
    g.fillRect(-190 * u, -190 * u, 380 * u, 380 * u);
    g.restore();
  }
  g.textBaseline = 'alphabetic';
  g.shadowColor = halo(inkT, 0.85);
  g.shadowBlur = 12 * u;
  const mono = (text: string, a: number) => {
    g.font = FONT.mono(11.5 * u);
    g.letterSpacing = `${0.4 * u}px`;
    g.fillStyle = ink(inkT, a);
    g.fillText(text, x, y);
    y -= 19 * u;
  };
  const t = Math.pow(10, l.lt);
  const ago = EN ? 'ago' : 'hace';
  if (l.reloj === 2) {
    const age = Math.floor((now - loaded) / 1000);
    mono(EN ? 'cosmic calendar: December 31, midnight' : 'calendario cósmico: 31 de diciembre, 24:00', 0.42);
    mono(EN ? `age of the universe: 13,787,000,000 years and ${age} s  (± 20 million years)` : `edad del universo: 13 787 000 000 años y ${age} s  (± 20 millones de años)`, 0.62);
    mono(`${EN ? 'now' : 'ahora'}: ${reloj.format(new Date())}`, 0.85);
  } else if (l.reloj === 1) {
    mono(`${EN ? 'cosmic calendar' : 'calendario cósmico'}: ${calendario(AGE - l.years * YEAR)}`, 0.42);
    mono(EN ? `${anios(AGE / YEAR - l.years, 5)} after the beginning` : `${anios(AGE / YEAR - l.years, 5)} después del inicio`, 0.62);
    mono(EN ? `${anios(l.years, 2)} ago` : `hace ${anios(l.years, 2)}`, 0.85);
  } else if (l.reloj === 3) {
    mono(`${EN ? 'our universe will measure' : 'nuestro universo medirá'} ${largo(l.logSize)}`, 0.42);
    mono(kelvin(l.logT), 0.62);
    const ahead = l.logYears >= 12 ? `10${sup(Math.floor(l.logYears))} ${EN ? 'years' : 'años'}` : anios(l.years, 2);
    mono(EN ? `${ahead} from now` : `dentro de ${ahead}`, l.logYears >= 1e4 ? 0 : 0.85);
  } else if (l.reloj === 4) {
    mono(EN ? 'before time: hypotheses' : 'antes del tiempo: hipótesis', 0.42);
    mono(EN ? 'physics as we know it begins at the Planck time, 10⁻⁴³ s' : 'la física que conocemos empieza en el tiempo de Planck, 10⁻⁴³ s', 0.62);
  } else {
    mono(`${EN ? 'cosmic calendar' : 'calendario cósmico'}: ${calendario(t)}`, 0.42);
    mono(`${kelvin(l.logT)}  ·  ${EN ? 'our universe measured' : 'nuestro universo medía'} ${largo(l.logSize)}`, 0.62);
    const since = t / YEAR;
    mono(EN ? `${anios(since, 2)} after the beginning  ·  ${anios((AGE - t) / YEAR, 5)} ${ago}` : `${anios(since, 2)} después del inicio  ·  hace ${anios((AGE - t) / YEAR, 5)}`, 0.85);
  }

  // The power of ten (its order of magnitude).
  y -= 6 * u;
  const big = 76 * u;
  const order = (v: number) => Math.floor(Math.log10(v) + 1e-9);
  if (l.reloj === 2) {
    g.font = FONT.serif(big);
    g.fillStyle = ink(inkT);
    g.fillText(EN ? 'Now' : 'Ahora', x, y);
  } else if (l.reloj === 4) {
    g.font = FONT.serif(big);
    g.fillStyle = ink(inkT);
    g.fillText('t = ?', x, y);
  } else if (l.reloj === 1 || l.reloj === 3) {
    const pre = l.reloj === 1 ? (EN ? '' : 'hace') : EN ? 'in' : 'dentro de';
    const unitY = EN ? (l.reloj === 1 ? 'years ago' : 'years') : 'años';
    const unitS = EN ? (l.reloj === 1 ? 's ago' : 's') : 's';
    if (l.logYears >= 1e3) potenciaDoble(g, x, y, l.logYears, unitY, big, inkT, pre);
    else if (l.logYears >= 0) potencia(g, x, y, Math.floor(l.logYears + 1e-9), unitY, big, inkT, pre);
    else potencia(g, x, y, order(Math.max(l.years * YEAR, 1e-3)), unitS, big, inkT, pre);
  } else {
    potencia(g, x, y, Math.floor(l.lt + 1e-9), 's', big, inkT, 't =');
  }
  y -= big + 14 * u;

  // The name and its one sentence, fading as they change.
  const key = named ? named.name : '';
  if (key !== shown.key) {
    leaving = shown.key ? { ...shown, since: now } : null;
    shown = { key, name: named?.name ?? '', fact: named?.fact ?? '', since: now + 250 };
    arrived = !!named;
  }
  const drawCap = (c: Shown, a: number) => {
    if (a <= 0.01 || !c.key) return;
    g.save();
    g.globalAlpha = a * fade;
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
  return arrived;
}

/** A point (scene units) to the plate (device px); z > 1 is behind the camera. */
export function proyectar(v: THREE.Vector3, camera: THREE.Camera, W: number, H: number) {
  const p = v.clone().project(camera);
  return { x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H, z: p.z };
}
