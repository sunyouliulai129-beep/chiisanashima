// ちいさな島から世界へ — YouTube登録者数の節目イベント（終わりなし）
// 節目：20, 30, 50, 70, 100, 150, 200, 300, 500, 700, 1000, 1500, … と、ずっと続く。
// 使い方：CSEvents.list(上限) / CSEvents.next(いまの登録者数) / CSEvents.upcoming(いまの登録者数, 件数)
(function () {
  const FIXED = {
    50: '初めてのお祭り',
    100: '島の名前をコメントで決める',
    500: '嵐がくる → みんなで建て直して村になる',
    1000: '港が完成して船が来る',
    5000: '旗と名前を決めて国になる',
    10000: '新しい大陸を発見して世界編へ',
    100000: '空にうかぶ島を発見',
    1000000: '世界一周の船出',
  };
  const POOL = [
    '旅人が流れ着く', '森の奥で遺跡を発見', '雪山の頂上に旗を立てる', '砂漠でオアシスを発見', '湖に船を浮かべる',
    '花火大会', '市場がひらく', 'クジラがやってくる', '灯台ができる', '温泉がわく', '流れ星の夜', '島の運動会',
    '洞くつ探検', '大きな橋をかける', '新しい島を発見', '島の音楽祭', '空に気球を飛ばす', '宝の地図が見つかる',
    '火山が目をさます', '島の学校ができる', 'となりの島と交流', 'お城を建てる', 'オーロラが見える', '島の博物館ができる',
  ];
  const M = [1, 1.5, 2, 3, 5, 7];
  function at(i) { // i = 0 → 20
    const j = i + 2, k = Math.floor(j / M.length) + 1, m = M[j % M.length];
    return Math.round(m * Math.pow(10, k));
  }
  function name(i) {
    const v = at(i);
    if (FIXED[v]) return FIXED[v];
    const k = Math.round(Math.log10(v));
    if (Math.pow(10, k) === v && v > 1000000) return '新しい世界 その' + (k - 6);
    return POOL[i % POOL.length];
  }
  const api = {
    list(max) { const out = []; for (let i = 0; at(i) <= max; i++) out.push({ at: at(i), name: name(i) }); return out; },
    next(n) { for (let i = 0; ; i++) if (at(i) > n) return { at: at(i), name: name(i), index: i }; },
    upcoming(n, count = 5) { const s = api.next(n).index, out = []; for (let i = s; i < s + count; i++) out.push({ at: at(i), name: name(i) }); return out; },
    passed(from, to) { const out = []; for (let i = 0; at(i) <= to; i++) if (at(i) > from) out.push({ at: at(i), name: name(i) }); return out; },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.CSEvents = api;
})();
