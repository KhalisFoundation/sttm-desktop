// Shabad-level evidence for the panel: which pangtis of each possible new Shabad have been
// heard, and how far the Shabad has built up toward a switch. Display only: it never feeds a
// lock or a switch.
//
// This is a small adapter in the shape of the V6 Shabad-level evidence (fix 1 V6, SHEV_* in
// VoiceFollow.jsx on vf-fix1-v6 / kir-find-1): each distinct pangti heard adds to its
// Shabad's total, a repeat of one already heard adds less, a pangti matched for another
// Shabad scales the rest down a little, and totals fade slowly (tens of seconds) instead of
// vanishing. On 9.0.4 it is fed from what the switch judge scores every decode (the
// challenger, its best-matching pangti and its match score); once the real V6 store is in the
// build, `snapshot` can read that store instead and the panel stays the same.
//
// A pangti counts as heard CLEARLY when that decode would win for the judge (match >= winMin
// and ahead of the Shabad on screen by winMargin); WEAKLY when it matches >= weakMin. Time is
// whatever `now` the caller passes (ms), so it is deterministic in replay.

const DEFAULTS = {
  winMin: 0.65, // VoiceFollow.jsx SWITCH_ACOUSTIC_MIN
  winMargin: 0.15, // VoiceFollow.jsx SWITCH_ACOUSTIC_MARGIN
  weakMin: 0.5, // a weaker match still shows as a half chip
  faintAdd: 0.3, // any other pangti the judge scored for it: listed at once (a preview), no chip
  clearAdd: 1, // a new pangti heard clearly (V6: 1)
  weakAdd: 0.4, // a new pangti heard weakly
  repeat: 0.3, // the same pangti again (V6 SHEV_REPEAT), scaled by strength
  maxPer: 2, // one pangti never counts for more than this (V6: 2)
  rival: 0.9, // a pangti heard clearly for another Shabad scales this one (V6 SHEV_RIVAL)
  tauMs: 30000, // totals fade with this time constant (V6: 60 decodes ~ 30 s)
  threshold: 2.3, // the switch line on each bar (V6 SHEV_SWITCH) ...
  minDistinct: 2, // ... over at least this many distinct pangtis
  floor: 0.25, // a pangti below this weight no longer counts as heard (no chip)
  keep: 0.1, // a Shabad stays listed while its total is at least this (a faint one ~30 s)
  maxChips: 8,
};

function createEvidence(params = {}) {
  const P = { ...DEFAULTS, ...params };
  let store = new Map(); // shabadId -> Map(key -> { w, at, line, clear, first })
  let order = 0;

  const fade = (e, now) => e.w * Math.exp(-Math.max(0, now - e.at) / P.tauMs);

  function reset() {
    store = new Map();
  }

  function prune(now) {
    store.forEach((lines, sid) => {
      lines.forEach((e, k) => {
        if (fade(e, now) < P.keep / 2) lines.delete(k);
      });
      if (!lines.size) store.delete(sid);
    });
  }

  // One decode while following: every challenger the judge scored, with its best-matching
  // pangti ({ shabadId, verseId?, line, score }), and the Shabad on screen's own score.
  function add({ now, cur = null, sCur = 0, cands = [] }) {
    const heardFor = new Set();
    cands.forEach((c) => {
      if (c.shabadId == null || c.shabadId === cur) return;
      const s = c.score || 0;
      if (!(s > 0)) return;
      const clear = s >= P.winMin && s - sCur >= P.winMargin;
      const weak = !clear && s >= P.weakMin;
      const key = c.verseId != null ? `v${c.verseId}` : `l${(c.line || '').trim()}`;
      if (key === 'l') return;
      let lines = store.get(c.shabadId);
      if (!lines) {
        lines = new Map();
        store.set(c.shabadId, lines);
      }
      const old = lines.get(key);
      let gain = P.faintAdd;
      if (clear) gain = P.clearAdd;
      else if (weak) gain = P.weakAdd;
      const strength = gain / P.clearAdd;
      const base = old ? fade(old, now) : 0;
      let plus = gain;
      if (old) plus = P.repeat * strength;
      lines.set(key, {
        w: Math.min(P.maxPer, base + plus),
        at: now,
        line: c.line || (old && old.line) || '',
        clear: clear || !!(old && old.clear && fade(old, now) >= 0.5),
        weak: weak || !!(old && old.weak),
        first: old ? old.first : (order += 1),
      });
      if (clear) heardFor.add(c.shabadId);
    });
    // A pangti heard clearly for one Shabad makes the others a little less likely.
    if (heardFor.size)
      store.forEach((lines, sid) => {
        if (heardFor.has(sid)) return;
        lines.forEach((e) => {
          e.w = fade(e, now) * P.rival; // eslint-disable-line no-param-reassign
          e.at = now; // eslint-disable-line no-param-reassign
        });
      });
    prune(now);
  }

  // A Shabad was put on screen: its evidence has done its job.
  function drop(id) {
    store.delete(id);
  }

  function of(id, now) {
    const lines = store.get(id);
    if (!lines) return null;
    let total = 0;
    const pangtis = [];
    lines.forEach((e, key) => {
      const w = fade(e, now);
      total += w;
      if (w >= P.floor)
        pangtis.push({
          key,
          line: e.line,
          clear: e.clear,
          faint: !e.clear && !e.weak,
          w: Math.round(w * 100) / 100,
          first: e.first,
        });
    });
    pangtis.sort((a, b) => a.first - b.first);
    const distinct = pangtis.length;
    // Fill of the bar toward the switch line (1 = at the line). Short of two distinct pangtis
    // the line cannot be crossed, however often one pangti repeats.
    let fill = total / P.threshold;
    if (distinct < P.minDistinct) fill = Math.min(fill, 0.95);
    return {
      total: Math.round(total * 100) / 100,
      distinct,
      fill: Math.max(0, fill),
      pangtis: pangtis.slice(-P.maxChips),
      more: Math.max(0, pangtis.length - P.maxChips),
    };
  }

  // Every Shabad with evidence still above the floor, strongest first.
  function snapshot(now) {
    const out = [];
    store.forEach((_, id) => {
      const ev = of(id, now);
      if (ev && ev.total >= P.keep) out.push({ shabadId: id, ev });
    });
    return out.sort((a, b) => b.ev.total - a.ev.total);
  }

  return { add, drop, of, snapshot, reset, params: P };
}

module.exports = { createEvidence, DEFAULTS };
