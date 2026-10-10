// The one Voice-Follow shadow score. The app runs it live on the session folder (bus.js,
// every SAVE_S) and the offline benchmark runs the same file (`node score.js <dir>`), so
// the number a tester's laptop shows and the official benchmark can never disagree.
//
// Inputs (one session folder): human.jsonl, system.jsonl, activity.jsonl, events.jsonl.
//
// Every second gets exactly one state:
//   paused - Voice-Follow paused (busy computer), mic down, or the computer asleep: not scored
//   idle   - no Gurbani on the sevadaar's screen (before the service, a slide)
//   kirtan - Gurbani on screen AND words heard within +-ACT_WIN_S: the benchmark
//   held   - Gurbani on screen, nothing heard (katha pause, silence)
//
// The sevadaar's clicks are the truth, but people click late, early, or flick through
// shabads; these rules keep human timing from being scored as system error:
//   lag      - Voice-Follow agrees if the sevadaar showed its shabad within +-LAG_S.
//   early    - Voice-Follow shows a shabad the sevadaar then opens within EARLY_S: correct.
//   linger   - after the sevadaar leaves Gurbani (slide, blank), Voice-Follow still showing
//              the shabad they had within LINGER_S is not a false alarm.
//   blip     - a human label shown under BLIP_S (a mis-click, flicking through) is ignored.
//   behind   - after the sevadaar switches, Voice-Follow still on the shabad they just
//              left (and not yet caught up) is BEHIND, not wrong: a delay, measured per
//              switch (signed: negative = it got there before the sevadaar). WRONG is
//              only a shabad the sevadaar was not on: the real failure.
//   lines    - compared within +-LINE_LAG_S, only while the sevadaar is moving lines
//              (a line change within STALE_S).
//   listen   - every stretch of LISTEN_MIN_S+ where the two disagree is listed with its
//              audio file and offset, so a person can listen and settle who was right.
/* eslint-disable no-continue */
const fs = require('fs');
const path = require('path');

const C = {
  LAG_S: 5,
  ACT_WIN_S: 5,
  LETTERS_MIN: 6, // letters recognised in a second that count as words heard
  LEVEL_MIN: 0.003, // RMS loudness that counts as sound (a quiet room is ~0.001)
  EARLY_S: 60,
  LINGER_S: 60,
  BLIP_S: 3,
  LINE_LAG_S: 3,
  LINE_AHEAD_S: 10, // a model line move counts as right if the sevadaar reaches that line this soon
  STALE_S: 60,
  MATCH_CAP_S: 180, // a human switch not followed within this is missed
  LINE_CAP_S: 30, // a sevadaar line change not followed within this is missed
  COLD_S: 15, // a human switch this soon after the session began is a cold start: the
  // session (and hidden Voice-Follow) started because of that click, so its delay is
  // start-up time, reported on its own and not as a slow switch
  LINE_HOLD_S: 3, // a line held shorter than this is a flick, not a line change
  LISTEN_MIN_S: 20,
  LISTEN_JOIN_S: 3,
  GAP_S: 5, // the live clock jumping this far means the computer slept
  // Visible use (the sevadaar drives Voice-Follow): a decision is judged by what they do next.
  VERDICT_S: 20, // a manual change this soon after a Voice-Follow decision is a correction
  ABANDON_S: 60, // Stop this soon after Start means they gave up on it
  RECOVER_S: 60, // after a correction, Voice-Follow is "back" if it moves again within this
};

function readJsonl(file) {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => {
        try {
          return l.trim() ? JSON.parse(l) : null;
        } catch (_) {
          return null; // a line cut short by a crash
        }
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function contentKey(l) {
  if (!l || l.slide) return null; // a slide (Waheguru, blank, announcement) shows no Gurbani
  if (l.bani != null) return `bani:${l.bani}`;
  if (l.ceremony != null) return `ceremony:${l.ceremony}`;
  if (l.shabadId != null) return `shabad:${l.shabadId}`;
  return null;
}

// How good Voice-Follow was while the sevadaar was using it (visible mode). There is no
// human timeline to score against then, so every decision Voice-Follow made (a screen change
// it drove) gets a verdict from what the sevadaar did next:
//   accepted       - no manual change for VERDICT_S
//   corrected      - the sevadaar moved to a different Shabad within VERDICT_S (the failure)
//   lineCorrected  - same Shabad, a different line, within VERDICT_S
// Plus: picked (a candidate tapped in the panel: right but slow), abandoned (Stop within
// ABANDON_S of Start), time to the first lock after each Start, recovery after each
// correction, and the one-tap rating given at Stop.
function visibleUse(humanEv, events) {
  const ev = [...events].sort((a, b) => (a.t || 0) - (b.t || 0));
  const stretches = [];
  let from = null;
  ev.forEach((e) => {
    if (e.type === 'vf_visible' && from == null) from = e.t;
    if (e.type === 'vf_hidden' && from != null) {
      stretches.push([from, e.t]);
      from = null;
    }
  });
  if (from != null) stretches.push([from, Infinity]);
  const inVisible = (t) => stretches.some(([a, b]) => t >= a && t <= b);
  const human = [...humanEv].sort((a, b) => (a.t || 0) - (b.t || 0));
  const verseOf = (l) => (l && l.verseId != null ? l.verseId : null);
  const decisions = [];
  const corrections = [];
  human.forEach((h, i) => {
    if (h.override !== false || !inVisible(h.t)) return; // only Voice-Follow's own changes
    let verdict = 'accepted';
    for (let j = i + 1; j < human.length; j += 1) {
      const n = human[j];
      if (n.t - h.t > C.VERDICT_S) break;
      if (n.override === true) {
        const sameShabad = contentKey(n) === contentKey(h);
        verdict = sameShabad && verseOf(n) !== verseOf(h) ? 'lineCorrected' : 'corrected';
        if (verdict === 'corrected') {
          // recovery: Voice-Follow moving again on its own after the correction
          const next = human.slice(j + 1).find((x) => x.override === false);
          corrections.push({
            t: Math.round(n.t * 10) / 10,
            from: contentKey(h),
            to: contentKey(n),
            delayS: Math.round((n.t - h.t) * 10) / 10,
            recoveredS:
              next && next.t - n.t <= C.RECOVER_S ? Math.round((next.t - n.t) * 10) / 10 : null,
          });
        }
        break;
      }
      if (n.override === false) break; // Voice-Follow moved on first: this one stood
    }
    decisions.push({ t: Math.round(h.t * 10) / 10, key: contentKey(h), verdict });
  });
  const count = (v) => decisions.filter((d) => d.verdict === v).length;
  const timeToLockS = stretches.map(([a, b]) => {
    const first = human.find((h) => h.override === false && h.t >= a && h.t <= b);
    return first ? Math.round((first.t - a) * 10) / 10 : null;
  });
  const abandoned = stretches.filter(([a, b]) => b !== Infinity && b - a < C.ABANDON_S).length;
  const picked = ev.filter((e) => e.type === 'vf_pick').length;
  const ratings = ev.filter((e) => e.type === 'rating');
  const rating = ratings.length ? ratings[ratings.length - 1].value : null;
  const accepted = count('accepted');
  const corrected = count('corrected');
  return {
    stretches: stretches.length,
    decisions: decisions.length,
    accepted,
    corrected,
    lineCorrected: count('lineCorrected'),
    acceptedPct:
      accepted + corrected ? Math.round((100 * accepted) / (accepted + corrected)) : null,
    picked,
    abandoned,
    timeToLockS,
    corrections,
    rating,
  };
}

// Step function: the label in force at each whole second. System updates are partial.
function perSecond(evs, length, merge) {
  const out = [];
  const sorted = [...evs].sort((a, b) => (a.t || 0) - (b.t || 0));
  let cur = {};
  let j = 0;
  for (let s = 0; s < length; s += 1) {
    while (j < sorted.length && (sorted[j].t || 0) <= s + 0.999) {
      const { t, ...e } = sorted[j];
      if (merge) {
        cur = { ...cur, ...e };
        if (e.shabadId != null) cur.slide = null;
      } else cur = e;
      j += 1;
    }
    out.push(cur);
  }
  return out;
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// fixes: human-checked corrections [{ from, to, truth }] (seconds; truth is a content key,
// 'unknown' when the sevadaar was wrong but the right shabad is not known, or null for no
// Gurbani). They replace the sevadaar's label for those seconds; lines there are not scored.
function scoreTimelines({ human: humanEv, system: systemEv, activity, events, fixes = [] }) {
  const ends = [...humanEv, ...systemEv, ...activity, ...events].map((e) => e.t || 0);
  const length = ends.length ? Math.floor(Math.max(...ends)) + 1 : 0;
  const human = perSecond(humanEv, length, false);
  const system = perSecond(systemEv, length, true);

  // blip: a human label run shorter than BLIP_S takes the label before it.
  let hkey = human.map(contentKey);
  for (let i = 1; i < length;) {
    let j = i;
    while (j < length && hkey[j] === hkey[i]) j += 1;
    if (hkey[i] !== hkey[i - 1] && j - i < C.BLIP_S && j < length) {
      for (let k = i; k < j; k += 1) human[k] = human[i - 1];
    }
    i = j;
  }
  hkey = human.map(contentKey);
  const skey = system.map(contentKey);
  const hverse = human.map((h, i) => (hkey[i] && h.verseId !== '' ? (h.verseId ?? null) : null));
  const sverse = system.map((s, i) => (skey[i] ? (s.verseId ?? null) : null));
  fixes.forEach((f) => {
    for (let k = Math.max(0, f.from); k < Math.min(length, f.to); k += 1) {
      hkey[k] = f.truth;
      hverse[k] = null;
    }
  });
  // A Bani and a shabad showing the same verse are the same Gurbani on screen (Voice-Follow
  // opens Rehras/Sohila/Japji from a shabad read in order; a sevadaar may do the reverse).
  // Such seconds count as agreement on the sevadaar's label, and are counted on their own
  // (baniSameVerse) so the data shows how often the framing differs.
  let baniSameVerse = 0;
  for (let i = 0; i < length; i += 1) {
    const k = skey[i];
    const h = hkey[i];
    if (!k || !h || k === h || sverse[i] == null) continue;
    const kinds = (k.startsWith('bani:') ? 1 : 0) + (h.startsWith('bani:') ? 1 : 0);
    if (kinds !== 1) continue;
    let same = false;
    for (let m = Math.max(0, i - C.LAG_S); m <= Math.min(length - 1, i + C.LAG_S) && !same; m += 1)
      if (hkey[m] === h && hverse[m] === sverse[i]) same = true;
    if (same) {
      skey[i] = h;
      baniSameVerse += 1;
    }
  }

  const level = new Array(length).fill(0);
  const letters = new Array(length).fill(0);
  activity.forEach((a) => {
    const t = Math.floor(a.t || 0);
    if (t >= 0 && t < length) {
      level[t] = Math.max(level[t], a.level || 0);
      letters[t] = Math.max(letters[t], a.letters || 0);
    }
  });
  const haveActivity = activity.length > 0;

  // paused: busy computer (paused..resumed), mic down (mic_error..mic_restarted), asleep (gap).
  const paused = new Array(length).fill(false);
  const vfDown = new Array(length).fill(false); // hidden Voice-Follow could not run
  const visible = new Array(length).fill(false); // the sevadaar was driving Voice-Follow
  const mark = (from, to, arr = paused) => {
    const a = arr;
    for (let k = Math.max(0, Math.floor(from)); k < Math.min(length, Math.ceil(to)); k += 1)
      a[k] = true;
  };
  let busyFrom = null;
  let micFrom = null;
  let downFrom = null;
  let visFrom = null;
  [...events]
    .sort((a, b) => (a.t || 0) - (b.t || 0))
    .forEach((e) => {
      if (e.type === 'paused' && busyFrom == null) busyFrom = e.t;
      if (e.type === 'resumed' && busyFrom != null) {
        mark(busyFrom, e.t);
        busyFrom = null;
      }
      if (e.type === 'mic_error' && micFrom == null) micFrom = e.t;
      if ((e.type === 'mic_restarted' || e.type === 'audio_segment') && micFrom != null) {
        mark(micFrom, e.t);
        micFrom = null;
      }
      if (e.type === 'gap') mark(e.from, e.t);
      if (e.type === 'vf_down' && downFrom == null) downFrom = e.t;
      if (e.type === 'vf_up' && downFrom != null) {
        mark(downFrom, e.t, vfDown);
        downFrom = null;
      }
      if (e.type === 'vf_visible' && visFrom == null) visFrom = e.t;
      if (e.type === 'vf_hidden' && visFrom != null) {
        mark(visFrom, e.t, visible);
        visFrom = null;
      }
    });
  if (visFrom != null) mark(visFrom, length, visible);
  if (busyFrom != null) mark(busyFrom, length);
  if (micFrom != null) mark(micFrom, length);
  if (downFrom != null) mark(downFrom, length, vfDown);
  for (let k = 0; k < length; k += 1) if (vfDown[k] || visible[k]) paused[k] = true;

  const heard = (i) => {
    if (!haveActivity) return true;
    for (let k = Math.max(0, i - C.ACT_WIN_S); k <= Math.min(length - 1, i + C.ACT_WIN_S); k += 1)
      if (letters[k] >= C.LETTERS_MIN && level[k] >= C.LEVEL_MIN) return true;
    return false;
  };
  const states = hkey.map((k, i) => {
    if (paused[i]) return 'paused';
    if (!k) return 'idle';
    return heard(i) ? 'kirtan' : 'held';
  });
  const humanHas = (key, from, to) => {
    for (let k = Math.max(0, from); k <= Math.min(length - 1, to); k += 1)
      if (hkey[k] === key) return true;
    return false;
  };

  // Human switches to new Gurbani; what they left; whether Voice-Follow has caught up.
  // A switch is new Gurbani, not a return to the same shabad after a slide.
  const switchesAt = [];
  const leftKey = new Array(length).fill(null); // the Gurbani before the latest switch
  const caughtUp = new Array(length).fill(true); // Voice-Follow reached it since then
  const lastLine = new Array(length).fill(-1e9);
  let left = null;
  let shown = null; // last Gurbani the sevadaar had on screen
  let caught = true;
  let ln = -1e9;
  for (let i = 0; i < length; i += 1) {
    if (hkey[i] && hkey[i] !== 'unknown' && hkey[i] !== shown) {
      switchesAt.push(i);
      left = shown;
      shown = hkey[i];
      caught = false;
    }
    if (skey[i] && skey[i] === shown) caught = true;
    if (i === 0 || hkey[i] !== hkey[i - 1] || hverse[i] !== hverse[i - 1]) ln = i;
    leftKey[i] = left;
    caughtUp[i] = caught;
    lastLine[i] = ln;
  }

  const sc = {
    seconds: length,
    vfDown: vfDown.filter(Boolean).length, // part of paused: Voice-Follow not running
    visible: visible.filter(Boolean).length, // part of paused: the sevadaar drove Voice-Follow
    overrides: humanEv.filter((h) => h.override).length, // sevadaar corrections in visible mode
    visibleUse: visibleUse(humanEv, events), // how it did while the sevadaar used it
    kirtan: 0,
    held: 0,
    idle: 0,
    paused: 0,
    agree: 0,
    early: 0,
    wrong: 0,
    behind: 0,
    none: 0,
    heldAgree: 0,
    heldBehind: 0,
    heldWrong: 0,
    heldNone: 0,
    idleQuiet: 0,
    idleEarly: 0,
    linger: 0,
    falseAlarm: 0,
    lineSeconds: 0,
    lineAgree: 0,
    switches: 0,
    switchesCut: 0, // human switches whose follow-up a pause cut short (not scored)
    switchesCold: 0, // the session's opening switch (see COLD_S)
    coldDelays: [], // seconds the model needed to show the opening shabad
    matched: 0,
    switchDelays: [],
    lineChanges: 0, // sevadaar line changes on a shabad Voice-Follow was also showing
    lineFound: 0, // ...that Voice-Follow reached within LINE_CAP_S
    lineDelays: [], // seconds from each such change to Voice-Follow on that line
    modelSwitches: 0, // shabad changes Voice-Follow made
    modelSwitchesRight: 0, // ...to a shabad the sevadaar had (within LAG_S) or opened (within EARLY_S)
    modelLineMoves: 0, // line moves Voice-Follow made within a shabad the sevadaar was also on
    modelLineMovesRight: 0, // ...to a line the sevadaar had (LINE_LAG_S before) or reached (LINE_AHEAD_S)
    baniSameVerse, // seconds a Bani and a shabad showed the same verse (scored as agreement)
  };
  const outcome = new Array(length).fill(null);
  for (let i = 0; i < length; i += 1) {
    const st = states[i];
    sc[st] += 1;
    if (st === 'paused') continue;
    const k = skey[i];
    if (st === 'idle') {
      let o = 'idleQuiet';
      if (k && humanHas(k, i - C.LINGER_S, i)) o = 'linger';
      else if (k && humanHas(k, i, i + C.EARLY_S)) o = 'idleEarly';
      else if (k) o = 'falseAlarm';
      sc[o] += 1;
      outcome[i] = o;
      continue;
    }
    let o;
    if (!k) o = 'none';
    else if (humanHas(k, i - C.LAG_S, i + C.LAG_S)) o = 'agree';
    else if (humanHas(k, i + 1, i + C.EARLY_S)) o = 'early';
    else if (k === leftKey[i] && !caughtUp[i]) o = 'behind';
    else o = 'wrong';
    outcome[i] = o;
    if (st === 'held') {
      sc[o === 'early' ? 'heldAgree' : `held${o[0].toUpperCase()}${o.slice(1)}`] += 1;
      continue;
    }
    sc[o] += 1;
    // Lines: only on agreed seconds while the sevadaar is moving lines.
    if (o === 'agree' && hverse[i] != null && i - lastLine[i] <= C.STALE_S) {
      sc.lineSeconds += 1;
      const lo = Math.max(0, i - C.LINE_LAG_S);
      const hi = Math.min(length - 1, i + C.LINE_LAG_S);
      const hv = new Set();
      for (let m = lo; m <= hi; m += 1) if (hkey[m] === k && hverse[m] != null) hv.add(hverse[m]);
      let ok = false;
      for (let m = lo; m <= hi && !ok; m += 1) if (skey[m] === k && hv.has(sverse[m])) ok = true;
      if (ok) sc.lineAgree += 1;
    }
  }

  // Signed delay per switch made while words were heard: system arrival minus human click.
  const switches = [];
  switchesAt.forEach((i) => {
    if (states[i] !== 'kirtan') return;
    const key = hkey[i];
    let at = null;
    let cut = false; // paused before Voice-Follow got there: not scorable either way
    if (skey[i] === key) {
      at = i;
      while (at > 0 && at > i - C.EARLY_S && skey[at - 1] === key) at -= 1;
    } else {
      for (let m = i + 1; m < Math.min(length, i + C.MATCH_CAP_S); m += 1) {
        if (paused[m]) {
          cut = true;
          break;
        }
        if (skey[m] === key) {
          at = m;
          break;
        }
      }
    }
    if (cut) {
      sc.switchesCut += 1;
      return;
    }
    if (i < C.COLD_S && sc.switchesCold === 0 && sc.switches === 0) {
      sc.switchesCold += 1;
      if (at != null) sc.coldDelays.push(at - i);
      return;
    }
    sc.switches += 1;
    const row = { t: i, at: mmss(i), human: key, delay: at == null ? null : at - i };
    switches.push(row);
    if (at != null) {
      sc.matched += 1;
      sc.switchDelays.push(at - i);
    }
  });
  sc.switchDelays.sort((a, b) => a - b);

  // Line delay: each sevadaar line change (same shabad, held LINE_HOLD_S+, while singing)
  // on a shabad Voice-Follow is also showing; signed, negative = Voice-Follow was first.
  for (let i = 1; i < length; i += 1) {
    const key = hkey[i];
    const v = hverse[i];
    if (!key || v == null || hkey[i - 1] !== key || hverse[i - 1] === v) continue;
    if (states[i] !== 'kirtan' || skey[i] !== key) continue;
    let held = 0;
    while (i + held < length && hkey[i + held] === key && hverse[i + held] === v) held += 1;
    if (held < C.LINE_HOLD_S) continue;
    sc.lineChanges += 1;
    let at = null;
    if (sverse[i] === v) {
      at = i;
      while (at > 0 && at > i - C.LINE_LAG_S && skey[at - 1] === key && sverse[at - 1] === v)
        at -= 1;
    } else {
      for (let m = i + 1; m < Math.min(length, i + C.LINE_CAP_S); m += 1) {
        if (skey[m] === key && sverse[m] === v) {
          at = m;
          break;
        }
      }
    }
    if (at != null) {
      sc.lineFound += 1;
      sc.lineDelays.push(at - i);
    }
  }
  sc.lineDelays.sort((a, b) => a - b);

  // Steadiness: every change Voice-Follow itself made, and whether it was a right one.
  // Catches flicker and jumping to wrong shabads/lines, which time-based scores can hide.
  for (let i = 1; i < length; i += 1) {
    if (paused[i]) continue;
    const k = skey[i];
    if (k && k !== skey[i - 1]) {
      sc.modelSwitches += 1;
      if (humanHas(k, i - C.LAG_S, i + C.EARLY_S)) sc.modelSwitchesRight += 1;
    } else if (k && k === skey[i - 1] && sverse[i] != null && sverse[i] !== sverse[i - 1]) {
      if (states[i] !== 'kirtan' || hkey[i] !== k) continue;
      sc.modelLineMoves += 1;
      for (
        let m = Math.max(0, i - C.LINE_LAG_S);
        m <= Math.min(length - 1, i + C.LINE_AHEAD_S);
        m += 1
      ) {
        if (hkey[m] === k && hverse[m] === sverse[i]) {
          sc.modelLineMovesRight += 1;
          break;
        }
      }
    }
  }

  // Listen list: disagreement stretches long enough to be worth a person's ear.
  const audio = events
    .filter((e) => e.type === 'audio_segment')
    .sort((a, b) => (a.t || 0) - (b.t || 0));
  const audioAt = (t) => {
    let seg = null;
    audio.forEach((a) => {
      if ((a.t || 0) <= t) seg = a;
    });
    return seg ? { file: seg.file, offset: mmss(t - (seg.t || 0)) } : null;
  };
  const bad = (o) => o === 'wrong' || o === 'none' || o === 'behind' || o === 'falseAlarm';
  const listen = [];
  for (let i = 0; i < length;) {
    if (!bad(outcome[i])) {
      i += 1;
      continue;
    }
    let j = i;
    let gap = 0;
    let end = i;
    while (j < length && gap <= C.LISTEN_JOIN_S) {
      if (bad(outcome[j])) {
        end = j;
        gap = 0;
      } else gap += 1;
      j += 1;
    }
    if (end - i + 1 >= C.LISTEN_MIN_S) {
      listen.push({
        fromS: i,
        toS: end + 1,
        from: mmss(i),
        to: mmss(end + 1),
        seconds: end - i + 1,
        kind: outcome[i],
        human: hkey[i],
        system: skey[i],
        audio: audioAt(i),
      });
    }
    i = end + 1;
  }
  // Every stretch of one outcome (for review sampling).
  const runs = [];
  for (let i = 0, s = 0; i <= length; i += 1) {
    if (i === length || outcome[i] !== outcome[s] || hkey[i] !== hkey[s] || skey[i] !== skey[s]) {
      if (i > s && outcome[s]) {
        runs.push({ fromS: s, toS: i, kind: outcome[s], human: hkey[s], system: skey[s] });
      }
      s = i;
    }
  }
  return { score: sc, switches, listen, runs, states, audioAt };
}

const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
const median = (xs) => (xs.length ? xs[Math.floor(xs.length / 2)] : null);

// The numbers people read. "right" = agree + early.
//   successPct      THE headline: of the singing time both the sevadaar and Voice-Follow
//                   had Gurbani up, the share where it was the same shabad. Confounders are
//                   left out and reported beside it: no Gurbani on screen (idle, slides),
//                   nothing heard (held), paused/asleep/mic down, and catch-up after a
//                   switch (behind/searching), which is measured as switch delay instead.
//   lineSuccessPct  the same for the line, while the sevadaar is moving lines.
//   foundPct        switches Voice-Follow reached within MATCH_CAP_S (guards successPct:
//                   a system that never commits would otherwise look perfect).
function summarize(sc) {
  const right = sc.agree + sc.early;
  const min = (x) => Math.round((x / 60) * 10) / 10;
  return {
    successPct: pct(right, right + sc.wrong),
    lineSuccessPct: pct(sc.lineAgree, sc.lineSeconds),
    foundPct: pct(sc.matched, sc.switches),
    switches: sc.switches,
    medianDelayS: median(sc.switchDelays),
    worstDelayS: sc.switchDelays.length ? sc.switchDelays[sc.switchDelays.length - 1] : null,
    scoredMin: min(right + sc.wrong),
    catchUpMin: min(sc.behind + sc.none),
    heldMin: min(sc.held),
    idleMin: min(sc.idle),
    pausedMin: min(sc.paused),
    vfDownMin: min(sc.vfDown || 0),
    falseAlarmPct: pct(sc.falseAlarm, sc.idle),
    baniSameVerseS: sc.baniSameVerse || 0,
  };
}

function scoreDir(dir, fixes = []) {
  const r = scoreTimelines({
    fixes,
    human: readJsonl(path.join(dir, 'human.jsonl')),
    system: readJsonl(path.join(dir, 'system.jsonl')),
    activity: readJsonl(path.join(dir, 'activity.jsonl')),
    events: readJsonl(path.join(dir, 'events.jsonl')),
  });
  const segments = [];
  for (let i = 0, s = 0; i <= r.states.length; i += 1) {
    if (i === r.states.length || r.states[i] !== r.states[s]) {
      if (i > s) segments.push({ from: s, to: i, state: r.states[s] });
      s = i;
    }
  }
  return {
    ...summarize(r.score),
    raw: r.score,
    switches: r.switches,
    listen: r.listen,
    runs: r.runs,
    segments,
  };
}

module.exports = { C, contentKey, scoreTimelines, scoreDir, summarize, visibleUse };

if (require.main === module) {
  // node score.js <session dir> [fixes.json]
  const fixes = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : [];
  process.stdout.write(JSON.stringify(scoreDir(process.argv[2], fixes)));
}
