#!/usr/bin/env node
/* gab.js — GAB, the Gurbani Autopilot Bench: one entry point for benchmarking STTM Voice-Follow from the cache,
 * and for growing the benchmark. See GAB.md.
 *
 *   Tiers (gab-sets.json `tiers`): every command below scores the MAIN tier (everything except GAB-Hard) unless
 *   --set hard (or `gab hard run|compare ...`): GAB-Hard = the Fremont hall laptop-mic recordings only; --set akhand (or
 *   `gab akhand run|compare ...`): GAB-Akhand Kirtan = smagam kirtan with many singers (gab-sets.json tiers). Never mixed.
 *   gab run <build> [--set main|hard] [--manifest hf | <local benchmark dir>] [--tier smoke|full] [--split dev|test|train,dev] [--folders 1-kirtan-shabad,2-bani-recited/japji] [--ids rt11_,kh12]
 *                   [--name "<build name>"] [--out <dir>] [--jobs N] [--keep]                        -> scorecard
 *   gab compare <A> <B> [same options]                    -> both scorecards + before/after with pass/fail guardrails
 *   gab slowpc <A> <B> [--clips rehras,kh04,ytasa1] [--speeds 0.5,0.7,0.9,1.2] [--jobs N]  -> simulated slow-PC sweep
 *   gab pull [--split ...]                                 -> fetch every locally missing / partial cache entry from Azure
 *   gab fill [--root <build>] [--plan] [--no-push]        -> pull from Azure, then record (model) only what is in
 *                                                             neither place, then push it to Azure
 *   gab ingest [--dry-run] [--push]                       -> pull new Jaspal recordings, rebuild the manifest, fill plan
 *   gab publish <main scorecard.json> --hard <hard scorecard.json> --name "<build name>"  -> one row (both tiers) on the
 *                                                             leaderboard Space + the dataset card's short table
 *   gab publish --batch <batch.json>                      -> every build in one commit (after a GAB version change)
 *   gab harvest [...]                                      -> Azure sessions -> review queue (gab-harvest.js)
 *   gab review [--queue <dir>] [--port 8771]              -> yes/no ear-check app over a review queue (gab-review.js)
 *   gab label pick|first|review|apply|upload <batch> ...  -> line-level answer keys: slide OCR + aligner, a person
 *                                                             checks the unsure pangti starts (sttm-desktop
 *                                                             research/level2-dataset/linelabel, LINE-LABEL.md)
 *
 * <build> = an app worktree path, or a git rev of ~/personal/sttm-desktop (`upstream` = khalis/experimental-release);
 * a rev gets a detached worktree under <cache>/worktrees/<sha12> (same place vf-check uses).
 * Cache rule (every command): an entry missing locally is pulled from the shared Azure bench-cache first; the model
 * runs only for entries missing in BOTH places (gab fill, under the bench lock, nice 19). gab run / compare never
 * run the model: a clip missing in both places is listed as "not run (needs gab fill)".
 * `gab hard <build>` = `gab run <build> --set hard`; `gab hard compare A B` = `gab compare A B --set hard`; `gab akhand ...` likewise.
 * Split rule: the default split `dev` = every row that is not test (train + dev). Test rows run only with --split test.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const G = require('./gab-score');

const TOOLS = __dirname;
const DS = path.join(TOOLS, '..');
const MAIN_REPO = process.env.VF_MAIN_REPO || '/Users/asingh02/personal/sttm-desktop';
let BENCH = process.env.VF_BENCHMARK || path.join(os.homedir(), 'personal/vf-benchmark');
const { DEFAULT_ROOT, modelSha } = require('./emis-cache');
const CACHE = path.resolve(process.env.VF_EMIS_CACHE || DEFAULT_ROOT);
const MODEL = process.env.MODEL || '/Users/asingh02/AAI/models/karansea-shabad-ctc/model.int8.onnx';
// x86 is the reference (owner, Oct 17 2026): GAB scores from the x86 (linux-x64) model output of every recording
// (codec namespace q16-x86, recorded on the GCP VM). VF_EMIS_CODEC=q16 = the older mixed Mac + x86 cache. Set in env so
// vf-check and the runners it starts use the same namespace.
if (!process.env.VF_EMIS_CODEC) process.env.VF_EMIS_CODEC = 'q16-x86';
const CODEC = process.env.VF_EMIS_CODEC;
const MIN_FREE_GB = Number(process.env.VF_MIN_FREE_GB || 15);
const HF_REPO = 'khalisfoundation/GurbaniAutopilotBench';
const hfToken = () => process.env.HF_TOKEN || (fs.existsSync(path.join(os.homedir(), '.vf-hf-token')) ? fs.readFileSync(path.join(os.homedir(), '.vf-hf-token'), 'utf8').trim() : '');
async function hfGet(repo, file) {
  const t = hfToken();
  // Hugging Face rate-limits bursts (HTTP 429, e.g. several cloud sessions at once): wait and retry, up to ~8 min
  for (let k = 0; ; k++) {
    const r = await fetch(`https://huggingface.co/datasets/${repo}/resolve/main/${file.split('/').map(encodeURIComponent).join('/')}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
    if (r.ok) return r.text();
    if ((r.status === 429 || r.status >= 500) && k < 8) { await new Promise((ok) => setTimeout(ok, Math.min(120, 5 * 2 ** k) * 1000 * (0.75 + Math.random() / 2))); continue; }
    throw new Error(`HF ${r.status} for ${file}`);
  }
}
// --manifest hf[:org/repo]: score against the dataset on Hugging Face (manifest + the selected clips' truth csv files,
// cached per manifest hash under <cache>/gab-hf/<sha>/); default: the local copy ~/personal/vf-benchmark
async function useHfManifest() {
  const spec = arg('manifest');
  if (!spec || !spec.startsWith('hf')) { if (spec) BENCH = path.resolve(spec.replace(/manifest\.csv$/, '')); return null; }
  const repo = spec.includes(':') ? spec.split(':')[1] : HF_REPO;
  const text = await hfGet(repo, 'manifest.csv');
  BENCH = path.join(CACHE, 'gab-hf', G.manifestSha(text));
  fs.mkdirSync(BENCH, { recursive: true });
  fs.writeFileSync(path.join(BENCH, 'manifest.csv'), text);
  return repo;
}
async function fetchTruth(repo, rows) {
  let n = 0;
  await Promise.all([0, 1, 2, 3, 4, 5].map(async (k) => {
    for (const r of rows.filter((_, i) => i % 6 === k)) {
      const d = path.join(BENCH, r.content_folder, r.id);
      fs.mkdirSync(d, { recursive: true });
      for (const f of ['lines.csv', 'shabads.csv']) {
        if (fs.existsSync(path.join(d, f))) continue;
        try { fs.writeFileSync(path.join(d, f), await hfGet(repo, `${r.content_folder}/${r.id}/${f}`)); n++; } catch (e) { /* no such truth file: scored as absent */ }
      }
    }
  }));
  // ear checks of aligned line starts (scorers skip a rejected line)
  const vf = path.join(BENCH, 'human-verdicts', 'line-start-check', 'verdicts.csv');
  if (!fs.existsSync(vf)) { try { const t = await hfGet(repo, 'human-verdicts/line-start-check/verdicts.csv'); fs.mkdirSync(path.dirname(vf), { recursive: true }); fs.writeFileSync(vf, t); n++; } catch (_) { /* none */ } }
  return n;
}
// smoke tier: ~1 min; per GAB tier and split (test smoke only with --split test)
const SMOKE = {
  main: {
    dev: ['clip02', 'clip05', 'clip13', 'clip34', 'pt01', 'pt19', 'pt28', 'pt35', 'pt52'],
    test: ['rt11_hukamnama', 'rt11_sohila', 'nw11_kirtan2'],
  },
  hard: {
    dev: ['kh12_sttm_desktop_2026_10_11T02_50_05_783Z', 'kh14_sttm_desktop_2026_10_11T13_42_38_291Z', 'kh28_sttm_desktop_2026_10_13T03_01_13_513Z', 'kh29_sttm_desktop_2026_10_13T03_13_38_540Z'],
    test: ['kh05_sttm_desktop_2026_10_08T04_05_00_105Z'],
  },
  akhand: {
    dev: ['l3clip01', 'l3clip18', 'l3clip24'],
    test: ['l3clip10'],
  },
};

let argv = process.argv.slice(2);
// `gab hard <build>` / `gab hard run|compare ...` = the same command with --set hard
// `gab akhand <build>` / `gab akhand run|compare ...` = the same with --set akhand (GAB-Akhand Kirtan)
if (argv[0] === 'hard' || argv[0] === 'akhand') {
  const sub = ['run', 'compare'].includes(argv[1]) ? argv[1] : 'run';
  argv = [sub, ...argv.slice(sub === argv[1] ? 2 : 1), '--set', argv[0]];
}
const cmd = argv[0];
const pos = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--') && !['--keep', '--plan', '--push', '--no-push', '--dry-run', '--include-dev'].includes(all[i - 1])));
const flag = (n) => argv.includes(`--${n}`);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const sh = (c, a, o = {}) => execFileSync(c, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...o }).trim();
const now = () => Date.now() / 1000;
const r1 = (x) => +x.toFixed(1);
const load = () => os.loadavg().map((x) => x.toFixed(1)).join(' ');

// ---------------------------------------------------------------- builds -------------
function resolveBuild(spec) {
  if (!spec) throw new Error('missing <build> (an app worktree, or a git rev such as `upstream`)');
  let dir = path.resolve(spec.replace(/^~/, os.homedir()));
  if (!fs.existsSync(path.join(dir, 'www'))) {
    const rev = spec === 'upstream' ? 'khalis/experimental-release' : spec;
    const sha = sh('git', ['-C', MAIN_REPO, 'rev-parse', '--verify', `${rev}^{commit}`]);
    dir = path.join(CACHE, 'worktrees', sha.slice(0, 12));
    if (!fs.existsSync(path.join(dir, 'www'))) {
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      sh('git', ['-C', MAIN_REPO, 'worktree', 'add', '--detach', dir, sha]);
    }
    const nm = path.join(dir, 'node_modules');
    if (!fs.existsSync(nm)) fs.symlinkSync(path.join(MAIN_REPO, 'node_modules'), nm);
  }
  let commit = null;
  let dirty = true;
  let subject = '';
  try {
    commit = sh('git', ['-C', dir, 'rev-parse', '--short=12', 'HEAD']);
    dirty = !!sh('git', ['-C', dir, 'status', '--porcelain', '--', 'www', ':(exclude)www/assets/videos']);
    subject = sh('git', ['-C', dir, 'log', '-1', '--format=%s']);
  } catch (_) { /* not a git tree */ }
  // Voice-Follow feature version stamped in the build (shadow/config.js, since 9.0.1); null = before the stamp existed
  let featureVersion = null;
  try { const m = fs.readFileSync(path.join(dir, 'www/main/addons/voice-follow/shadow/config.js'), 'utf8').match(/VF_FEATURE_VERSION\s*=\s*'([^']+)'/); featureVersion = m ? m[1] : null; } catch (_) { /* no config */ }
  return { root: dir, commit, dirty, subject, spec, featureVersion };
}

// ---------------------------------------------------------------- selection ----------
function loadManifest() {
  const text = fs.readFileSync(path.join(BENCH, 'manifest.csv'), 'utf8');
  const { parseCsv, canonRows } = require('./vf-manifest');
  return { text, rows: canonRows(parseCsv(text)), sha: G.manifestSha(text) };
}
const splitOk = (split) => {
  const want = arg('split', 'dev');
  if (want === 'dev') return split !== 'test';
  return want.split(',').includes(split);
};
const suiteJobsMemo = {};
function suiteJob(suite, clip) {
  const { SUITES } = require('./vf-suites');
  if (!SUITES[suite]) return null;
  if (!suiteJobsMemo[suite]) { const prev = process.env.VF_SPLIT; delete process.env.VF_SPLIT; suiteJobsMemo[suite] = SUITES[suite].jobs(); if (prev) process.env.VF_SPLIT = prev; }
  return suiteJobsMemo[suite].find((j) => j.clip === clip || j.id === clip) || null;
}
// -> { man, rows, jobs: [{ row, suite, clip, id, wav, dur, outFile }], notRun: [{ id, folder, why }] }
const gabSet = () => {
  const s = arg('set', 'main');
  const known = Object.keys(G.loadSets().tiers || { main: 1 });
  if (!known.includes(s)) throw new Error(`--set ${known.join('|')} (got ${s})`);
  return s;
};
function select({ tier = arg('tier', 'smoke'), folders = arg('folders'), set = gabSet() } = {}) {
  const man = loadManifest();
  const splitKey = arg('split', 'dev') === 'test' ? 'test' : 'dev';
  const sets = G.loadSets();
  // the GAB tier first (main = all but GAB-Hard; hard = GAB-Hard only), then split, folders, ids, smoke
  let rows = man.rows.filter((r) => G.inTier(r, set, sets) && splitOk(r.split));
  if (folders) { const fs2 = folders.split(',').map(require('./folder-names').canonFolder); rows = rows.filter((r) => fs2.some((f) => r.content_folder === f || r.content_folder.startsWith(`${f}/`))); }
  // --ids rt11_,kh12: only clips whose id starts with one of these (reconciliation of an old number on its own clips)
  if (arg('ids')) { const pre = arg('ids').split(','); rows = rows.filter((r) => pre.some((p) => r.id.startsWith(p))); }
  if (tier === 'smoke') rows = rows.filter((r) => set !== 'all' && ((SMOKE[set] || {})[splitKey] || []).includes(r.id));
  else if (tier !== 'full') throw new Error(`--tier smoke|full (got ${tier})`);
  const jobs = [];
  const notRun = [];
  const { exclude } = sets;
  for (const r of rows) {
    if (exclude[r.id]) { notRun.push({ id: r.id, folder: r.content_folder, why: `excluded (${exclude[r.id]})` }); continue; }
    const first = (r.suite_jobs || '').split(';').filter(Boolean)[0];
    if (!first) { notRun.push({ id: r.id, folder: r.content_folder, why: 'no replay runner for this clip yet' }); continue; }
    const [suite, clip] = first.split(':');
    const j = suiteJob(suite, clip);
    if (!j) { notRun.push({ id: r.id, folder: r.content_folder, why: `suite ${suite} has no job for ${clip}` }); continue; }
    if (!fs.existsSync(j.wav)) { notRun.push({ id: r.id, folder: r.content_folder, why: 'audio not on this Mac' }); continue; }
    jobs.push({ row: r, suite, clip: j.clip, id: j.id, wav: j.wav, dur: j.dur, outFile: j.outFile });
  }
  return { man, rows, jobs, notRun, tier, split: arg('split', 'dev'), set };
}

// ---------------------------------------------------------------- cache (Azure first) -
const msha12 = () => modelSha(MODEL, CACHE).slice(0, 12);
const entryDir = (id) => path.join(CACHE, `${msha12()}-${CODEC}`, id);
const cachedLocally = (id) => fs.existsSync(path.join(entryDir(id), 'index.jsonl')) && fs.existsSync(path.join(entryDir(id), 'emis.bin'));
function freeBytes(dir) {
  const out = sh('df', ['-k', dir]).split('\n').pop().trim().split(/\s+/);
  return Number(out[3]) * 1024;
}
// Pull every entry that is missing locally (thorough: also partial ones) from the shared Azure bench-cache.
// Returns the ids still missing in both places (= need the model).
async function pullMissing(clips, { thorough = false, say = console.log } = {}) {
  // VF_NO_EMIS_PULL=1 (cloud-gab): the builds' replays come from the shared results cache (results-sync.js pull), so
  // the model output is not fetched; a build that does need a replay then reports a cache miss = INCOMPLETE, never PASS
  if (process.env.VF_NO_EMIS_PULL === '1') return [];
  const uniq = [...new Map(clips.map((c) => [c.id, { id: c.id, wav: c.wav }])).values()].filter((c) => fs.existsSync(c.wav));
  const todo = thorough ? uniq : uniq.filter((c) => !cachedLocally(c.id));
  if (!todo.length) return [];
  const remote = require('./remote-cache');
  let listing;
  try { listing = await remote.list(); } catch (e) { say(`(Azure bench-cache not reachable: ${remote.redact(e.message).slice(0, 120)}); ${todo.filter((c) => !cachedLocally(c.id)).length} entries missing locally`); return todo.filter((c) => !cachedLocally(c.id)).map((c) => c.id); }
  let need = 0;
  for (const c of todo) {
    const k = `${remote.PREFIX}/${msha12()}/${CODEC}/${remote.audioSha(c.wav)}`;
    const rb = listing.get(`${k}.bin`) || 0;
    const local = fs.existsSync(path.join(entryDir(c.id), 'emis.bin')) ? fs.statSync(path.join(entryDir(c.id), 'emis.bin')).size : 0;
    if (rb > local) need += rb + (listing.get(`${k}.index.jsonl`) || 0);
  }
  if (need) {
    const free = freeBytes(CACHE);
    // not enough disk: pull nothing and say so; the clips stay 'not in the local cache' (listed as not run), so a
    // run on the other clips still works (never a half-filled disk; the Mac hit 0 bytes free once, Oct 13 2026)
    if (free - need < MIN_FREE_GB * 1e9) {
      say(`NOT pulling ${(need / 1e9).toFixed(1)} GB from Azure: it would leave < ${MIN_FREE_GB} GB free (free ${(free / 1e9).toFixed(1)} GB); free disk space, then gab pull. These clips are not run.`);
      return todo.filter((c) => !cachedLocally(c.id)).map((c) => c.id);
    }
    say(`pulling ${(need / 1e6).toFixed(0)} MB of cache entries from Azure bench-cache ...`);
    const r = await remote.pull({ root: CACHE, model: msha12(), codec: CODEC, clips: todo, log: () => {} });
    say(`pulled ${r.pulled} entries (${(r.bytes / 1e6).toFixed(0)} MB) from Azure`);
  }
  return todo.filter((c) => !cachedLocally(c.id)).map((c) => c.id);
}

// ---------------------------------------------------------------- replay -------------
function runNode(args, { quiet = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: TOOLS, stdio: ['ignore', quiet ? 'pipe' : 'inherit', 'inherit'] });
    let out = '';
    if (quiet) child.stdout.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
  });
}
async function replay(A, B, jobs, outDir) {
  const suites = [...new Set(jobs.map((j) => j.suite))];
  const only = [...new Set(jobs.map((j) => j.clip))];
  const args = ['vf-check.js', '--base', A.root, '--cand', B.root, '--suites', suites.join(','), '--only', only.join(','), '--out', outDir, '--replay-only', '--no-pull'];
  if (arg('jobs')) args.push('--jobs', arg('jobs'));
  const { code, out } = await runNode(args, { quiet: true });
  const rep = path.join(outDir, 'replay.json');
  if (!fs.existsSync(rep)) throw new Error(`vf-check replay failed (exit ${code}):\n${out.split('\n').slice(-15).join('\n')}`);
  return JSON.parse(fs.readFileSync(rep, 'utf8'));
}
// Clips that did not replay (cache miss = the build asked the model for new windows; or a replay
// error), on the given sides. Any such clip makes the run/compare INCOMPLETE: no verdict, exit 3.
function unreplayed(rep, sides) {
  return [...rep.missed.map((m) => ({ ...m, why: 'cache miss' })), ...rep.failed.map((m) => ({ ...m, why: 'replay error' }))]
    .filter((m) => sides.some((s) => m.key.startsWith(`${s}/`)));
}
function incompleteNote(bad) {
  return `INCOMPLETE: ${bad.length} clip run(s) did not replay, so these numbers are not a verdict (fill the missing windows with \`gab fill\` or vf-check --fill, then rerun): ${bad.map((m) => `${m.key} (${m.why})`).join(', ')}`;
}
function eventsFile(outDir, side, j) {
  const tr = path.join(outDir, side, j.suite, 'trace', `${j.id}.events.jsonl`);
  if (fs.existsSync(tr)) return tr;
  const js = path.join(outDir, side, j.suite, j.outFile);
  return fs.existsSync(js) ? js : null;
}
function cardFor(sel, build, side, outDir, rep, extra) {
  const sv = require('./sangat-score');
  const ds = sv.loadDataset(BENCH);
  const bad = new Set([...rep.missed, ...rep.failed].map((m) => m.key));
  const notRun = [...sel.notRun];
  const runs = [];
  for (const j of sel.jobs) {
    if (bad.has(`${side}/${j.suite}/${j.id}`)) {
      const miss = rep.missed.some((m) => m.key === `${side}/${j.suite}/${j.id}`);
      notRun.push({ id: j.row.id, folder: j.row.content_folder, why: miss ? 'replay left the cache (this build asks the model for new windows: gab fill)' : 'replay error' });
      continue;
    }
    if (extra.missingBoth && extra.missingBoth.includes(j.id)) continue;
    const ev = eventsFile(outDir, side, j);
    if (!ev) { notRun.push({ id: j.row.id, folder: j.row.content_folder, why: 'no replay output' }); continue; }
    runs.push({ row: j.row, suite: j.suite, events: ev });
  }
  const card = G.scorecard({ sv, ds, clips: runs, meta: {
    createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    build: { name: arg('name') || null, root: build.root, commit: build.commit, dirty: build.dirty, subject: build.subject, featureVersion: build.featureVersion },
    manifest: { sha: sel.man.sha, rows: sel.man.rows.length, path: path.join(BENCH, 'manifest.csv') },
    set: sel.set, tier: sel.tier, split: sel.split === 'dev' ? 'dev (train + dev rows; test held out)' : sel.split, folders: arg('folders') || null,
    notRun: notRun.sort((a, b) => a.id.localeCompare(b.id)),
    timings: extra.timings,
  } });
  sv.close();
  return card;
}

function outDirFor(kind) {
  const d = path.resolve(arg('out', path.join(DS, 'results', 'gab', `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}-${kind}`)));
  fs.mkdirSync(d, { recursive: true });
  return d;
}
const write = (file, s) => fs.writeFileSync(file, typeof s === 'string' ? `${s}\n` : JSON.stringify(s, null, 1));

async function prepare(builds, label) {
  const t0 = now();
  const repo = await useHfManifest();
  const sel = select();
  if (repo) { const n = await fetchTruth(repo, sel.jobs.map((j) => j.row)); console.log(`manifest + truth from Hugging Face ${repo} (${n} truth files fetched, cached in ${BENCH})`); }
  const out = outDirFor(label);
  console.log(`${G.GAB_VERSION} ${label}: ${G.tierTitle(sel.set)} (--set ${sel.set}) · manifest ${sel.man.sha} · tier ${sel.tier} · split ${sel.split}${arg('folders') ? ` · folders ${arg('folders')}` : ''} · ${sel.jobs.length} clips (${(sel.jobs.reduce((a, j) => a + j.dur, 0) / 3600).toFixed(2)} h of audio), ${sel.notRun.length} without a runner · load ${load()}`);
  for (const b of builds) console.log(`  build ${b.root} @ ${b.commit}${b.dirty ? ' (uncommitted edits)' : ''}`);
  console.log(`  model output: ${/-x86$/.test(CODEC) ? 'x86 reference' : 'NOT the x86 reference'} (codec ${CODEC})`);
  const missingBoth = await pullMissing(sel.jobs);
  if (missingBoth.length) console.log(`  ${missingBoth.length} clips are in neither the local nor the Azure cache (not run; record them with gab fill): ${missingBoth.join(' ')}`);
  const jobs = sel.jobs.filter((j) => !missingBoth.includes(j.id));
  for (const id of missingBoth) { const j = sel.jobs.find((x) => x.id === id); sel.notRun.push({ id: j.row.id, folder: j.row.content_folder, why: 'not in the local or Azure cache (gab fill)' }); }
  return { t0, sel: { ...sel, jobs }, out, missingBoth };
}

async function cmdRun() {
  const W = resolveBuild(pos[0]);
  const { t0, sel, out, missingBoth } = await prepare([W], 'run');
  const t1 = now();
  const rep = sel.jobs.length ? await replay(W, W, sel.jobs, path.join(out, 'replay')) : { missed: [], failed: [], reused: 0, runs: 0 };
  // one build on both sides of vf-check: each clip is counted once
  const timings = { replay_s: r1(now() - t1), clip_runs: Math.ceil(rep.runs / 2), reused: Math.ceil(rep.reused / 2), load: load() };
  const card = cardFor(sel, W, 'base', path.join(out, 'replay'), rep, { missingBoth, timings });
  card.timings.total_s = r1(now() - t0);
  write(path.join(out, 'scorecard.json'), card);
  const md = G.markdown(card);
  write(path.join(out, 'scorecard.md'), md);
  const badRun = unreplayed(rep, ['base']);
  if (badRun.length) { card.incomplete = badRun; write(path.join(out, 'scorecard.json'), card); }
  console.log(`\n${md}\n\nscorecard: ${path.join(out, 'scorecard.json')}`);
  if (badRun.length) { console.log(`\n${incompleteNote(badRun)}`); process.exitCode = 3; }
  // the second-by-second view (Space timeline.html) from the screen events, before they are deleted; gab publish uploads it
  try {
    const sv = require('./sangat-score');
    const tl = require('./gab-timeline').build({ sv, ds: sv.loadDataset(BENCH), card, sideDir: path.join(out, 'replay', 'base'), label: arg('name') || null });
    sv.close();
    if (tl) { write(path.join(out, 'timeline.json'), JSON.stringify(tl)); console.log(`timeline: ${path.join(out, 'timeline.json')} (${tl.clips.length} clips)`); }
  } catch (e) { console.log(`(timeline not written: ${String(e.message).slice(0, 160)})`); }
  if (!flag('keep')) fs.rmSync(path.join(out, 'replay'), { recursive: true, force: true });
}

async function cmdCompare() {
  const A = resolveBuild(pos[0]);
  const B = resolveBuild(pos[1]);
  const { t0, sel, out, missingBoth } = await prepare([A, B], 'compare');
  const t1 = now();
  const rep = sel.jobs.length ? await replay(A, B, sel.jobs, path.join(out, 'replay')) : { missed: [], failed: [], reused: 0, runs: 0 };
  const timings = { replay_s: r1(now() - t1), clip_runs: rep.runs, reused: rep.reused, load: load() };
  const nameA = arg('name-a') || null;
  const nameB = arg('name-b') || arg('name') || null;
  const ca = cardFor(sel, A, 'base', path.join(out, 'replay'), rep, { missingBoth, timings });
  ca.build.name = nameA;
  const cb = cardFor(sel, B, 'cand', path.join(out, 'replay'), rep, { missingBoth, timings });
  cb.build.name = nameB;
  // screen-event diff per clip (what the hall would see differently)
  const scr = (f) => (f && f.endsWith('.jsonl') ? fs.readFileSync(f, 'utf8').split('\n').filter((l) => /"type":"(shabad|verse|seeking)"/.test(l)).join('\n') : null);
  const changed = sel.jobs.filter((j) => { const a = scr(eventsFile(path.join(out, 'replay'), 'base', j)); const b = scr(eventsFile(path.join(out, 'replay'), 'cand', j)); return a != null && b != null && a !== b; }).map((j) => j.row.id);
  const c = G.compare(ca, cb);
  c.screenChanged = changed;
  // A clip that did not replay on either side leaves the two scorecards on different clips: no verdict.
  const badCmp = unreplayed(rep, ['base', 'cand']);
  if (badCmp.length) { c.incomplete = badCmp; c.pass = false; }
  const total = r1(now() - t0);
  for (const card of [ca, cb]) card.timings.total_s = total;
  write(path.join(out, 'scorecard-A.json'), ca);
  write(path.join(out, 'scorecard-B.json'), cb);
  write(path.join(out, 'compare.json'), c);
  const md = [G.compareMarkdown(c, ca, cb), '', `Screen events differ on ${changed.length} of ${sel.jobs.length} clips${changed.length ? `: ${changed.slice(0, 20).join(', ')}${changed.length > 20 ? ' ...' : ''}` : ''}.`, `Timing: total ${total} s (replay ${timings.replay_s} s, ${rep.runs} clip runs, ${rep.reused} reused), load ${timings.load}.`, '', G.markdown(ca), '', G.markdown(cb)].join('\n');
  write(path.join(out, 'compare.md'), md);
  console.log(`\n${md}\n\ncompare: ${path.join(out, 'compare.json')}`);
  if (!flag('keep')) fs.rmSync(path.join(out, 'replay'), { recursive: true, force: true });
  if (badCmp.length) console.log(`\n${incompleteNote(badCmp)}`);
  process.exitCode = badCmp.length ? 3 : c.pass ? 0 : 1;
}

async function cmdSlowpc() {
  const A = resolveBuild(pos[0]);
  const B = resolveBuild(pos[1]);
  const clips = arg('clips', 'rehras,kh04,ytasa1').split(',');
  const CLIPS = require('./vf-suites').CLIPS;
  const wavOf = (c) => { const id = c === 'rehras' ? 'rt11_rehras' : c.split(':')[0]; const f = fs.existsSync(path.join(CLIPS, `${id}.wav`)) ? `${id}.wav` : fs.readdirSync(CLIPS).find((x) => x.startsWith(`${id}_`) && x.endsWith('.wav')); return f ? { id: path.basename(f, '.wav'), wav: path.join(CLIPS, f) } : null; };
  const need = clips.map(wavOf).filter(Boolean);
  const missingBoth = await pullMissing(need);
  if (missingBoth.length) console.log(`(not in the local or Azure cache: ${missingBoth.join(' ')}; their cells need --fill)`);
  const name = (b, d) => (arg(d) || path.basename(b.root)).replace(/[=,]/g, '-');
  const args = ['sim-sweep.js', '--builds', `${name(A, 'name-a')}=${A.root},${name(B, 'name-b')}=${B.root}`, '--clips', clips.join(',')];
  for (const k of ['speeds', 'jobs', 'keep', 'sim-js-ms']) if (arg(k)) args.push(`--${k}`, arg(k));
  for (const k of ['fill', 'sim-serial', 'sim-flat']) if (flag(k)) args.push(`--${k}`);
  console.log(`${G.GAB_VERSION} slowpc (simulated slow PC, timing only; never on the leaderboard): ${args.slice(1).join(' ')}`);
  const { code } = await runNode(args);
  process.exitCode = code;
}

async function cmdPull() {
  const sel = select({ tier: arg('tier', 'full'), set: arg('set', 'all') });
  const t0 = now();
  const left = await pullMissing(sel.jobs, { thorough: flag('thorough') });
  console.log(`${sel.jobs.length} clips checked in ${r1(now() - t0)} s; ${left.length} in neither place${left.length ? `: ${left.join(' ')}` : ''}`);
}

async function cmdFill() {
  // every manifest clip with a runner, all splits: pull from Azure first (thorough), then the model only for the rest
  process.argv.push('--split', 'train,dev,test');
  argv.push('--split', 'train,dev,test');
  const sel = select({ tier: 'full', set: 'all' });
  const left = await pullMissing(sel.jobs, { thorough: true });
  console.log(`fill: ${sel.jobs.length} manifest clips with a runner; ${left.length} in neither the local nor the Azure cache`);
  if (!left.length) return;
  const root = resolveBuild(arg('root', 'upstream')).root;
  const suites = [...new Set(sel.jobs.filter((j) => left.includes(j.id)).map((j) => j.suite))];
  const only = sel.jobs.filter((j) => left.includes(j.id)).map((j) => j.clip);
  const args = ['vf-check.js', '--fill-new', '--roots', root, '--suites', suites.join(','), '--only', only.join(','), '--no-pull'];
  if (flag('plan')) args.push('--plan');
  else if (!flag('no-push')) args.push('--push');
  console.log(`${flag('plan') ? 'plan' : 'recording (model, bench lock, nice 19)'}: ${only.join(' ')} on ${root}`);
  const { code } = await runNode(args);
  process.exitCode = code;
}

async function cmdIngest() {
  const dry = flag('dry-run');
  let r = await runNode(['hf-ingest.js', ...(dry ? ['--dry-run'] : [])]);
  if (r.code || dry) { process.exitCode = r.code; return; }
  const before = loadManifest();
  r = await runNode(['vf-benchmark-build.js', '--out', BENCH]);
  if (r.code) { process.exitCode = r.code; return; }
  const after = loadManifest();
  const old = new Set(before.rows.map((x) => x.id));
  const added = after.rows.filter((x) => !old.has(x.id));
  console.log(`manifest ${before.sha} -> ${after.sha}: ${added.length} new clips${added.length ? ` (${added.map((x) => `${x.id.split('_')[0]} ${x.split}`).join(', ')})` : ''}`);
  if (flag('push')) { r = await runNode(['hf-ingest.js', '--push-benchmark']); process.exitCode = r.code; }
  console.log('next: gab fill --plan   (pulls from Azure, lists what still needs the model)');
}

const commands = { run: cmdRun, compare: cmdCompare, slowpc: cmdSlowpc, pull: cmdPull, fill: cmdFill, ingest: cmdIngest,
  publish: () => require('./gab-publish').main(argv.slice(1)),
  harvest: () => require('./gab-harvest').main(argv.slice(1)),
  review: () => require('./gab-review').main(argv.slice(1)),
  label: () => { const r = require('child_process').spawnSync(process.execPath, [path.join(os.homedir(), 'personal/sttm-desktop/research/level2-dataset/linelabel/label.js'), ...argv.slice(1)], { stdio: 'inherit' }); process.exitCode = r.status; } };
if (require.main === module) {
  if (!commands[cmd]) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].split('\n').slice(1).map((l) => l.replace(/^ \* ?/, '').replace(/^\/\* ?/, '')).join('\n'));
    process.exit(cmd ? 2 : 0);
  }
  Promise.resolve(commands[cmd]()).catch((e) => { console.error(`gab ${cmd}: ${String(e.stack || e).replace(/sig=[^&\s"']+/g, 'sig=REDACTED').replace(/hf_[A-Za-z0-9]+/g, 'hf_REDACTED')}`); process.exit(2); });
}
module.exports = { select, pullMissing, resolveBuild, loadManifest, BENCH, HF_REPO, CACHE };
