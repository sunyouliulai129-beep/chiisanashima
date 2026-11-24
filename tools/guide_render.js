(function () {
  const V = 'http://localhost:50021';
  const FONT = "'Yu Gothic UI','Yu Gothic','Meiryo',sans-serif";
  const CS = window.CS = {};
  CS.prepare = async (EP) => {
    CS.AC = new AudioContext({ sampleRate: 48000 }); CS.BUFS = [];
    for (let li = 0; li < EP.lines.length; li++) {
      const sub = EP.lines[li][1];
      const text = (EP.voice && EP.voice[li]) || sub.replace(/／/g, '');
      const q = await fetch(`${V}/audio_query?speaker=31&text=${encodeURIComponent(text)}`, { method: 'POST' }).then(r => r.json());
      Object.assign(q, { speedScale: 1.3, intonationScale: 1.25, volumeScale: 1.3, prePhonemeLength: 0.05, postPhonemeLength: 0.1, outputSamplingRate: 48000 });
      const ab = await fetch(`${V}/synthesis?speaker=31`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) }).then(r => r.arrayBuffer());
      CS.BUFS.push(await CS.AC.decodeAudioData(ab));
    }
    const w = (EP.buildWorld || Island3D.dayOneWorld)(EP.world || {});
    CS.STILLS = {};
    for (const k in EP.cams) { const img = Island3D.render(w.S, EP.cams[k], 1080, 1920, { ss: 1, skyTop: '#7FD1FF', skyBot: '#FFF4D6' }); CS.STILLS[k] = await createImageBitmap(new ImageData(img.data, 1080, 1920)); }
    CS.CV = document.createElement('canvas'); CS.CV.width = 1080; CS.CV.height = 1920;
    return { voice: CS.BUFS.reduce((a, b) => a + b.duration, 0).toFixed(1), durs: CS.BUFS.map(b => b.duration.toFixed(1)) };
  };
  const CX = 465;
  CS.drawFrame = (EP, ctx, i, rel, dur) => {
    let [shot, sub, mode] = EP.lines[i]; if (EP.hook && i === 0) sub = '';
    const p = Math.min(1, Math.max(0, rel / dur)), sc = 1 + 0.08 * p, img = CS.STILLS[shot];
    ctx.drawImage(img, (1080 - 1080 * sc) / 2, (1920 - 1920 * sc) / 2, 1080 * sc, 1920 * sc);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(35,52,80,0.88)'; ctx.beginPath(); ctx.roundRect(CX - 230, 250, 460, 84, 42); ctx.fill();
    ctx.font = `900 48px ${FONT}`; ctx.fillStyle = '#FFE27A'; ctx.fillText(EP.dayLabel || `${EP.day}日目`, CX - 105, 294); ctx.fillStyle = '#fff'; ctx.font = `900 38px ${FONT}`; ctx.fillText(EP.tag, CX + 80, 294);
    if (['all', 'A', 'B', 'C'].includes(mode) && EP.choices) {
      EP.choices.forEach(([k, em, nm], j) => {
        const x = 70 + j * 275, y = 620, on = mode === 'all' || mode === k, big = mode === k, S = 250;
        ctx.save(); ctx.globalAlpha = on ? 1 : 0.45; const s = big ? 1.07 : 1; ctx.translate(x + S / 2, y + S / 2); ctx.scale(s, s); ctx.translate(-S / 2, -S / 2);
        ctx.fillStyle = '#FFF8E8'; ctx.strokeStyle = big ? '#FF7A1A' : '#5A381C'; ctx.lineWidth = big ? 12 : 7; ctx.beginPath(); ctx.roundRect(0, 0, S, S, 30); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#FF7A1A'; ctx.beginPath(); ctx.arc(44, 44, 32, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `900 40px ${FONT}`; ctx.fillText(k, 44, 47);
        ctx.font = `100px 'Segoe UI Emoji','Apple Color Emoji',sans-serif`; ctx.fillText(em, S / 2, 115);
        ctx.fillStyle = '#5A381C'; ctx.font = `900 42px ${FONT}`; ctx.fillText(nm, S / 2, 208); ctx.restore();
      });
    }
    if (EP.hook && i === 0) {
      const pop = Math.min(1, rel / 0.35), sc2 = 0.6 + 0.4 * pop;
      ctx.save(); ctx.translate(CX, 520); ctx.scale(sc2, sc2); ctx.rotate(-0.03);
      ctx.fillStyle = '#FF7A1A'; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 10; ctx.beginPath(); ctx.roundRect(-400, -130, 800, 260, 40); ctx.fill(); ctx.stroke();
      ctx.font = `900 64px ${FONT}`; ctx.lineWidth = 12; ctx.strokeStyle = '#7A2E00';
      EP.hook.forEach((h, k) => { const y = (k - (EP.hook.length - 1) / 2) * 92; ctx.strokeText(h, 0, y); ctx.fillStyle = k === EP.hook.length - 1 ? '#FFF27A' : '#FFFFFF'; ctx.fillText(h, 0, y); });
      ctx.restore();
    }
    const lines = sub.split('／'); const four = lines.length >= 4, fs = four ? 50 : 58, gap = four ? 66 : 78;
    const y0 = 1085 - (lines.length - 1) * gap / 2;
    ctx.font = `900 ${fs}px ${FONT}`;
    lines.forEach((ln, k) => { ctx.lineWidth = 15; ctx.strokeStyle = '#1E2A3A'; ctx.strokeText(ln, CX, y0 + k * gap); ctx.fillStyle = '#fff'; ctx.fillText(ln, CX, y0 + k * gap); });
    const hx = 50, hy = 1290, hw = 830, hh = 200;
    ctx.fillStyle = '#C98B4E'; ctx.strokeStyle = '#5A381C'; ctx.lineWidth = 8; ctx.beginPath(); ctx.roundRect(hx, hy, hw, hh, 30); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#B0743C'; ctx.lineWidth = 3; for (const yy of [hy + 50, hy + 100, hy + 150]) { ctx.beginPath(); ctx.moveTo(hx + 18, yy); ctx.lineTo(hx + hw - 18, yy); ctx.stroke(); }
    const glow = mode === 'hud' ? 0.5 + 0.5 * Math.sin(rel * 6) : 0;
    ctx.font = `900 50px ${FONT}`; ctx.lineWidth = 10; ctx.strokeStyle = '#5A381C';
    const T = (s, x, y, c = '#fff') => { ctx.strokeText(s, x, y); ctx.fillStyle = c; ctx.fillText(s, x, y); };
    T(EP.island, hx + 175, hy + 58); T(`島民 ${EP.subs}人`, hx + hw - 185, hy + 58, glow ? `rgb(255,${226 - 60 * glow},${122 - 80 * glow})` : '#FFE27A');
    ctx.font = `900 40px ${FONT}`; T(`次のイベントまで あと${Math.max(0, EP.nextEvent - EP.subs)}人`, CX, hy + 128);
    ctx.fillStyle = 'rgba(90,56,28,0.5)'; ctx.beginPath(); ctx.roundRect(hx + 70, hy + 165, hw - 140, 14, 7); ctx.fill();
    ctx.fillStyle = '#FF7A1A'; ctx.beginPath(); ctx.roundRect(hx + 70, hy + 165, Math.max(14, (hw - 140) * Math.min(1, EP.subs / EP.nextEvent)), 14, 7); ctx.fill();
  };
  CS.preview = (EP, i) => { const s = document.createElement('canvas'); s.width = 1080; s.height = 1920; CS.drawFrame(EP, s.getContext('2d'), i, 2, 5); s.id = '__pv'; s.style.cssText = 'position:fixed;left:0;top:0;height:100vh;z-index:999999;background:#000'; document.getElementById('__pv')?.remove(); document.body.appendChild(s); return i; };
  CS.clearPreview = () => document.getElementById('__pv')?.remove();
  CS.record = async (EP) => {
    CS.clearPreview(); const AC = CS.AC; if (AC.state !== 'running') { try { await AC.resume(); } catch (e) { } }
    const SR = AC.sampleRate, PAD = 0.4, GAP = 0.5, starts = [], durs = []; let tt = PAD;
    CS.BUFS.forEach(b => { starts.push(tt); durs.push(b.duration + GAP); tt += b.duration + GAP; }); const TOTAL = Math.max(tt + 1.0, 61.5);
    const N = Math.ceil(TOTAL * SR), bgm = AC.createBuffer(1, N, SR), o = bgm.getChannelData(0);
    const note = (f, st, dur, amp) => { const i0 = Math.floor(st * SR), n = Math.floor(dur * SR); for (let k = 0; k < n && i0 + k < N; k++) { if (i0 + k < 0) continue; const x = k / SR, env = Math.min(1, x / 0.02) * Math.exp(-x * 2.2); o[i0 + k] += (Math.sin(2 * Math.PI * f * x) + 0.25 * Math.sin(6 * Math.PI * f * x)) * env * amp; } };
    const beat = 60 / 96, ch = [[196, 246.9, 293.7], [164.8, 207.7, 246.9], [174.6, 220, 261.6], [196, 246.9, 293.7]], mel = [587.3, 659.3, 784, 659.3, 587.3, 493.9, 440, 493.9];
    for (let b = 0, k = 0; b * beat < TOTAL; b++) { const c = ch[Math.floor(b / 4) % 4]; if (b % 4 == 0) note(c[0] / 2, b * beat, beat * 3, 0.10); note(c[b % 3], b * beat, beat, 0.045); if (b % 2 == 1) { note(mel[k % 8], b * beat, beat * 0.9, 0.03); k++; } }
    let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; }; let lp = 0;
    for (let i = 0; i < N; i++) { lp = lp * 0.995 + rnd() * 0.005; o[i] += lp * (0.5 + 0.5 * Math.sin(2 * Math.PI * i / SR / 6)) * 3.0; }
    for (const s of starts) { note(1046.5, s - 0.12, 0.5, 0.05); note(1568, s - 0.05, 0.5, 0.04); }
    let mx = 0; for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(o[i])); for (let i = 0; i < N; i++) { o[i] = o[i] / mx * 0.5; if (i > N - 2 * SR) o[i] *= (N - i) / (2 * SR); }
    const dest = AC.createMediaStreamDestination(), T0 = AC.currentTime + 0.5;
    const bg = AC.createBufferSource(); bg.buffer = bgm; const g = AC.createGain(); g.gain.value = 0.18; bg.connect(g).connect(dest); bg.start(T0);
    CS.BUFS.forEach((b, i) => { const s = AC.createBufferSource(); s.buffer = b; s.connect(dest); s.start(T0 + starts[i]); });
    const ctx = CS.CV.getContext('2d'); CS.drawFrame(EP, ctx, 0, 0, durs[0]);
    const stream = new MediaStream([CS.CV.captureStream(30).getVideoTracks()[0], ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1.640028,mp4a.40.2', videoBitsPerSecond: 6000000, audioBitsPerSecond: 192000 });
    const chunks = []; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    CS.OUT = null; CS.REC_STATE = 'recording'; CS.UP_STATE = 'waiting';
    rec.onstop = () => { CS.OUT = new Blob(chunks, { type: 'video/mp4' }); CS.REC_STATE = 'done';
      try { const inp = document.querySelector('input[type=file]'); const dt = new DataTransfer(); dt.items.add(new File([CS.OUT], EP.file, { type: 'video/mp4' })); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); CS.UP_STATE = 'sent'; } catch (e) { CS.UP_STATE = 'err ' + e.message; } };
    let started = false, stopped = false;
    CS.iv = setInterval(() => { const now = AC.currentTime - T0; if (!started && now >= -0.05) { started = true; rec.start(1000); } if (!started) return;
      let i = 0; for (let k = 0; k < starts.length; k++) if (now >= starts[k] - 0.1) i = k;
      CS.drawFrame(EP, ctx, i, Math.max(0, now - starts[i]), durs[i]);
      if (!stopped && now >= TOTAL) { stopped = true; clearInterval(CS.iv); rec.stop(); } }, 33);
    return { total: TOTAL.toFixed(1) };
  };
})();
(function(){const FONT="'Yu Gothic UI','Yu Gothic','Meiryo',sans-serif";const base=CS.drawFrame;
CS.drawFrame=(EP,ctx,i,rel,dur)=>{base(EP,ctx,i,rel,dur);if(!EP.evergreen)return;const hx=50,hy=1290,hw=830,hh=200,CX=465;
ctx.fillStyle='#C98B4E';ctx.strokeStyle='#5A381C';ctx.lineWidth=8;ctx.beginPath();ctx.roundRect(hx,hy,hw,hh,30);ctx.fill();ctx.stroke();
ctx.strokeStyle='#B0743C';ctx.lineWidth=3;for(const yy of [hy+50,hy+100,hy+150]){ctx.beginPath();ctx.moveTo(hx+18,yy);ctx.lineTo(hx+hw-18,yy);ctx.stroke();}
ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=10;ctx.strokeStyle='#5A381C';
const T=(s,x,y,c='#fff')=>{ctx.strokeText(s,x,y);ctx.fillStyle=c;ctx.fillText(s,x,y);};
ctx.font=`900 52px ${FONT}`;T('ちいさな島から世界へ',CX,hy+62,'#FFE27A');ctx.font=`900 40px ${FONT}`;T('いまの島民数はプロフィールのリンクで',CX,hy+138);};})();
