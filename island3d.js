// Low-poly "diorama" island renderer: z-buffered flat-shaded triangles into an RGBA buffer.
// Works in Node (preview) and in a browser (putImageData). No dependencies.
(function (root) {
  // ---------- small math ----------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  // deterministic random
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  // value noise
  function makeNoise(seed) {
    const r = rng(seed), P = []; for (let i = 0; i < 256; i++) P.push(r());
    const h = (x, y) => P[((x * 73856093) ^ (y * 19349663)) & 255];
    const sm = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
      const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };
  }

  // ---------- scene building ----------
  function Scene() { this.tris = []; }
  Scene.prototype.tri = function (a, b, c, col) { this.tris.push([a, b, c, typeof col === 'string' ? hex(col) : col]); };
  Scene.prototype.quad = function (a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); };
  Scene.prototype.box = function (x, y, z, sx, sy, sz, col, rotY = 0) {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const P = (dx, dy, dz) => [x + dx * c - dz * s, y + dy, z + dx * s + dz * c];
    const hx = sx / 2, hz = sz / 2;
    const v = [P(-hx, 0, -hz), P(hx, 0, -hz), P(hx, 0, hz), P(-hx, 0, hz), P(-hx, sy, -hz), P(hx, sy, -hz), P(hx, sy, hz), P(-hx, sy, hz)];
    const F = [[4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [3, 2, 1, 0]];
    for (const f of F) this.quad(v[f[0]], v[f[1]], v[f[2]], v[f[3]], col);
  };
  Scene.prototype.cone = function (x, y, z, r, h, n, col) {
    const top = [x, y + h, z];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const p0 = [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r];
      this.tri(p0, p1, top, col); this.tri(p1, p0, [x, y, z], col);
    }
  };
  Scene.prototype.cyl = function (x, y, z, r, h, n, col) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const p0 = [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r];
      this.quad(p0, p1, [p1[0], y + h, p1[2]], [p0[0], y + h, p0[2]], col);
      this.tri([x, y + h, z], [p0[0], y + h, p0[2]], [p1[0], y + h, p1[2]], col);
    }
  };
  Scene.prototype.ico = function (x, y, z, r, col, seed = 1) { // lumpy low-poly blob (tree crown / rock)
    const R = rng(seed), t = (1 + Math.sqrt(5)) / 2;
    let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    V = V.map(v => { const n = norm(v), k = r * (0.85 + R() * 0.3); return [x + n[0] * k, y + n[1] * k * 0.9, z + n[2] * k]; });
    const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (const f of F) this.tri(V[f[0]], V[f[1]], V[f[2]], col);
  };

  // ---------- island ----------
  // Round diorama island sitting on a hexagonal "plate" of sea.
  function islandHeight(x, z, noise, opt) {
    const r = Math.hypot(x, z) / opt.radius;
    let h = (1 - r * r) * 2.2;                     // dome
    h += (noise(x * 0.18 + 10, z * 0.18) - 0.5) * 1.6; // bumps
    const hx = x - opt.hill[0], hz = z - opt.hill[1];  // a hill
    h += Math.max(0, 3.4 - Math.hypot(hx, hz) * 0.55);
    return h;
  }
  function buildIsland(S, opt) {
    const noise = makeNoise(opt.seed || 7), N = opt.grid || 40, size = opt.radius * 1.35, step = (size * 2) / N;
    const H = [];
    for (let i = 0; i <= N; i++) { H.push([]); for (let j = 0; j <= N; j++) { const x = -size + i * step, z = -size + j * step; H[i].push(islandHeight(x, z, noise, opt)); } }
    const col = (h) => h < 0.35 ? '#F2DFA7' : h < 0.6 ? '#E8D394' : h < 2.8 ? '#7CCB5B' : h < 4.4 ? '#5DB24B' : '#8FA27A';
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const P = (a, b) => { const h = H[a][b]; return [-size + a * step, Math.max(h, -0.6), -size + b * step]; };
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      if (Math.max(a[1], b[1], c[1], d[1]) < -0.05) continue;
      const m1 = (a[1] + b[1] + c[1]) / 3, m2 = (a[1] + c[1] + d[1]) / 3;
      S.tri(a, b, c, col(m1)); S.tri(a, c, d, col(m2));
    }
    // sea plate (hexagon) with a visible side (diorama look)
    const R = opt.radius * 1.75, top = 0.0, bot = -1.6, n = 6, center = [0, top, 0];
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2 + Math.PI / 6, a1 = ((k + 1) / n) * Math.PI * 2 + Math.PI / 6;
      const p0 = [Math.cos(a0) * R, top, Math.sin(a0) * R], p1 = [Math.cos(a1) * R, top, Math.sin(a1) * R];
      S.tri(center, p1, p0, '#4FB8E8');
      S.quad(p0, p1, [p1[0], bot, p1[2]], [p0[0], bot, p0[2]], '#2C86C4');
      S.quad([p0[0], bot, p0[2]], [p1[0], bot, p1[2]], [p1[0], bot - 0.6, p1[2]], [p0[0], bot - 0.6, p0[2]], '#C9A36B'); // wooden base
    }
    // shallow-water ring
    for (let k = 0; k < 24; k++) {
      const a0 = (k / 24) * Math.PI * 2, a1 = ((k + 1) / 24) * Math.PI * 2, r0 = opt.radius * 1.02, r1 = opt.radius * 1.22;
      S.quad([Math.cos(a0) * r0, 0.02, Math.sin(a0) * r0], [Math.cos(a1) * r0, 0.02, Math.sin(a1) * r0], [Math.cos(a1) * r1, 0.02, Math.sin(a1) * r1], [Math.cos(a0) * r1, 0.02, Math.sin(a0) * r1], '#7FD6EE');
    }
    return (x, z) => islandHeight(x, z, noise, opt);
  }

  // ---------- props ----------
  function tree(S, x, y, z, s, seed) {
    S.cyl(x, y, z, 0.18 * s, 1.0 * s, 5, '#8B5A2B');
    S.ico(x, y + 1.5 * s, z, 0.85 * s, seed % 2 ? '#3FA35B' : '#4DB86A', seed);
    S.ico(x + 0.2 * s, y + 2.2 * s, z - 0.1 * s, 0.55 * s, '#5CC979', seed + 3);
  }
  function palm(S, x, y, z, s, seed) {
    for (let k = 0; k < 4; k++) S.box(x + k * 0.08 * s, y + k * 0.55 * s, z, 0.28 * s, 0.55 * s, 0.28 * s, '#9C6B3C');
    const tx = x + 0.32 * s, ty = y + 2.2 * s;
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; S.tri([tx, ty, z], [tx + Math.cos(a) * 1.4 * s, ty - 0.5 * s, z + Math.sin(a) * 1.4 * s], [tx + Math.cos(a + 0.35) * 1.1 * s, ty - 0.25 * s, z + Math.sin(a + 0.35) * 1.1 * s], '#2E9E4F'); }
  }
  function rock(S, x, y, z, s, seed) { S.ico(x, y + 0.2 * s, z, 0.5 * s, '#A9A9A0', seed); }
  function boat(S, x, y, z, rot) {
    S.box(x, y, z, 2.2, 0.35, 0.9, '#B5743B', rot);
    S.box(x, y + 0.35, z, 2.4, 0.15, 1.05, '#8A5428', rot);
  }
  // Hero: orange bandana, teal shirt, brown backpack (original design)
  function hero(S, x, y, z, s = 1, rot = 0) {
    const c = Math.cos(rot), sn = Math.sin(rot);
    const B = (dx, dy, dz, sx, sy, sz, col) => S.box(x + dx * c - dz * sn, y + dy * s, z + dx * sn + dz * c, sx * s, sy * s, sz * s, col, rot);
    B(-0.13 * s, 0, 0, 0.2, 0.55, 0.24, '#33415C'); B(0.13 * s, 0, 0, 0.2, 0.55, 0.24, '#33415C');
    B(0, 0.55, 0, 0.55, 0.6, 0.32, '#1FA6A0');
    B(0, 0.62, 0.24 * s, 0.42, 0.48, 0.18, '#8B5A2B');           // backpack
    B(-0.36 * s, 0.6, 0, 0.16, 0.5, 0.2, '#1FA6A0'); B(0.36 * s, 0.6, 0, 0.16, 0.5, 0.2, '#1FA6A0');
    B(0, 1.15, 0, 0.48, 0.46, 0.44, '#F6CFA8');                  // head
    B(0, 1.5, 0, 0.52, 0.14, 0.48, '#FF7A1A');                   // bandana
    B(0.1 * s, 1.5, 0.27 * s, 0.12, 0.12, 0.14, '#FF7A1A');      // knot
    B(-0.1 * s, 1.36, -0.225 * s, 0.07, 0.09, 0.02, '#222'); B(0.1 * s, 1.36, -0.225 * s, 0.07, 0.09, 0.02, '#222');
  }
  function signpost(S, x, y, z) { S.box(x, y, z, 0.15, 1.3, 0.15, '#7A4E2A'); S.box(x, y + 1.0, z - 0.02, 1.3, 0.55, 0.1, '#C98B4E'); }

  // ---------- camera & raster ----------
  function render(S, cam, W, H, opt = {}) {
    const ss = opt.ss || 2, w = W * ss, h = H * ss;
    const buf = new Uint8ClampedArray(w * h * 4), zb = new Float32Array(w * h).fill(Infinity);
    // sky gradient
    const top = hex(opt.skyTop || '#8FD8FF'), bot = hex(opt.skyBot || '#E9F8FF');
    for (let y = 0; y < h; y++) { const t = y / h; const r = top[0] + (bot[0] - top[0]) * t, g = top[1] + (bot[1] - top[1]) * t, b = top[2] + (bot[2] - top[2]) * t; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255; } }
    const f = norm(sub(cam.target, cam.pos)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
    const fov = (cam.fov || 40) * Math.PI / 180, fl = (h / 2) / Math.tan(fov / 2);
    const toCam = (p) => { const d = sub(p, cam.pos); return [dot(d, r), dot(d, u), dot(d, f)]; };
    const sun = norm(opt.sun || [-0.5, 0.85, -0.35]);
    const proj = (c) => [w / 2 + c[0] / c[2] * fl, h / 2 - c[1] / c[2] * fl, c[2]];
    for (const [a, b, c, col] of S.tris) {
      const ca = toCam(a), cb = toCam(b), cc = toCam(c);
      if (ca[2] < 0.1 || cb[2] < 0.1 || cc[2] < 0.1) continue;
      const n = norm(cross(sub(b, a), sub(c, a)));
      let L = Math.abs(dot(n, sun)); L = 0.55 + 0.5 * L;
      const R = Math.min(255, col[0] * L), G = Math.min(255, col[1] * L), Bc = Math.min(255, col[2] * L);
      const p0 = proj(ca), p1 = proj(cb), p2 = proj(cc);
      const minx = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0]))), maxx = Math.min(w - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
      const miny = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1]))), maxy = Math.min(h - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
      const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
      if (Math.abs(area) < 1e-6) continue;
      const iz0 = 1 / p0[2], iz1 = 1 / p1[2], iz2 = 1 / p2[2];
      for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
        const px = x + 0.5, py = y + 0.5;
        let w0 = (p1[0] - px) * (p2[1] - py) - (p1[1] - py) * (p2[0] - px);
        let w1 = (p2[0] - px) * (p0[1] - py) - (p2[1] - py) * (p0[0] - px);
        let w2 = (p0[0] - px) * (p1[1] - py) - (p0[1] - py) * (p1[0] - px);
        if (area < 0) { w0 = -w0; w1 = -w1; w2 = -w2; }
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const A = Math.abs(area), iz = (w0 * iz0 + w1 * iz1 + w2 * iz2) / A, z = 1 / iz, idx = y * w + x;
        if (z >= zb[idx]) continue; zb[idx] = z;
        const i = idx * 4; buf[i] = R; buf[i + 1] = G; buf[i + 2] = Bc;
      }
    }
    // downsample
    const out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let r0 = 0, g0 = 0, b0 = 0;
      for (let dy = 0; dy < ss; dy++) for (let dx = 0; dx < ss; dx++) { const i = ((y * ss + dy) * w + (x * ss + dx)) * 4; r0 += buf[i]; g0 += buf[i + 1]; b0 += buf[i + 2]; }
      const o = (y * W + x) * 4, k = ss * ss; out[o] = r0 / k; out[o + 1] = g0 / k; out[o + 2] = b0 / k; out[o + 3] = 255;
    }
    const project = (p) => { const c = toCam(p); const q = proj(c); return [q[0] / ss, q[1] / ss, c[2]]; };
    return { data: out, w: W, h: H, project };
  }

  // ---------- default world (day 1: empty island) ----------
  function dayOneWorld(opt = {}) {
    const S = new Scene();
    const io = { radius: 9, hill: [2.5, 3.5], seed: opt.seed || 11, grid: 44 };
    const hAt = buildIsland(S, io);
    const R = rng(5);
    let placed = 0;
    for (let k = 0; k < 400 && placed < (opt.trees ?? 26); k++) {
      const x = (R() - 0.5) * 18, z = (R() - 0.5) * 18, y = hAt(x, z);
      if (y < 0.7 || y > 4.2) continue;
      if (Math.hypot(x - 1, z + 3) < 3) continue; // keep a clearing (forest edge)
      tree(S, x, y - 0.05, z, 0.8 + R() * 0.5, k); placed++;
    }
    for (const [x, z] of [[-6.5, -4.8], [-7.6, 1.2]]) palm(S, x, hAt(x, z) - 0.05, z, 0.9, 3);
    for (const [x, z, s] of [[-5.5, -6.6, 0.9], [6.8, -5.2, 0.7], [7.8, 1.5, 1.0]]) rock(S, x, Math.max(hAt(x, z), 0), z, s, 9);
    boat(S, -3.6, 0.05, -10.6, 0.35);
    if (opt.hero !== false) { const hx = opt.heroAt ? opt.heroAt[0] : -1.0, hz = opt.heroAt ? opt.heroAt[1] : -8.4; hero(S, hx, Math.max(hAt(hx, hz), 0.05) + 0.02, hz, opt.heroScale || 1.15, opt.heroRot ?? 0.5); }
    return { S, hAt, spots: { A: [-1.5, 0, -6.8], B: [1.0, 0, -2.8], C: [2.5, 0, 3.5] } };
  }

  const api = { Scene, render, dayOneWorld, hero, tree, palm, rock, boat, signpost, buildIsland };
  if (typeof module !== "undefined" && module.exports) module.exports = api; (typeof window !== "undefined" ? window : globalThis).Island3D = api;
})(this);
