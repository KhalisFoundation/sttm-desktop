// farm-jobs.js — every GAB clip with a runner (all tiers, all splits) as the farm sees it: one JSON line per clip
// {id, suite, clip, tier, split, folder, dur, wav, exists}. Run from the GAB tools dir (needs gab-sets.json,
// vf-suites.js, VF_BENCHMARK = the benchmark copy with manifest.csv, VF_CLIPS = the runners' wav dir).
const fs = require('fs');
const path = require('path');
const TOOLS = process.argv[2] || process.cwd();
const G = require(path.join(TOOLS, 'gab-score'));
const { SUITES } = require(path.join(TOOLS, 'vf-suites'));
const { parseCsv, canonRows } = require(path.join(TOOLS, 'vf-manifest'));
const BENCH = process.env.VF_BENCHMARK;
const rows = canonRows(parseCsv(fs.readFileSync(path.join(BENCH, 'manifest.csv'), 'utf8')));
const sets = G.loadSets();
const memo = {};
delete process.env.VF_SPLIT;
for (const r of rows) {
  const tier = ['main', 'hard', 'akhand'].find((t) => G.inTier(r, t, sets));
  const first = (r.suite_jobs || '').split(';').filter(Boolean)[0];
  if (!first) { console.log(JSON.stringify({ id: r.id, tier, split: r.split, skip: 'no runner' })); continue; }
  if ((sets.exclude || {})[r.id]) { console.log(JSON.stringify({ id: r.id, tier, split: r.split, skip: `excluded: ${sets.exclude[r.id]}` })); continue; }
  const [suite, clip] = first.split(':');
  if (!SUITES[suite]) { console.log(JSON.stringify({ id: r.id, tier, skip: `unknown suite ${suite}` })); continue; }
  memo[suite] ||= SUITES[suite].jobs();
  const j = memo[suite].find((x) => x.clip === clip || x.id === clip);
  if (!j) { console.log(JSON.stringify({ id: r.id, tier, skip: `suite ${suite} has no job ${clip}` })); continue; }
  console.log(JSON.stringify({ id: j.id, row: r.id, suite, clip: j.clip, tier, split: r.split, folder: r.content_folder, dur: j.dur, wav: j.wav, exists: fs.existsSync(j.wav), args: j.args, only: j.only || null, root: !!j.root, outFile: j.outFile }));
}
