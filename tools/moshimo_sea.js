// もしも毎日、海の水が1%ずつ減ったら？ — vertical reel (1080x1920) with Island3D.GL + CS.encode
(function () {
const W = 1080, H = 1920, FONT = "'Yu Gothic UI','Yu Gothic','Meiryo',sans-serif";
const I = window.Island3D;
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function makeNoise(seed) { const r = rng(seed), P = []; for (let i = 0; i < 256; i++) P.push(r()); const h = (x, y) => P[((x * 73856093) ^ (y * 19349663)) & 255]; const sm = t => t * t * (3 - 2 * t);
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi); const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; }; }
const BIG = { radius: 24, forest: [-12, 5], mountain: [9, 12], desert: [13, -6], lake: [-2, 6], beach: [-3, -22.6] };
const TR = [-22, 17];
const noise = makeNoise(11);
function land(x, z) {
  const a = Math.atan2(z, x), rr = BIG.radius * (1 + (noise(Math.cos(a) * 2 + 40, Math.sin(a) * 2 + 40) - 0.5) * 0.35), r = Math.hypot(x, z) / rr;
  let h = (1 - r * r) * 2.6 + (noise(x * 0.12 + 10, z * 0.12) - 0.5) * 1.4;
  for (const [px, pz, ph, k] of [[9, 13, 11, 0.85], [14, 7, 8, 0.9], [4, 16, 7.5, 0.9], [12, 17, 6, 1]]) h += Math.max(0, ph - Math.hypot(x - px, z - pz) * k) * (0.8 + 0.4 * noise(x * 0.5, z * 0.5));
  const dd = Math.hypot(x - BIG.desert[0], z - BIG.desert[1]); if (dd < 9) h = h * (0.55 + 0.45 * dd / 9);
  const ld = Math.hypot(x - BIG.lake[0], z - BIG.lake[1]); if (ld < 4.5) h = Math.min(h, -0.2 + (ld / 4.5) ** 2 * 1.4);
  return h;
}
function floorAt(x, z) { const d = Math.hypot(x - TR[0], z - TR[1]); return -1.42 - 0.17 * Math.max(0, 1 - d / 4.5) + (noise(x * 0.3 + 70, z * 0.3) - 0.5) * 0.06; }
const hAt = (x, z) => Math.max(land(x, z), floorAt(x, z));
function color(h, x, z, salt) {
  if (h < -0.05) { if (salt) return noise(x * 0.8, z * 0.8) > 0.5 ? '#F6F4EE' : '#E9E5DA'; const d = -h; return d < 0.4 ? '#D9C79A' : d < 0.9 ? '#C2AA7C' : d < 1.43 ? '#9A876D' : '#665C51'; }
  if (h < 0.35) return '#F2DFA7'; if (h < 0.6) return '#E8D394'; if (h > 8.2) return '#F4F7FA'; if (h > 5.2) return h > 6.6 ? '#A8A39A' : '#8E8A80';
  const dd = Math.hypot(x - BIG.desert[0], z - BIG.desert[1]); if (dd < 8) return '#EAC67C';
  const fd = Math.hypot(x - BIG.forest[0], z - BIG.forest[1]); if (fd < 8) return '#3F9A4C';
  const v = noise(x * 0.9 + 3, z * 0.9 + 7); return h > 3.6 ? '#6FAE58' : v < 0.3 ? '#74C255' : v > 0.75 ? '#86D365' : '#7CCB5B';
}
const PLATE = 33.6;
const inHex = (x, z, R) => { for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 3; if (x * Math.cos(a) + z * Math.sin(a) > R * Math.cos(Math.PI / 6) + 0.001) return false; } return true; };
function terrain(salt) {
  const S = new I.Scene(), N = 200, size = PLATE, st = size * 2 / N, Hh = [];
  for (let i = 0; i <= N; i++) { Hh.push([]); for (let j = 0; j <= N; j++) Hh[i].push(hAt(-size + i * st, -size + j * st)); }
  const HG = (a, b) => Hh[Math.max(0, Math.min(N, a))][Math.max(0, Math.min(N, b))];
  const NR = (a, b) => norm([HG(a - 1, b) - HG(a + 1, b), 2 * st, HG(a, b - 1) - HG(a, b + 1)]);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x0 = -size + i * st, z0 = -size + j * st; if (!inHex(x0 + st / 2, z0 + st / 2, PLATE * 0.995)) continue;
    const P = (a, b) => [-size + a * st, Hh[a][b], -size + b * st]; const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
    const col = (t) => color((t[0][1] + t[1][1] + t[2][1]) / 3, (t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3, salt);
    S.triN(a, b, c, col([a, b, c]), NR(i, j), NR(i + 1, j), NR(i + 1, j + 1)); S.triN(a, c, d, col([a, c, d]), NR(i, j), NR(i + 1, j + 1), NR(i, j + 1));
  }
  for (let k = 0; k < 6; k++) { const a0 = k / 6 * Math.PI * 2 + Math.PI / 6, a1 = (k + 1) / 6 * Math.PI * 2 + Math.PI / 6;
    const p0 = [Math.cos(a0) * PLATE, 0, Math.sin(a0) * PLATE], p1 = [Math.cos(a1) * PLATE, 0, Math.sin(a1) * PLATE];
    for (const [y0, y1, c] of [[0.2, -0.5, '#8C7A64'], [-0.5, -1.1, '#7A6A58'], [-1.1, -1.65, '#6A5C4C'], [-1.65, -2.3, '#C9A36B']]) S.quad([p0[0], y0, p0[2]], [p1[0], y0, p1[2]], [p1[0], y1, p1[2]], [p0[0], y1, p0[2]], c); }
  const R = rng(5);
  const tree = (x, y, z, s, sd) => { S.cyl(x, y, z, 0.18 * s, 1.0 * s, 5, '#8B5A2B'); S.kind = 1.5; S.ico(x, y + 1.5 * s, z, 0.85 * s, sd % 2 ? '#3FA35B' : '#4DB86A', sd); S.kind = 1.8; S.ico(x + 0.2 * s, y + 2.2 * s, z - 0.1 * s, 0.55 * s, '#5CC979', sd + 3); S.kind = 0; };
  for (let k = 0, n = 0; k < 9000 && n < 220; k++) { const x = (R() - 0.5) * 46, z = (R() - 0.5) * 46, y = land(x, z); if (y < 0.8 || y > 5 || Math.hypot(x - BIG.desert[0], z - BIG.desert[1]) < 9 || Math.hypot(x - BIG.beach[0], z - BIG.beach[1]) < 6) continue; tree(x, y - 0.05, z, 0.8 + R() * 0.5, k); n++; }
  for (const [x, z] of [[-8, -19.5], [1.5, -21], [-12, -16], [5, -19], [-15, -12], [9, -17]]) { const y = land(x, z); for (let k = 0; k < 4; k++) S.box(x + k * 0.08, y + k * 0.55, z, 0.28, 0.55, 0.28, '#9C6B3C'); S.kind = 1.9; for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; S.tri([x + 0.32, y + 2.2, z], [x + 0.32 + Math.cos(a) * 1.4, y + 1.7, z + Math.sin(a) * 1.4], [x + 0.32 + Math.cos(a + 0.35) * 1.1, y + 1.95, z + Math.sin(a + 0.35) * 1.1], '#2E9E4F'); } S.kind = 0; }
  // seabed life (revealed when the water goes)
  const CO = salt ? ['#FFFFFF', '#F1EEE6'] : ['#FF7A8A', '#FF9F43', '#B07CFF', '#FFD23F', '#F06292'];
  for (let k = 0, n = 0; k < 20000 && n < 260; k++) { const x = (R() - 0.5) * 64, z = (R() - 0.5) * 64; if (!inHex(x, z, PLATE * 0.95)) continue; const y = hAt(x, z); if (y > -0.25) continue;
    if (n % 3 === 0) { S.cyl(x, y, z, 0.05, 0.5, 4, salt ? '#EEE' : '#6E9F3A'); S.cyl(x + 0.12, y, z, 0.04, 0.35, 4, salt ? '#EEE' : '#7FB244'); } else S.ico(x, y + 0.12, z, 0.18 + R() * 0.2, CO[n % CO.length], k); n++; }
  for (let k = 0, n = 0; k < 4000 && n < 30; k++) { const x = (R() - 0.5) * 64, z = (R() - 0.5) * 64; if (!inHex(x, z, PLATE * 0.95)) continue; const y = hAt(x, z); if (y > -0.4) continue; S.ico(x, y + 0.2, z, 0.5 + R() * 0.5, salt ? '#E4E0D6' : '#8E8A80', k); n++; }
  S.plateR = PLATE; S.islandR = 24;
  return { S, hAt, big: BIG };
}
function waterScene() { const S = new I.Scene(); S.kind = 5; const N = 80, half = PLATE, st = half * 2 / N;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const x0 = -half + i * st, z0 = -half + j * st, x1 = x0 + st, z1 = z0 + st; if (!inHex((x0 + x1) / 2, (z0 + z1) / 2, PLATE * 0.99)) continue;
    S.triN([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [80, 180, 230], [0, 1, 0], [0, 1, 0], [0, 1, 0]); S.triN([x0, 0, z0], [x1, 0, z1], [x0, 0, z1], [80, 180, 230], [0, 1, 0], [0, 1, 0], [0, 1, 0]); }
  return S; }
function shipScene() { const S = new I.Scene(); S.box(0, 0, 0, 1.6, 0.6, 4.2, '#E8E2D6'); S.box(0, 0.1, 0, 1.75, 0.18, 4.4, '#C0392B'); S.box(0, 0.6, 0.5, 1.2, 0.8, 1.6, '#FFFFFF'); S.box(0, 1.4, 0.5, 0.9, 0.4, 1.0, '#2C3E50'); S.cyl(0, 1.8, 0.4, 0.12, 0.9, 6, '#E74C3C'); return S; }

const GL = I.GL.create(W, H, { fogD: 0.0026, transparent: true });
const W1 = terrain(false), W2 = terrain(true);
GL.setWorld(W1, 'main'); const ST_SEA = GL.static; GL.setWorld(W2, 'salt'); const ST_SALT = GL.worlds.salt.st; GL.use('main');
const EMPTY = { vao: GL.worlds.main.wa.vao, count: 0 };
for (const k in GL.worlds) GL.worlds[k].wa = EMPTY; GL.water = EMPTY;
const WATER = GL.addProp(waterScene());
const SHIP = GL.addProp(shipScene());
const ME = GL.addCharacter({ look: { colors: { skin: '#F6CFA8', hair: '#3A2A1E', shirt: '#1E9E5A', pants: '#33415C', hat: 'cap', hatCol: '#F2C21B', acc: 'none' }, tall: 1.06, key: 'moshimo' }, pos: [-3, null, -21.2], yaw: 0, act: 'idle', phase: 0, path: [[-3, -21.2], [-2, -23.4]], speed: 0.6 });
const T = (ctx, s, x, y, fill, stroke, lw) => { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(s, x, y); ctx.fillStyle = fill; ctx.fillText(s, x, y); };
const ease = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const levelY = p => p <= 0 ? -9 : -1.62 * Math.pow(1 - p, 0.5);
const out = document.createElement('canvas'); out.width = W; out.height = H; const g = out.getContext('2d');
window.CS = window.CS || {}; CS.CV = out;
CS.drawFrame = (EP, ctx, i, rel, dur) => {
  const L = EP.lines[i], prev = EP.lines[Math.max(0, i - 1)], t = CS.REC_T || 0;
  const k = ease(rel / 1.6), pct = prev[2] + (L[2] - prev[2]) * (i === 0 ? 1 : k), day = L[3];
  const wy = levelY(pct / 100);
  WATER.M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, wy, 0, 1];
  const sx = 6, sz = -28, sy = Math.max(wy - 0.15, hAt(sx, sz) - 0.05) + (wy > hAt(sx, sz) ? Math.sin(t * 1.3) * 0.04 : 0), tilt = wy > hAt(sx, sz) ? Math.sin(t * 0.9) * 0.03 : 0.12;
  const c = Math.cos(0.4), s = Math.sin(0.4); SHIP.M = I.GL.M4.mul([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, sx, sy, sz, 1], I.GL.M4.mul(I.GL.M4.RY(0.4), I.GL.M4.RZ(tilt)));
  GL.static = L[2] <= 0 && (i > 0 && prev[2] > 0 ? k > 0.5 : true) && EP.saltFrom <= i ? ST_SALT : ST_SEA;
  ME.act = L[5] || 'idle';
  const cam = EP.cams[L[0]], p = Math.min(1, rel / Math.max(dur, 1)), o = cam.orbit ?? 0.15, dl = cam.dolly ?? 0.08, a = o * (p - 0.5), kk = 1 - dl * p;
  const dx = cam.pos[0] - cam.target[0], dz = cam.pos[2] - cam.target[2], dy = cam.pos[1] - cam.target[1];
  const cc = { pos: [cam.target[0] + (dx * Math.cos(a) - dz * Math.sin(a)) * kk, cam.target[1] + dy * kk, cam.target[2] + (dx * Math.sin(a) + dz * Math.cos(a)) * kk], target: cam.target, fov: cam.fov || 46 };
  const hot = Math.min(1, Math.max(0, (100 - pct) / 100));
  const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, hot > 0.45 ? `rgb(${110 + 120 * (hot - 0.45)},${195 - 60 * (hot - 0.45)},${245 - 150 * (hot - 0.45)})` : '#6EC3F5'); gr.addColorStop(0.6, '#D6ECF7'); gr.addColorStop(1, '#F3F1EA');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(GL.render(cc, t), 0, 0);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(20,34,60,0.82)'; ctx.beginPath(); ctx.roundRect(70, 190, W - 140, 220, 40); ctx.fill();
  ctx.font = `900 62px ${FONT}`; T(ctx, 'もしも毎日', W / 2, 250, '#fff', '#14223C', 8); ctx.font = `900 70px ${FONT}`; T(ctx, '海の水が1%ずつ減ったら？', W / 2, 345, '#FFE27A', '#14223C', 8);
  if (day !== null) {
    const pop = i > 0 && prev[3] !== day ? 1 + 0.25 * (1 - ease(rel / 0.35)) : 1;
    ctx.save(); ctx.translate(W / 2, 520); ctx.scale(pop, pop); ctx.font = `900 120px ${FONT}`; T(ctx, day === 0 ? 'いつもの海' : day + '日目', 0, 0, '#FFFFFF', '#0B3A66', 16); ctx.restore();
    const bw = 680, bx = W / 2 - bw / 2, by = 610;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.roundRect(bx - 10, by - 10, bw + 20, 70, 35); ctx.fill();
    ctx.fillStyle = '#CFE3EE'; ctx.beginPath(); ctx.roundRect(bx, by, bw, 50, 25); ctx.fill();
    ctx.fillStyle = '#1C86D1'; ctx.beginPath(); ctx.roundRect(bx, by, Math.max(26, bw * pct / 100), 50, 25); ctx.fill();
    ctx.font = `900 40px ${FONT}`; T(ctx, `海の水 ${Math.round(pct)}%`, W / 2, by + 26, '#fff', '#0B3A66', 8);
  }
  const sub = L[1];
  if (sub) { const LL = sub.split('／'), fs = 66, gap = 88, yb = 1500 - (LL.length - 1) * gap / 2; ctx.font = `900 ${fs}px ${FONT}`;
    const bw2 = Math.max(...LL.map(q => ctx.measureText(q).width)) + 90; ctx.fillStyle = 'rgba(15,25,40,0.6)'; ctx.beginPath(); ctx.roundRect(W / 2 - bw2 / 2, yb - 70, bw2, (LL.length - 1) * gap + 140, 34); ctx.fill();
    LL.forEach((q, n) => T(ctx, q, W / 2, yb + n * gap, n === 0 && L[6] ? '#FFE27A' : '#fff', '#0F1928', 14)); }
};
window._MS = { GL, W1, ME, WATER, SHIP };
// [cam, 字幕, 海の水%, 日, 声, 主人公の動き, 1行目を黄色]
window.EP = {
  saltFrom: 9,
  cams: {
    wide: { pos: [-34, 26, -52], target: [0, -0.5, -6], fov: 48, orbit: 0.25 },
    beach: { pos: [1.2, 2.6, -15.5], target: [-3.5, 0.2, -27], fov: 50, orbit: 0.18, dolly: 0.1 },
    ship: { pos: [12.5, 3.2, -23], target: [5, -0.8, -28.5], fov: 48, orbit: 0.2 },
    side: { pos: [4, 1.2, -62], target: [0, -0.9, -24], fov: 40, orbit: 0.12, dolly: 0.05 },
    top: { pos: [0.1, 62, -34], target: [0, -1, -4], fov: 46, orbit: 0.2, dolly: 0.06 },
    face: { pos: [-1.6, 1.7, -24.6], target: [-3, 1.0, -21.2], fov: 42, orbit: 0.2, dolly: 0.08 },
    trench: { pos: [-12, 9, 5], target: [-22, -1.5, 17], fov: 46, orbit: 0.25 },
    seabed: { pos: [-8, 3, -38], target: [-10, -1.2, -28], fov: 48, orbit: 0.2 },
  },
  lines: [
    ['wide', 'もしも、毎日／海の水が1%ずつ減ったら？', 100, 0, 'もしも、毎日、海の水が、1パーセントずつ減ったら？', 'idle', 1],
    ['beach', '1日目。海の水は99%', 99, 1, '1日目。海の水は、99パーセント。', 'idle', 1],
    ['side', '海面は平均で／約37メートルも下がる', 99, 1, '海面は、平均で、約37メートルも下がる。', 'idle'],
    ['ship', '港の船は、海の底に／取り残される', 99, 1, '港の船は、海の底に、取り残される。', 'idle'],
    ['seabed', '3日目。海面は110メートル下／氷河期の海と同じくらい', 97, 3, '3日目。海面は、110メートル下。氷河期の海と、同じくらいだ。', 'walk', 1],
    ['top', 'イギリスとヨーロッパが／歩いてつながる', 97, 3, 'イギリスとヨーロッパ大陸が、歩いてつながる。', 'walk'],
    ['wide', '30日目。浅い海は／ぜんぶ陸地になった', 70, 30, '30日目。海の水は70パーセント。浅い海は、ぜんぶ陸地になった。', 'idle', 1],
    ['side', '50日目。海の水は半分／雨がぐんと少なくなる', 50, 50, '50日目。海の水は半分。海からの水蒸気が減って、雨がぐんと少なくなる。', 'idle', 1],
    ['trench', '99日目。最後の1%は／深い海溝の水たまりだけ', 1, 99, '99日目。最後の1パーセント。残っているのは、深い海溝の水たまりだけ。', 'idle', 1],
    ['top', '100日目。海は消えた／海の底には塩が真っ白に', 0, 100, 'そして100日目。海は消えた。海の底には、塩が真っ白に残る。', 'idle', 1],
    ['face', 'あなたは何日目まで／生きのびられる？', 0, 100, 'あなたは、何日目まで、生きのびられる？コメントで教えて！', 'wave', 1],
  ],
};
})();
