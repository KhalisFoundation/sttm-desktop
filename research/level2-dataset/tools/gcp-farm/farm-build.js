// farm-build.js — build the complete x86 GAB cache on the VM, per clip and resumable.
//   stage base: the baseline app (3fafc0ba) records every window it asks for (the real runner, record mode,
//               VF_ORT_THREADS=2) while tap-preload.js saves the exact audio stream it fed the app
//   stage univ: farm-universe.js records the window universe (classes, default A,C) from that stream
// A done marker per (clip, stage) under <farm>/state; a killed or self-stopped VM resumes where it left off.
// node farm-build.js [--workers 10] [--tiers main,hard,akhand] [--classes A,C] [--only id,id] [--stages base,univ]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const HOME = os.homedir();
const FARM = path.join(HOME, 'farm');
const TOOLS = path.join(HOME, 'personal/sttm-replay/research/level2-dataset/tools');
const APP = arg('app', path.join(HOME, 'personal/live-darbar-venues/cache/worktrees/3fafc0baf8a7'));
const MODEL = require('../speech-pack').speechModel().onnx;
const CACHE = arg('cache', path.join(FARM, 'cache-x86'));
const TAP = arg('tap', path.join(FARM, 'tap'));
const STATE = arg('state', path.join(FARM, 'state'));
const LOCKS = path.join(CACHE, 'locks');
const LOGS = path.join(FARM, 'logs');
const WORKERS = Number(arg('workers', 10));
const TIERS = arg('tiers', 'main,hard,akhand').split(',');
const CLASSES = arg('classes', 'A,C');
const STAGES = arg('stages', 'base,univ').split(',');
const ONLY = arg('only') ? new Set(arg('only').split(',')) : null;
for (const d of [CACHE, TAP, STATE, LOGS, LOCKS]) fs.mkdirSync(d, { recursive: true });
const { storeDir } = require(path.join(TOOLS, 'emis-cache'));

const jobs = fs.readFileSync(path.join(FARM, 'jobs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  .filter((j) => !j.skip && j.exists && TIERS.includes(j.tier) && (!ONLY || ONLY.has(j.id) || ONLY.has(j.row)));
// tier order, then longest first (balanced finish)
jobs.sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || b.dur - a.dur);

const mark = (id, st) => path.join(STATE, `${id}.${st}${st === 'univ' ? `-${CLASSES.replace(/,/g, '')}` : ''}.done`);
const LOGFILE = arg('log', arg('state') ? path.join(arg('state'), 'fill.log') : path.join(FARM, 'build.log'));
const log = (s) => { const line = `${new Date().toISOString()} ${s}`; console.log(line); fs.appendFileSync(LOGFILE, `${line}\n`); };
// The disk is shared with other agents' jobs: never start a clip below MIN_FREE_GB free.
const MIN_FREE_GB = Number(arg('min-free-gb', 15));
const freeGB = () => { const st = fs.statfsSync(CACHE); return (st.bavail * st.bsize) / 1e9; };

// One writer per clip entry at a time (Store appends at its own idea of the file end): flock per clip.
function run(cmd, args, env, logFile, id, cwd = TOOLS) {
  return new Promise((resolve) => {
    const out = fs.openSync(logFile, 'a');
    const child = spawn('flock', [path.join(LOCKS, `${id}.lock`), 'nice', '-n', '10', cmd, ...args], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', out, out] });
    child.on('close', (code) => { fs.closeSync(out); resolve(code); });
  });
}

function stamp(id) {
  const dir = storeDir({ root: CACHE, model: MODEL, codec: 'q16', clip: id });
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'provenance.json');
  if (!fs.existsSync(f)) fs.writeFileSync(f, `${JSON.stringify({ platform: `${process.platform}-${process.arch}`, cpu: (os.cpus()[0] || {}).model || null, host: 'GCP vf-record n2-standard-32 (us-east1-b), gcp-farm', firstRecordedAt: new Date().toISOString(), by: 'gcp-farm farm-build.js (baseline 3fafc0ba + window universe)' }, null, 1)}\n`);
}

async function base(j) {
  if (fs.existsSync(mark(j.id, 'base'))) return true;
  stamp(j.id);
  const out = path.join(arg('out', path.join(FARM, 'base-out')), j.suite);
  fs.mkdirSync(out, { recursive: true });
  const shadow = fs.existsSync(path.join(APP, 'www/main/addons/voice-follow/shadow/config.js'));
  const args = [...(shadow ? ['-r', './no-shadow-preload.js'] : []), ...j.args, ...(j.root ? ['--root', APP] : []), ...(j.only ? ['--only', j.only] : []), '--out', out];
  const env = { VF_DRIVER_ROOT: APP, VF_EMIS_CACHE: CACHE, VF_EMIS_MODE: 'record', VF_EMIS_CODEC: 'q16', MODEL, VF_ORT_THREADS: '2',
    VF_EVENT_TRACE: path.join(out, 'trace'), NODE_OPTIONS: `--require ${path.join(FARM, 'tap-preload.js')}`, VF_TAP_DIR: TAP,
    VF_TAP_DRIVER: path.join(TOOLS, 'bench-driver.js'), VF_RECORD_HOST: 'GCP vf-record n2-standard-32 (us-east1-b)', VF_AZURE_SAS: 'none' };
  const t0 = Date.now();
  const code = await run(process.execPath, args, env, path.join(LOGS, `${j.id}.base.log`), j.id);
  const ok = code === 0 && fs.existsSync(path.join(out, j.outFile)) && fs.existsSync(path.join(TAP, `${j.id}.json`));
  log(`base ${ok ? 'ok  ' : 'FAIL'} ${j.tier} ${j.id} ${Math.round(j.dur)} s audio in ${Math.round((Date.now() - t0) / 1000)} s (exit ${code})`);
  if (ok) fs.writeFileSync(mark(j.id, 'base'), new Date().toISOString());
  return ok;
}

async function univ(j) {
  if (fs.existsSync(mark(j.id, 'univ'))) return true;
  const t0 = Date.now();
  const code = await run(process.execPath, [path.join(FARM, 'farm-universe.js'), '--clip', j.id, '--tap', TAP, '--cache', CACHE, '--app', APP, '--model', MODEL,
    '--tools', TOOLS, '--classes', CLASSES, '--record', '--status', path.join(FARM, 'status')], { VF_ORT_THREADS: '2' }, path.join(LOGS, `${j.id}.univ.log`), j.id);
  log(`univ ${code === 0 ? 'ok  ' : 'FAIL'} ${j.tier} ${j.id} ${Math.round(j.dur)} s audio in ${Math.round((Date.now() - t0) / 1000)} s (exit ${code})`);
  if (code === 0) fs.writeFileSync(mark(j.id, 'univ'), new Date().toISOString());
  return code === 0;
}

(async () => {
  log(`start: ${jobs.length} clips (${(jobs.reduce((a, j) => a + j.dur, 0) / 3600).toFixed(2)} h), tiers ${TIERS}, stages ${STAGES}, classes ${CLASSES}, ${WORKERS} workers`);
  const queue = [...jobs];
  const worker = async () => {
    while (queue.length) {
      if (freeGB() < MIN_FREE_GB) { log(`STOP: only ${freeGB().toFixed(1)} GB free on the disk (< ${MIN_FREE_GB}); not starting more clips`); queue.length = 0; return; }
      const j = queue.shift();
      if (STAGES.includes('base') && !(await base(j))) continue;
      if (STAGES.includes('univ') && fs.existsSync(mark(j.id, 'base'))) await univ(j);
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  const left = jobs.filter((j) => STAGES.some((s) => !fs.existsSync(mark(j.id, s))));
  log(`end: ${jobs.length - left.length} of ${jobs.length} clips complete; incomplete: ${left.map((j) => j.id).join(' ') || 'none'}`);
})();
