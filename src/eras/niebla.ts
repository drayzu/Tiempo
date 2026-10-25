import * as THREE from 'three';
import { clamp, gauss, smoothstep } from '../lib/math';
import { YEAR, freeFraction, meanFreePath, redshift, transparency } from '../lib/cosmo';
import { bbColor, bbVisible, planck, wienPeak } from '../lib/cuerpo-negro';
import { materia, materiaBuilder, type MateriaData } from '../engine/materia';
import type { EraModule } from '../engine/eras';
import { ACCENT, FONT, ink, nota, rotulo } from '../engine/placa';

/**
 * La niebla → Se hace la luz (≈ 20 minutes → 4 million years). 1 unit = 1 mm (the atoms are about
 * that far apart at recombination). Phase-0 study, style chosen: Brasa as the base, the orange sky of
 * Horno for the transition.
 *
 * A plasma of protons, helium and free electrons; light cannot travel (each photon hits an electron
 * after a tiny step: tangled trails). The electrons fall onto the protons (each capture gives off a
 * photon: a spark); with no free electrons left the fog clears and light flies straight: the oldest
 * light. Then it cools, orange, red, infrared: at about three million years it can no longer be seen.
 * Our proton catches its electron in the middle of it all, and the camera, in first person, leans in.
 *
 * One clock drives it all (`lt`): the temperature, the free-electron fraction and the light's mean
 * free path (`src/lib/cosmo.ts`).
 */

const LT = (years: number) => Math.log10(years * YEAR);

const OURS = new THREE.Vector3(0.45, -0.3, 1.4);
const OUR_DELAY = 0.55;
const EX_P = new THREE.Vector3(-1.5, 0.8, -1.0);
const EX_HE = new THREE.Vector3(1.6, 0.95, -2.2);
const EX_E = new THREE.Vector3(-0.8, -1.05, -0.4);
const HALF: [number, number, number] = [16, 10, 16];

const SOUND_GLSL = /* glsl */ `
  uniform float uWaveT, uSound;
  float sound(vec3 p) {
    float w = 0.0;
    w += sin(5.0 * length(p - vec3(-1.5, 0.8, -3.0)) - uWaveT * 2.2) * exp(-length(p - vec3(-1.5, 0.8, -3.0)) / 5.0);
    w += sin(5.0 * length(p - vec3(2.6, -1.1, -6.0)) - uWaveT * 2.2) * exp(-length(p - vec3(2.6, -1.1, -6.0)) / 5.0);
    w += sin(5.0 * length(p - vec3(0.3, 1.9, -11.0)) - uWaveT * 2.2) * exp(-length(p - vec3(0.3, 1.9, -11.0)) / 5.0);
    w += sin(5.0 * length(p - vec3(-3.5, -2.0, 4.0)) - uWaveT * 2.2) * exp(-length(p - vec3(-3.5, -2.0, 4.0)) / 5.0);
    return w;
  }
`;

const WANDER_GLSL = /* glsl */ `
  vec3 wander(float s, float t) {
    return vec3(
      sin(t * 7.1 + s * 91.0) + 0.5 * sin(t * 12.7 + s * 37.0),
      cos(t * 8.3 + s * 53.0) + 0.5 * sin(t * 10.9 + s * 71.0),
      sin(t * 6.7 + s * 29.0) + 0.5 * cos(t * 13.1 + s * 17.0)
    ) * 0.06;
  }
`;

/** Electrons (kind 1, their proton is `position`; `aDelay` is when each is caught), our electron (3). */
const MOVE = /* glsl */ `
  if (aKind > 0.5 && aKind < 1.5) {
    float k = smoothstep(aDelay, aDelay + 0.05, uBound);
    vec3 w = wander(seed, uTime) * (1.0 + 0.8 * seed);
    float a = seed * 40.0 + k * 9.0 + uTime * 3.0;
    vec3 orbit = vec3(cos(a), sin(a), sin(a * 0.7)) * 0.012;
    float fall = (1.0 - k) * (1.0 - k);
    p += w * fall + orbit * (1.0 - fall);
    // The photon it gives off when caught.
    float flash = exp(-pow((k - 0.8) / 0.12, 2.0));
    em = mix(em, uAtom, k) * (1.0 + flash * 9.0);
    sz *= mix(1.0, 1.5, k);
    occ *= mix(1.0, 0.5, k);
  } else if (aKind > 2.5) {
    float k = smoothstep(0.0, 1.0, uOurs);
    vec3 w = wander(seed, uTime) * 2.2;
    float a = uTime * 2.4 + k * 10.0;
    vec3 orbit = vec3(cos(a), sin(a) * 0.8, sin(a * 0.6)) * 0.02;
    float fall = (1.0 - k) * (1.0 - k);
    p += w * fall + orbit * (1.0 - fall);
    float flash = exp(-pow((k - 0.85) / 0.1, 2.0));
    em = mix(em, uAtom * 1.4, k) * (1.0 + flash * 14.0);
    sz *= mix(1.0, 2.2, k);
  } else {
    // Nuclei barely move (forty times slower than electrons at the same temperature).
    p += wander(seed + 0.37, uTime * 0.12) * 0.12;
  }
  em *= 1.0 + uSound * 0.35 * sound(p);
  // Matter shows by the light that fills the universe: as the glow fades, so does it. Against the
  // fire (Horno) its specks are a little larger, so they read as specks.
  if (aKind < 2.5) {
    em *= uLit;
    sz *= uSpeck;
  }
`;

const LEN = 32;
const NPH = 260;

export function niebla(): EraModule {
  return {
    spec: {
      id: 'niebla',
      acto: 'La niebla',
      certeza: 'O',
      name: 'La niebla',
      fact: 'Todo es un plasma incandescente: la luz choca con los electrones libres y no puede avanzar.',
      label: 'la niebla',
      unitExp: -3,
      frame: 6,
      frameCenter: new THREE.Vector3(),
      fade: [0.5, 0.55],
      tint: 0xffc890,
      notes: [
        { at: EX_P.toArray(), text: 'protón' },
        { at: EX_HE.toArray(), text: 'helio' },
        { at: EX_E.toArray(), text: 'electrón' },
      ],
      generate() {
        const b = materiaBuilder(301);
        const r = b.r;
        const addProton = (x: number, y: number, z: number, delay: number) => {
          b.push(x, y, z, 0xfff1dc, 0.02, 0.75, { ink: 0.9, kind: 0 });
          b.push(x, y, z, 0xbfe0ff, 0.011, 1.1, { ink: 0.5, kind: 1, delay });
        };
        addProton(EX_P.x, EX_P.y, EX_P.z, 0.35);
        addProton(EX_E.x + 0.05, EX_E.y, EX_E.z, 0.92);
        const N = 22000;
        for (let i = 0; i < N; i++) addProton((r() * 2 - 1) * HALF[0], (r() * 2 - 1) * HALF[1], (r() * 2 - 1) * HALF[2], r());
        // Helium (about one atom in twelve), already neutral: it caught its electrons earlier.
        b.push(EX_HE.x, EX_HE.y, EX_HE.z, 0xffcf6a, 0.027, 0.85, { ink: 1, kind: 2 });
        for (let i = 0; i < N / 12; i++) b.push((r() * 2 - 1) * HALF[0], (r() * 2 - 1) * HALF[1], (r() * 2 - 1) * HALF[2], 0xffcf6a, 0.027, 0.85, { ink: 1, kind: 2 });
        // Our proton's electron (the proton itself is the page's accent).
        b.push(OURS.x, OURS.y, OURS.z, 0xd6e6ff, 0.016, 1.6, { kind: 3 });
        void gauss;
        return { main: b.data() };
      },
      assemble(data) {
        const atom = new THREE.Color(0xd2e2ff);
        const uni = {
          uBound: { value: 0 },
          uOurs: { value: 0 },
          uAtom: { value: atom },
          uLit: { value: new THREE.Vector3(1, 1, 1) },
          uWaveT: { value: 0 },
          uSound: { value: 0 },
          uSpeck: { value: 1 },
        };
        const matter = materia(data.main as MateriaData, {
          pre: `${SOUND_GLSL}\n${WANDER_GLSL}\nuniform float uBound, uOurs, uSpeck;\nuniform vec3 uAtom, uLit;`,
          move: MOVE,
          uniforms: uni,
        });
        matter.u.uNear.value = 1;
        matter.u.uFogNear.value = 2.2;

        // Photons: random walks while the fog lasts, straight lines after (simulated here: their
        // motion is ambient, the state of the universe comes from the clock).
        const pos = new Float32Array(NPH * (LEN - 1) * 6);
        const col = new Float32Array(NPH * (LEN - 1) * 6);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const lines = new THREE.LineSegments(
          geo,
          new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        lines.frustumCulled = false;
        const rnd = Math.random;
        const dirRand = (v: THREE.Vector3) => {
          const z = rnd() * 2 - 1;
          const a = rnd() * Math.PI * 2;
          const s = Math.sqrt(1 - z * z);
          return v.set(Math.cos(a) * s, Math.sin(a) * s, z);
        };
        const ph = Array.from({ length: NPH }, () => ({ p: new THREE.Vector3(), d: new THREE.Vector3(), next: 0, trail: new Float32Array(LEN * 3), head: 0 }));
        const spawn = (o: (typeof ph)[number]) => {
          o.p.set((rnd() * 2 - 1) * 11, (rnd() * 2 - 1) * 7, (rnd() * 2 - 1) * 11);
          dirRand(o.d);
          for (let k = 0; k < LEN; k++) o.trail.set([o.p.x, o.p.y, o.p.z], k * 3);
          o.next = 0;
        };
        ph.forEach(spawn);
        const tmp = new THREE.Vector3();
        const bb = { r: 0, g: 0, b: 0 };
        let waveT = 0;
        const st = { xe: 1, mfp: 0.01, clear: 0, vis: 1, T: 3000, bgL: 0 };

        const object = new THREE.Group();
        object.add(matter.points, lines);
        return {
          object,
          clouds: [matter],
          update(f) {
            const t = Math.pow(10, f.lt);
            const z = redshift(t);
            const xe = freeFraction(z);
            const mfp = meanFreePath(z);
            const clear = transparency(t);
            const vis = bbVisible(f.T);
            bbColor(f.T, bb);
            const horno = f.tl.get('horno', f.p);
            const bgL = horno * Math.pow(vis, 1.25);
            waveT += f.dt * (1 - clear);
            uni.uBound.value = 1 - xe;
            uni.uOurs.value = smoothstep(OUR_DELAY - 0.05, OUR_DELAY + 0.06, 1 - xe);
            uni.uWaveT.value = waveT;
            uni.uSound.value = 1 - clear;
            // Against the fire (Horno), matter is a speck; in the dark (Brasa), a spark lit by the glow.
            matter.u.uInk.value = 0.95 * smoothstep(0.05, 0.4, bgL);
            matter.u.uGain.value = 1 - 0.85 * smoothstep(0.15, 0.6, bgL);
            const lit = 0.06 + 0.94 * Math.pow(vis, 0.9);
            uni.uLit.value.set(lit, lit, lit).lerp(new THREE.Vector3(bb.r, bb.g, bb.b).multiplyScalar(0.9 * Math.pow(vis, 0.7)), horno);
            matter.u.uFog.value = clear > 0.98 ? 0 : (1.4 + 60 * clear * clear) * (1 + horno);
            uni.uSpeck.value = 1 + 0.8 * smoothstep(0.05, 0.4, bgL);

            // Photons: trapped while the fog lasts (the glow is the light), their paths seen once free.
            const step = 2.3 * f.dt;
            const light = 1.2 * Math.pow(vis, 0.8) * smoothstep(0.35, 0.95, clear) * f.alpha;
            const m = Math.max(mfp, 0.012);
            let o6 = 0;
            for (const o of ph) {
              let left = step;
              let hops = 0;
              while (left > 1e-6 && hops < 10) {
                if (o.next <= 0) {
                  dirRand(o.d);
                  o.next = -m * Math.log(1 - rnd() * 0.999);
                  hops++;
                }
                const s = Math.min(left, o.next);
                o.p.addScaledVector(o.d, s);
                o.next -= s;
                left -= s;
              }
              if (left > 1e-6) o.p.add(dirRand(tmp).multiplyScalar(m * Math.sqrt(left / m) * 0.6));
              if (Math.abs(o.p.x) > 14 || Math.abs(o.p.y) > 9 || Math.abs(o.p.z) > 14) spawn(o);
              o.head = (o.head + 1) % LEN;
              o.trail.set([o.p.x, o.p.y, o.p.z], o.head * 3);
              for (let k = 0; k < LEN - 1; k++) {
                for (let j = 0; j < 2; j++) {
                  const src = ((o.head - k - j + 2 * LEN) % LEN) * 3;
                  const fade = Math.pow(1 - (k + j) / (LEN - 1), 1.5) * light;
                  pos[o6] = o.trail[src];
                  pos[o6 + 1] = o.trail[src + 1];
                  pos[o6 + 2] = o.trail[src + 2];
                  col[o6] = bb.r * fade;
                  col[o6 + 1] = bb.g * fade;
                  col[o6 + 2] = bb.b * fade;
                  o6 += 3;
                }
              }
            }
            geo.attributes.position.needsUpdate = true;
            geo.attributes.color.needsUpdate = true;
            Object.assign(st, { xe, mfp, clear, vis, T: f.T, bgL });
          },
          proton: () => OURS,
          tinta: (f) => f.tl.get('horno', f.p) * smoothstep(0.25, 0.45, Math.pow(bbVisible(f.T), 1.25)),
          placa(g, f, on, toScreen) {
            if (!on || f.alpha < 0.4) return;
            const { u } = f;
            // How far light gets: a circle around our proton whose radius is the mean free path.
            const pr = toScreen(OURS);
            const R = Math.min(st.mfp, 60);
            const edge = toScreen(tmp.copy(OURS).add(new THREE.Vector3(R, 0, 0)));
            const rpx = Math.max(Math.abs(edge.x - pr.x), 16 * u);
            if (pr.z < 1 && rpx < f.W * 1.5) {
              g.save();
              g.setLineDash([4 * u, 4 * u]);
              g.strokeStyle = ink(0, 0.55);
              g.lineWidth = Math.max(1, u);
              g.beginPath();
              g.arc(pr.x, pr.y, rpx, 0, Math.PI * 2);
              g.stroke();
              g.restore();
              const ex = pr.x + Math.cos(-2.3) * rpx;
              const ey = pr.y + Math.sin(-2.3) * rpx;
              if (ey > 40 * u && ex > 40 * u) nota(g, u, ex, ey, st.clear < 0.5 ? 'lo que alcanza a viajar la luz' : 'la luz ya viaja sin chocar', -40, -26, 0, f.alpha);
            }
            espectro(g, f.W, f.H, u, st.T, f.alpha);
          },
        };
      },
    },
    choreo(tl, era) {
      // From the nuclei's minutes to the fog of 120 000 years, zooming out to where atoms are a
      // millimetre apart; the camera, inside the plasma, drifts forward.
      tl.with(0.02, { reloj: 0 });
      tl.to(3.2, { era: era.index, e: era.home + 0.05, lt: LT(1.2e5), fondo: 1, horno: 0, fov: 50, yaw: 0, pitch: 0, roll: 0, bloom: 0.7, umbral: 0.12 });
      tl.label('niebla');
      tl.caption(4.6, 'El universo sonaba', 'Un plasma incandescente donde la luz no puede avanzar, que vibra con ondas de sonido reales. Con sonido (S) se oyen, unas cincuenta octavas más agudas.');
      tl.to(4.4, { lt: LT(2.9e5), 'niebla.fz': -2.5, yaw: 0.12, pitch: 0.04 });
      // Se hace la luz: the sky turns orange (Horno), and the camera leans in to our proton.
      tl.caption(4.8, 'Se hace la luz', 'Los electrones caen en los protones: nace el hidrógeno, y la luz por fin puede viajar.');
      tl.with(2.0, { horno: 1 });
      tl.with(2.4, { 'niebla.fx': OURS.x, 'niebla.fy': OURS.y, 'niebla.fz': OURS.z, e: era.home - 0.45, yaw: 0, pitch: 0, roll: 0.05 });
      tl.to(4.6, { lt: LT(4.7e5) });
      // The light cools and goes; the camera pulls back and turns to watch it fly.
      tl.caption(5.6, 'El universo deja de brillar', 'Esa luz se enfría: naranja, rojo, infrarrojo. Hacia los tres millones de años ya no se ve. Hoy es el fondo de microondas.');
      tl.with(2.8, { 'niebla.fx': 0, 'niebla.fy': 0, 'niebla.fz': 0, e: era.home + 0.1, yaw: -0.45, pitch: 0.12, roll: 0 });
      tl.to(5.6, { lt: LT(4.2e6) });
      tl.with(1.6, { horno: 0 });
    },
  };
}

/** A small plate figure: the blackbody spectrum at T, the visible band, and where its peak is. */
function espectro(g: CanvasRenderingContext2D, W: number, H: number, u: number, T: number, alpha: number) {
  const w = 300 * u;
  const h = 92 * u;
  const x0 = W - 170 * u - w;
  const y0 = H - 46 * u;
  const lmin = Math.log10(100);
  const lmax = Math.log10(30000);
  const X = (nm: number) => x0 + ((Math.log10(nm) - lmin) / (lmax - lmin)) * w;
  const peak = wienPeak(T);
  const bmax = planck(peak, T);
  g.save();
  g.globalAlpha = alpha;
  const grad = g.createLinearGradient(X(380), 0, X(750), 0);
  ['#6b2cff', '#2a5bff', '#22c4ff', '#3cff7a', '#e8ff3c', '#ffb02a', '#ff3b2a'].forEach((c, i, a) => grad.addColorStop(i / (a.length - 1), c));
  g.fillStyle = grad;
  g.globalAlpha = 0.75 * alpha;
  g.fillRect(X(380), y0 + 4 * u, X(750) - X(380), 3 * u);
  g.globalAlpha = alpha;
  g.strokeStyle = ink(0, 0.45);
  g.lineWidth = Math.max(1, u);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x0 + w, y0);
  g.stroke();
  g.beginPath();
  for (let k = 0; k <= 120; k++) {
    const nm = Math.pow(10, lmin + ((lmax - lmin) * k) / 120);
    g.lineTo(X(nm), y0 - (planck(nm, T) / bmax) * h);
  }
  g.strokeStyle = ink(0, 0.9);
  g.stroke();
  const c = bbColor(T);
  const gam = (x: number) => Math.round(255 * Math.pow(x, 1 / 2.2));
  g.beginPath();
  g.moveTo(X(380), y0);
  for (let nm = 380; nm <= 750; nm += 5) g.lineTo(X(nm), y0 - (planck(nm, T) / bmax) * h);
  g.lineTo(X(750), y0);
  g.closePath();
  g.fillStyle = `rgba(${gam(c.r)},${gam(c.g)},${gam(c.b)},0.55)`;
  g.fill();
  const px = X(clamp(peak, 100, 30000));
  g.setLineDash([2 * u, 3 * u]);
  g.strokeStyle = ACCENT;
  g.beginPath();
  g.moveTo(px, y0);
  g.lineTo(px, y0 - h - 6 * u);
  g.stroke();
  g.setLineDash([]);
  g.font = FONT.mono(9.5 * u);
  g.letterSpacing = `${u}px`;
  g.fillStyle = ink(0, 0.7);
  g.fillText('LA LUZ DEL UNIVERSO, POR COLOR', x0, y0 - h - 12 * u);
  const peakTxt = peak < 1000 ? `${Math.round(peak)} nm` : `${(peak / 1000).toFixed(1).replace('.', ',')} µm`;
  const zone = peak < 380 ? 'ultravioleta' : peak < 750 ? 'visible' : 'infrarrojo';
  g.fillStyle = ACCENT;
  const right = px > x0 + w * 0.6;
  g.textAlign = right ? 'right' : 'left';
  g.fillText(`pico: ${peakTxt} · ${zone}`.toUpperCase(), px + (right ? -6 : 6) * u, y0 - h + 2 * u);
  rotulo(g, u, (X(380) + X(750)) / 2, y0 + 17 * u, 'visible', 9, 0, 0.6 * alpha);
  g.restore();
}
