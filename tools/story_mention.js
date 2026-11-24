(function () {
const W = 1080, H = 1920, FONT = "'Yu Gothic UI','Yu Gothic','Meiryo',sans-serif";
window.CS = window.CS || {};
const nm = s => String(s || '').trim().toLowerCase().replace(/^@/, '').replace(/[\s　]/g, '');
const SEP = { residents: window._RES.map(([p, i, n]) => ({ id: p + ':' + nm(i), name: n })), buildWorld: (o) => Island3D.bigWorld(o), heroAct: 'wave', lines: [['a', '', null]] };
const ST = Island3D.GL.stage(SEP, W, H);
const cam = { pos: [-14, 9, -38], target: [-3, 1.2, -16], fov: 50, orbit: 0.35, dolly: 0.12, tagDist: 26 };
const T = (ctx, s, x, y, fill, stroke, lw) => { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(s, x, y); ctx.fillStyle = fill; ctx.fillText(s, x, y); };
const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
window.CS.CV = document.createElement('canvas'); CS.CV.width = W; CS.CV.height = H;
window.CS.drawFrame = (EP, ctx, i, rel) => {
  const t = CS.REC_T || 0, TOT = EP.total || 10;
  ctx.drawImage(ST.frame(cam, Math.min(1, t / TOT), t), 0, 0);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  // top band
  const a1 = ease(t / 0.5);
  ctx.save(); ctx.globalAlpha = a1;
  ctx.fillStyle = 'rgba(255,122,26,0.96)'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.beginPath(); ctx.roundRect(60, 230, W - 120, 330, 48); ctx.fill(); ctx.stroke();
  ctx.font = `900 64px ${FONT}`; T(ctx, 'インスタのストーリーで', W / 2, 310, '#fff', '#7A2E00', 12);
  ctx.font = `900 58px ${FONT}`; T(ctx, '@chiisanashima_sekai', W / 2, 400, '#FFF27A', '#7A2E00', 12);
  ctx.font = `900 64px ${FONT}`; T(ctx, 'をメンションすると…', W / 2, 490, '#fff', '#7A2E00', 12);
  ctx.restore();
  // middle message
  const a2 = ease((t - 1.6) / 0.6);
  if (a2 > 0) {
    ctx.save(); ctx.globalAlpha = a2; ctx.translate(W / 2, 760); ctx.scale(0.8 + 0.2 * a2, 0.8 + 0.2 * a2);
    ctx.fillStyle = 'rgba(255,248,232,0.97)'; ctx.strokeStyle = '#5A381C'; ctx.lineWidth = 10; ctx.beginPath(); ctx.roundRect(-480, -140, 960, 280, 44); ctx.fill(); ctx.stroke();
    ctx.font = `900 72px ${FONT}`; T(ctx, '次の動画に', 0, -55, '#5A381C', '#fff', 10);
    T(ctx, '採用される確率が', 0, 45, '#5A381C', '#fff', 10);
    ctx.restore();
  }
  // big "あがるかも！"
  const a3 = ease((t - 3.0) / 0.35);
  if (a3 > 0) {
    const bob = Math.sin(t * 7) * 0.05 + 1;
    ctx.save(); ctx.translate(W / 2, 1010); ctx.rotate(-0.06); ctx.scale(a3 * bob * 1.0, a3 * bob * 1.0);
    ctx.font = `900 150px ${FONT}`; T(ctx, 'あがるかも！', 0, 0, '#FF3B5C', '#fff', 22);
    ctx.restore();
  }
  // bottom: YouTube invite (no reward)
  const a4 = ease((t - 4.6) / 0.6);
  if (a4 > 0) {
    ctx.save(); ctx.globalAlpha = a4;
    ctx.fillStyle = 'rgba(201,139,78,0.96)'; ctx.strokeStyle = '#5A381C'; ctx.lineWidth = 8; ctx.beginPath(); ctx.roundRect(110, 1420, W - 220, 230, 36); ctx.fill(); ctx.stroke();
    ctx.font = `900 50px ${FONT}`; T(ctx, 'YouTubeでも毎日島が進むよ', W / 2, 1490, '#fff', '#5A381C', 9);
    T(ctx, 'チャンネル登録してね', W / 2, 1575, '#FFE27A', '#5A381C', 9);
    ctx.restore();
  }
};
window._STORY = { SEP, ST };
})();
