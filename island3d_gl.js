// ちいさな島から世界へ — GPU (WebGL2) renderer for Island3D scenes.
// Shadows, soft terrain shading, waving water, trees swaying in the wind, haze, and animated characters/fire.
// Needs island3d.js first (window.Island3D). Usage:
//   const R = Island3D.GL.create(W, H)                 // makes its own canvas (R.canvas)
//   R.setWorld(world)                                  // world = Island3D.bigWorld({hd:true, hero:false}) (+ your buildings)
//   R.addCharacter({ look, pos:[x,y,z], yaw, act:'idle'|'walk'|'wave'|'work'|'cheer', path:[[x,z],[x,z]], speed, name })
//   R.addFire([x,y,z])
//   R.render(cam, t)   // cam = {pos, target, fov}; t = seconds (drives waves, wind, walking)
//   R.project([x,y,z]) -> [sx, sy, depth] in canvas pixels (for name tags)
//   R.labels() -> [{name, x, y, d}] screen positions above each named character (call after render)
(function () {
  const I = window.Island3D;
  const VS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec3 aC; layout(location=3) in float aK;
uniform mat4 uVP, uM, uLVP; uniform float uT;
out vec3 vN; out vec3 vC; out vec4 vL; out vec3 vW; out float vK;
void main(){
  vec4 w = uM * vec4(aP, 1.0); vec3 n = mat3(uM) * aN;
  if (aK > 0.5 && aK < 2.0) { float s = (aK - 1.0) * 0.12;
    w.x += sin(uT * 1.7 + w.x * 0.35 + w.z * 0.27) * s; w.z += cos(uT * 1.3 + w.x * 0.21 + w.z * 0.4) * s * 0.8; }
  if (aK > 4.5) { float a = w.x * 0.55 + uT * 1.1, b = w.z * 0.7 - uT * 1.4, c = (w.x + w.z) * 1.6 + uT * 2.2;
    w.y += sin(a) * 0.07 + sin(b) * 0.06 + sin(c) * 0.025;
    n = normalize(vec3(-cos(a) * 0.0385 - cos(c) * 0.04, 1.0, -cos(b) * 0.042 - cos(c) * 0.04)); }
  vW = w.xyz; vN = n; vC = aC; vK = aK; vL = uLVP * w; gl_Position = uVP * w;
}`;
  const FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vC; in vec4 vL; in vec3 vW; in float vK;
uniform vec3 uSun, uSky, uGround, uFog, uEye; uniform float uFogD, uShore, uPlate; uniform highp sampler2D uSh;
out vec4 o;
float shadow(vec3 n){
  vec3 p = vL.xyz / vL.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = 0.0008 + 0.002 * (1.0 - abs(dot(n, uSun)));
  vec2 ts = 1.0 / vec2(textureSize(uSh, 0)); float s = 0.0;
  for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++) s += (p.z - bias > texture(uSh, p.xy + vec2(x, y) * ts).r) ? 0.0 : 1.0;
  return s / 25.0;
}
void main(){
  vec3 n = normalize(vN); vec3 v = normalize(uEye - vW);
  if (dot(n, v) < 0.0 && vK < 4.5) n = -n;
  vec3 c;
  if (vK > 2.5 && vK < 3.5) { c = vC; }
  else {
    float sh = shadow(n);
    float dif = max(dot(n, uSun), 0.0);
    vec3 amb = mix(uGround, uSky, n.y * 0.5 + 0.5);
    vec3 base = vC;
    if (vK > 4.5) {
      float r = length(vW.xz); float shallow = 1.0 - smoothstep(uShore * 0.98, uShore * 1.3, r);
      base = mix(vec3(0.10, 0.40, 0.66), vec3(0.30, 0.70, 0.78), shallow);
      float edge = smoothstep(uPlate * 0.97, uPlate, max(abs(vW.x), abs(vW.z) * 1.15));
      base = mix(base, vec3(0.14, 0.45, 0.72), edge);
    }
    c = base * (amb * 0.52 + dif * sh * vec3(1.0, 0.94, 0.84) * 0.74);
    if (vK > 4.5) { vec3 h = normalize(v + uSun); float sp = pow(max(dot(n, h), 0.0), 80.0) * 0.9 * sh;
      float fr = pow(1.0 - max(dot(n, v), 0.0), 4.0); c = mix(c, uSky, fr * 0.45) + vec3(sp); }
  }
  float d = length(uEye - vW); float f = 1.0 - exp(-d * uFogD);
  c = mix(c, uFog, clamp(f, 0.0, 0.8));
  c = pow(clamp(c, 0.0, 1.0), vec3(1.06)) * 1.04;
  o = vec4(c, 1.0);
}`;
  const SVS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=3) in float aK; uniform mat4 uLVP, uM; uniform float uT;
void main(){ vec4 w = uM * vec4(aP, 1.0);
  if (aK > 0.5 && aK < 2.0) { float s = (aK - 1.0) * 0.12; w.x += sin(uT * 1.7 + w.x * 0.35 + w.z * 0.27) * s; w.z += cos(uT * 1.3 + w.x * 0.21 + w.z * 0.4) * s * 0.8; }
  gl_Position = uLVP * w; }`;
  const SFS = `#version 300 es
precision mediump float; out vec4 o; void main(){ o = vec4(1.0); }`;

  // ---- tiny matrix helpers (column-major) ----
  const M4 = {
    id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
    persp(fov, asp, n, f) { const t = 1 / Math.tan(fov / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; },
    ortho(l, r, b, t, n, f) { return [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]; },
    look(e, c, up = [0, 1, 0]) {
      const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], nrm = a => { const l = Math.hypot(...a) || 1; return a.map(x => x / l); }, cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const z = nrm(sub(e, c)), x = nrm(cr(up, z)), y = cr(z, x);
      return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dt(x, e), -dt(y, e), -dt(z, e), 1];
    },
    T: (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
    RY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
    RX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },
    RZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
    S: (k) => [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1],
  };
  const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  function packScene(S) { // interleaved: pos3 nrm3 col3 kind1
    const n = S.tris.length, f = new Float32Array(n * 3 * 10); let o = 0;
    for (const t of S.tris) {
      const [a, b, c, col, kind, ns] = t; let fn = null;
      if (!ns) { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; fn = norm3([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]); }
      const vs = [a, b, c];
      for (let k = 0; k < 3; k++) { const p = vs[k], nn = ns ? ns[k] : fn; f[o++] = p[0]; f[o++] = p[1]; f[o++] = p[2]; f[o++] = nn[0]; f[o++] = nn[1]; f[o++] = nn[2]; f[o++] = col[0] / 255; f[o++] = col[1] / 255; f[o++] = col[2] / 255; f[o++] = kind || 0; }
    }
    return { data: f, count: n * 3 };
  }

  function create(W, H, opt = {}) {
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 が使えません');
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = (v, f) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
    const P = prog(VS, FS), PS = prog(SVS, SFS);
    const U = n => gl.getUniformLocation(P, n), US = n => gl.getUniformLocation(PS, n);
    const SM = opt.shadowSize || 4096;
    const shTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, shTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SM, SM, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shTex, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    function mesh(S) {
      const { data, count } = packScene(S); const vao = gl.createVertexArray(), vbo = gl.createBuffer();
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const st = 40; gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, st, 24);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 36);
      gl.bindVertexArray(null); return { vao, count };
    }
    function waterMesh(R) { // tessellated hexagon-ish square of water, kind 5
      const S = new I.Scene(); S.kind = 5; const N = 90, half = R * 1.02, st = half * 2 / N;
      const inHex = (x, z) => { for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6 + Math.PI / 6; if (x * Math.cos(a) + z * Math.sin(a) > R * Math.cos(Math.PI / 6) + 0.001) return false; } return true; };
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x0 = -half + i * st, z0 = -half + j * st, x1 = x0 + st, z1 = z0 + st;
        if (!inHex((x0 + x1) / 2, (z0 + z1) / 2)) continue;
        S.triN([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [80, 180, 230], [0, 1, 0], [0, 1, 0], [0, 1, 0]);
        S.triN([x0, 0, z0], [x1, 0, z1], [x0, 0, z1], [80, 180, 230], [0, 1, 0], [0, 1, 0], [0, 1, 0]);
      }
      return S;
    }

    const R = { canvas, gl, chars: [], fires: [], props: [], world: null, sun: norm3(opt.sun || [-0.45, 0.8, -0.4]) };
    R.worlds = {};
    R.setWorld = (w, key = 'main') => {
      const S = new I.Scene(); S.tris = w.S.tris.filter(t => t[4] !== 4);
      R.worlds[key] = { w, st: mesh(S), wa: mesh(waterMesh((w.S.plateR || 33.6) * 0.995)), shore: w.S.islandR || 24, plate: w.S.plateR || 33.6 };
      if (key === 'main' || !R.world) R.use(key);
    };
    R.use = (key) => { const o = R.worlds[key] || R.worlds.main; R.cur = key; R.world = o.w; R.static = o.st; R.water = o.wa; R.shore = o.shore; R.plate = o.plate; };
    const partCache = new Map();
    R.addCharacter = (c) => {
      const L = c.look || I.HERO_LOOK, key = L.key || JSON.stringify(L);
      if (!partCache.has(key)) { const vp = I.villagerParts(L), m = {}; for (const k in vp.parts) m[k] = mesh(vp.parts[k]); partCache.set(key, { m, pv: vp.pivots, h: vp.height }); }
      const ch = Object.assign({ yaw: 0, act: 'idle', speed: 0.9, scale: 1, phase: Math.random() * 6.28 }, c, { mesh: partCache.get(key) });
      if (!ch.pos && ch.path) ch.pos = [ch.path[0][0], 0, ch.path[0][1]];
      R.chars.push(ch); return ch;
    };
    R.addFire = (p, s = 1) => {
      const logs = new I.Scene(); for (let k = 0; k < 4; k++) logs.box(0, 0, 0, 0.12 * s, 0.12 * s, 0.9 * s, '#6B4423', k * Math.PI / 4);
      for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28; logs.ico(Math.cos(a) * 0.55 * s, 0.05, Math.sin(a) * 0.55 * s, 0.13 * s, '#8E8E86', k); }
      const fl = []; for (const [col, r, h] of [['#E8401C', 0.34, 0.85], ['#FF7A1F', 0.26, 1.0], ['#FFB23A', 0.18, 0.8], ['#FFE680', 0.09, 0.55]]) { const S = new I.Scene(); S.kind = 3; S.cone(0, 0, 0, r * s, h * s, 7, col); fl.push(mesh(S)); }
      R.fires.push({ p, logs: mesh(logs), fl, s }); };
    R.addProp = (S, M = M4.id()) => { const m = mesh(S); const pr = { m, M }; R.props.push(pr); return pr; };

    function charPose(ch, t) { // returns model matrices for parts
      let [x, y, z] = ch.pos, yaw = ch.yaw, bob = 0, aL = 0, aR = 0, lL = 0, lR = 0, zL = 0, zR = 0, ph = ch.phase;
      if (ch.act === 'walk' && ch.path) {
        const [p0, p1] = ch.path, d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, per = d / ch.speed, u = ((t + ph) % (2 * per)) / per, f = u < 1 ? u : 2 - u;
        x = p0[0] + (p1[0] - p0[0]) * f; z = p0[1] + (p1[1] - p0[1]) * f; y = R.world.hAt(x, z);
        yaw = Math.atan2(-(p1[0] - p0[0]) * (u < 1 ? 1 : -1), -(p1[1] - p0[1]) * (u < 1 ? 1 : -1));
        const w = Math.sin((t + ph) * ch.speed * 7); lL = w * 0.6; lR = -w * 0.6; aL = -w * 0.5; aR = w * 0.5; bob = Math.abs(Math.cos((t + ph) * ch.speed * 7)) * 0.05;
      } else if (ch.act === 'wave') { zR = 2.5 + Math.sin((t + ph) * 8) * 0.35; aL = Math.sin((t + ph) * 2) * 0.08; bob = Math.sin((t + ph) * 2) * 0.01; }
      else if (ch.act === 'work') { const w = (t + ph) * 3.2 % 1; aR = -2.4 * (w < 0.6 ? w / 0.6 : 1 - (w - 0.6) / 0.4); aL = aR * 0.6; bob = -Math.max(0, aR) * 0.02; }
      else if (ch.act === 'cheer') { const j = Math.abs(Math.sin((t + ph) * 5)); zL = -2.6 - j * 0.3; zR = 2.6 + j * 0.3; bob = j * 0.22; }
      else { aL = Math.sin((t + ph) * 1.6) * 0.06; aR = -aL; bob = Math.sin((t + ph) * 1.6) * 0.012; }
      if (ch.act !== 'walk' && (y === undefined || y === null)) y = R.world.hAt(x, z);
      ch.cur = [x, y + bob, z];
      const base = M4.mul(M4.T(x, y + bob, z), M4.mul(M4.RY(yaw), M4.S(ch.scale)));
      const pv = ch.mesh.pv, J = (name, ang, rz = 0) => M4.mul(base, M4.mul(M4.T(...pv[name]), M4.mul(M4.mul(M4.RZ(rz), M4.RX(ang)), M4.T(-pv[name][0], -pv[name][1], -pv[name][2]))));
      return { body: base, armL: J('armL', aL, zL), armR: J('armR', aR, zR), legL: J('legL', lL), legR: J('legR', lR) };
    }

    let VP = null;
    R.render = (cam, t = 0) => {
      const sky = opt.sky || [0.62, 0.84, 0.98], ground = [0.42, 0.38, 0.32], fog = opt.fog || [0.80, 0.90, 0.97];
      const sun = R.sun, ctr = [0, 2, 0], ext = (R.plate || 34) * 1.05;
      const LV = M4.look([ctr[0] + sun[0] * 80, ctr[1] + sun[1] * 80, ctr[2] + sun[2] * 80], ctr), LP = M4.ortho(-ext, ext, -ext, ext, 10, 170), LVP = M4.mul(LP, LV);
      const poses = R.cur === 'main' ? R.chars.map(ch => charPose(ch, t)) : [];
      const drawAll = (uM, isShadow) => {
        const id = M4.id();
        gl.uniformMatrix4fv(uM, false, id); gl.bindVertexArray(R.static.vao); gl.drawArrays(gl.TRIANGLES, 0, R.static.count);
        if (R.cur === 'main') for (const pr of R.props) { gl.uniformMatrix4fv(uM, false, pr.M); gl.bindVertexArray(pr.m.vao); gl.drawArrays(gl.TRIANGLES, 0, pr.m.count); }
        if (R.cur === 'main') R.chars.forEach((ch, i) => { const ps = poses[i]; for (const k of ['body', 'armL', 'armR', 'legL', 'legR']) { gl.uniformMatrix4fv(uM, false, ps[k]); const m = ch.mesh.m[k]; gl.bindVertexArray(m.vao); gl.drawArrays(gl.TRIANGLES, 0, m.count); } });
        if (R.cur === 'main') for (const f of R.fires) {
          gl.uniformMatrix4fv(uM, false, M4.T(...f.p)); gl.bindVertexArray(f.logs.vao); gl.drawArrays(gl.TRIANGLES, 0, f.logs.count);
          if (!isShadow) f.fl.forEach((m, k) => { const fl = 1 + 0.25 * Math.sin(t * (11 + k * 3) + k) + 0.12 * Math.sin(t * 23 + k * 2); const M = M4.mul(M4.T(f.p[0], f.p[1] + 0.05, f.p[2]), M4.mul(M4.RY(t * 2 + k), [1, 0, 0, 0, 0, fl, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])); gl.uniformMatrix4fv(uM, false, M); gl.bindVertexArray(m.vao); gl.drawArrays(gl.TRIANGLES, 0, m.count); });
        }
      };
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      // shadow pass
      gl.useProgram(PS); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, SM, SM); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(US('uLVP'), false, LVP); gl.uniform1f(US('uT'), t); drawAll(US('uM'), true);
      // main pass
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.useProgram(P);
      const asp = W / H, V = M4.look(cam.pos, cam.target), Pm = M4.persp((cam.fov || 45) * Math.PI / 180, asp, 0.3, 400); VP = M4.mul(Pm, V);
      if (opt.transparent) gl.clearColor(0, 0, 0, 0); else gl.clearColor(...fog, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(U('uVP'), false, VP); gl.uniformMatrix4fv(U('uLVP'), false, LVP); gl.uniform1f(U('uT'), t);
      gl.uniform3fv(U('uSun'), sun); gl.uniform3fv(U('uSky'), sky); gl.uniform3fv(U('uGround'), ground); gl.uniform3fv(U('uFog'), fog); gl.uniform3fv(U('uEye'), cam.pos);
      gl.uniform1f(U('uFogD'), opt.fogD ?? 0.0032); gl.uniform1f(U('uShore'), R.shore); gl.uniform1f(U('uPlate'), R.plate);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shTex); gl.uniform1i(U('uSh'), 0);
      drawAll(U('uM'), false);
      gl.uniformMatrix4fv(U('uM'), false, M4.id()); gl.bindVertexArray(R.water.vao); gl.drawArrays(gl.TRIANGLES, 0, R.water.count);
      gl.bindVertexArray(null);
      return canvas;
    };
    R.project = (p) => { if (!VP) return null; const x = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12], y = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13], w = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15]; if (w <= 0.01) return null; return [(x / w * 0.5 + 0.5) * W, (1 - (y / w * 0.5 + 0.5)) * H, w]; };
    R.labels = () => R.cur !== 'main' ? [] : R.chars.filter(c => c.name && c.cur).map(c => { const q = R.project([c.cur[0], c.cur[1] + c.mesh.h * c.scale + 0.35, c.cur[2]]); return q && { name: c.name, x: q[0], y: q[1], d: q[2] }; }).filter(Boolean);
    return R;
  }
  // ---------- stage: what the video pipelines use ----------
  // EP fields used: buildWorld(opt) (optional; must pass opt to Island3D.bigWorld), cams, worlds (extra worlds for cams with world:'key'),
  //   heroAt [x,z], heroAct, residents [{id:'ig:xxx', name:'xxx'}] (order = data.json residents), actors [{look, pos, act, path, name}], fires [[x,y,z]], tags (true = show name tags)
  function stage(EP, W, H) {
    const R = create(W, H, { transparent: true });
    const w = (EP.buildWorld || I.bigWorld)({ hd: true, hero: false });
    R.setWorld(w, 'main');
    for (const k in (EP.worlds || {})) R.setWorld(EP.worlds[k](), k);
    R.use('main');
    const hb = EP.heroAt || [w.big.beach[0], w.big.beach[1]];
    R.addCharacter({ look: I.HERO_LOOK, pos: [hb[0], null, hb[1]], yaw: -0.55, act: EP.heroAct || 'idle', phase: 0, name: EP.heroName || '' });
    const res = EP.residents || [], spots = I.villagerSpots(w, res.length), taken = new Set(), ACT = ['idle', 'walk', 'work', 'idle', 'walk', 'wave', 'cheer', 'walk', 'work', 'idle'];
    res.forEach((r, i) => { const p = spots[i]; if (!p) return; const a = r.act || ACT[i % ACT.length], ang = i * 2.4;
      R.addCharacter({ look: I.lookFor(r.id, taken), pos: [p[0], p[1], p[2]], yaw: ang, act: a, path: [[p[0], p[2]], [p[0] + Math.cos(ang) * 2.2, p[2] + Math.sin(ang) * 2.2]], speed: 0.7 + (i % 3) * 0.15, name: r.name, phase: i * 1.7 }); });
    (EP.actors || []).forEach(a => R.addCharacter(a));
    (EP.fires || []).forEach(f => R.addFire(f));
    const out = document.createElement('canvas'); out.width = W; out.height = H; const ctx = out.getContext('2d');
    const FONT = "'Yu Gothic UI','Yu Gothic','Meiryo',sans-serif";
    // clearView(['camKey',...], r): remove trees/props of the static island between each camera and its target (ground stays)
    const clearView = (keys, r = 2.6) => {
      const segs = keys.map(k => EP.cams[k]).filter(Boolean).map(c => [c.pos[0], c.pos[2], c.target[0], c.target[2]]);
      const dseg = (px, pz, [ax, az, bx, bz]) => { const vx = bx - ax, vz = bz - az, l = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1.25, ((px - ax) * vx + (pz - az) * vz) / l)); return Math.hypot(px - ax - vx * t, pz - az - vz * t); };
      w.S.tris = w.S.tris.filter(t => { if (t[5] || t[4] === 4) return true; const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cz = (t[0][2] + t[1][2] + t[2][2]) / 3; return !segs.some(sg => dseg(cx, cz, sg) < r); });
      R.setWorld(w, 'main'); R.use('main');
    };
    return {
      R, world: w, clearView,
      frame(cam, p, t) {
        R.use(cam.world || 'main');
      const allCh = R.chars; if (cam.solo) R.chars = allCh.slice(0, 1);   // solo: only the hero
        const o = cam.orbit ?? 0.12, dl = cam.dolly ?? 0.07, a = o * (p - 0.5), k = 1 - dl * p;
        const dx = cam.pos[0] - cam.target[0], dz = cam.pos[2] - cam.target[2], dy = cam.pos[1] - cam.target[1];
        const c = { pos: [cam.target[0] + (dx * Math.cos(a) - dz * Math.sin(a)) * k, cam.target[1] + dy * k, cam.target[2] + (dx * Math.sin(a) + dz * Math.cos(a)) * k], target: cam.target, fov: cam.fov };
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, cam.skyTop || '#6EC3F5'); g.addColorStop(0.55, cam.skyBot || '#CFE9F7'); g.addColorStop(1, '#F3F7F2');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.drawImage(R.render(c, t), 0, 0); R.chars = allCh;
        if (EP.tags !== false && !cam.noTags) {
          const L = (cam.solo ? [] : R.labels()).filter(l => l.d < (cam.tagDist || 22) && l.x > 0 && l.x < W && l.y > 0 && l.y < H).sort((a, b) => b.d - a.d);
          for (const l of L) { const fs = Math.max(18, Math.min(34, 520 / l.d)); ctx.font = `800 ${fs}px ${FONT}`; const tw = ctx.measureText(l.name).width + fs * 1.1, th = fs * 1.5;
            ctx.globalAlpha = Math.min(1, (cam.tagDist || 22) - l.d); ctx.fillStyle = 'rgba(255,252,240,0.92)'; ctx.strokeStyle = 'rgba(90,56,28,0.8)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.roundRect(l.x - tw / 2, l.y - th, tw, th, th / 2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(l.x - 6, l.y); ctx.lineTo(l.x + 6, l.y); ctx.lineTo(l.x, l.y + 8); ctx.closePath(); ctx.fillStyle = 'rgba(255,252,240,0.92)'; ctx.fill();
            ctx.fillStyle = '#5A381C'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(l.name, l.x, l.y - th / 2); ctx.globalAlpha = 1; }
        }
        return out;
      },
    };
  }
  I.GL = { create, stage, M4 };
})();
