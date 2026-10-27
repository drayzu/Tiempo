// Copia de horizontes-cuerpos (d352f41) hecha por tools/copiar.mjs. Se edita allá, no aquí.
import * as THREE from 'three';

/** Loads a map for the GPU (sRGB for colour, raw for data such as clouds). */
export function cargar(url: string, srgb = true) {
  return new Promise<THREE.Texture>((res, rej) => {
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.wrapS = THREE.RepeatWrapping;
        t.anisotropy = 8;
        res(t);
      },
      undefined,
      rej,
    );
  });
}

const LIN = Array.from({ length: 256 }, (_, k) => (k / 255) ** 2.2);

function pixeles(tex: THREE.Texture) {
  const img = tex.image as HTMLImageElement;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  return { d: g.getImageData(0, 0, c.width, c.height).data, W: c.width, H: c.height };
}

/** An equirectangular map on the CPU: the linear colour at a direction (nearest pixel). */
export function lector(tex: THREE.Texture) {
  const { d, W, H } = pixeles(tex);
  return (x: number, y: number, z: number, out: number[]) => {
    const u = Math.atan2(-z, x) / (Math.PI * 2) + 0.5;
    const v = 0.5 - Math.asin(Math.max(-1, Math.min(1, y))) / Math.PI;
    const px = Math.min(W - 1, Math.max(0, Math.floor(u * W)));
    const py = Math.min(H - 1, Math.max(0, Math.floor(v * H)));
    const i = (py * W + px) * 4;
    out[0] = LIN[d[i]];
    out[1] = LIN[d[i + 1]];
    out[2] = LIN[d[i + 2]];
    return out;
  };
}

/** A strip read along its width (a ring's profile): linear colour and opacity at 0..1. */
export function lectorTira(tex: THREE.Texture) {
  const { d, W, H } = pixeles(tex);
  const y = Math.floor(H / 2);
  return (s: number, out: number[]) => {
    const px = Math.min(W - 1, Math.max(0, Math.floor(s * W)));
    const i = (y * W + px) * 4;
    out[0] = LIN[d[i]];
    out[1] = LIN[d[i + 1]];
    out[2] = LIN[d[i + 2]];
    out[3] = d[i + 3] / 255;
    return out;
  };
}

/** A seeded random number generator (mulberry32). */
export function azar(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hands the main thread back between chunks of work, so a page keeps running while bodies build. */
export const pausa = () => new Promise<void>((r) => setTimeout(r, 0));

/** A 1 × 1 black texture: a map's stand-in until it loads. */
export function negro() {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}
