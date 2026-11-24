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
  // tri = [a, b, c, rgb, kind, normals?]  kind: 0 solid, 1..1.99 sways in the wind (weight = kind-1), 3 glowing, 4 skip in GPU renderer (its own water)
  function Scene() { this.tris = []; this.kind = 0; }
  Scene.prototype.tri = function (a, b, c, col) { this.tris.push([a, b, c, typeof col === 'string' ? hex(col) : col, this.kind]); };
  Scene.prototype.triN = function (a, b, c, col, na, nb, nc) { this.tris.push([a, b, c, typeof col === 'string' ? hex(col) : col, this.kind, [na, nb, nc]]); };
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
    const hf = opt.heightFn ? (x, z) => opt.heightFn(x, z, noise) : (x, z) => islandHeight(x, z, noise, opt);
    const H = [];
    for (let i = 0; i <= N; i++) { H.push([]); for (let j = 0; j <= N; j++) { const x = -size + i * step, z = -size + j * step; H[i].push(hf(x, z)); } }
    const HG = (a, b) => H[Math.max(0, Math.min(N, a))][Math.max(0, Math.min(N, b))];
    const NRM = (a, b) => norm([HG(a - 1, b) - HG(a + 1, b), 2 * step, HG(a, b - 1) - HG(a, b + 1)]);
    const col0 = (h) => h < 0.35 ? '#F2DFA7' : h < 0.6 ? '#E8D394' : h < 2.8 ? '#7CCB5B' : h < 4.4 ? '#5DB24B' : '#8FA27A';
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const P = (a, b) => { const h = H[a][b]; return [-size + a * step, Math.max(h, -0.6), -size + b * step]; };
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      if (Math.max(a[1], b[1], c[1], d[1]) < -0.05) continue;
      const m1 = (a[1] + b[1] + c[1]) / 3, m2 = (a[1] + c[1] + d[1]) / 3;
      const col = opt.colorFn ? (h, t) => opt.colorFn(h, (t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3, noise) : (h) => col0(h);
      const nA = NRM(i, j), nB = NRM(i + 1, j), nC = NRM(i + 1, j + 1), nD = NRM(i, j + 1);
      S.triN(a, b, c, col(m1, [a, b, c]), nA, nB, nC); S.triN(a, c, d, col(m2, [a, c, d]), nA, nC, nD);
    }
    // sea plate (hexagon) with a visible side (diorama look)
    const R = opt.radius * (opt.plate || 1.75), top = 0.0, bot = -1.6, n = 6, center = [0, top, 0];
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2 + Math.PI / 6, a1 = ((k + 1) / n) * Math.PI * 2 + Math.PI / 6;
      const p0 = [Math.cos(a0) * R, top, Math.sin(a0) * R], p1 = [Math.cos(a1) * R, top, Math.sin(a1) * R];
      S.kind = 4; S.tri(center, p1, p0, '#4FB8E8'); S.kind = 0;
      S.quad(p0, p1, [p1[0], bot, p1[2]], [p0[0], bot, p0[2]], '#2C86C4');
      S.quad([p0[0], bot, p0[2]], [p1[0], bot, p1[2]], [p1[0], bot - 0.6, p1[2]], [p0[0], bot - 0.6, p0[2]], '#C9A36B'); // wooden base
    }
    // shallow-water ring
    S.kind = 4;
    for (let k = 0; k < 24; k++) {
      const a0 = (k / 24) * Math.PI * 2, a1 = ((k + 1) / 24) * Math.PI * 2, r0 = opt.radius * 1.02, r1 = opt.radius * 1.22;
      S.quad([Math.cos(a0) * r0, 0.02, Math.sin(a0) * r0], [Math.cos(a1) * r0, 0.02, Math.sin(a1) * r0], [Math.cos(a1) * r1, 0.02, Math.sin(a1) * r1], [Math.cos(a0) * r1, 0.02, Math.sin(a0) * r1], '#7FD6EE');
    }
    S.kind = 0; S.plateR = R; S.islandR = opt.radius;
    return hf;
  }

  // ---------- props ----------
  function tree(S, x, y, z, s, seed) {
    S.cyl(x, y, z, 0.18 * s, 1.0 * s, 5, '#8B5A2B');
    S.kind = 1.5; S.ico(x, y + 1.5 * s, z, 0.85 * s, seed % 2 ? '#3FA35B' : '#4DB86A', seed);
    S.kind = 1.8; S.ico(x + 0.2 * s, y + 2.2 * s, z - 0.1 * s, 0.55 * s, '#5CC979', seed + 3); S.kind = 0;
  }
  function palm(S, x, y, z, s, seed) {
    for (let k = 0; k < 4; k++) S.box(x + k * 0.08 * s, y + k * 0.55 * s, z, 0.28 * s, 0.55 * s, 0.28 * s, '#9C6B3C');
    const tx = x + 0.32 * s, ty = y + 2.2 * s;
    S.kind = 1.9; for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; S.tri([tx, ty, z], [tx + Math.cos(a) * 1.4 * s, ty - 0.5 * s, z + Math.sin(a) * 1.4 * s], [tx + Math.cos(a + 0.35) * 1.1 * s, ty - 0.25 * s, z + Math.sin(a + 0.35) * 1.1 * s], '#2E9E4F'); } S.kind = 0;
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
  function cactus(S, x, y, z, s) {
    S.cyl(x, y, z, 0.22 * s, 1.6 * s, 6, '#3E9B4F');
    S.box(x + 0.3 * s, y + 0.6 * s, z, 0.4 * s, 0.18 * s, 0.18 * s, '#3E9B4F'); S.box(x + 0.45 * s, y + 0.6 * s, z, 0.18 * s, 0.6 * s, 0.18 * s, '#3E9B4F');
    S.box(x - 0.28 * s, y + 0.9 * s, z, 0.36 * s, 0.16 * s, 0.16 * s, '#3E9B4F'); S.box(x - 0.42 * s, y + 0.9 * s, z, 0.16 * s, 0.45 * s, 0.16 * s, '#3E9B4F');
  }
  function pine(S, x, y, z, s, seed) {
    S.cyl(x, y, z, 0.16 * s, 0.7 * s, 5, '#7A4E2A');
    S.kind = 1.3; S.cone(x, y + 0.6 * s, z, 0.9 * s, 1.4 * s, 7, seed % 2 ? '#2F7D45' : '#36894D'); S.kind = 1.6; S.cone(x, y + 1.4 * s, z, 0.65 * s, 1.2 * s, 7, '#3C9555'); S.kind = 0;
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

  // ---------- big world: forest / mountains / desert / lake / beach ----------
  const BIG = { radius: 24, forest: [-12, 5], mountain: [9, 12], desert: [13, -6], lake: [-2, 6], beach: [-3, -22.6] };
  function bigHeight(x, z, noise) {
    const a = Math.atan2(z, x), rr = BIG.radius * (1 + (noise(Math.cos(a) * 2 + 40, Math.sin(a) * 2 + 40) - 0.5) * 0.35);
    const r = Math.hypot(x, z) / rr;
    let h = (1 - r * r) * 2.6 + (noise(x * 0.12 + 10, z * 0.12) - 0.5) * 1.4;
    for (const [px, pz, ph, k] of [[9, 13, 11, 0.85], [14, 7, 8, 0.9], [4, 16, 7.5, 0.9], [12, 17, 6, 1]]) h += Math.max(0, ph - Math.hypot(x - px, z - pz) * k) * (0.8 + 0.4 * noise(x * 0.5, z * 0.5));
    const dd = Math.hypot(x - BIG.desert[0], z - BIG.desert[1]); if (dd < 9) h = h * (0.55 + 0.45 * dd / 9) + Math.sin(x * 0.9 + z * 0.4) * 0.25 * (1 - dd / 9);
    const ld = Math.hypot(x - BIG.lake[0], z - BIG.lake[1]); if (ld < 4.5) h = Math.min(h, -0.4 + (ld / 4.5) ** 2 * 1.6);
    return h;
  }
  function bigColor(h, x, z, noise) {
    if (h < 0.35) return '#F2DFA7'; if (h < 0.6) return '#E8D394';
    if (h > 8.2) return '#F4F7FA'; if (h > 5.2) return h > 6.6 ? '#A8A39A' : '#8E8A80';
    const dd = Math.hypot(x - BIG.desert[0], z - BIG.desert[1]) + (noise(x * 0.4, z * 0.4) - 0.5) * 3;
    if (dd < 8) return h > 2 ? '#E0B868' : '#EAC67C';
    const fd = Math.hypot(x - BIG.forest[0], z - BIG.forest[1]) + (noise(x * 0.4 + 5, z * 0.4) - 0.5) * 3;
    if (fd < 8) return '#3F9A4C';
    if (h > 3.6) return '#6FAE58';
    const v = noise(x * 0.9 + 3, z * 0.9 + 7);
    if (h < 2.8) return v < 0.3 ? '#74C255' : v > 0.75 ? '#86D365' : '#7CCB5B';
    return v < 0.4 ? '#58AB47' : '#5DB24B';
  }
  function bigWorld(opt = {}) {
    const S = new Scene();
    // opt.stage (0..1): the island's birth. <1 = rising out of the sea, early stages are bare volcanic rock.
    const st = opt.stage ?? 1;
    const hFn = st >= 1 ? bigHeight : (x, z, n) => { const h = bigHeight(x, z, n); const pk = Math.max(0, 1 - Math.hypot(x - 9, z - 13) / 26); return (h + 2.2) * (0.15 + 0.85 * st) * (st < 0.5 ? 0.4 + 0.6 * pk : 1) - 2.2 - (1 - st) * 1.2; };
    const cFn = st >= 0.75 ? bigColor : (h, x, z, n) => { if (st < 0.5) return h > 2.5 && Math.hypot(x - 9, z - 13) < 4 ? '#E2453C' : (n(x * 0.7, z * 0.7) > 0.5 ? '#5A4A42' : '#4A3C36'); if (h < 0.5) return '#E8D394'; return h > 4 ? '#7A6A60' : (n(x * 0.5, z * 0.5) > 0.6 ? '#7CCB5B' : '#8A7A6E'); };
    const hAt = buildIsland(S, { radius: BIG.radius, seed: opt.seed || 11, grid: opt.grid || (opt.hd ? 180 : 112), plate: 1.4, heightFn: hFn, colorFn: cFn });
    if (st < 1) { if (st >= 0.75) for (let k = 0, n = 0, R2 = rng(9); k < 800 && n < 25; k++) { const x = (R2() - 0.5) * 40, z = (R2() - 0.5) * 40, y = hAt(x, z); if (y < 0.8 || y > 4) continue; tree(S, x, y - 0.05, z, 0.6 + R2() * 0.3, k); n++; }
      if (st < 0.5) for (let k = 0; k < 6; k++) S.ico(9 + Math.sin(k) * 1.5, hAt(9, 13) + 2 + k * 1.6, 13 + Math.cos(k * 2) * 1.2, 1.2 + k * 0.35, k % 2 ? '#9A9A9A' : '#BDBDBD', k);
      return { S, hAt, big: BIG }; }
    const R = rng(5), near = (x, z, c, d) => Math.hypot(x - c[0], z - c[1]) < d;
    for (let k = 0, n = 0; k < 9000 && n < (opt.hd ? 260 : 90); k++) { // forest
      const x = BIG.forest[0] + (R() - 0.5) * 16, z = BIG.forest[1] + (R() - 0.5) * 16, y = hAt(x, z);
      if (!near(x, z, BIG.forest, 8) || y < 0.7 || y > 5) continue;
      (k % 3 ? tree : pine)(S, x, y - 0.05, z, 0.9 + R() * 0.6, k); n++;
    }
    for (let k = 0, n = 0; k < 6000 && n < (opt.hd ? 90 : 28); k++) { // scattered trees on grassland
      const x = (R() - 0.5) * 40, z = (R() - 0.5) * 40, y = hAt(x, z);
      if (y < 0.8 || y > 4.5 || near(x, z, BIG.desert, 10) || near(x, z, BIG.forest, 9) || near(x, z, BIG.beach, 5)) continue;
      tree(S, x, y - 0.05, z, 0.8 + R() * 0.4, k); n++;
    }
    for (let k = 0, n = 0; k < 2000 && n < 24; k++) { // pines on mountain slopes
      const x = BIG.mountain[0] + (R() - 0.5) * 20, z = BIG.mountain[1] + (R() - 0.5) * 16, y = hAt(x, z);
      if (y < 3 || y > 6.2) continue; pine(S, x, y - 0.05, z, 0.8 + R() * 0.3, k); n++;
    }
    for (let k = 0, n = 0; k < 2000 && n < 12; k++) { // desert cacti
      const x = BIG.desert[0] + (R() - 0.5) * 12, z = BIG.desert[1] + (R() - 0.5) * 12, y = hAt(x, z);
      if (!near(x, z, BIG.desert, 6) || y < 0.6) continue; cactus(S, x, y - 0.05, z, 0.9 + R() * 0.5); n++;
    }
    for (let k = 0, n = 0; k < 2000 && n < 14; k++) { // rocks on mountains
      const x = BIG.mountain[0] + (R() - 0.5) * 18, z = BIG.mountain[1] + (R() - 0.5) * 14, y = hAt(x, z);
      if (y < 4.5) continue; rock(S, x, y - 0.1, z, 1.2 + R(), k); n++;
    }
    for (const [x, z] of [[-8, -19.5], [1.5, -21], [-12, -16], [5, -19], [-15, -12], [9, -17]]) palm(S, x, hAt(x, z) - 0.05, z, 1.0, 3);
    if (opt.detail !== false) {
      const FL = ['#FF6B8A', '#FFD23F', '#FFFFFF', '#B07CFF', '#FF9A3D'];
      for (let k = 0, n = 0; k < 20000 && n < (opt.hd ? 900 : 160); k++) { // flowers & grass tufts on grassland
        const x = (R() - 0.5) * 44, z = (R() - 0.5) * 44, y = hAt(x, z);
        if (y < 0.7 || y > 3.6 || near(x, z, BIG.desert, 9) || near(x, z, BIG.lake, 5)) continue;
        if (n % 3) { S.cone(x, y - 0.02, z, 0.14, 0.32, 4, n % 2 ? '#4FA640' : '#6CC24E'); } else { S.cyl(x, y, z, 0.03, 0.22, 3, '#3E8E3A'); S.ico(x, y + 0.26, z, 0.11, FL[n % FL.length], k); }
        n++;
      }
      for (let k = 0, n = 0; k < 3000 && n < 40; k++) { // bushes
        const x = (R() - 0.5) * 42, z = (R() - 0.5) * 42, y = hAt(x, z);
        if (y < 0.8 || y > 4 || near(x, z, BIG.desert, 9) || near(x, z, BIG.beach, 3)) continue;
        S.ico(x, y + 0.15, z, 0.35 + R() * 0.25, R() < 0.5 ? '#3F9A4C' : '#4DB86A', k); n++;
      }
      for (let k = 0, n = 0; k < 2000 && n < 14; k++) { // mushrooms in the forest
        const x = BIG.forest[0] + (R() - 0.5) * 14, z = BIG.forest[1] + (R() - 0.5) * 14, y = hAt(x, z);
        if (!near(x, z, BIG.forest, 7) || y < 0.7) continue;
        S.cyl(x, y, z, 0.05, 0.18, 4, '#F4E9D8'); S.cone(x, y + 0.16, z, 0.16, 0.12, 6, n % 2 ? '#E2453C' : '#C9853E'); n++;
      }
      for (let a = 0; a < Math.PI * 2; a += 0.35) { // reeds around the lake
        const r = 4.3 + R() * 0.6, x = BIG.lake[0] + Math.cos(a) * r, z = BIG.lake[1] + Math.sin(a) * r, y = hAt(x, z);
        if (y < -0.1) continue; S.cyl(x, Math.max(y, 0), z, 0.03, 0.6, 3, '#6E9F3A'); S.cyl(x + 0.15, Math.max(y, 0), z + 0.1, 0.03, 0.45, 3, '#7FB244');
      }
      for (let k = 0, n = 0; k < 2000 && n < 16; k++) { // desert rocks & dead bushes
        const x = BIG.desert[0] + (R() - 0.5) * 14, z = BIG.desert[1] + (R() - 0.5) * 14, y = hAt(x, z);
        if (!near(x, z, BIG.desert, 7) || y < 0.5) continue;
        if (n % 2) S.ico(x, y + 0.1, z, 0.3 + R() * 0.3, '#C9A06A', k); else { S.cyl(x, y, z, 0.05, 0.5, 3, '#8A6A3C'); S.cyl(x + 0.1, y + 0.3, z, 0.03, 0.3, 3, '#8A6A3C'); }
        n++;
      }
      for (let k = 0, n = 0; k < 2000 && n < 18; k++) { // shells & pebbles on the beach
        const a = R() * Math.PI * 2, r = BIG.radius * (0.92 + R() * 0.12), x = Math.cos(a) * r, z = Math.sin(a) * r, y = hAt(x, z);
        if (y < 0.05 || y > 0.6) continue; S.ico(x, y + 0.04, z, 0.12, n % 3 ? '#FFE1D6' : '#D9D2C5', k); n++;
      }
      for (let k = 0, n = 0; k < 2000 && n < 12; k++) { // snowy boulders high up
        const x = BIG.mountain[0] + (R() - 0.5) * 14, z = BIG.mountain[1] + (R() - 0.5) * 12, y = hAt(x, z);
        if (y < 7) continue; S.ico(x, y, z, 0.6 + R() * 0.5, '#E6ECF0', k); n++;
      }
    }
    for (const [x, z, s] of [[-6, -21.5, 0.9], [3.5, -22, 0.7]]) rock(S, x, Math.max(hAt(x, z), 0), z, s, 9);
    const hb = BIG.beach; boat(S, hb[0] + 4.5, 0.05, hb[1] - 2.2, 0.35);
    if (opt.hero !== false) hero(S, hb[0], Math.max(hAt(hb[0], hb[1]), 0.05) + 0.02, hb[1], opt.heroScale || 1.3, opt.heroRot ?? -0.55);
    return { S, hAt, big: BIG };
  }
  const BIG_CAMS = {
    wide:     { pos: [-58, 62, -80], target: [0, 1, 2], fov: 46 },
    top:      { pos: [-12, 95, -38], target: [0, 0, 0], fov: 50 },
    side:     { pos: [38, 22, -40], target: [4, 4, 6], fov: 50 },
    beach:    { pos: [-8.5, 3.6, -30], target: [-3, 1.5, -22], fov: 42 },
    forest:   { pos: [-20, 9, -8], target: [-11, 2.5, 5], fov: 50 },
    mountain: { pos: [-4, 10, -6], target: [10, 7, 13], fov: 50 },
    desert:   { pos: [4, 5, -18], target: [13, 1.2, -6], fov: 50 },
  };

  // ---------- villagers: every resident gets a different look ----------
  const SKIN = ['#F6CFA8', '#E9B88E', '#D39A6A', '#A86F45', '#7A4B2C', '#FFE0C4'];
  const HAIR = ['#2B1D14', '#5A3A22', '#8B5A2B', '#D9A441', '#C0392B', '#E8E3D9', '#3B5BA9', '#7D3C98', '#1E8C6E', '#F08CB4'];
  const SHIRT = ['#E85D75', '#5B7CFA', '#2BB3A0', '#F2B134', '#9B6BD6', '#EF7D3C', '#3BAF4A', '#E2E2E2', '#2C3E50', '#FF8FB1', '#00A8E8', '#B5651D'];
  const PANTS = ['#33415C', '#6B4F2A', '#2E5E3A', '#7A1F2B', '#3D3D3D', '#C9B37A', '#1F4E79'];
  const HAT = ['none', 'cap', 'straw', 'beanie', 'band', 'hood', 'flower', 'tophat'];
  const ACC = ['none', 'glasses', 'scarf', 'pack', 'none', 'cape'];
  function hashStr(t) { let h = 2166136261 >>> 0; for (const c of String(t)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function lookFor(id, taken) { // taken: Set of keys already used (pass the same Set for all residents)
    let h = hashStr(String(id).toLowerCase());
    for (let t = 0; t < 64; t++, h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0) {
      const L = { skin: h % SKIN.length, hair: (h >>> 3) % HAIR.length, shirt: (h >>> 7) % SHIRT.length, pants: (h >>> 11) % PANTS.length, hat: (h >>> 14) % HAT.length, acc: (h >>> 17) % ACC.length, hatCol: (h >>> 20) % SHIRT.length, tall: 0.9 + ((h >>> 24) % 5) * 0.05 };
      const key = [L.skin, L.hair, L.shirt, L.pants, L.hat, L.acc, L.hatCol].join('.');
      if (!taken || !taken.has(key)) { if (taken) taken.add(key); L.key = key; return L; }
    }
    return { skin: 0, hair: 0, shirt: 0, pants: 0, hat: 0, acc: 0, hatCol: 0, tall: 1, key: 'fallback' };
  }
  function villager(S, x, y, z, s = 1, rot = 0, L = lookFor('x')) {
    s *= L.tall || 1; const c = Math.cos(rot), sn = Math.sin(rot);
    const B = (dx, dy, dz, sx, sy, sz, col) => S.box(x + (dx * c - dz * sn) * s, y + dy * s, z + (dx * sn + dz * c) * s, sx * s, sy * s, sz * s, col, rot);
    const sk = SKIN[L.skin], hr = HAIR[L.hair], sh = SHIRT[L.shirt], pa = PANTS[L.pants], hc = SHIRT[L.hatCol];
    B(-0.11, 0, 0, 0.18, 0.5, 0.22, pa); B(0.11, 0, 0, 0.18, 0.5, 0.22, pa);
    B(0, 0.5, 0, 0.5, 0.55, 0.3, sh); B(-0.32, 0.55, 0, 0.14, 0.45, 0.18, sh); B(0.32, 0.55, 0, 0.14, 0.45, 0.18, sh);
    B(-0.32, 0.47, 0, 0.12, 0.1, 0.14, sk); B(0.32, 0.47, 0, 0.12, 0.1, 0.14, sk);
    B(0, 1.05, 0, 0.44, 0.42, 0.4, sk);
    B(0, 1.42, 0.02, 0.48, 0.12, 0.44, hr); B(0, 1.2, 0.2, 0.46, 0.3, 0.06, hr);
    B(-0.1, 1.1, -0.205, 0.06, 0.08, 0.02, '#222'); B(0.1, 1.1, -0.205, 0.06, 0.08, 0.02, '#222');
    const hat = HAT[L.hat];
    if (hat === 'cap') { B(0, 1.48, 0, 0.5, 0.12, 0.46, hc); B(0, 1.48, -0.3, 0.42, 0.04, 0.2, hc); }
    if (hat === 'straw') { B(0, 1.46, 0, 0.8, 0.05, 0.8, '#E8C872'); B(0, 1.5, 0, 0.44, 0.16, 0.42, '#E8C872'); B(0, 1.5, 0, 0.45, 0.05, 0.43, hc); }
    if (hat === 'beanie') { B(0, 1.48, 0, 0.5, 0.2, 0.46, hc); B(0, 1.7, 0, 0.12, 0.1, 0.12, '#fff'); }
    if (hat === 'band') { B(0, 1.32, 0, 0.47, 0.07, 0.43, hc); }
    if (hat === 'hood') { B(0, 1.25, 0.04, 0.52, 0.5, 0.46, sh); B(0, 1.05, -0.21, 0.36, 0.34, 0.02, sk); }
    if (hat === 'flower') { B(0.16, 1.5, -0.1, 0.12, 0.12, 0.12, '#FF6B8A'); B(0.16, 1.5, -0.1, 0.05, 0.05, 0.14, '#FFD23F'); }
    if (hat === 'tophat') { B(0, 1.48, 0, 0.6, 0.04, 0.56, '#222'); B(0, 1.52, 0, 0.36, 0.34, 0.34, '#222'); B(0, 1.55, 0, 0.37, 0.06, 0.35, hc); }
    const acc = ACC[L.acc];
    if (acc === 'glasses') { B(-0.1, 1.1, -0.215, 0.13, 0.11, 0.02, '#1E2A3A'); B(0.1, 1.1, -0.215, 0.13, 0.11, 0.02, '#1E2A3A'); }
    if (acc === 'scarf') { B(0, 0.98, 0, 0.5, 0.1, 0.36, hc); B(0.12, 0.8, -0.18, 0.1, 0.25, 0.04, hc); }
    if (acc === 'pack') { B(0, 0.55, 0.22, 0.36, 0.4, 0.14, '#8B5A2B'); }
    if (acc === 'cape') { B(0, 0.45, 0.18, 0.5, 0.6, 0.04, hc); }
  }
  // ---------- animated characters (GPU renderer): body parts in local space, feet at origin, facing -z ----------
  const HERO_LOOK = { colors: { skin: '#F6CFA8', hair: '#3A2A1E', shirt: '#1FA6A0', pants: '#33415C', hat: 'band', hatCol: '#FF7A1A', acc: 'pack' }, tall: 1.08, key: 'hero' };
  function villagerParts(L) {
    const P = { body: new Scene(), armL: new Scene(), armR: new Scene(), legL: new Scene(), legR: new Scene() };
    const C = L.colors || { skin: SKIN[L.skin], hair: HAIR[L.hair], shirt: SHIRT[L.shirt], pants: PANTS[L.pants], hat: HAT[L.hat], hatCol: SHIRT[L.hatCol], acc: ACC[L.acc] };
    const s = L.tall || 1, B = (p, dx, dy, dz, sx, sy, sz, col) => P[p].box(dx * s, dy * s, dz * s, sx * s, sy * s, sz * s, col);
    B('legL', -0.11, 0, 0, 0.18, 0.5, 0.22, C.pants); B('legR', 0.11, 0, 0, 0.18, 0.5, 0.22, C.pants);
    B('legL', -0.11, 0, -0.03, 0.2, 0.08, 0.28, '#4A3426'); B('legR', 0.11, 0, -0.03, 0.2, 0.08, 0.28, '#4A3426');
    B('body', 0, 0.5, 0, 0.5, 0.55, 0.3, C.shirt);
    B('armL', -0.32, 0.55, 0, 0.14, 0.45, 0.18, C.shirt); B('armR', 0.32, 0.55, 0, 0.14, 0.45, 0.18, C.shirt);
    B('armL', -0.32, 0.47, 0, 0.12, 0.1, 0.14, C.skin); B('armR', 0.32, 0.47, 0, 0.12, 0.1, 0.14, C.skin);
    B('body', 0, 1.05, 0, 0.44, 0.42, 0.4, C.skin);
    B('body', 0, 1.42, 0.02, 0.48, 0.12, 0.44, C.hair); B('body', 0, 1.2, 0.2, 0.46, 0.3, 0.06, C.hair);
    B('body', -0.1, 1.12, -0.205, 0.06, 0.08, 0.02, '#222'); B('body', 0.1, 1.12, -0.205, 0.06, 0.08, 0.02, '#222');
    B('body', 0, 1.0, -0.205, 0.12, 0.03, 0.02, '#B0645A');
    const hat = C.hat, hc = C.hatCol;
    if (hat === 'cap') { B('body', 0, 1.48, 0, 0.5, 0.12, 0.46, hc); B('body', 0, 1.48, -0.3, 0.42, 0.04, 0.2, hc); }
    if (hat === 'straw') { B('body', 0, 1.46, 0, 0.8, 0.05, 0.8, '#E8C872'); B('body', 0, 1.5, 0, 0.44, 0.16, 0.42, '#E8C872'); B('body', 0, 1.5, 0, 0.45, 0.05, 0.43, hc); }
    if (hat === 'beanie') { B('body', 0, 1.48, 0, 0.5, 0.2, 0.46, hc); B('body', 0, 1.7, 0, 0.12, 0.1, 0.12, '#fff'); }
    if (hat === 'band') { B('body', 0, 1.36, 0, 0.5, 0.12, 0.46, hc); B('body', 0.08, 1.38, 0.26, 0.12, 0.12, 0.12, hc); }
    if (hat === 'hood') { B('body', 0, 1.25, 0.04, 0.52, 0.5, 0.46, C.shirt); B('body', 0, 1.05, -0.21, 0.36, 0.34, 0.02, C.skin); }
    if (hat === 'flower') { B('body', 0.16, 1.5, -0.1, 0.12, 0.12, 0.12, '#FF6B8A'); B('body', 0.16, 1.5, -0.1, 0.05, 0.05, 0.14, '#FFD23F'); }
    if (hat === 'tophat') { B('body', 0, 1.48, 0, 0.6, 0.04, 0.56, '#222'); B('body', 0, 1.52, 0, 0.36, 0.34, 0.34, '#222'); B('body', 0, 1.55, 0, 0.37, 0.06, 0.35, hc); }
    const acc = C.acc;
    if (acc === 'glasses') { B('body', -0.1, 1.1, -0.215, 0.13, 0.11, 0.02, '#1E2A3A'); B('body', 0.1, 1.1, -0.215, 0.13, 0.11, 0.02, '#1E2A3A'); }
    if (acc === 'scarf') { B('body', 0, 0.98, 0, 0.5, 0.1, 0.36, hc); B('body', 0.12, 0.8, -0.18, 0.1, 0.25, 0.04, hc); }
    if (acc === 'pack') { B('body', 0, 0.58, 0.22, 0.4, 0.46, 0.16, '#8B5A2B'); B('body', 0, 0.95, 0.24, 0.42, 0.08, 0.18, '#6E4520'); }
    if (acc === 'cape') { B('body', 0, 0.45, 0.18, 0.5, 0.6, 0.04, hc); }
    return { parts: P, pivots: { armL: [-0.32 * s, 1.0 * s, 0], armR: [0.32 * s, 1.0 * s, 0], legL: [-0.11 * s, 0.5 * s, 0], legR: [0.11 * s, 0.5 * s, 0] }, height: 1.6 * s };
  }
  // place residents around the beach and meadow (same spots on the site and in videos)
  function villagerSpots(w, count) {
    const spots = [];
    for (let k = 0; spots.length < count && k < 4000; k++) {
      const a = -1.9 + k * 0.47, r = 9 + (k % 7) * 1.6, x = Math.cos(a) * r - 2, z = Math.sin(a) * r - 8, y = w.hAt(x, z);
      if (y < 0.6 || y > 3.2) continue; if (spots.some(p => Math.hypot(p[0] - x, p[2] - z) < 1.1)) continue; spots.push([x, y, z]);
    }
    return spots;
  }
  function placeVillagers(w, ids, opt = {}) {
    const taken = new Set(), R = rng(opt.seed || 77), spots = [];
    for (let k = 0; spots.length < ids.length && k < 4000; k++) {
      const a = -1.9 + k * 0.47, r = 9 + (k % 7) * 1.6, x = Math.cos(a) * r - 2, z = Math.sin(a) * r - 8, y = w.hAt(x, z);
      if (y < 0.6 || y > 3.2) continue; if (spots.some(p => Math.hypot(p[0] - x, p[2] - z) < 1.1)) continue; spots.push([x, y, z]);
    }
    ids.forEach((id, i) => { const p = spots[i]; if (!p) return; villager(w.S, p[0], p[1], p[2], opt.scale || 0.9, R() * 6.28, lookFor(id, taken)); });
    return spots;
  }
  const api = { Scene, render, dayOneWorld, bigWorld, villager, villagerParts, HERO_LOOK, lookFor, placeVillagers, villagerSpots, BIG_CAMS, cactus, pine, hero, tree, palm, rock, boat, signpost, buildIsland };
  if (typeof module !== "undefined" && module.exports) module.exports = api; (typeof window !== "undefined" ? window : globalThis).Island3D = api;
})(this);
