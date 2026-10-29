#!/usr/bin/env node
/* vf-record-all.js — the one-time full cache build (REPLAY.md). Records every suite's clips with the real
 * model, in this order: Renton rt11 parts, the smoke tier, then everything else (longest first), for each
 * root in --roots. Every model run is under the bench lock (lockf -k /tmp/vf-bench.lock, nice 19):
 * ONE clip per lock turn while anyone else is waiting for the lock, otherwise a batch of --par clips
 * (default 3) in parallel per turn. A clip already complete in the cache (locally, or pulled from the
 * shared Azure copy before each clip) is skipped. Each finished clip is pushed to Azure at once.
 * Resumable: re-run the same command; progress is in <out>/progress.json.
 *
 *   node vf-record-all.js --roots <wt>[,<wt>] [--par 3] [--suites ...] [--out <dir>]
 */
const fs = require('fs');
const path = require('path');
const { SUITES } = require('./vf-suites');
const { makeTasks, runLocked, foreignWaiters, CACHE, CODEC, MODEL } = require('./vf-check');
const { modelSha } = require('./emis-cache');
const remote = require('./remote-cache');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const roots = arg('roots', '').split(',').filter(Boolean).map((r) => path.resolve(r));
if (!roots.length) throw new Error('--roots <worktree>[,<worktree>]');
const PAR = Number(arg('par', 3));
const outRoot = path.resolve(arg('out', path.join(CACHE, 'record-runs', `all-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`)));
fs.mkdirSync(outRoot, { recursive: true });
const progFile = path.join(outRoot, 'progress.json');
const progress = fs.existsSync(progFile) ? JSON.parse(fs.readFileSync(progFile, 'utf8')) : { done: {}, failed: {}, started: new Date().toISOString() };
const save = () => fs.writeFileSync(progFile, JSON.stringify(progress, null, 1));
const model = modelSha(MODEL, CACHE).slice(0, 12);
const now = () => Date.now() / 1000;
const log = (s) => console.log(`${new Date().toISOString().slice(11, 19)} ${s}`);

// ordered clip list: renton, smoke, then the rest longest-first
const suites = (arg('suites', Object.keys(SUITES).join(','))).split(',');
const all = [];
for (const s of suites) for (const j of SUITES[s].jobs()) all.push({ ...j, suite: s });
const smokeIds = new Set(all.filter((j) => (SUITES[j.suite].smoke || []).includes(j.clip)).map((j) => j.id));
const tier = (j) => (j.suite === 'renton' ? 0 : smokeIds.has(j.id) ? 1 : 2);
all.sort((a, b) => tier(a) - tier(b) || b.dur - a.dur);
const seen = new Set();
const queue = all.filter((j) => (seen.has(j.id) ? false : seen.add(j.id)));

const localDone = (j) => {
  const d = path.join(CACHE, `${model}-${CODEC}`, j.id);
  return fs.existsSync(path.join(d, 'emis.bin')) && fs.existsSync(path.join(d, 'index.jsonl'));
};
let seq = 0;
async function runBatch(batch, par) {
  // each root in turn (a later root only runs the model where its windows differ)
  for (const [ri, root] of roots.entries()) {
    const tasks = makeTasks(batch, ri === 0 ? 'base' : `root${ri}`, root, outRoot, 'record', { perClip: true });
    const st = await runLocked({ jobs: par, tasks, verbose: true }, path.join(outRoot, `plan-${seq++}.json`), { threads: 3 });
    for (const j of batch) {
      const k = `${ri === 0 ? 'base' : `root${ri}`}/${j.suite}/${j.id}`;
      const s = st.status[k];
      if (!s || s.code) progress.failed[j.id] = { root, err: s ? s.err : 'not run', at: new Date().toISOString() };
    }
  }
  for (const j of batch) {
    if (!progress.failed[j.id] && localDone(j)) progress.done[j.id] = { suite: j.suite, dur: j.dur, at: new Date().toISOString() };
    save();
  }
  try {
    const r = await remote.push({ root: CACHE, model, codec: CODEC, clips: batch.map((j) => ({ id: j.id, wav: j.wav })), commit: null, log: () => {} });
    log(`pushed ${r.pushed} clips, ${(r.bytes / 1e6).toFixed(1)} MB; remote total ${(r.remoteTotal / 1e6).toFixed(0)} MB`);
  } catch (e) { log(`push failed (will retry on the next batch): ${remote.redact(e.message)}`); }
}

(async () => {
  const t0 = now();
  log(`${queue.length} clips, ${(queue.reduce((a, j) => a + j.dur, 0) / 3600).toFixed(1)} h of audio, roots ${roots.join(', ')}, cache ${CACHE} (${model}-${CODEC})`);
  let i = 0;
  while (i < queue.length) {
    const j = queue[i];
    if (progress.done[j.id] || progress.failed[j.id]) { i++; continue; }
    // the shared copy may already have it (another machine, or an earlier run)
    try { await remote.pull({ root: CACHE, model, codec: CODEC, clips: [{ id: j.id, wav: j.wav }], log: () => {} }); } catch (_) { /* offline: record */ }
    if (localDone(j) && roots.length === 1) { progress.done[j.id] = { suite: j.suite, dur: j.dur, skipped: true }; save(); i++; continue; }
    const par = foreignWaiters() ? 1 : PAR;
    const batch = [];
    while (batch.length < par && i < queue.length) {
      const x = queue[i++];
      if (!progress.done[x.id] && !progress.failed[x.id]) batch.push(x);
    }
    log(`batch of ${batch.length} (${par} parallel${par === 1 ? ', others waiting for the lock' : ''}): ${batch.map((x) => x.id).join(' ')}`);
    const tb = now();
    await runBatch(batch, par);
    const done = Object.keys(progress.done).length;
    log(`  done in ${((now() - tb) / 60).toFixed(1)} min; ${done}/${queue.length} clips cached, ${((now() - t0) / 3600).toFixed(2)} h elapsed`);
  }
  const bySuite = {};
  for (const [id, d] of Object.entries(progress.done)) { bySuite[d.suite] = bySuite[d.suite] || { clips: 0, hours: 0 }; bySuite[d.suite].clips++; bySuite[d.suite].hours += d.dur / 3600; }
  console.log('\n| suite | clips recorded | audio hours |\n|---|---|---|');
  for (const [s, v] of Object.entries(bySuite)) console.log(`| ${s} | ${v.clips} | ${v.hours.toFixed(2)} |`);
  console.log(`failed: ${Object.keys(progress.failed).length} ${Object.keys(progress.failed).join(' ')}`);
  const m = await remote.list();
  console.log(`Azure bench-cache/: ${([...m.values()].reduce((a, b) => a + b, 0) / 1e9).toFixed(2)} GB in ${m.size} blobs`);
})().catch((e) => { console.error(e.stack); process.exit(1); });
