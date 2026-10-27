// Copia de horizontes-cuerpos (d352f41) hecha por tools/copiar.mjs. Se edita allá, no aquí.
import * as THREE from 'three';
import { GLSL_COMUN, GLSL_RELIEVE } from './glsl';
import { cargar, lector, negro } from './mapas';
import { GLOBAL_FIN, PARCHE_FIN, PARCHE_INICIO, PARCHE_PRE, fibonacci, geometriaParche, pasoPara, seguir } from './esfera';
import { enfocar, geometria, puntos, type Puntos, type Vista } from './puntos';

/**
 * A planet in points, the style of the series, coloured from a real map. Three layers in the
 * planet's own frame (radii):
 *
 * 1 · Global points: a Fibonacci sphere coloured from the map on the CPU. With a cloud map, a second
 *     shell of points at 1.01 where it is cloudy.
 * 2 · Under them, the same photograph, treated and dim (~0.2): the gaps between points read as
 *     ground, and it hides what is behind the planet (the points test depth against it).
 * 3 · The patch: ever finer points under the camera (see esfera.ts).
 *
 * The planet's own changes to its ground (a mine, a greening, a shade, a ring's shadow) are one piece
 * of GLSL, `superficie.glsl`, run on every point and on every pixel of the photograph. In scope:
 *   n (vec3)       the unit direction of the ground, planet frame
 *   alb (vec3)     its colour, linear (inout)
 *   nn (vec3)      the normal the Sun lights (inout)
 *   sombra (float) how much sunlight reaches it (inout, 1)
 *   extra (vec3)   its own light, added unlit (inout, 0)
 *   paso (float)   the spacing between points there, in radians. For a thin line: draw it
 *                  max(width, paso) wide and dim it by width / paso, so it reads the same at any distance.
 *   hp (float)     a hash of the point, 0..1
 *   uSun, uCamL    the Sun's direction and the camera (planet frame)
 * plus h3, n3, fbm, dirDe(la, lo) and uvDe(n).
 */

export interface PlanetaOpts {
  /** The colour map: equirectangular, longitude 0 in the middle, east to the right. */
  mapa: string;
  /** A cloud map (white where cloudy): a shell of points above the ground, grey on the ground. */
  nubes?: string;
  /** How much air: 0, bare rock with a hard terminator; 1, a thick atmosphere with a soft one and a rim. */
  aire: number;
  /** Relief read from the map's own shading (rock lit low: Mercury, the Moon). */
  relieve?: boolean;
  /** The Sun's glint on open water (the map's blue pixels). */
  mar?: boolean;
  /** The haze beyond the limb (its colour and radius), or none. */
  halo?: { color: THREE.Color; r?: number };
  /** Points over the whole sphere (the patch adds finer ones near the camera). */
  puntos?: number;
  /** The albedo's tint. */
  tinte?: THREE.Color;
  /** How bright the photograph under the points is, and its radius. */
  fondo?: number;
  fondoR?: number;
  semilla?: number;
  /** Flattening at the poles (Jupiter 0.065, Saturn 0.098). */
  achatado?: number;
  /** How fast it turns: radians per unit of `tiempo` (0: the caller turns it). */
  giro?: number;
  /** The planet's own changes to its ground (see above). Its uniforms are shared by every layer. */
  superficie?: { pre?: string; glsl: string; uniforms?: Record<string, THREE.IUniform> };
}

/** What a body needs each frame. Directions and places are in the body's frame (radii), before its own turn. */
export interface Marco extends Vista {
  /** The direction towards the Sun. */
  sol: THREE.Vector3;
  /** Where the camera is. */
  camara: THREE.Vector3;
  /** Seconds (its turn, anything that moves). */
  tiempo?: number;
  /** How present it is (0..1). */
  presencia?: number;
}

export interface Planeta {
  /** Add it to the planet's place, scaled to its radius (and tilted, if it is). */
  group: THREE.Group;
  /** What turns with it (its own points; things on it can go here too). */
  cuerpo: THREE.Group;
  /** Resolves once the maps are loaded and the points built. */
  listo: Promise<void>;
  /** The haze's uniforms, when there is one (its strength through `brilloHalo`). */
  halo: { uColor: { value: THREE.Color }; uOn: { value: number } } | null;
  /** The haze's strength (1), before height and presence. */
  brilloHalo: number;
  /** The Sun's direction and the camera in the turning frame (as last updated). */
  local: { sol: THREE.Vector3; camara: THREE.Vector3 };
  update(m: Marco): void;
}

const NUBE_GRIS = 'vec3(0.62, 0.64, 0.66)';
const f = (x: number) => x.toFixed(6);

export function planeta(opts: PlanetaOpts): Planeta {
  const o = { puntos: 400000, semilla: 7, fondo: 0.2, fondoR: 0.996, achatado: 0, giro: 0, ...opts };
  const group = new THREE.Group();
  const cuerpo = new THREE.Group();
  cuerpo.scale.y = 1 - o.achatado;
  group.add(cuerpo);
  const capas: Puntos[] = [];
  const AIRE = f(o.aire);
  const hook = o.superficie ? `{\n${o.superficie.glsl}\n}` : '';
  const pre = o.superficie?.pre ?? '';
  const propios = o.superficie?.uniforms ?? {};
  const conNubes = !!o.nubes;
  const u = {
    uSun: { value: new THREE.Vector3(1, 0, 0) },
    uCamL: { value: new THREE.Vector3(0, 0, 5) },
    uMap: { value: negro() as THREE.Texture },
    uNubes: { value: negro() as THREE.Texture },
    uTinte: { value: (o.tinte ?? new THREE.Color(1, 1, 1)).clone() },
    uFocoLat: { value: 0 },
    uFocoLon: { value: 0 },
    uNivel: { value: 0 },
  };

  // Layer 2 · the photograph, treated and dim, under the points.
  const fondoU = { ...u, ...propios, uBrillo: { value: o.fondo } };
  const fondo = new THREE.Mesh(
    new THREE.SphereGeometry(1, 192, 128),
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
        uniform sampler2D uMap, uNubes; uniform vec3 uSun, uCamL, uTinte; uniform float uBrillo;
        varying vec3 vN;
        ${GLSL_COMUN}
        ${pre}
        void main() {
          #include <logdepthbuf_fragment>
          vec3 n = normalize(vN);
          vec3 V = normalize(uCamL - vN);
          vec2 uv = uvDe(n);
          vec3 base = texture2D(uMap, uv).rgb * uTinte;
          vec3 alb = base;
          float cl = 0.0;
          ${conNubes ? `cl = smoothstep(0.2, 0.9, texture2D(uNubes, uv).r); alb = mix(alb, ${NUBE_GRIS}, cl * 0.8);` : ''}
          vec3 nn = n;
          ${o.relieve ? GLSL_RELIEVE : ''}
          float sombra = 1.0;
          vec3 extra = vec3(0.0);
          float paso = length(fwidth(n));
          float hp = 0.5;
          ${hook}
          vec3 c = luz(alb, nn, uSun, V, ${AIRE}) * sombra;
          ${o.mar ? 'c += brilloMar(n, uSun, V, 70.0) * esMar(base) * (1.0 - cl) * smoothstep(0.0, 0.2, dot(n, uSun)) * sombra;' : ''}
          gl_FragColor = vec4((c + extra) * uBrillo, 1.0);
        }`,
    }),
  );
  fondo.scale.setScalar(o.fondoR);
  fondo.renderOrder = -50;
  cuerpo.add(fondo);

  // The haze beyond the limb: a slightly larger sphere, its back half only, glowing edge-on by day.
  let halo: Planeta['halo'] = null;
  let brilloHalo = 1;
  if (o.halo) {
    const hu = { uSun: u.uSun, uCamL: u.uCamL, uOn: { value: 1 }, uColor: { value: o.halo.color.clone() } };
    halo = hu;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(o.halo.r ?? 1.028, 128, 64),
      new THREE.ShaderMaterial({
        uniforms: hu,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          #include <common>
          #include <logdepthbuf_pars_vertex>
          uniform vec3 uCamL;
          varying vec3 vN; varying vec3 vV;
          void main() { vN = normalize(position); vV = normalize(uCamL - position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            #include <logdepthbuf_vertex>
          }`,
        fragmentShader: /* glsl */ `
          #include <logdepthbuf_pars_fragment>
          uniform vec3 uSun, uColor; uniform float uOn; varying vec3 vN; varying vec3 vV;
          void main() {
            #include <logdepthbuf_fragment>
            float e = 1.0 - abs(dot(normalize(vN), normalize(vV)));
            float g = pow(max(e, 0.0), 5.0) * smoothstep(-0.35, 0.45, dot(normalize(vN), uSun));
            gl_FragColor = vec4(uColor * g * 1.1 * uOn, 1.0);
          }`,
      }),
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    cuerpo.add(mesh);
  }

  // Layer 3 · the patch.
  const parche = puntos(geometriaParche(), {
    pre: /* glsl */ `
      uniform sampler2D uMap, uNubes;
      uniform vec3 uSun, uCamL, uTinte;
      ${PARCHE_PRE}
      ${GLSL_COMUN}
      ${pre}`,
    cuerpo: /* glsl */ `{
      ${PARCHE_INICIO}
      // Its colour: the map, the clouds, a little grain of its own (the map's pixels are larger than the finest points).
      vec3 base = texture2D(uMap, uv).rgb * uTinte;
      vec3 alb = base;
      float cl = 0.0;
      ${conNubes ? `cl = smoothstep(0.2, 0.9, texture2D(uNubes, uv).r); alb = mix(alb, ${NUBE_GRIS}, cl * 0.8);` : ''}
      alb *= 0.82 + 0.36 * hp;
      vec3 nn = n;
      ${o.relieve ? GLSL_RELIEVE : ''}
      float sombra = 1.0;
      vec3 extra = vec3(0.0);
      ${hook}
      float lit = luzSol(n, nn, uSun, ${AIRE}) * sombra;
      em = grado(alb) * (lit * 0.9 + 0.003) + extra;
      ${o.mar ? 'em += brilloMar(n, uSun, normalize(uCamL - n), 60.0) * lit * esMar(base) * (1.0 - cl);' : ''}
      ${PARCHE_FIN}
    }`,
    uniforms: { ...u, ...propios },
  });
  parche.points.visible = false;
  cuerpo.add(parche.points);

  let hecho = false;
  const listo = (async () => {
    const [map, cloud] = await Promise.all([cargar(o.mapa, true), o.nubes ? cargar(o.nubes, false) : Promise.resolve(null)]);
    u.uMap.value = map;
    if (cloud) u.uNubes.value = cloud;
    const leer = lector(map);
    const leerNubes = cloud ? lector(cloud) : null;
    const t = o.tinte ?? new THREE.Color(1, 1, 1);
    const c2 = [0, 0, 0];
    const lum = (x: number, y: number, z: number) => {
      const l = Math.hypot(x, y, z);
      leer(x / l, y / l, z / l, c2);
      return c2[0] + c2[1] + c2[2];
    };
    // Layer 1 · the global points.
    const { datos, extra: nrm } = await fibonacci(
      o.puntos,
      o.semilla,
      (x, y, z, out) => {
        leer(x, y, z, out);
        out[0] *= t.r;
        out[1] *= t.g;
        out[2] *= t.b;
        return o.mar && out[2] > out[0] * 1.4 && out[2] > out[1] ? 1 : 0;
      },
      o.relieve
        ? {
            porPunto: 3,
            // Relief from the map's own shading: t1 = UP × p, t2 = p × t1.
            llenar: (x, y, z, out, i) => {
              let ax = z;
              let az = -x;
              const al = Math.hypot(ax, az);
              if (al < 1e-6) {
                out.set([x, y, z], i);
                return;
              }
              ax /= al;
              az /= al;
              const bx = y * az;
              const by = z * ax - x * az;
              const bz = -y * ax;
              const e = 0.003;
              const h0 = lum(x, y, z);
              const d1 = (lum(x + ax * e, y, z + az * e) - h0) * 2.0;
              const d2 = (lum(x + bx * e, y + by * e, z + bz * e) - h0) * 2.0;
              const nx = x - ax * d1 - bx * d2;
              const ny = y - by * d2;
              const nz = z - az * d1 - bz * d2;
              const nl = Math.hypot(nx, ny, nz);
              out.set([nx / nl, ny / nl, nz / nl], i);
            },
          }
        : undefined,
    );
    const global = puntos(geometria(datos, nrm ? { aNrm: [nrm, 3] } : {}), {
      pre: /* glsl */ `
        uniform vec3 uSun, uCamL;
        ${PARCHE_PRE}
        ${nrm ? 'attribute vec3 aNrm;' : ''}
        ${GLSL_COMUN}
        ${pre}`,
      cuerpo: /* glsl */ `{
        vec3 n = normalize(p);
        vec3 alb = color;
        vec3 nn = ${nrm ? 'aNrm' : 'n'};
        float sombra = 1.0;
        vec3 extra = vec3(0.0);
        float paso = ${f(pasoPara(o.puntos))};
        float hp = seed;
        ${hook}
        float lit = luzSol(n, nn, uSun, ${AIRE}) * sombra;
        em = grado(alb) * (lit * 0.9 + 0.003) + extra;
        ${o.mar ? 'if (aKind > 0.5) em += brilloMar(n, uSun, normalize(uCamL - p), 60.0) * lit;' : ''}
        ${GLOBAL_FIN}
      }`,
      uniforms: { ...u, ...propios },
    });
    cuerpo.add(global.points);
    capas.push(global);
    // The clouds: a second shell, where the cloud map is white, lit as air.
    if (leerNubes) {
      const nc = Math.round(o.puntos * 0.5);
      const { datos: dn } = await fibonacci(nc, o.semilla + 1, (x, y, z, out) => {
        const cl = leerNubes(x, y, z, out)[0];
        const v = cl < 0.12 ? 0 : Math.min(1, cl * 1.4);
        out[0] = 0.62 * v;
        out[1] = 0.64 * v;
        out[2] = 0.66 * v;
        return 0;
      });
      const nubes = puntos(geometria(dn), {
        pre: /* glsl */ `
          uniform vec3 uSun, uCamL;
          ${PARCHE_PRE}
          ${GLSL_COMUN}`,
        cuerpo: /* glsl */ `{
          p *= 1.01;
          vec3 n = normalize(p);
          em = grado(color) * (luzSol(n, n, uSun, 1.0) * 0.9 + 0.003);
          ${GLOBAL_FIN}
        }`,
        uniforms: { ...u },
      });
      cuerpo.add(nubes.points);
      capas.push(nubes);
    }
    capas.push(parche);
    hecho = true;
  })();

  const local = { sol: new THREE.Vector3(1, 0, 0), camara: new THREE.Vector3(0, 0, 5) };
  const q = new THREE.Quaternion();
  return {
    group,
    cuerpo,
    listo,
    halo,
    get brilloHalo() {
      return brilloHalo;
    },
    set brilloHalo(v: number) {
      brilloHalo = v;
    },
    local,
    update(m) {
      const gain = m.presencia ?? 1;
      if (o.giro) cuerpo.rotation.y = (m.tiempo ?? 0) * o.giro;
      q.copy(cuerpo.quaternion).invert();
      local.sol.copy(m.sol).applyQuaternion(q).normalize();
      local.camara.copy(m.camara).applyQuaternion(q);
      local.camara.y /= 1 - o.achatado;
      u.uSun.value.copy(local.sol);
      u.uCamL.value.copy(local.camara);
      const nivel = seguir(u, local.camara);
      parche.points.visible = hecho && nivel > 0.001 && gain > 0.001;
      for (const c of capas) enfocar(c, m, gain);
      fondoU.uBrillo.value = o.fondo * gain;
      // Low over the ground the haze's shell is seen edge on from inside: it thins to a band.
      if (halo) halo.uOn.value = brilloHalo * gain * Math.min(1, (local.camara.length() - 1) / 0.08);
    },
  };
}
