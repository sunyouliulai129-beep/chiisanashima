// CS.encode(EP): frame-by-frame MP4 (H.264 + AAC) with WebCodecs. Not real time, so the video never stutters
// even if the PC is busy. Needs CS.drawFrame, CS.BUFS (voice AudioBuffers, one per EP.lines), CS.CV (output canvas).
// Progress: CS.ENC = {state, k, total}. Result: CS.OUT (Blob, video/mp4), CS.STARTS (line start seconds).
(function () {
const CS = window.CS;
const u8 = (a) => new Uint8Array(a);
const str = (s) => [...s].map(c => c.charCodeAt(0));
const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const u16 = (v) => [(v >>> 8) & 255, v & 255];
const u64 = (v) => { const hi = Math.floor(v / 4294967296), lo = v >>> 0; return [...u32(hi), ...u32(lo)]; };
function box(type, ...parts) {
  const flat = []; for (const p of parts) { for (let i = 0; i < p.length; i++) flat.push(p[i]); }
  return u8([...u32(flat.length + 8), ...str(type), ...flat]);
}
const full = (type, ver, flags, ...parts) => box(type, [ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...parts);
const MAT = [...u32(0x00010000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x00010000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)];
function trak(o) {
  const tkhd = full('tkhd', 0, 3, u32(0), u32(0), u32(o.id), u32(0), u32(o.durMovie), u32(0), u32(0), u16(0), u16(0), u16(o.video ? 0 : 0x0100), u16(0), MAT, u32(o.video ? o.w << 16 : 0), u32(o.video ? o.h << 16 : 0));
  const mdhd = full('mdhd', 0, 0, u32(0), u32(0), u32(o.ts), u32(o.dur), u16(0x55c4), u16(0));
  const hdlr = full('hdlr', 0, 0, u32(0), str(o.video ? 'vide' : 'soun'), u32(0), u32(0), u32(0), str(o.video ? 'VideoHandler' : 'SoundHandler'), [0]);
  const xmhd = o.video ? full('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)) : full('smhd', 0, 0, u16(0), u16(0));
  const dinf = box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1)));
  let entry;
  if (o.video) {
    entry = box('avc1', [0, 0, 0, 0, 0, 0], u16(1), new Array(16).fill(0), u16(o.w), u16(o.h), u32(0x00480000), u32(0x00480000), u32(0), u16(1), new Array(32).fill(0), u16(0x18), u16(0xffff), box('avcC', o.desc));
  } else {
    const asc = [...o.desc];
    const dsi = [5, asc.length, ...asc];
    const dcd = [4, 13 + dsi.length, 0x40, 0x15, 0, 0, 0, ...u32(160000), ...u32(160000), ...dsi];
    const esd = [3, 3 + dcd.length + 3, ...u16(1), 0, ...dcd, 6, 1, 2];
    entry = box('mp4a', [0, 0, 0, 0, 0, 0], u16(1), u32(0), u32(0), u16(o.ch), u16(16), u16(0), u16(0), u32(o.sr << 16), full('esds', 0, 0, esd));
  }
  const stsd = full('stsd', 0, 0, u32(1), entry);
  const stts = full('stts', 0, 0, u32(1), u32(o.sizes.length), u32(o.delta));
  const stsc = full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1));
  const szs = []; for (const s of o.sizes) szs.push(...u32(s));
  const stsz = full('stsz', 0, 0, u32(0), u32(o.sizes.length), szs);
  const offs = []; for (const f of o.offsets) offs.push(...u64(f));
  const co64 = full('co64', 0, 0, u32(o.offsets.length), offs);
  const parts = [stsd, stts];
  if (o.keys) { const k = []; o.keys.forEach(n => k.push(...u32(n))); parts.push(full('stss', 0, 0, u32(o.keys.length), k)); }
  parts.push(stsc, stsz, co64);
  return box('trak', tkhd, box('mdia', mdhd, hdlr, box('minf', xmhd, dinf, box('stbl', ...parts))));
}
function mux(v, a, W, H, durSec) {
  const ftyp = box('ftyp', str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41'));
  let total = 0; for (const c of v.chunks) total += c.byteLength; for (const c of a.chunks) total += c.byteLength;
  const mdatHead = u8([...u32(1), ...str('mdat'), ...u64(total + 16)]);
  let off = ftyp.length + 16; const vOff = [], aOff = [];
  for (const c of v.chunks) { vOff.push(off); off += c.byteLength; }
  for (const c of a.chunks) { aOff.push(off); off += c.byteLength; }
  const durMs = Math.round(durSec * 1000);
  const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(durMs), u32(0x00010000), u16(0x0100), u16(0), u32(0), u32(0), MAT, new Array(24).fill(0), u32(3));
  const tv = trak({ id: 1, video: true, w: W, h: H, ts: 90000, dur: v.chunks.length * 3000, durMovie: durMs, delta: 3000, desc: v.desc, sizes: v.chunks.map(c => c.byteLength), offsets: vOff, keys: v.keys });
  const ta = trak({ id: 2, video: false, ts: 48000, sr: 48000, ch: a.ch, dur: a.chunks.length * 1024, durMovie: durMs, delta: 1024, desc: a.desc, sizes: a.chunks.map(c => c.byteLength), offsets: aOff });
  const moov = box('moov', mvhd, tv, ta);
  return new Blob([ftyp, mdatHead, ...v.chunks, ...a.chunks, moov], { type: 'video/mp4' });
}
const yieldNow = () => new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
async function mixAudio(EP, starts, TOTAL) {
  const SR = 48000, N = Math.ceil(TOTAL * SR), OC = new OfflineAudioContext(1, N, SR);
  const beat = 60 / 92, NL = Math.ceil(beat * 64 * SR), loop = OC.createBuffer(1, NL, SR), o = loop.getChannelData(0);
  const note = (f, st, dur, amp) => { const i0 = Math.floor(st * SR), n = Math.floor(dur * SR); for (let k = 0; k < n; k++) { const j = (i0 + k) % NL, x = k / SR, env = Math.min(1, x / 0.02) * Math.exp(-x * 2.0); o[j] += (Math.sin(2 * Math.PI * f * x) + 0.25 * Math.sin(6 * Math.PI * f * x)) * env * amp; } };
  const chd = [[196, 246.9, 293.7], [164.8, 207.7, 246.9], [174.6, 220, 261.6], [196, 246.9, 293.7]], mel = [587.3, 659.3, 784, 659.3, 587.3, 493.9, 440, 493.9, 523.3, 587.3, 659.3, 587.3];
  for (let b = 0, k = 0; b < 64; b++) { const c = chd[Math.floor(b / 4) % 4]; if (b % 4 == 0) note(c[0] / 2, b * beat, beat * 3, 0.10); note(c[b % 3], b * beat, beat, 0.04); if (b % 2 == 1 && (b < 24 || b > 40)) { note(mel[k % mel.length], b * beat, beat * 0.9, 0.028); k++; } }
  let mx = 0; for (let i = 0; i < NL; i++) mx = Math.max(mx, Math.abs(o[i])); for (let i = 0; i < NL; i++) o[i] = o[i] / mx * 0.5;
  const ding = OC.createBuffer(1, SR, SR), dd = ding.getChannelData(0); for (let k = 0; k < SR; k++) { const x = k / SR; dd[k] = (Math.sin(2 * Math.PI * 1046.5 * x) * 0.6 + Math.sin(2 * Math.PI * 1568 * x) * 0.4) * Math.exp(-x * 5) * 0.25; }
  const bg = OC.createBufferSource(); bg.buffer = loop; bg.loop = true; const g = OC.createGain(); g.gain.setValueAtTime(0.16, 0); g.gain.setValueAtTime(0.16, TOTAL - 2.5); g.gain.linearRampToValueAtTime(0, TOTAL); bg.connect(g).connect(OC.destination); bg.start(0);
  CS.BUFS.forEach((b, i) => { const s = OC.createBufferSource(); s.buffer = b; s.connect(OC.destination); s.start(starts[i]); if (EP.lines[i][2] === 'chapter') { const d = OC.createBufferSource(); d.buffer = ding; d.connect(OC.destination); d.start(Math.max(0, starts[i] - 0.1)); } });
  return OC.startRendering();
}
CS.encode = async (EP, opt = {}) => {
  const W = CS.CV.width, H = CS.CV.height, FPS = 30;
  CS.ENC = { state: 'audio', k: 0, total: 0 };
  try {
    const PAD = 0.6, GAP = 0.7, starts = [], durs = []; let tt = PAD;
    CS.BUFS.forEach((b, i) => { const extra = EP.lines[i][2] === 'chapter' ? 1.2 : 0; starts.push(tt); durs.push(b.duration + GAP + extra); tt += b.duration + GAP + extra; });
    CS.STARTS = starts; const TOTAL = tt + 2.0;
    const mixed = await mixAudio(EP, starts, TOTAL);
    // audio encode
    const aChunks = []; let aDesc = null;
    const ae = new AudioEncoder({ output: (c, m) => { if (m && m.decoderConfig && m.decoderConfig.description && !aDesc) aDesc = u8(m.decoderConfig.description); const b = new Uint8Array(c.byteLength); c.copyTo(b); aChunks.push(b); }, error: e => { CS.ENC.err = 'a ' + e.message; } });
    ae.configure({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 1, bitrate: 160000 });
    const pcm = mixed.getChannelData(0), STEP = 48000;
    for (let i = 0; i < pcm.length; i += STEP) { const n = Math.min(STEP, pcm.length - i); const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 1, timestamp: Math.round(i / 48 * 1000), data: pcm.slice(i, i + n) }); ae.encode(ad); ad.close(); }
    await ae.flush(); ae.close();
    // video encode
    const vChunks = [], keys = []; let vDesc = null, lastTs = -1, order = true;
    const ve = new VideoEncoder({ output: (c, m) => { if (m && m.decoderConfig && m.decoderConfig.description && !vDesc) vDesc = u8(m.decoderConfig.description); const b = new Uint8Array(c.byteLength); c.copyTo(b); vChunks.push(b); if (c.type === 'key') keys.push(vChunks.length); if (c.timestamp < lastTs) order = false; lastTs = c.timestamp; }, error: e => { CS.ENC.err = 'v ' + e.message; } });
    ve.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: opt.bitrate || 5000000, framerate: FPS, avc: { format: 'avc' }, latencyMode: 'quality' });
    const NF = Math.round(TOTAL * FPS), ctx = CS.CV.getContext('2d');
    CS.ENC.state = 'video'; CS.ENC.total = NF;
    let i = 0;
    for (let k = 0; k < NF; k++) {
      if (CS.ENC.stop) throw new Error('stopped');
      const t = k / FPS; while (i + 1 < starts.length && t >= starts[i + 1] - 0.1) i++;
      CS.REC_T = t; CS.drawFrame(EP, ctx, i, Math.max(0, t - starts[i]), durs[i]);
      const vf = new VideoFrame(CS.CV, { timestamp: Math.round(t * 1e6), duration: Math.round(1e6 / FPS) });
      ve.encode(vf, { keyFrame: k % (FPS * 2) === 0 }); vf.close();
      CS.ENC.k = k + 1;
      while (ve.encodeQueueSize > 3) await yieldNow();
      if (k % 15 === 0) await yieldNow();
    }
    await ve.flush(); ve.close();
    if (CS.ENC.err) throw new Error(CS.ENC.err);
    if (!order) throw new Error('B-frames: out of order timestamps');
    CS.ENC.state = 'mux';
    CS.OUT = mux({ chunks: vChunks, desc: vDesc, keys }, { chunks: aChunks, desc: aDesc, ch: 1 }, W, H, TOTAL);
    CS.ENC.state = 'done'; CS.ENC.mb = Math.round(CS.OUT.size / 1e6); CS.ENC.sec = TOTAL;
    return CS.ENC;
  } catch (e) { CS.ENC.state = 'error'; CS.ENC.err = String(e && e.message || e); return CS.ENC; }
};
})();
