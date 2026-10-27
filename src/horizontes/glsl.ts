// Copia de horizontes-cuerpos (d352f41) hecha por tools/copiar.mjs. Se edita allá, no aquí.
/**
 * GLSL every body shares: value noise, directions and map coordinates, and the treatment of the
 * series (a dark, muted grade; a soft terminator where there is air, a sharp one on rock).
 *
 * Coordinates: north +Y, longitude 0 at +X, east towards −Z. An equirectangular map with longitude
 * 0 in its middle (as Solar System Scope's are) lands where it should.
 */
export const GLSL_COMUN = /* glsl */ `
  float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
  vec3 dirDe(float la, float lo) { return vec3(cos(la) * cos(lo), sin(la), -cos(la) * sin(lo)); }
  vec2 uvDe(vec3 n) { return vec2(atan(-n.z, n.x) / 6.2831853 + 0.5, 0.5 + asin(clamp(n.y, -1.0, 1.0)) / 3.14159265); }
  vec2 uvLL(float la, float lo) { return vec2(fract(lo / 6.2831853 + 0.5), 0.5 + la / 3.14159265); }
  // The grade: muted, darker, a little cool.
  vec3 grado(vec3 c) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, 0.6);
    c = pow(max(c, vec3(0.0)), vec3(1.3));
    return c * vec3(0.9, 0.96, 1.04);
  }
  // Sunlight on a point: soft where there is air (the light goes round a little), sharp on rock.
  float luzSol(vec3 n, vec3 nn, vec3 L, float aire) {
    float d = dot(nn, L);
    return mix(smoothstep(-0.02, 0.22, d) * smoothstep(-0.05, 0.05, dot(n, L)), smoothstep(-0.14, 0.42, d), aire);
  }
  // The photograph's light: the same, plus the air within the limb (blue by day, warm at the terminator).
  vec3 luz(vec3 albedo, vec3 n, vec3 L, vec3 V, float aire) {
    float d = dot(n, L);
    float lit = mix(smoothstep(-0.02, 0.22, d), smoothstep(-0.14, 0.42, d), aire);
    vec3 c = grado(albedo) * lit * 0.62;
    float mu = max(dot(n, V), 0.0);
    float rim = pow(max(1.0 - mu, 0.0), 2.6) * aire;
    c += vec3(0.32, 0.55, 1.0) * rim * 0.45 * smoothstep(-0.2, 0.5, d);
    c += vec3(1.0, 0.5, 0.26) * aire * 0.06 * exp(-(d / 0.09) * (d / 0.09)) * (0.4 + rim);
    return c;
  }
  float esMar(vec3 c) { return step(c.r * 1.4, c.b) * step(c.g, c.b); }
  vec3 brilloMar(vec3 n, vec3 L, vec3 V, float pw) { return vec3(1.0, 0.85, 0.65) * pow(max(dot(reflect(-L, n), V), 0.0), pw) * 0.5; }`;

/** Relief from the map's own shading (rock lit low): brighter where it faces its light, read as slope. */
export const GLSL_RELIEVE = /* glsl */ `
  {
    float e = 0.0015;
    float h0 = dot(texture2D(uMap, uv).rgb, vec3(0.33));
    float hx = dot(texture2D(uMap, uv + vec2(e, 0.0)).rgb, vec3(0.33));
    float hy = dot(texture2D(uMap, uv + vec2(0.0, e)).rgb, vec3(0.33));
    vec3 t1 = normalize(cross(vec3(0.0, 1.0, 0.0), n) + 1e-5);
    vec3 t2 = cross(n, t1);
    nn = normalize(n - (t1 * (hx - h0) + t2 * (hy - h0)) * 2.5);
  }`;

/** 3D simplex noise (Ian McEwan, Ashima Arts; MIT licence), as in the Atlas's star. */
export const GLSL_SIMPLEX = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }`;
