// How close a possible new Shabad is to being put on screen, read off the very values the switch
// routes decide on. Display only: nothing here feeds a lock or a switch.
//
// Three routes can change the Shabad while following (VoiceFollow.jsx):
//   - the acoustic judge: `wins` winning decodes in a row out of `needed` (SWITCH_CONFIRM);
//   - Pankti Cumulation (switch): a per-Shabad store of heard pangtis (panktiCumulation.js), ready
//     at `lock` total weight over `distinct` pangtis while `lead` times any other Shabad;
//   - fragment confirm: a per-Shabad store of short pieces (fragmentConfirm.js), ready at `lock`
//     total over `distinctChange` / `distinctList` pangtis by the card's place on the panel.
// Each route's gauge is the weakest of its own conditions (a route is ready only when every one
// of them holds), so a gauge reads 1 exactly when that route would switch on its next decode.
// A Shabad's progress is the furthest of its routes.
//
// "Switching soon": a steady flag with hysteresis, so it never flickers with one decode. It comes
// on at `soonOn` (half way) and goes off only below `soonOff`, never sooner than `soonHoldMs` after it came
// on. Time is whatever `now` the caller passes (ms), so it is deterministic in replay.

const { shabadTotal, LIVE: cumulationLive } = require('./panktiCumulation');
const { of: fragmentOf, LIVE: fragmentLive } = require('./fragmentConfirm');

const FRAG_LIVE = fragmentLive; // a pangti with at least this weight counts as heard
const PC_LIVE = cumulationLive;
const clamp01 = (x) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));

// The acoustic judge: wins so far plus how near this decode came to a win (the weaker of the
// two conditions a win needs: match >= min, and ahead of the Shabad on screen by margin). One
// strong decode (match >= 0.8, margin >= 0.3) counts two wins, so whenever a single decode could
// commit (two or fewer steps to go) the gauge sits at least at `soonFloor`: the sevadaar is
// warned before any switch the judge can make.
function acousticGauge(entry, cfg) {
  const { score = 0, wins = 0, needed = 3, sCur = 0 } = entry || {};
  const near = Math.min(
    clamp01((score - (cfg.min - 0.3)) / 0.3),
    clamp01((score - sCur) / cfg.margin),
  );
  const steps = Math.max(1, needed);
  const w = Math.min(Math.max(0, wins), steps);
  let g = clamp01((w + near) / (steps + 1));
  if (steps - w <= 2 && cfg.soonFloor > 0) g = Math.max(g, cfg.soonFloor);
  return g;
}

// A Shabad's pangtis counted toward `need` distinct ones: every pangti at or above `live` weight
// is one; the strongest pangti still below it counts for its share, so the gauge moves while a
// pangti is being built up instead of stepping once per pangti. `ok(index)` can leave a pangti
// out (a stale one).
function distinctWith(lines, live, ok = () => true) {
  let distinct = 0;
  let frac = 0;
  lines.forEach((w, i) => {
    if (!ok(i)) return;
    if (w >= live) distinct += 1;
    else frac = Math.max(frac, w / live);
  });
  return distinct + frac;
}

// Pankti Cumulation (switch): one Shabad's lines (Map verseId -> weight) against the whole store.
function cumulationGauge(store, shabadId, cfg) {
  const lines = store && store.get ? store.get(shabadId) : null;
  if (!lines || !lines.size) return 0;
  const own = shabadTotal(lines);
  let next = 0;
  store.forEach((l, sid) => {
    if (sid !== shabadId) next = Math.max(next, shabadTotal(l).total);
  });
  const parts = [own.total / cfg.lock, distinctWith(lines, PC_LIVE) / cfg.distinct];
  if (next > 0) parts.push(own.total / (cfg.lead * next));
  return clamp01(Math.min(...parts));
}

// Fragment confirm: one Shabad's pieces (Map lineIndex -> weight); `role` is where the card sits
// ('change' = the Changing-to card or a Shabad the search nominated, else the list), which sets how
// many pangtis it needs. The confirm also wants those pangtis heard recently: with `hitAt` (Map
// lineIndex -> ms) and `now`, a pangti counts only when hit within `freshMs`. `gated` (a confirm
// too soon after the last one, or in the cool-down after a change) holds the gauge just under 1.
function fragmentGauge(store, shabadId, role, cfg, opts = {}) {
  const lines = store && store.get ? store.get(shabadId) : null;
  if (!lines || !lines.size) return 0;
  const { total } = fragmentOf(store, shabadId);
  if (!(total > 0)) return 0;
  const fresh = (i) => {
    if (!(opts.hitAt && opts.freshMs > 0)) return true;
    const at = opts.hitAt.get(i);
    return at != null && at >= opts.now - opts.freshMs;
  };
  const need = role === 'change' ? cfg.distinctChange : cfg.distinctList;
  const g = clamp01(Math.min(total / cfg.lock, distinctWith(lines, FRAG_LIVE, fresh) / need));
  return opts.gated ? Math.min(g, 0.95) : g;
}

// All routes for one Shabad. Returns { prog, route } with route = the furthest one
// ('judge' | 'pangtis' | 'pieces' | null when nothing has started).
function gauge({ acoustic = null, cumulation = 0, fragment = 0 }, cfg) {
  const judge = acoustic ? acousticGauge(acoustic, cfg.acoustic) : 0;
  // The two stores switch only inside the hit that completes them, so a store that already
  // looks ready is "waiting for the next heard piece": shown just under full. A full bar is the
  // judge's alone, whose next decode commits.
  const best = Math.max(judge, Math.min(cumulation, 0.95), Math.min(fragment, 0.95));
  let route = null;
  if (best > 0) {
    if (best === judge) route = 'judge';
    else if (best === Math.min(cumulation, 0.95)) route = 'pangtis';
    else route = 'pieces';
  }
  return { prog: best, route };
}

const SOON_DEFAULTS = { soonOn: 0.5, soonOff: 0.3, soonHoldMs: 1500 };

// Per-Shabad "switching soon" flags with hysteresis and a minimum hold.
function createSoon(params = {}) {
  const P = { ...SOON_DEFAULTS, ...params };
  let on = new Map(); // shabadId -> when it came on (ms)
  function update(shabadId, prog, now) {
    const since = on.get(shabadId);
    if (since == null) {
      if (prog >= P.soonOn) {
        on.set(shabadId, now);
        return true;
      }
      return false;
    }
    if (prog < P.soonOff && now - since >= P.soonHoldMs) {
      on.delete(shabadId);
      return false;
    }
    return true;
  }
  const drop = (shabadId) => on.delete(shabadId);
  const reset = () => {
    on = new Map();
  };
  // Forget every Shabad not in `keep` (the cards still listed).
  const prune = (keep) => {
    [...on.keys()].forEach((id) => {
      if (!keep.has(id)) on.delete(id);
    });
  };
  return { update, drop, reset, prune, params: P };
}

module.exports = {
  acousticGauge,
  cumulationGauge,
  fragmentGauge,
  gauge,
  distinctWith,
  createSoon,
  SOON_DEFAULTS,
};
