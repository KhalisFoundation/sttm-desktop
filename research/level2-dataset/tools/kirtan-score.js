#!/usr/bin/env node
/* kirtan-score.js — kirtan scorecard for line-labelled darbar recordings (the jaspal suite: Fremont sevadaar-screen
 * truth), per split and per Gurdwara. Library (vf-suites.js jaspal.score) + CLI.
 *
 *   node kirtan-score.js <dir with khalis-bench outputs (kh*.json)> [--md] [--clips] [--json out.json]
 *   node kirtan-score.js --compare <base dir> <cand dir>         per split, per Gurdwara, per clip
 *
 * Truth = the verse the sevadaar put on screen (khalis-tests.json timeline; "sevadaar screen (human, may lag)").
 * Metrics, over each clip from the sevadaar's first verse to the end:
 *   Shabad level   right / wrong / searching % of the time (shown Shabad id == the sevadaar's; khalis-bench)
 *   line level     sangat sees the right pangti = ON + catching up within 1 s (sangat-score.js, text-compared)
 *   find           a NEW Shabad (first one in the clip, or a new main Shabad): seconds from the sevadaar's switch
 *                  to the app showing it (0 if the app was there first); "not found" = never shown in that stretch
 *   parmaan        a detour A -> B -> A (B quoted inside A): follow = seconds to show B (missed if never shown
 *                  while B is sung), return = seconds from the sevadaar going back to A to the app showing A
 *   wrong s/h      seconds a different Shabad than the sevadaar's is up, per hour
 *   wrong switches the app switches to a Shabad the sevadaar does not show within [-15 s, +30 s] of the switch
 * Split / Gurdwara come from hf-jaspal/ledger.json.
 */
const fs = require('fs');
const path = require('path');

const DS = path.join(__dirname, '..');
const SWITCH_BEFORE = 15;
const SWITCH_AFTER = 30;
const ledgerBy = () => {
  const L = JSON.parse(fs.readFileSync(path.join(DS, 'hf-jaspal', 'ledger.json'), 'utf8'));
  return new Map(Object.values(L.datasets).filter((d) => d.clipName).map((d) => [d.clipName, d]));
};
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1); };

// screen states: shown Shabad (null while the Waheguru / seeking slide is up) and the last verse set
function shownAt(events) {
  const ev = events.filter((e) => e.type === 'shabad' || e.type === 'seeking' || e.type === 'verse').map((e, i) => ({ ...e, i })).sort((a, b) => a.t - b.t || a.i - b.i);
  const st = [{ t: -1e9, s: null, v: null }];
  let sid = null; let seeking = false; let v = null;
  for (const e of ev) {
    if (e.type === 'shabad') { sid = e.shabadId; v = e.verseId ?? v; } else if (e.type === 'verse') v = e.verseId; else seeking = !!e.visible;
    st.push({ t: e.t, s: seeking ? null : sid, v });
  }
  return st;
}
const stAt = (st, t) => { let lo = 0; let hi = st.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (st[m].t <= t) lo = m; else hi = m - 1; } return st[lo]; };
// right = the same Shabad id, another stored copy of the same Gurbani, or a Bani whose shown line belongs to it
process.env.COPIES = process.env.COPIES || '1';
const { isRight } = require('./bani-aware');
const okAt = (x, sid) => x.s != null && sid != null && isRight(x.s, new Set([sid]), x.v);
// first time >= from (or the state at from) the app shows sid, before until; null if never
function firstShown(st, sid, from, until) {
  if (okAt(stAt(st, from), sid)) return from;
  for (const x of st) if (x.t > from && x.t < until && okAt(x, sid)) return x.t;
  return null;
}

// one clip: khalis-bench output -> events per Shabad stretch
function clipEvents(run) {
  const { row, metrics } = run;
  const events = run.trace || run.events;
  const tl = row.timeline.filter((x) => x.shabadId != null);
  const end = row.seconds;
  const segs = [];
  for (const [i, x] of tl.entries()) {
    const last = segs[segs.length - 1];
    if (last && last.s === x.shabadId) continue;
    if (last) last.end = x.t;
    segs.push({ s: x.shabadId, start: x.t, end });
    void i;
  }
  for (const [k, g] of segs.entries()) {
    const before = segs.slice(0, k).map((x) => x.s);
    if (before.includes(g.s)) { g.kind = 'return'; continue; }
    // detour: a later stretch goes back to the Shabad that was up before this one
    const prev = k ? segs[k - 1] : null;
    let main = null;
    for (let j = k - 1; j >= 0 && !main; j--) { const later = segs.slice(k + 1).findIndex((x) => x.s === segs[j].s); if (later >= 0) main = segs[j].s; }
    g.kind = prev && main != null ? 'detour' : 'new';
  }
  const st = shownAt(events);
  const out = { find: [], notFound: 0, newN: 0, follow: [], followMissed: 0, detours: 0, ret: [], retMissed: 0, returns: 0, wrongSwitches: 0, switches: 0 };
  for (const g of segs) {
    const t = firstShown(st, g.s, g.start, g.end);
    const d = t == null ? null : +(t - g.start).toFixed(1);
    g.shownAfter = d;
    if (g.kind === 'new') { out.newN++; if (d == null) out.notFound++; else out.find.push(d); }
    if (g.kind === 'detour') { out.detours++; if (d == null) out.followMissed++; else out.follow.push(d); }
    if (g.kind === 'return') { out.returns++; if (d == null) out.retMissed++; else out.ret.push(d); }
  }
  // wrong switches: a new Shabad on screen that the sevadaar does not show within [-15 s, +30 s]
  let last = null;
  for (const x of st.slice(1)) {
    if (x.s == null || x.s === last) continue;
    last = x.s;
    if (x.t < (tl[0] ? tl[0].t : 0) - SWITCH_BEFORE) continue;
    out.switches++;
    const near = tl.filter((y) => y.t >= x.t - SWITCH_BEFORE && y.t <= x.t + SWITCH_AFTER).map((y) => y.shabadId);
    let k = -1; for (const [i, y] of tl.entries()) if (y.t <= x.t) k = i;
    if (k >= 0) near.push(tl[k].shabadId);
    if (!near.some((sid) => okAt(x, sid))) out.wrongSwitches++;
  }
  // time-weighted Shabad level (copy- and Bani-aware): from the sevadaar's first verse to the end
  const STEP = 0.1; let right = 0; let wrong = 0; let searching = 0; let k = 0; let j = 0;
  for (let t = tl.length ? tl[0].t : end; t < end; t += STEP) {
    while (k + 1 < tl.length && tl[k + 1].t <= t) k++;
    while (j + 1 < st.length && st[j + 1].t <= t) j++;
    const x = st[j];
    if (x.s == null) searching += STEP; else if (okAt(x, tl[k].shabadId)) right += STEP; else wrong += STEP;
  }
  const T = Math.max(STEP, right + wrong + searching);
  const heard = events.filter((e) => e.type === 'transcript' && e.t >= (tl[0] ? tl[0].t : 0)).reduce((a, e) => a + (e.text || '').length, 0);
  out.heardPerMin = Math.round(heard / Math.max(1, (T / 60)));
  out.segs = segs.map((g) => `${g.kind[0]}:${g.s}@${Math.round(g.start)}${g.shownAfter == null ? '(never)' : `+${g.shownAfter}`}`);
  out.dur = +T.toFixed(1);
  out.right = right / T; out.wrong = wrong / T; out.searching = searching / T;
  void metrics;
  return out;
}

function scoreDir(dir) {
  const L = ledgerBy();
  const files = fs.readdirSync(dir).filter((f) => /^kh\d\d_.*\.json$/.test(f));
  let sangat = null;
  try {
    const ss = require('./sangat-score');
    const res = ss.scoreRun(dir);
    sangat = new Map(res.clips.map((c) => [c.id, c]));
  } catch (e) { process.stderr.write(`kirtan-score: sangat view skipped: ${e.message}\n`); }
  const clips = [];
  for (const f of files) {
    const run = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const name = path.basename(f, '.json');
    const tf = path.join(dir, 'trace', `${name}.events.jsonl`);
    if (fs.existsSync(tf)) run.trace = fs.readFileSync(tf, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const led = L.get(name) || {};
    const ev = clipEvents(run);
    const sg = sangat && sangat.get(name);
    clips.push({ id: name, clip: name.slice(0, 4), split: led.split || '?', gurdwara: led.gurdwara || '?', ...ev, lineAcc: sg && sg.line && sg.line.acc, lineRight: sg && sg.line && sg.line.summary ? sg.line.summary.right_pct : null });
  }
  return clips.sort((a, b) => a.id.localeCompare(b.id));
}

function summarize(cs) {
  if (!cs.length) return null;
  const T = cs.reduce((a, c) => a + c.dur, 0);
  const w = (k) => +(100 * cs.reduce((a, c) => a + c[k] * c.dur, 0) / T).toFixed(1);
  const all = (k) => cs.flatMap((c) => c[k]);
  const sum = (k) => cs.reduce((a, c) => a + c[k], 0);
  let line = null;
  const accs = cs.map((c) => c.lineAcc).filter(Boolean);
  if (accs.length) { const ss = require('./sangat-score'); line = ss.summarize(ss.merge(accs)); }
  return {
    clips: cs.length, hours: +(T / 3600).toFixed(2),
    'Shabad right %': w('right'), 'Shabad wrong %': w('wrong'), 'searching %': w('searching'),
    'sangat line %': line ? line.right_pct : null, 'catch-up lag p50 s': line ? line.lag_p50 : null,
    'find median s': q(all('find'), 0.5), 'find p90 s': q(all('find'), 0.9), 'not found': sum('notFound'), 'new Shabads': sum('newN'),
    'parmaan follow median s': q(all('follow'), 0.5), 'parmaan missed': sum('followMissed'), detours: sum('detours'),
    'return median s': q(all('ret'), 0.5), 'return p90 s': q(all('ret'), 0.9), 'return missed': sum('retMissed'), returns: sum('returns'),
    'wrong s/h': +(cs.reduce((a, c) => a + c.wrong * c.dur, 0) / (T / 3600)).toFixed(0), 'wrong switches': sum('wrongSwitches'),
  };
}
const DIR = { 'Shabad right %': 1, 'Shabad wrong %': -1, 'searching %': -1, 'sangat line %': 1, 'catch-up lag p50 s': -1, 'find median s': -1, 'find p90 s': -1, 'not found': -1,
  'parmaan follow median s': -1, 'parmaan missed': -1, 'return median s': -1, 'return p90 s': -1, 'return missed': -1, 'wrong s/h': -1, 'wrong switches': -1 };
const direction = (name) => { const k = Object.keys(DIR).find((m) => name.endsWith(m)); return k ? DIR[k] : 0; };

function groups(clips) {
  const g = [['all', clips]];
  for (const s of ['train', 'dev', 'test']) { const x = clips.filter((c) => c.split === s); if (x.length) g.push([s, x]); }
  const gw = [...new Set(clips.map((c) => c.gurdwara))];
  if (gw.length > 1) for (const w of gw) g.push([w, clips.filter((c) => c.gurdwara === w)]);
  return g;
}
// flat metrics for vf-check: "<group> <metric>"
function suiteMetrics(dir) {
  const m = {};
  for (const [k, cs] of groups(scoreDir(dir))) {
    const s = summarize(cs);
    for (const [name, v] of Object.entries(s)) if (name in DIR) m[`${k} ${name}`] = v;
  }
  return m;
}
const COLS = ['clips', 'hours', 'Shabad right %', 'Shabad wrong %', 'searching %', 'sangat line %', 'find median s', 'find p90 s', 'not found', 'new Shabads', 'parmaan follow median s', 'parmaan missed', 'detours', 'return median s', 'return missed', 'returns', 'wrong s/h', 'wrong switches'];
function markdown(clips, { perClip = false } = {}) {
  const out = [`| group | ${COLS.join(' | ')} |`, `|---|${COLS.map(() => '---').join('|')}|`];
  for (const [k, cs] of groups(clips)) { const s = summarize(cs); out.push(`| ${k} | ${COLS.map((c) => s[c] ?? '-').join(' | ')} |`); }
  if (perClip) {
    out.push('', '| clip | split | Shabad right % | sangat line % | stretches (kind:shabad@start+seconds to show) | wrong switches | heard chars/min |', '|---|---|---|---|---|---|---|');
    for (const c of clips) out.push(`| ${c.clip} | ${c.split} | ${(100 * c.right).toFixed(1)} | ${c.lineRight ?? '-'} | ${c.segs.join(' ')} | ${c.wrongSwitches} | ${c.heardPerMin} |`);
  }
  return out.join('\n');
}
function compare(baseDir, candDir) {
  const A = scoreDir(baseDir); const B = scoreDir(candDir);
  const out = ['| group | metric | base | cand | |', '|---|---|---|---|---|'];
  const gb = new Map(groups(B));
  for (const [k, cs] of groups(A)) {
    const a = summarize(cs); const b = summarize(gb.get(k) || []);
    if (!b) continue;
    for (const c of COLS.filter((x) => x in DIR)) {
      const d = direction(c); const va = a[c]; const vb = b[c];
      const tag = va == null || vb == null || va === vb || !d ? '' : (vb - va) * d > 0 ? 'better' : 'WORSE';
      out.push(`| ${k} | ${c} | ${va ?? '-'} | ${vb ?? '-'} | ${tag} |`);
    }
  }
  const bb = new Map(B.map((c) => [c.id, c]));
  out.push('', '| clip | split | Shabad right base / cand | sangat line base / cand | wrong switches |', '|---|---|---|---|---|');
  for (const c of A) { const d = bb.get(c.id); if (d) out.push(`| ${c.clip} | ${c.split} | ${(100 * c.right).toFixed(1)} / ${(100 * d.right).toFixed(1)} | ${c.lineRight ?? '-'} / ${d.lineRight ?? '-'} | ${c.wrongSwitches} / ${d.wrongSwitches} |`); }
  return out.join('\n');
}

module.exports = { scoreDir, summarize, suiteMetrics, direction, markdown, compare, clipEvents };

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--compare') { console.log(compare(path.resolve(argv[1]), path.resolve(argv[2]))); process.exit(0); }
  const clips = scoreDir(path.resolve(argv[0]));
  console.log(markdown(clips, { perClip: argv.includes('--clips') }));
  const j = argv.indexOf('--json');
  if (j > 0) fs.writeFileSync(argv[j + 1], JSON.stringify(clips.map(({ lineAcc, ...c }) => c), null, 1));
  process.exit(0);
}
