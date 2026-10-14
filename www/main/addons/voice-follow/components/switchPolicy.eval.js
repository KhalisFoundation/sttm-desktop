/* eslint-disable no-console */
// Policy-layer KPI harness for Voice-Follow switching + display hold.
// Run: node www/main/addons/voice-follow/components/switchPolicy.eval.js
// (wired as `npm run test:unit` alongside the unit tests).
//
// What this measures: the DECISION policy (switchPolicy.js) driven by scripted
// decode sequences — commit latency, false commits on confusion-zone audio,
// the real length-penalty math, and display-flicker. Deterministic, runs in
// milliseconds, no model or audio. Shipped tuning comes from
// switchPolicy.config.js (read out of VoiceFollow.jsx), so this always
// evaluates the config the app actually runs.
//
// What it does NOT measure: acoustics. Real-kirtan numbers (on-correct /
// erroneous / stale on the 86-min, voice-B, and stress streams) still need
// the audio benchmark harness on the machine holding the kirtan audio corpus
// (kept out of the repo: it needs the private ~1.2GB audio).
// Relation to the project's 9 north-star KPIs for voice-follow (#1 right-page,
// #2 wrong-page, #3 lock-in, #4 stale, #5 recall, #6 flip speed, #7 mid-join,
// #8 within-shabad, #9 path regression):
// commit-latency is a proxy for #6 (how fast it flips); confusion-commits
// guard #2 (wrong page); the counter dynamics are relevant to #3/#5
// (lock-in, recall) but prove nothing about audio. Unmeasured here: #1
// right-page, #4 stale, #7 mid-join, #8 within-shabad, #9 path regression.
//
// Threshold discipline: keep a change ONLY if latency improves AND
// confusion-commits stay 0 AND flicker stays 0. KNOWN-LIMIT marks the one
// documented acoustic-ceiling case: it prints without failing the build.
const { nextSwitchWins, nextEmptyStreak, maxLineScore } = require('./switchPolicy');
const { CFG, CONFIRM, HOLD, HOP_S, HYP_MIN } = require('./switchPolicy.config');

// --- Scenario runners. ---
function runSwitch(script) {
  let wins = 0;
  let commitAt = -1;
  for (let i = 0; i < script.length; i += 1) {
    const cfg = { ...CFG, hypLen: script[i].len == null ? 35 : script[i].len, hypMin: HYP_MIN };
    wins = nextSwitchWins(wins, script[i].cand, script[i].cur, cfg).wins;
    if (wins >= CONFIRM && commitAt < 0) commitAt = i + 1; // 1-based decode #
  }
  return { commitAt };
}

function runHold(empties) {
  let streak = 0;
  let clears = 0;
  for (let i = 0; i < empties; i += 1) {
    const r = nextEmptyStreak(streak, false, HOLD);
    streak = r.streak;
    if (r.clear) clears += 1;
  }
  return { clears };
}

const win = (cand, cur, len) => ({ cand, cur, len });
const results = [];
function check(name, actual, expect, unit) {
  const pass = actual === expect;
  results.push({ name, actual, expect, unit, pass, known: false });
}
function knownLimit(name, actual, note) {
  results.push({ name, actual, expect: note, unit: '', pass: true, known: true });
}

// 1. Clean decisive switch must commit fast (the #1 user complaint).
check(
  'clean-switch decodes-to-commit',
  runSwitch([win(0.94, 0.31), win(0.94, 0.31)]).commitAt,
  2,
  'decodes',
);
// 2. Borderline real switch still commits via the full confirmation.
check(
  'borderline decodes-to-commit',
  runSwitch([win(0.7, 0.5), win(0.7, 0.5), win(0.7, 0.5)]).commitAt,
  3,
  'decodes',
);
// 3. Confusion zone (shared closing phrase) must NEVER commit.
check(
  'confusion commits in 12 decodes',
  runSwitch(Array(12).fill(win(0.6, 0.4))).commitAt,
  -1,
  'decodes',
);
// 4. Thin-margin high score commits only via the slow path (3, not 2).
check(
  'thin-margin decodes-to-commit',
  runSwitch([win(0.95, 0.79), win(0.95, 0.79), win(0.95, 0.79)]).commitAt,
  3,
  'decodes',
);
// 5. Sustained spurious slow wins: the documented acoustic ceiling. Count
//    schemes cannot separate these from real switches; the real protections
//    are upstream (6-vote propose gate + 15-char length penalty). Recorded,
//    not blessed: a future fix that rejects these must flip this to a check.
knownLimit(
  'sustained-spurious decodes-to-commit',
  runSwitch([win(0.72, 0.5), win(0.72, 0.5), win(0.72, 0.5)]).commitAt,
  'commits at 3 today; rejecting it is future work',
);
// 6. Strong win then a miss then recovery: steps back (2->1), still commits.
check(
  'strong-miss-recovery commits',
  runSwitch([win(0.9, 0.4), win(0.4, 0.5), win(0.9, 0.4), win(0.7, 0.5)]).commitAt,
  3,
  'decodes',
);
// 7. The real length-penalty math, through the shipped function: a short
//    line fully contained in the hyp is discounted, a full line is not.
check(
  'length penalty discounts a contained short line',
  maxLineScore('aaaabbbbcccc', ['bbbb'], 15) < 1,
  true,
  'bool',
);
check(
  'length penalty spares a fully-heard long line',
  maxLineScore('aaaabbbbccccddddeeee', ['aaaabbbbccccddddeeee'], 15) > 0.99,
  true,
  'bool',
);
// 8. Display holds through singing pauses (8 empties, then votes).
check('flicker clears over 8 empty decodes', runHold(8).clears, 0, 'clears');
// 9. A realistic 25s kirtan pause (50 decodes) never clears at shipped hold.
check('pause clears over 50 empty decodes', runHold(50).clears, 0, 'clears');
// 10. Dead-session backstop eventually clears exactly once.
check('backstop clears after HOLD+1 empties', runHold(HOLD + 1).clears, 1, 'clears');
// 11. Thin fragments (mumbled sungaudio) never commit on scores alone: six
//     decisive-score decodes at 5 heard chars must hold at 0 wins.
check(
  'thin-fragment decodes never commit',
  runSwitch(Array(6).fill(win(0.94, 0.31, 5))).commitAt,
  -1,
  'decodes',
);
// 12. Holds cost no wins: 2 thin decodes then 2 decisive ones commit at 4.
check(
  'held decodes preserve wins across the gap',
  runSwitch([win(0.94, 0.31, 5), win(0.94, 0.31, 5), win(0.94, 0.31), win(0.94, 0.31)]).commitAt,
  4,
  'decodes',
);

// --- Report. ---
let failed = 0;
console.log(
  `switch-policy KPIs (shipped config min=${CFG.min} margin=${CFG.margin} confirm=${CONFIRM} strong=${CFG.strongMin}/${CFG.strongMargin} hold=${HOLD} hop=${HOP_S}s hypMin=${HYP_MIN})`,
);
results.forEach((r) => {
  if (r.known) {
    console.log(`  [KNOWN-LIMIT] ${r.name}: got ${r.actual} — ${r.expect}`);
    return;
  }
  if (!r.pass) failed += 1;
  const latency =
    r.unit === 'decodes' && r.actual > 0 ? ` (~${(r.actual * HOP_S).toFixed(1)}s)` : '';
  console.log(
    `  [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}: got ${r.actual}${latency}, want ${r.expect} ${r.unit}`,
  );
});
if (failed > 0) {
  console.error(`${failed} KPI check(s) failed.`);
  process.exit(1);
}
console.log('All policy KPIs hold.');
