// Copia de horizontes-cuerpos (d352f41) hecha por tools/copiar.mjs. Se edita allá, no aquí.
import * as THREE from 'three';
import { GLSL_COMUN, GLSL_SIMPLEX } from './glsl';
import { azar, pausa } from './mapas';
import { GLOBAL_FIN, PARCHE_FIN, PARCHE_INICIO, PARCHE_PRE, fibonacci, geometriaParche, pasoPara, seguir, tamañoPara } from './esfera';
import { enfocar, geometria, puntos, type Puntos } from './puntos';
import type { Marco } from './planeta';

/**
 * The Sun in points: the Atlas's living star (its hero, LivingStar.tsx) carried to the series'
 * style. The photosphere boils (granules in two sizes, finer ones up close; supergranulation, active
 * regions, a few dark spots), darkens towards the limb with a reddish edge; the corona is a cloud of
 * points round it, streaming, with a fringe of spicules at the limb and now and then a flare that
 * rises from the edge and fades. No map: a photograph would stand still.
 *
 * It gives light rather than takes it: no Sun direction, only the camera. `brillo` scales it all
 * (the works decide how blinding it is).
 */
export interface SolOpts {
  puntos?: number;
  /** Points in the corona and in the spicules' fringe. */
  corona?: number;
  semilla?: number;
  /** How bright the photograph under the points is. */
  fondo?: number;
  /** Seconds between flares (0: none). */
  llamaradas?: number;
  /** How it is seen (see `EstiloSol`). */
  estilo?: EstiloSol;
  /**
   * Its surface temperature in kelvin (the Sun's, 5 772, by default). Cooler, the palette slides
   * towards its embers (a red giant, about 3 000 K); hotter, towards white. Each frame: `u.uTemp`.
   */
  temperatura?: number;
  /**
   * How large its convection cells are against the Sun's (1). A red giant has a few, each as big as
   * a good part of its face (about 0.1). Each frame: `u.uCeldas`.
   */
  celdas?: number;
}

/**
 * How the star is seen.
 * - `visible`: as the eye would see it (through a filter): even, fine granules, few dark spots,
 *   darker towards the limb.
 * - `viva`: the same light with its structure pushed up: active regions, bright plages and the
 *   supergranulation's network, spots with umbra and penumbra, broad orange mottling.
 * - `cromosfera`: as in the pictures taken in H-alpha or in ultraviolet (SDO, 304 Å): a mottled,
 *   burning surface, bright active regions, dark filaments, the limb brighter instead of darker.
 */
export type EstiloSol = 'visible' | 'viva' | 'cromosfera';

const GRANOS = /* glsl */ `
    float t = uT * 0.02;
    // Everything on the surface scales with its cells (q); a cooler star burns lower in the palette.
    vec3 q = n * uCeldas;
    float tono = clamp(log2(uTemp / 5772.0), -1.5, 1.0) * 0.22;
    // Granulation: bright cells and thin dark lanes; a finer size once the points are fine enough.
    float s1 = snoise(q * 30.0 + vec3(t * 2.0, -t * 1.4, t));
    float g1 = smoothstep(0.0, 0.32, abs(s1));
    float g2 = smoothstep(0.0, 0.32, abs(snoise(q * 64.0 + vec3(-t * 1.7, t * 2.2, -t))));
    float g3 = smoothstep(0.0, 0.32, abs(snoise(q * 520.0 + vec3(t * 3.1, t * 2.3, -t * 2.7))));
    float fino = 1.0 - smoothstep(0.0006, 0.0018, paso * uCeldas);
    float gran = mix(g1 * 0.65 + g2 * 0.35, g1 * 0.4 + g2 * 0.25 + g3 * 0.35, fino);
    // A giant's cells are few and huge: each one brighter or darker than the next, and no spots.
    float gigante = 1.0 - smoothstep(0.2, 0.6, uCeldas);
    gran += gigante * 0.4 * s1;
    float mu = clamp(dot(n, V), 0.0, 1.0);`;

const CUERPO_SOL: Record<EstiloSol, string> = {
  visible: /* glsl */ `
    // Supergranulation and active regions: broad swells of brightness; spots where activity peaks.
    float sup = snoise(q * 6.0 + vec3(0.0, t * 0.8, t * 0.5));
    float act = snoise(q * 1.7 + vec3(t * 0.3, 0.0, -t * 0.25));
    float man = smoothstep(0.8, 0.92, snoise(q * 2.2 + vec3(4.1, t * 0.2, 1.7))) * (1.0 - gigante);
    float calor = 0.42 + gran * 0.28 + sup * 0.08 + act * 0.14 - man * 0.3 + tono;
    // Darker towards the limb, with a reddish edge.
    vec3 c = paleta(calor) * (0.3 + 0.7 * pow(max(mu, 0.0), 0.55)) * 1.12;
    c += vec3(1.0, 0.24, 0.05) * pow(max(1.0 - mu, 0.0), 2.4) * 0.38;
    return c;`,
  viva: /* glsl */ `
    float sup = snoise(q * 6.0 + vec3(0.0, t * 0.8, t * 0.5));
    // Broad orange mottling.
    float mot = snoise(q * 3.2 + vec3(t * 0.2, 1.3, -t * 0.15)) * 0.6 + snoise(q * 8.5 + vec3(-t * 0.3, 0.0, 2.1)) * 0.4;
    // The supergranulation's network: bright lanes where its cells meet.
    float red = 1.0 - smoothstep(0.0, 0.1, abs(snoise(q * 11.0 + vec3(t * 0.4, -t * 0.3, 0.0))));
    // Active regions: bright plages, and spots with a dark umbra inside a lighter penumbra.
    float act = snoise(q * 1.7 + vec3(t * 0.3, 0.0, -t * 0.25)) * 0.5 + 0.5;
    float region = smoothstep(0.55, 0.8, act);
    float plage = region * smoothstep(0.45, 0.8, snoise(q * 14.0 + vec3(2.3, t * 0.3, 0.0)) * 0.5 + 0.5);
    float sp = snoise(q * 7.0 + vec3(4.1, t * 0.1, 1.7)) * 0.5 + 0.5;
    float pen = smoothstep(0.7, 0.78, sp) * region * (1.0 - gigante);
    float umb = smoothstep(0.8, 0.86, sp) * region * (1.0 - gigante);
    float calor = 0.4 + gran * 0.3 + sup * 0.08 + mot * 0.2 + (act - 0.5) * 0.24 + red * 0.08 + plage * 0.11 - pen * 0.22 - umb * 0.32;
    // Faculae show best near the limb.
    calor += plage * 0.1 * (1.0 - mu);
    // Bright, but warm: never past the palette's yellow (white would read as a hole).
    calor = min(calor, 0.78) + tono;
    vec3 c = paleta(calor) * (0.3 + 0.7 * pow(max(mu, 0.0), 0.55)) * 1.12;
    c += vec3(1.0, 0.24, 0.05) * pow(max(1.0 - mu, 0.0), 2.4) * 0.38;
    return c;`,
  cromosfera: /* glsl */ `
    // The chromosphere's mottling: its network and the grass of spicules, at three sizes.
    float m1 = abs(snoise(q * 18.0 + vec3(t, -t, t * 0.5)));
    float m2 = abs(snoise(q * 45.0 + vec3(-t * 1.3, t, 0.0)));
    float m3 = abs(snoise(q * 110.0 + vec3(t * 2.0)));
    float moteado = 1.0 - (m1 * 0.45 + m2 * 0.35 + m3 * 0.2);
    // Active regions burn brighter; dark filaments lie along the lines between them.
    float act = snoise(q * 1.6 + vec3(t * 0.3, 0.0, -t * 0.25)) * 0.5 + 0.5;
    float plage = smoothstep(0.6, 0.85, act) * smoothstep(0.3, 0.8, snoise(q * 9.0 + vec3(0.7, t * 0.2, 0.0)) * 0.5 + 0.5);
    // Filaments: soft, broken ribbons.
    float fil = (1.0 - smoothstep(0.0, 0.07, abs(snoise(q * 2.6 + vec3(1.3, t * 0.1, 0.0)))))
      * smoothstep(0.35, 0.75, snoise(q * 7.0 + vec3(3.3)) * 0.5 + 0.5)
      * smoothstep(0.3, 0.5, act) * (1.0 - smoothstep(0.7, 0.85, act));
    float calor = 0.1 + moteado * 0.46 + gran * 0.06 + plage * 0.32 - fil * 0.3 + (act - 0.5) * 0.18 + tono;
    // Its colour: dark red to orange, yellow only where it burns most; the limb brightens into a rim.
    vec3 c = mix(vec3(0.3, 0.04, 0.0), vec3(0.85, 0.25, 0.02), smoothstep(0.1, 0.4, calor));
    c = mix(c, vec3(1.0, 0.5, 0.08), smoothstep(0.4, 0.66, calor));
    c = mix(c, vec3(1.0, 0.75, 0.3), smoothstep(0.75, 0.98, calor));
    c *= (0.72 + 0.28 * pow(max(mu, 0.0), 0.5)) * 0.85;
    c += vec3(1.0, 0.45, 0.1) * pow(max(1.0 - mu, 0.0), 3.0) * 0.45;
    return c;`,
};

const fotosferaGLSL = (estilo: EstiloSol) => /* glsl */ `
  uniform float uT, uBrillo, uTemp, uCeldas;
  vec3 paleta(float h) {
    vec3 deep = vec3(0.36, 0.03, 0.01);
    vec3 ember = vec3(0.82, 0.17, 0.03);
    vec3 orange = vec3(1.0, 0.45, 0.12);
    vec3 hot = vec3(1.0, 0.8, 0.52);
    vec3 c = mix(deep, ember, smoothstep(0.12, 0.42, h));
    c = mix(c, orange, smoothstep(0.42, 0.68, h));
    return mix(c, hot, smoothstep(0.74, 0.98, h));
  }
  // n: the direction on the star; V: towards the camera; paso: the spacing it is drawn at.
  vec3 superficieSol(vec3 n, vec3 V, float paso) {
    ${GRANOS}
    ${CUERPO_SOL[estilo]}
  }
  vec3 fotosfera(vec3 n, vec3 V, float paso) { return superficieSol(n, V, paso) * uBrillo; }`;

/** The options given (an option left `undefined` keeps its default). */
const dadas = <T extends object>(x: T) => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)) as T;

export function sol(opts: SolOpts = {}) {
  const o = { puntos: 500000, corona: 220000, semilla: 3, fondo: 0.3, llamaradas: 14, estilo: 'visible' as EstiloSol, temperatura: 5772, celdas: 1, ...dadas(opts) };
  const group = new THREE.Group();
  const capas: Puntos[] = [];
  const u = {
    uCamL: { value: new THREE.Vector3(0, 0, 5) },
    uT: { value: 0 },
    uBrillo: { value: 1 },
    uTemp: { value: o.temperatura },
    uCeldas: { value: o.celdas },
    uCorona: { value: 0.13 },
    uFocoLat: { value: 0 },
    uFocoLon: { value: 0 },
    uNivel: { value: 0 },
    uFlareDir: { value: new THREE.Vector3(1, 0, 0) },
    uFlareAge: { value: -1 },
  };
  const PRE = /* glsl */ `uniform vec3 uCamL; ${PARCHE_PRE} ${GLSL_COMUN} ${GLSL_SIMPLEX} ${fotosferaGLSL(o.estilo)}`;

  // Under the points, the same photosphere, dimmer: it fills the gaps and hides what is behind.
  const fondoU = { ...u, uFondo: { value: o.fondo } };
  const fondo = new THREE.Mesh(
    new THREE.SphereGeometry(1, 160, 96),
    new THREE.ShaderMaterial({
      uniforms: fondoU,
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec3 vN;
        void main() { vN = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <logdepthbuf_pars_fragment>
        uniform float uFondo;
        varying vec3 vN;
        ${PRE}
        void main() {
          #include <logdepthbuf_fragment>
          vec3 n = normalize(vN);
          gl_FragColor = vec4(fotosfera(n, normalize(uCamL - vN), length(fwidth(n))) * uFondo, 1.0);
        }`,
    }),
  );
  fondo.scale.setScalar(0.997);
  fondo.renderOrder = -50;
  group.add(fondo);

  // The patch, up close.
  const parche = puntos(geometriaParche(), {
    pre: PRE,
    cuerpo: /* glsl */ `{
      ${PARCHE_INICIO}
      em = fotosfera(n, normalize(uCamL - n), paso) * (0.85 + 0.3 * hp) * 0.45;
      ${PARCHE_FIN}
    }`,
    uniforms: u,
  });
  parche.points.visible = false;
  group.add(parche.points);

  let hecho = false;
  const listo = (async () => {
    // The photosphere's points.
    const { datos } = await fibonacci(o.puntos, o.semilla, (_x, _y, _z, out) => {
      out[0] = out[1] = out[2] = 1;
      return 0;
    });
    const global = puntos(geometria(datos), {
      pre: PRE,
      cuerpo: /* glsl */ `{
        vec3 n = normalize(p);
        em = fotosfera(n, normalize(uCamL - p), ${pasoPara(o.puntos).toFixed(6)}) * color * 0.45;
        ${GLOBAL_FIN}
      }`,
      uniforms: u,
    });
    group.add(global.points);
    capas.push(global);

    // The corona: a shell of points, densest near the surface; and the spicules' fringe at the limb.
    const N = o.corona;
    const nf = Math.round(N * 0.35);
    const r = azar(o.semilla + 7);
    const pos = new Float32Array(N * 3);
    const kind = new Float32Array(N);
    const seed = new Float32Array(N);
    const size = new Float32Array(N);
    const S = tamañoPara(N);
    for (let i = 0; i < N; i++) {
      if (i % 40000 === 0) await pausa();
      const fleco = i < nf;
      // Heights: the fringe evenly up to 0.13 radii; the corona falling off as exp(−3.4 h), out to 1.7.
      const h = fleco ? r() * 0.13 : Math.min(1.4, -Math.log(1 - r() * 0.997) / 4.5 + (r() < 0.15 ? -Math.log(1 - r() * 0.8) / 1.4 : 0));
      const zz = r() * 2 - 1;
      const a = r() * Math.PI * 2;
      const s = Math.sqrt(1 - zz * zz);
      const R = 1 + h;
      pos.set([Math.cos(a) * s * R, zz * R, Math.sin(a) * s * R], i * 3);
      kind[i] = fleco ? 1 : 0;
      seed[i] = r();
      size[i] = S * (fleco ? 0.35 : 0.6 + h) * (0.65 + r() * 0.7);
    }
    const corona = puntos(geometria({ position: pos, color: new Float32Array(N * 3).fill(1), size, seed, aKind: kind }), {
      pre: /* glsl */ `
        uniform vec3 uCamL, uFlareDir; uniform float uT, uBrillo, uFlareAge, uCorona;
        ${GLSL_SIMPLEX}`,
      cuerpo: /* glsl */ `{
        float R = length(p);
        vec3 dir = p / R;
        float h = R - 1.0;
        float t = uT;
        // Streams: broad, slow structure along the field.
        float streams = pow(snoise(dir * 1.7 + vec3(0.0, 0.0, t * 0.035 + h * 0.45)) * 0.5 + 0.5, 2.4);
        float luz = (0.42 + 0.78 * streams) * 0.35;
        // Spicules: a fine fringe of jets, each its own height.
        if (aKind > 0.5) {
          float reach = 0.025 + 0.085 * smoothstep(0.1, 0.95, snoise(dir * 9.0 + vec3(t * 0.06)) * 0.5 + 0.5);
          float strands = 0.55 + 0.45 * snoise(dir * 38.0 + vec3(t * 0.12));
          luz = (1.0 - smoothstep(0.0, reach, h)) * strands * 1.4;
        }
        // A flare: a jet that rises from the edge, grows outwards and fades.
        if (uFlareAge >= 0.0) {
          float da = acos(clamp(dot(dir, uFlareDir), -1.0, 1.0));
          float front = 0.06 + uFlareAge * 0.65;
          float width = 0.035 + h * 0.12;
          float jet = exp(-(da * da) / (width * width)) * (1.0 - smoothstep(front - 0.08, front + 0.06, h)) * exp(-h * 1.6);
          luz += jet * exp(-uFlareAge * 0.7) * smoothstep(0.0, 0.08, uFlareAge) * 4.0;
        }
        em = mix(vec3(0.95, 0.2, 0.04), vec3(1.0, 0.72, 0.44), clamp(luz * 0.9 - 0.15, 0.0, 1.0)) * luz * uCorona * uBrillo;
        // Fading out at its far edge.
        em *= 1.0 - smoothstep(0.7, 1.4, h);
      }`,
      uniforms: { uCamL: u.uCamL, uFlareDir: u.uFlareDir, uT: u.uT, uBrillo: u.uBrillo, uFlareAge: u.uFlareAge, uCorona: u.uCorona },
    });
    group.add(corona.points);
    capas.push(corona, parche);
    hecho = true;
  })();

  const lado = new THREE.Vector3();
  return {
    group,
    listo,
    /**
     * Uniforms worth touching: `uBrillo` (all of it), `uTemp` and `uCeldas` (as the options), `uCorona`
     * (the corona and the spicules, 0.13).
     */
    u,
    /** Per frame: the camera in the star's frame (radii), the time; `sol` is not used. */
    update(m: Marco) {
      const t = m.tiempo ?? 0;
      u.uT.value = t;
      u.uCamL.value.copy(m.camara);
      const nivel = seguir(u, m.camara);
      parche.points.visible = hecho && nivel > 0.001;
      for (const c of capas) enfocar(c, m, m.presencia ?? 1);
      fondoU.uFondo.value = o.fondo * (m.presencia ?? 1);
      // Flares: one every few seconds, somewhere on the limb as seen from here.
      if (o.llamaradas > 0) {
        const k = Math.floor(t / o.llamaradas);
        const age = (t - k * o.llamaradas) / 4;
        const r = azar(k * 7919 + 13);
        lado.set(r() - 0.5, r() - 0.5, r() - 0.5);
        const v = m.camara.clone().normalize();
        lado.addScaledVector(v, -lado.dot(v)).normalize();
        u.uFlareDir.value.copy(lado);
        u.uFlareAge.value = age;
      }
    },
  };
}
