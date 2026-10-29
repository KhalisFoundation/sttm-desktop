#!/usr/bin/env node
/* board-visibility.js — how long the panel's "Possible new Shabads" cards stay readable.
 *
 *   node board-visibility.js <buildA> [<buildB>] [--set main|hard|akhand] [--tier full|smoke]
 *                            [--split dev|test] [--jobs 4] [--out <dir>] [--score-only <dir>]
 *
 * Replays the GAB clips of a tier (same selection as `gab run`: manifest rows of the tier, not test,
 * first suite job) through each build from the emissions cache (no speech model; a cache miss marks the
 * clip INCOMPLETE), with board-capture-preload.js recording the live board, the candidate shelf
 * (when the build has candidateShelf.js), transcripts, the change card and the screen.
 *
 * What the list shows:
 *   - a build with candidateShelf.js: the shelf's own output (exactly what the component lists, before
 *     the render-time "same Gurbani under another id" filter), up to 5;
 *   - an older build (upstream 3fafc0ba): MODELLED from the same board stream with its render rule:
 *     board candidates (not current, >= 1% while following, with a pangti, not the change-card Shabad),
 *     top 3 by %, shown only while a confident word (>= 0.88, a word of 3+ letters) was heard in the
 *     last 5 s (the hearing strip's timer).
 * Both are evaluated as step functions in audio time. In the app a 1 s timer also refreshes the shelf
 * between decodes; in replay it refreshes at each decode (~0.5 s), so the difference is < 1 s.
 *
 * Numbers (per clip and pooled):
 *   visible s       : each continuous stretch a Shabad is listed; median and p10 over stretches
 *   changes/min     : cards appearing + disappearing per minute of clip
 *   flickers/min    : listed stretches shorter than 2 s per minute
 *   reorders/min    : pairs of listed cards that swapped places, per minute
 *   correct ahead   : for every truth change to a different Shabad (shabads.csv), was that Shabad listed
 *                     (or in the change card) before the screen showed it (window: truth start - 5 s to
 *                     the screen switch, or the end of its window if never shown); lead = screen time -
 *                     first listed; "listed >= 1 s" counts switches where it was readable for >= 1 s.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const TOOLS = __dirname;
const DS = path.join(TOOLS, '..');
const MAIN_REPO = '/Users/asingh02/personal/sttm-desktop';
const BENCH = process.env.VF_BENCHMARK || path.join(os.homedir(), 'personal/vf-benchmark');
const { DEFAULT_ROOT } = require('./emis-cache');
const CACHE = path.resolve(process.env.VF_EMIS_CACHE || DEFAULT_ROOT);
const MODEL = process.env.MODEL || '/Users/asingh02/AAI/models/karansea-shabad-ctc/model.int8.onnx';
const CODEC = process.env.VF_EMIS_CODEC || 'q16';
const G = require('./gab-score');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const sh = (c, a) => execFileSync(c, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// ------------------------------------------------------------------ builds / selection
function resolveBuild(spec) {
  const dir = path.resolve(spec.replace(/^~/, os.homedir()));
  if (fs.existsSync(path.join(dir, 'www'))) return { name: spec, root: dir, commit: sh('git', ['-C', dir, 'rev-parse', '--short=12', 'HEAD']) };
  const rev = spec === 'upstream' ? 'upstream/experimental-release' : spec;
  const sha = sh('git', ['-C', MAIN_REPO, 'rev-parse', '--verify', `${rev}^{commit}`]);
  const wt = path.join(CACHE, 'worktrees', sha.slice(0, 12));
  if (!fs.existsSync(path.join(wt, 'www'))) throw new Error(`no worktree for ${spec} at ${wt} (run \`gab run ${spec}\` once to create it)`);
  return { name: spec, root: wt, commit: sha.slice(0, 12) };
}
const SMOKE = { main: ['clip02', 'clip05', 'clip13', 'clip34', 'pt01', 'pt19', 'pt28', 'pt35', 'pt52'], hard: ['kh12_', 'kh14_', 'kh28_', 'kh29_'], akhand: ['l3clip01', 'l3clip18', 'l3clip24'] };
function select() {
  const set = arg('set', 'main');
  const tier = arg('tier', 'full');
  const split = arg('split', 'dev');
  const { parseCsv, canonRows } = require('./vf-manifest');
  const rows = canonRows(parseCsv(fs.readFileSync(path.join(BENCH, 'manifest.csv'), 'utf8')));
  const sets = G.loadSets();
  const { SUITES } = require('./vf-suites');
  const memo = {};
  const jobs = [];
  const notRun = [];
  for (const r of rows) {
    if (!G.inTier(r, set, sets)) continue;
    if (split === 'dev' ? r.split === 'test' : !split.split(',').includes(r.split)) continue;
    if (tier === 'smoke' && !(SMOKE[set] || []).some((p) => r.id.startsWith(p))) continue;
    if (sets.exclude[r.id]) { notRun.push({ id: r.id, why: 'excluded' }); continue; }
    const first = (r.suite_jobs || '').split(';').filter(Boolean)[0];
    if (!first) { notRun.push({ id: r.id, why: 'no runner' }); continue; }
    const [suite, clip] = first.split(':');
    if (!SUITES[suite]) { notRun.push({ id: r.id, why: `no suite ${suite}` }); continue; }
    if (!memo[suite]) { const prev = process.env.VF_SPLIT; delete process.env.VF_SPLIT; memo[suite] = SUITES[suite].jobs(); if (prev) process.env.VF_SPLIT = prev; }
    const j = memo[suite].find((x) => x.clip === clip || x.id === clip);
    if (!j || !fs.existsSync(j.wav)) { notRun.push({ id: r.id, why: 'no job / audio' }); continue; }
    if (j.root) { notRun.push({ id: r.id, why: 'session runner (not per clip)' }); continue; }
    jobs.push({ row: r, suite, ...j });
  }
  return { set, tier, split, jobs, notRun };
}

// ------------------------------------------------------------------ replay
function runOne(build, args, only, outDir, boardDir) {
  return new Promise((resolve) => {
    const shadowCfg = path.join(build.root, 'www/main/addons/voice-follow/shadow/config.js');
    const a = ['-n', '19', process.execPath, ...(fs.existsSync(shadowCfg) ? ['-r', './no-shadow-preload.js'] : []), '-r', './board-capture-preload.js',
      ...args, '--only', only.join(','), '--out', outDir];
    const env = { ...process.env, VF_DRIVER_ROOT: build.root, VF_EMIS_CACHE: CACHE, VF_EMIS_MODE: 'replay', VF_EMIS_CODEC: CODEC, MODEL, VF_BOARD_OUT: boardDir };
    const child = spawn('nice', a, { cwd: TOOLS, env, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; if (err.length > 200000) err = err.slice(-100000); });
    child.on('close', (code) => resolve({ code, err }));
  });
}
async function replayBuild(build, sel, outRoot) {
  const boardDir = path.join(outRoot, build.commit, 'board');
  fs.mkdirSync(boardDir, { recursive: true });
  const have = (j) => fs.existsSync(path.join(boardDir, `${j.id}.board.json`));
  const todo = sel.jobs.filter((j) => !have(j));
  // batches of up to 6 clips per process (same runner args), longest first
  const groups = new Map();
  for (const j of todo.sort((a, b) => b.dur - a.dur)) {
    const k = JSON.stringify(j.args);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(j);
  }
  const queue = [];
  for (const [k, js] of groups) for (let i = 0; i < js.length; i += 6) queue.push({ args: JSON.parse(k), jobs: js.slice(i, i + 6) });
  const missed = {};
  const workers = Number(arg('jobs', 4));
  let n = 0;
  const work = async () => {
    while (queue.length) {
      const task = queue.shift();
      const tmp = path.join(outRoot, build.commit, '.jobs', String(n++));
      fs.mkdirSync(tmp, { recursive: true });
      const { err } = await runOne(build, task.args, task.jobs.map((j) => j.only), tmp, boardDir);
      const miss = err.match(/EMISSIONS CACHE MISS clip=(\S+)/);
      const left = task.jobs.filter((j) => !have(j));
      for (const j of left) {
        if (miss && miss[1] === j.id) missed[j.id] = 'cache miss';
        else if (task.jobs.length > 1) queue.push({ args: task.args, jobs: [j] }); // rerun on its own
        else missed[j.id] = miss ? 'cache miss' : `replay error: ${err.split('\n').filter((l) => l && !l.startsWith('[emis')).slice(-2).join(' | ').slice(0, 200)}`;
      }
      process.stderr.write(`  ${build.name}: ${sel.jobs.filter(have).length}/${sel.jobs.length} clips\r`);
    }
  };
  await Promise.all(Array.from({ length: workers }, work));
  process.stderr.write('\n');
  return missed;
}

// ------------------------------------------------------------------ what was listed
const HEARD_MIN_CONF = 0.88;
const HEARD_CLEAR_S = 5;
const at = (series, t) => { // last entry at or before t (series sorted by time)
  let lo = 0, hi = series.length - 1, best = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (series[m][0] <= t) { best = m; lo = m + 1; } else hi = m - 1; }
  return best >= 0 ? series[best] : null;
};
function frames(cap) {
  // -> [{ t, list: [{id, fading}], change: id|null }] on a 0.1 s grid
  const heardT = cap.heard.filter(([, c, w]) => c >= HEARD_MIN_CONF && w).map(([t]) => t);
  const lastHeard = (t) => { let lo = 0, hi = heardT.length - 1, b = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (heardT[m] <= t) { b = heardT[m]; lo = m + 1; } else hi = m - 1; } return b; };
  const out = [];
  for (let t = 0; t <= cap.end + 1e-9; t = Math.round((t + 0.1) * 10) / 10) {
    const hearing = (() => { const h = lastHeard(t); return h != null && t - h < HEARD_CLEAR_S; })();
    const b = at(cap.board, t);
    const board = b ? b[1] : [];
    const curItem = board.find((x) => x.role === 'current');
    const cur = curItem ? curItem.id : null;
    const lc = at(cap.lead, t);
    let lead = null;
    if (lc && cur != null) {
      const items = lc[1].filter(([id]) => id !== cur);
      const top = items.reduce((m, x) => (!m || x[1] > m[1] ? x : m), null);
      if (top && top[1] >= 1) lead = top[0];
    }
    let list;
    if (cap.hasShelf) {
      const s = at(cap.shelf, t);
      list = (s ? s[1] : []).filter((x) => x.id !== lead).slice(0, 5).map((x) => ({ id: x.id, fading: x.fading }));
    } else {
      list = hearing
        ? board.filter((x) => x.role !== 'current' && (cur == null || x.pct >= 0.01) && x.line && x.id !== lead).slice(0, 3).map((x) => ({ id: x.id, fading: false }))
        : [];
    }
    out.push({ t, list, change: lead != null && hearing ? lead : null, cur });
  }
  return out;
}
function truthOf(row) {
  const f = path.join(BENCH, row.content_folder, row.id, 'shabads.csv');
  if (!fs.existsSync(f)) return [];
  const [head, ...lines] = fs.readFileSync(f, 'utf8').trim().split('\n');
  const H = head.split(',');
  return lines.map((l) => { const v = l.split(','); const o = {}; H.forEach((h, i) => { o[h] = v[i]; }); return o; })
    .map((o) => ({ ids: String(o.shabadId).split('|').filter((x) => /^\d+$/.test(x)).map(Number), start: Number(o.start_s), end: Number(o.end_s) }))
    .filter((w) => Number.isFinite(w.start));
}
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
function scoreClip(cap, row) {
  const F = frames(cap);
  const mins = Math.max(cap.end, 1) / 60;
  const open = new Map(); // id -> start t
  const stretches = [];
  let changes = 0, reorders = 0;
  let prev = [];
  for (const f of F) {
    const ids = f.list.map((x) => x.id);
    for (const id of ids) if (!open.has(id)) { open.set(id, f.t); changes++; }
    for (const [id, t0] of [...open]) if (!ids.includes(id)) { stretches.push(f.t - t0); open.delete(id); changes++; }
    const both = ids.filter((id) => prev.includes(id));
    for (let i = 0; i < both.length; i++) for (let k = i + 1; k < both.length; k++) {
      if (Math.sign(prev.indexOf(both[i]) - prev.indexOf(both[k])) !== Math.sign(ids.indexOf(both[i]) - ids.indexOf(both[k]))) reorders++;
    }
    prev = ids;
  }
  for (const [, t0] of open) stretches.push(cap.end - t0);
  // correct Shabad listed ahead of the screen switch
  const truth = truthOf(row);
  const shown = cap.screen.filter(([, type]) => type === 'shabad');
  const sw = [];
  for (let k = 1; k < truth.length; k++) {
    const w = truth[k];
    const before = truth[k - 1];
    if (!w.ids.length || w.ids.some((id) => before.ids.includes(id))) continue;
    const scr = shown.find(([t, , id]) => t >= w.start - 5 && w.ids.includes(Number(id)));
    const X = scr ? scr[0] : w.end;
    const inWin = F.filter((f) => f.t >= w.start - 5 && f.t < X);
    const listed = inWin.filter((f) => f.list.some((x) => w.ids.includes(x.id)));
    const any = inWin.filter((f) => f.list.some((x) => w.ids.includes(x.id)) || w.ids.includes(f.change));
    sw.push({ at: w.start, shownAt: scr ? +scr[0].toFixed(1) : null, listedS: +(listed.length * 0.1).toFixed(1), anyS: +(any.length * 0.1).toFixed(1),
      lead: listed.length ? +(X - listed[0].t).toFixed(1) : null });
  }
  return { id: row.id, folder: row.content_folder, min: +mins.toFixed(2), stretches: stretches.map((x) => +x.toFixed(1)),
    changesPerMin: +(changes / mins).toFixed(2), flickersPerMin: +(stretches.filter((x) => x < 2).length / mins).toFixed(2),
    reordersPerMin: +(reorders / mins).toFixed(2), maxListed: Math.max(0, ...F.map((f) => f.list.length)), switches: sw };
}
function pool(clips) {
  const st = clips.flatMap((c) => c.stretches);
  const mins = clips.reduce((a, c) => a + c.min, 0);
  const sw = clips.flatMap((c) => c.switches);
  const per = (k) => +(clips.reduce((a, c) => a + c[k] * c.min, 0) / Math.max(mins, 1e-9)).toFixed(2);
  return { clips: clips.length, minutes: +mins.toFixed(1), stretches: st.length, medianVisibleS: q(st, 0.5), p10VisibleS: q(st, 0.1),
    changesPerMin: per('changesPerMin'), flickersPerMin: per('flickersPerMin'), reordersPerMin: per('reordersPerMin'),
    switches: sw.length, listedAhead: sw.filter((s) => s.listedS > 0).length, listedAhead1s: sw.filter((s) => s.listedS >= 1).length,
    cardOrChangeAhead1s: sw.filter((s) => s.anyS >= 1).length, medianLeadS: q(sw.filter((s) => s.lead != null).map((s) => s.lead), 0.5),
    medianListedS: q(sw.map((s) => s.listedS), 0.5) };
}

// ------------------------------------------------------------------ main
(async () => {
  const sel = select();
  const outRoot = path.resolve(arg('out', path.join(DS, 'results', 'board-visibility')));
  const builds = pos.map(resolveBuild);
  if (!builds.length) throw new Error('usage: board-visibility.js <buildA> [<buildB>] [--set main|hard|akhand] [--tier full|smoke]');
  console.log(`board visibility: set ${sel.set}, tier ${sel.tier}, split ${sel.split}: ${sel.jobs.length} clips (${sel.notRun.length} not run: ${[...new Set(sel.notRun.map((x) => x.why))].join(', ') || '-'})`);
  const results = {};
  const missedBy = {};
  for (const b of builds) missedBy[b.name] = await replayBuild(b, sel, outRoot);
  // the same clips on every side: a clip missing on any side is left out of all (and listed)
  const common = sel.jobs.filter((j) => builds.every((b) => fs.existsSync(path.join(outRoot, b.commit, 'board', `${j.id}.board.json`))));
  for (const b of builds) {
    const missed = missedBy[b.name];
    const clips = [];
    for (const j of common) {
      const f = path.join(outRoot, b.commit, 'board', `${j.id}.board.json`);
      clips.push(scoreClip(JSON.parse(fs.readFileSync(f, 'utf8')), j.row));
    }
    results[b.name] = { build: b, missed, clips, all: pool(clips) };
    fs.writeFileSync(path.join(outRoot, `${b.commit}-${sel.set}-${sel.tier}.json`), JSON.stringify(results[b.name], null, 1));
  }
  const L = [`# Candidate list visibility (set ${sel.set}, tier ${sel.tier}, ${sel.jobs.length} clips)`, '',
    '| build | clips | min | cards | median visible s | p10 visible s | changes/min | flickers (<2 s)/min | reorders/min | max listed | switches | listed before screen | listed >= 1 s | list or change card >= 1 s | median lead s |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const [name, r] of Object.entries(results)) {
    const a = r.all;
    L.push(`| ${name} (${r.build.commit.slice(0, 8)}) | ${a.clips} | ${a.minutes} | ${a.stretches} | ${a.medianVisibleS ?? '-'} | ${a.p10VisibleS ?? '-'} | ${a.changesPerMin} | ${a.flickersPerMin} | ${a.reordersPerMin} | ${Math.max(0, ...r.clips.map((c) => c.maxListed))} | ${a.switches} | ${a.listedAhead} | ${a.listedAhead1s} | ${a.cardOrChangeAhead1s} | ${a.medianLeadS ?? '-'} |`);
  }
  // per behaviour folder
  L.push('', '| build | folder | clips | median visible s | p10 | flickers/min | switches | listed >= 1 s before screen |', '|---|---|---|---|---|---|---|---|');
  for (const [name, r] of Object.entries(results)) {
    const byF = new Map();
    for (const c of r.clips) { const k = c.folder.split('/')[0]; if (!byF.has(k)) byF.set(k, []); byF.get(k).push(c); }
    for (const [k, cs] of byF) { const a = pool(cs); L.push(`| ${name} | ${k} | ${a.clips} | ${a.medianVisibleS ?? '-'} | ${a.p10VisibleS ?? '-'} | ${a.flickersPerMin} | ${a.switches} | ${a.listedAhead1s} |`); }
  }
  const bad = Object.entries(results).flatMap(([name, r]) => Object.entries(r.missed).map(([id, why]) => `${name}/${id} (${why})`));
  if (bad.length) L.push('', `INCOMPLETE: ${bad.length} clip run(s) did not replay: ${bad.join(', ')}`);
  L.push('', 'Upstream-style builds (no candidateShelf.js) are modelled from the same board stream with their render rule (top 3, 5 s hearing gate); shelf builds are measured from the shelf output.');
  const md = L.join('\n');
  fs.writeFileSync(path.join(outRoot, `compare-${sel.set}-${sel.tier}.md`), `${md}\n`);
  console.log(md);
  process.exit(bad.length ? 3 : 0);
})().catch((e) => { console.error(e.stack); process.exit(1); });
