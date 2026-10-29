#!/usr/bin/env node
/* sim-score.js — score one wall-paced or simulated slow-PC run (renton-stress.js / sim-slowpc.js output).
 *   rt11_rehras / rt11_sohila  renton-score.js (realigned Rehras truth): Bani right, line exact, within 1, lag median
 *   kh01..kh05 (Fremont)       khalis-tests.json timeline: right %, wrong page s, wrong switches, line lag median,
 *                              first Shabad on screen, and the time to every later Shabad change (as tp5-score.js)
 *   ytasa1 (Asa di Vaar)       nw-score.js: within 1, lines reached, lag median
 * plus the harness: audio backlog max / p95, tier (and steps), model passes per audio second.
 *   node sim-score.js <run.json | dir> ...   prints one row per run
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const TOOLS = __dirname;
const DS = path.join(__dirname, '..');
const KT = JSON.parse(fs.readFileSync(path.join(DS, 'khalis-tests.json')));
const STEP = 0.1;

function fremont(run, row) {
  const ev = run.events.filter((e) => ['shabad', 'seeking', 'verse'].includes(e.type)).sort((a, b) => a.t - b.t);
  const tl = row.timeline;
  const t0 = tl[0].t;
  const ok = new Set(row.shabads);
  let sid = null;
  let seeking = false;
  let i = 0;
  let k = 0;
  let right = 0;
  let wrong = 0;
  for (let t = t0; t < run.dur; t += STEP) {
    while (i < ev.length && ev[i].t <= t) { const e = ev[i++]; if (e.type === 'shabad') sid = e.shabadId; if (e.type === 'seeking') seeking = e.visible; }
    while (k + 1 < tl.length && tl[k + 1].t <= t) k++;
    const shown = seeking ? null : sid;
    if (shown === tl[k].shabadId) right += STEP; else if (shown != null) wrong += STEP;
  }
  const lags = [];
  const vEv = ev.filter((e) => e.type === 'verse');
  for (const tv of tl) { const h = vEv.find((e) => e.verseId === tv.verseId && e.t >= tv.t - 5 && e.t <= tv.t + 60); if (h) lags.push(h.t - tv.t); }
  lags.sort((a, b) => a - b);
  const sh = ev.filter((e) => e.type === 'shabad');
  let prev = null;
  let wsw = 0;
  for (const e of sh) { if (e.shabadId !== prev) { if (!ok.has(e.shabadId)) wsw++; prev = e.shabadId; } }
  const starts = [];
  let last = null;
  for (const x of tl) { if (x.shabadId !== last) { starts.push(x); last = x.shabadId; } }
  // time to each truth Shabad change after the first: first show of it in [change - 30, next change)
  const switches = starts.slice(1).map((x, j) => {
    const end = starts[j + 2] ? starts[j + 2].t : run.dur;
    const h = sh.find((e) => e.shabadId === x.shabadId && e.t >= x.t - 30 && e.t < end);
    return { shabad: x.shabadId, at: x.t, after: h ? +(h.t - x.t).toFixed(1) : null };
  });
  const first = sh.find((e) => e.shabadId === starts[0].shabadId);
  return {
    'right %': +(100 * right / (run.dur - t0)).toFixed(1),
    'wrong page s': Math.round(wrong),
    'wrong switches': wsw,
    'lag median s': lags.length ? +lags[Math.floor(lags.length / 2)].toFixed(1) : null,
    'first s': first ? Math.round(first.t - starts[0].t) : null,
    switches: switches.map((s) => `${s.shabad}:${s.after == null ? 'never' : Math.round(s.after)}`).join(' '),
  };
}

function viaTool(tool, file, content, env, read) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-score-'));
  try {
    fs.writeFileSync(path.join(dir, file), JSON.stringify(content));
    execFileSync(process.execPath, [tool, dir], { cwd: TOOLS, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return read(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function harness(run) {
  const s = run.summary || {};
  const t = s.tier;
  return {
    'backlog max s': s.lagMax,
    'backlog p95 s': s.lagP95,
    tier: t ? `${t.tier}/${t.steps}` : '-',
    'passes/s': s.passesPerAudioS ?? null,
  };
}

function scoreRun(run) {
  const clip = run.part || run.summary?.clip || '';
  let m = {};
  const row = KT.find((r) => r.name === clip || (clip && path.basename(r.clip, '.wav') === clip));
  if (row) m = { kind: 'fremont', ...fremont(run, row) };
  else if (clip.startsWith('ytasa1')) {
    const r = viaTool('nw-score.js', 'y.json', { ...run, name: clip }, {}, (d) => Object.values(JSON.parse(fs.readFileSync(path.join(d, 'score.json'))))[0].vaar[0]);
    m = { kind: 'asa', 'Bani right %': r.baniRight, 'within 1 %': r.lineWithin1, 'line exact %': r.lineExact, reached: String(r.linesReached), 'lag median s': r.lagMedian };
  } else if (clip === 'rt11_rehras' || clip === 'rt11_sohila') {
    const r = viaTool('renton-score.js', `${clip}.json`, run, { REHRAS_TRUTH: path.join(DS, 'results/rt11_rehrasX.app.truth.json') },
      (d) => Object.values(JSON.parse(fs.readFileSync(path.join(d, 'renton-score.json'))))[0].paath[0]);
    m = { kind: 'paath', 'Bani right %': r.baniRight, 'wrong %': r.wrong, 'line exact %': r.lineExact, 'within 1 %': r.lineWithin1, reached: String(r.linesReached), 'lag median s': r.lagMedian };
  } else m = { kind: 'unscored' };
  return { clip, ...m, ...harness(run) };
}

module.exports = { scoreRun, fremont };

if (require.main === module) {
  const files = process.argv.slice(2).flatMap((p) => (fs.statSync(p).isDirectory()
    ? fs.readdirSync(p).filter((f) => f.endsWith('.json') && !/score/.test(f)).map((f) => path.join(p, f)) : [p]));
  for (const f of files) {
    const r = scoreRun(JSON.parse(fs.readFileSync(f)));
    console.log(`| ${f} | ${Object.entries(r).filter(([k]) => k !== 'clip' && k !== 'kind').map(([k, v]) => `${k} ${v}`).join(' / ')} |`);
  }
}
