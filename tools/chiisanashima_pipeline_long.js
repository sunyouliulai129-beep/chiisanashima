// ちいさな島から世界へ — LONG (横長 1920x1080、8〜11分) pipeline. Runs inside a YouTube Studio upload tab, like chiisanashima_pipeline.js.
// Prereq: island3d.js evaluated (window.Island3D), VOICEVOX at http://localhost:50021, Studio open at .../videos/upload?d=ud.
// Usage:
//   await CS.prepare(EP)   -> voices + stills (returns total voice seconds; aim for 480〜660)
//   CS.preview(EP, i)      -> show scene i (CS.clearPreview() to remove)
//   await CS.record(EP)    -> records in real time (8〜11分かかる). When done the mp4 is put into the upload dialog (CS.UP_STATE==='sent').
// EP = {
//   title: 'ちいさな島から世界へ まとめ #1',       // top-left label
//   subs: 21, evCount: 11, nextEvent: 20, nextEventName: '旅人が流れ着く', evPrev: 0,
//   buildWorld: () => Island3D.bigWorld(),           // the current island (with everything built so far)
//   cams: { name: {pos,target,fov}, ... },           // as many as you like (Island3D.BIG_CAMS + your own)
//   lines: [[cam, '字幕（／で改行、1行22字まで、2行まで）', mode, '声の文（省略可）'], ...],
//          // mode: null | 'chapter'（大きな章タイトル。字幕が章名になる） | 'hud'（島民と次のイベントを大きく） | 'card'（EP.cards[n] を出す: mode 'card:0'）
//   worlds: { birth1: () => Island3D.bigWorld({stage:0.3}) },   // optional extra worlds; use with cams[k].world = 'birth1'
//   cards: [{ title: '投票結果', rows: ['A オノ 3票', 'B つりざお 7票'] }, ...],   // optional info panels
//   file: 'chiisanashima_long01.mp4'
// }
(function () {
  const V = 'http://localhost:50021';
  const FONT = "'Yu Gothic UI','Yu Gothic','Meiryo',sans-serif";
  const W = 1920, H = 1080;
  const CS = window.CS = {};
  CS.prepare = async (EP) => {
    CS.AC = new AudioContext({ sampleRate: 48000 }); CS.BUFS = [];
    for (const ln of EP.lines) {
      const text = (ln[3] || ln[1]).replace(/／/g, '');
      if (!text.trim()) { CS.BUFS.push(CS.AC.createBuffer(1, 48000 * 1.5, 48000)); continue; }
      const q = await fetch(`${V}/audio_query?speaker=31&text=${encodeURIComponent(text)}`, { method: 'POST' }).then(r => r.json());
      Object.assign(q, { speedScale: 1.2, intonationScale: 1.2, volumeScale: 1.3, prePhonemeLength: 0.05, postPhonemeLength: 0.15, outputSamplingRate: 48000 });
      const ab = await fetch(`${V}/synthesis?speaker=31`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) }).then(r => r.arrayBuffer());
      CS.BUFS.push(await CS.AC.decodeAudioData(ab));
    }
    const w = (EP.buildWorld || Island3D.bigWorld)({}), WS = {};   // a cam may say world:'name' to use EP.worlds[name]() (e.g. the island's birth stages)
    CS.STILLS = {};
    for (const k in EP.cams) { const cam = EP.cams[k], ww = cam.world ? (WS[cam.world] = WS[cam.world] || EP.worlds[cam.world]()) : w; const img = Island3D.render(ww.S, cam, W, H, { ss: 1, skyTop: cam.skyTop || '#7FD1FF', skyBot: cam.skyBot || '#FFF4D6' }); CS.STILLS[k] = await createImageBitmap(new ImageData(img.data, W, H)); }
    CS.CV = document.createElement('canvas'); CS.CV.width = W; CS.CV.height = H;
    return { voice: CS.BUFS.reduce((a, b) => a + b.duration, 0).toFixed(1), scenes: EP.lines.length };
  };
  const T = (ctx, s, x, y, fill = '#fff', stroke = '#1E2A3A', lw = 12) => { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(s, x, y); ctx.fillStyle = fill; ctx.fillText(s, x, y); };
  CS.drawFrame = (EP, ctx, i, rel, dur) => {
    const [shot, sub, mode] = EP.lines[i];
    const p = Math.min(1, Math.max(0, rel / dur)), img = CS.STILLS[shot] || CS.STILLS[Object.keys(CS.STILLS)[0]];
    // slow Ken Burns: zoom in or out and drift, direction by scene index
    const zin = i % 2 === 0, sc = zin ? 1.02 + 0.1 * p : 1.12 - 0.1 * p, dx = ((i % 3) - 1) * 60 * (p - 0.5), dy = ((i % 4 < 2) ? -1 : 1) * 25 * (p - 0.5);
    ctx.drawImage(img, (W - W * sc) / 2 + dx, (H - H * sc) / 2 + dy, W * sc, H * sc);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    // top-left label
    ctx.font = `900 40px ${FONT}`; const lab = EP.title || 'ちいさな島から世界へ', lw = ctx.measureText(lab).width + 60;
    ctx.fillStyle = 'rgba(35,52,80,0.85)'; ctx.beginPath(); ctx.roundRect(40, 36, lw, 72, 36); ctx.fill(); ctx.fillStyle = '#FFE27A'; ctx.fillText(lab, 40 + lw / 2, 73);
    // top-right event sign
    const EVN = EP.evCount ?? EP.subs, EVP = EP.evPrev || 0;
    ctx.fillStyle = 'rgba(201,139,78,0.95)'; ctx.strokeStyle = '#5A381C'; ctx.lineWidth = 6; ctx.beginPath(); ctx.roundRect(W - 620, 30, 580, 120, 24); ctx.fill(); ctx.stroke();
    ctx.font = `900 34px ${FONT}`; T(ctx, `島民 ${EP.subs}人`, W - 330, 66, '#FFE27A', '#5A381C', 8);
    ctx.font = `900 28px ${FONT}`; T(ctx, EP.nextEventName ? `登録者あと${Math.max(0, EP.nextEvent - EVN)}人で「${EP.nextEventName}」` : '', W - 330, 112, '#fff', '#5A381C', 7);
    if (mode === 'chapter') {
      const pop = Math.min(1, rel / 0.4);
      ctx.fillStyle = `rgba(20,30,45,${0.45 * pop})`; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(0.7 + 0.3 * pop, 0.7 + 0.3 * pop);
      ctx.fillStyle = '#FF7A1A'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 12; ctx.beginPath(); ctx.roundRect(-700, -150, 1400, 300, 50); ctx.fill(); ctx.stroke();
      ctx.font = `900 96px ${FONT}`; sub.split('／').forEach((s, k, a) => T(ctx, s, 0, (k - (a.length - 1) / 2) * 110, k === 0 ? '#FFF27A' : '#fff', '#7A2E00', 14));
      ctx.restore(); return;
    }
    if (mode && mode.startsWith('card:') && EP.cards) {
      const c = EP.cards[+mode.slice(5)]; if (c) {
        const rows = c.rows.slice(0, 7), h = 110 + rows.length * 70, y0 = 190;
        ctx.fillStyle = 'rgba(255,248,232,0.96)'; ctx.strokeStyle = '#5A381C'; ctx.lineWidth = 8; ctx.beginPath(); ctx.roundRect(W / 2 - 560, y0, 1120, h, 36); ctx.fill(); ctx.stroke();
        ctx.font = `900 54px ${FONT}`; T(ctx, c.title, W / 2, y0 + 60, '#E2560A', '#fff', 8);
        ctx.font = `900 44px ${FONT}`; rows.forEach((r, k) => { ctx.fillStyle = '#5A381C'; ctx.fillText(r, W / 2, y0 + 140 + k * 70); });
      }
    }
    if (mode === 'hud') {
      const g = 0.5 + 0.5 * Math.sin(rel * 5);
      ctx.fillStyle = 'rgba(255,248,232,0.95)'; ctx.strokeStyle = '#FF7A1A'; ctx.lineWidth = 10; ctx.beginPath(); ctx.roundRect(W / 2 - 520, 260, 1040, 300, 40); ctx.fill(); ctx.stroke();
      ctx.font = `900 80px ${FONT}`; T(ctx, `島民 ${EP.subs}人`, W / 2, 350, `rgb(255,${150 + 60 * g},40)`, '#5A381C', 12);
      ctx.font = `900 46px ${FONT}`; T(ctx, EP.nextEventName ? `YouTube登録者あと${Math.max(0, EP.nextEvent - EVN)}人で` : '', W / 2, 440, '#5A381C', '#fff', 8);
      T(ctx, EP.nextEventName ? `「${EP.nextEventName}」` : '', W / 2, 505, '#E2560A', '#fff', 8);
      ctx.fillStyle = 'rgba(90,56,28,0.3)'; ctx.beginPath(); ctx.roundRect(W / 2 - 440, 540, 880, 12, 6); ctx.fill();
      ctx.fillStyle = '#FF7A1A'; ctx.beginPath(); ctx.roundRect(W / 2 - 440, 540, Math.max(12, 880 * Math.min(1, Math.max(0, (EVN - EVP) / ((EP.nextEvent || 1) - EVP)))), 12, 6); ctx.fill();
    }
    // subtitles (bottom)
    if (sub) {
      const L = sub.split('／').slice(0, 2), fs = 64, gap = 84, yb = H - 70 - (L.length - 1) * gap;
      ctx.font = `900 ${fs}px ${FONT}`;
      const bw = Math.max(...L.map(s => ctx.measureText(s).width)) + 90;
      ctx.fillStyle = 'rgba(20,30,45,0.55)'; ctx.beginPath(); ctx.roundRect(W / 2 - bw / 2, yb - 60, bw, (L.length - 1) * gap + 120, 30); ctx.fill();
      L.forEach((s, k) => T(ctx, s, W / 2, yb + k * gap, '#fff', '#1E2A3A', 14));
    }
  };
  CS.preview = (EP, i) => { const s = document.createElement('canvas'); s.width = W; s.height = H; CS.drawFrame(EP, s.getContext('2d'), i, 2, 5); s.id = '__pv'; s.style.cssText = 'position:fixed;left:0;top:0;width:100vw;z-index:999999;background:#000'; document.getElementById('__pv')?.remove(); document.body.appendChild(s); return i; };
  CS.clearPreview = () => document.getElementById('__pv')?.remove();
  CS.record = async (EP) => {
    CS.clearPreview(); const AC = CS.AC; if (AC.state !== 'running') { try { await AC.resume(); } catch (e) { } }
    const SR = AC.sampleRate, PAD = 0.6, GAP = 0.7, starts = [], durs = []; let tt = PAD;
    CS.BUFS.forEach((b, i) => { const extra = EP.lines[i][2] === 'chapter' ? 1.2 : 0; starts.push(tt); durs.push(b.duration + GAP + extra); tt += b.duration + GAP + extra; });
    const TOTAL = tt + 2.0;
    // BGM: 16-bar loop, rendered once and looped (keeps memory small for 10 minutes)
    const beat = 60 / 92, LOOP = beat * 64, NL = Math.ceil(LOOP * SR), loop = AC.createBuffer(1, NL, SR), o = loop.getChannelData(0);
    const note = (f, st, dur, amp) => { const i0 = Math.floor(st * SR), n = Math.floor(dur * SR); for (let k = 0; k < n; k++) { const j = (i0 + k) % NL, x = k / SR, env = Math.min(1, x / 0.02) * Math.exp(-x * 2.0); o[j] += (Math.sin(2 * Math.PI * f * x) + 0.25 * Math.sin(6 * Math.PI * f * x)) * env * amp; } };
    const ch = [[196, 246.9, 293.7], [164.8, 207.7, 246.9], [174.6, 220, 261.6], [196, 246.9, 293.7]], mel = [587.3, 659.3, 784, 659.3, 587.3, 493.9, 440, 493.9, 523.3, 587.3, 659.3, 587.3];
    for (let b = 0, k = 0; b < 64; b++) { const c = ch[Math.floor(b / 4) % 4]; if (b % 4 == 0) note(c[0] / 2, b * beat, beat * 3, 0.10); note(c[b % 3], b * beat, beat, 0.04); if (b % 2 == 1 && (b < 24 || b > 40)) { note(mel[k % mel.length], b * beat, beat * 0.9, 0.028); k++; } }
    let mx = 0; for (let i = 0; i < NL; i++) mx = Math.max(mx, Math.abs(o[i])); for (let i = 0; i < NL; i++) o[i] = o[i] / mx * 0.5;
    const ding = AC.createBuffer(1, SR, SR), dd = ding.getChannelData(0); for (let k = 0; k < SR; k++) { const x = k / SR; dd[k] = (Math.sin(2 * Math.PI * 1046.5 * x) * 0.6 + Math.sin(2 * Math.PI * 1568 * x) * 0.4) * Math.exp(-x * 5) * 0.25; }
    const dest = AC.createMediaStreamDestination(), T0 = AC.currentTime + 0.6;
    const bg = AC.createBufferSource(); bg.buffer = loop; bg.loop = true; const g = AC.createGain(); g.gain.setValueAtTime(0.16, T0); g.gain.setValueAtTime(0.16, T0 + TOTAL - 2.5); g.gain.linearRampToValueAtTime(0, T0 + TOTAL); bg.connect(g).connect(dest); bg.start(T0); bg.stop(T0 + TOTAL);
    CS.BUFS.forEach((b, i) => { const s = AC.createBufferSource(); s.buffer = b; s.connect(dest); s.start(T0 + starts[i]); if (EP.lines[i][2] === 'chapter') { const d = AC.createBufferSource(); d.buffer = ding; d.connect(dest); d.start(T0 + starts[i] - 0.1); } });
    const ctx = CS.CV.getContext('2d'); CS.drawFrame(EP, ctx, 0, 0, durs[0]);
    const stream = new MediaStream([CS.CV.captureStream(30).getVideoTracks()[0], ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1.640028,mp4a.40.2', videoBitsPerSecond: 4000000, audioBitsPerSecond: 160000 });
    const chunks = []; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    CS.OUT = null; CS.REC_STATE = 'recording'; CS.UP_STATE = 'waiting'; CS.FC = 0;
    CS.upload = () => { try { const inp = document.querySelector('input[type=file]'); const dt = new DataTransfer(); dt.items.add(new File([CS.OUT], EP.file, { type: 'video/mp4' })); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); CS.UP_STATE = 'sent'; } catch (e) { CS.UP_STATE = 'err ' + e.message; } return CS.UP_STATE; };
    rec.onstop = () => { CS.OUT = new Blob(chunks, { type: 'video/mp4' }); CS.REC_STATE = 'done'; if (EP.holdUpload) return;   // holdUpload: keep the file (CS.OUT) and call CS.upload() later
      try { const inp = document.querySelector('input[type=file]'); const dt = new DataTransfer(); dt.items.add(new File([CS.OUT], EP.file, { type: 'video/mp4' })); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); CS.UP_STATE = 'sent'; } catch (e) { CS.UP_STATE = 'err ' + e.message; } };
    let started = false, stopped = false;
    CS.iv = setInterval(() => { const now = AC.currentTime - T0; if (!started && now >= -0.05) { started = true; rec.start(2000); } if (!started) return;
      let i = 0; for (let k = 0; k < starts.length; k++) if (now >= starts[k] - 0.1) i = k;
      CS.drawFrame(EP, ctx, i, Math.max(0, now - starts[i]), durs[i]); CS.FC++; CS.NOW = now;
      if (!stopped && now >= TOTAL) { stopped = true; clearInterval(CS.iv); rec.stop(); } }, 33);
    return { total: TOTAL.toFixed(1) };
  };
})();
