#!/usr/bin/env node
/* sim-sweep.js — simulated slow-PC sweep over engine speeds, one table per build (SIM-SLOWPC.md).
 *
 *   node sim-sweep.js --builds upstream=~/personal/sttm-er-bench,tiers=~/personal/sttm-slowpc \
 *        [--clips rehras,kh04,ytasa1] [--speeds 0.5,0.7,0.9,1.2] [--fill] [--jobs 4] [--keep <dir>] \
 *        [--sim-js-ms M] [--sim-serial] [--sim-flat]
 *
 * Every cell is one sim-slowpc.js run (cached model output on a virtual clock; no model). A cell
 * whose windows the cache lacks exits 3; with --fill it is re-run with the model filling just those
 * windows into the sim overlay (exclusive bench lock, nice 19), and later sweeps of the same build,
 * speed and clip are pure replay. Replay cells take one of the shared replay slots
 * (/tmp/vf-replay-slot-<k>.lock, as vf-check), --jobs at a time, nice 19. Run outputs are scored
 * (sim-score.js) and deleted unless --keep <dir>.
 * Clips: rehras = rt11_rehras 0-600 s; kh01..kh06 / ytasa1 = the whole clip; or <cache id>[:from:to].
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { scoreRun } = require('./sim-score');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);
const home = (p) => p.replace(/^~(?=\/|$)/, os.homedir());
const CLIPS = process.env.VF_CLIPS || require('path').join(require('os').homedir(), 'personal/live-darbar-venues/clips');
const SLOTS = Number(process.env.VF_REPLAY_SLOTS || 3);

const ALIAS = { rehras: 'rt11_rehras:0:600', sohila: 'rt11_sohila' };
function clipSpec(name) {
  const s = ALIAS[name] || name;
  let [id, from, to] = s.split(':');
  if (!fs.existsSync(path.join(CLIPS, `${id}.wav`))) {
    const hit = fs.readdirSync(CLIPS).find((f) => f.startsWith(`${id}_`) && f.endsWith('.wav'));
    if (!hit) throw new Error(`no clip ${id} in ${CLIPS}`);
    id = hit.replace(/\.wav$/, '');
  }
  return { name, id, from: from ? Number(from) : 0, to: to ? Number(to) : null };
}

// Hold one shared replay slot for the whole sweep (re-exec under lockf, as vf-check does).
async function inSlot() {
  if (process.env.VF_SIM_SLOT) return;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let said = false;
  for (;;) {
    for (let k = 0; k < SLOTS; k += 1) {
      // eslint-disable-next-line no-await-in-loop
      const code = await new Promise((resolve) => spawn('lockf', ['-k', '-t', '0', `/tmp/vf-replay-slot-${k}.lock`, 'env', `VF_SIM_SLOT=${k}`,
        process.execPath, __filename, ...argv], { stdio: 'inherit' }).on('close', resolve));
      if (code !== 75) process.exit(code);
    }
    if (!said) { process.stderr.write(`all ${SLOTS} replay slots busy, waiting ...\n`); said = true; }
    // eslint-disable-next-line no-await-in-loop
    await sleep(5000);
  }
}

function run(args) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let err = '';
    const child = spawn('nice', ['-n', '19', process.execPath, path.join(__dirname, 'sim-slowpc.js'), ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve({ code, err, s: (Date.now() - t0) / 1000 }));
  });
}

const fmt = (r) => {
  if (r.kind === 'paath') return `lag ${r['lag median s']} s / within 1 ${r['within 1 %']}% / exact ${r['line exact %']}% / reached ${r.reached}`;
  if (r.kind === 'asa') return `lag ${r['lag median s']} s / within 1 ${r['within 1 %']}% / reached ${r.reached}`;
  if (r.kind === 'fremont') return `right ${r['right %']}% / wrong ${r['wrong page s']} s / wrong sw ${r['wrong switches']} / lag ${r['lag median s']} s / first ${r['first s']} s${r.switches ? ` / ${r.switches}` : ''}`;
  return '-';
};

(async () => {
  await inSlot();
  const builds = (arg('builds', '') || '').split(',').filter(Boolean).map((b) => { const [name, root] = b.split('='); return { name, root: path.resolve(home(root)) }; });
  if (!builds.length) throw new Error('--builds name=<worktree>,...');
  const clips = arg('clips', 'rehras,kh04,ytasa1').split(',').map(clipSpec);
  const speeds = arg('speeds', '0.5,0.7,0.9,1.2').split(',').map(Number);
  const jobs = Number(arg('jobs', 4));
  const keep = arg('keep', '');
  const outDir = keep ? path.resolve(home(keep)) : fs.mkdtempSync(path.join(os.tmpdir(), 'sim-sweep-'));
  const extra = [...(arg('sim-js-ms') ? ['--sim-js-ms', arg('sim-js-ms')] : []), ...(flag('sim-serial') ? ['--sim-serial'] : []), ...(flag('sim-flat') ? ['--sim-flat'] : [])];
  const cells = [];
  for (const b of builds) for (const c of clips) for (const sp of speeds) cells.push({ b, c, sp, file: path.join(outDir, b.name, `${c.name}-${sp}x.json`) });
  const t0 = Date.now();
  let next = 0;
  const fills = [];
  const worker = async () => {
    while (next < cells.length) {
      const cell = cells[next++];
      fs.mkdirSync(path.dirname(cell.file), { recursive: true });
      const args = ['--clip', cell.c.id, '--from', String(cell.c.from), ...(cell.c.to != null ? ['--to', String(cell.c.to)] : []),
        '--root', cell.b.root, '--sim-speed', String(cell.sp), ...extra, '--out', cell.file];
      // eslint-disable-next-line no-await-in-loop
      let r = await run(args);
      if (r.code === 3 && flag('fill')) {
        process.stderr.write(`  ${cell.b.name} ${cell.c.name} ${cell.sp}x: cache miss, filling with the model (bench lock) ...\n`);
        const f = run([...args, '--fill']);
        fills.push(f);
        // eslint-disable-next-line no-await-in-loop
        const rf = await f;
        r = { ...rf, filled: true };
      }
      cell.wall = r.s;
      cell.filled = !!r.filled;
      if (r.code !== 0) { cell.error = r.code === 3 ? 'cache miss (rerun with --fill)' : (r.err.trim().split('\n').pop() || `exit ${r.code}`); continue; }
      cell.score = scoreRun(JSON.parse(fs.readFileSync(cell.file)));
      const sum = JSON.parse(fs.readFileSync(cell.file)).summary;
      cell.simWall = sum.wallS;
      process.stderr.write(`  ${cell.b.name} ${cell.c.name} ${cell.sp}x done in ${r.s.toFixed(0)} s${cell.filled ? ' (filled)' : ''}\n`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, cells.length) }, worker));
  for (const b of builds) {
    console.log(`\n### ${b.name} (${b.root})`);
    console.log('| clip | speed (ms per 4 s pass) | result | audio backlog max / p95 | tier/steps | passes per audio s | wall s |');
    console.log('|---|---|---|---|---|---|---|');
    for (const cell of cells.filter((x) => x.b === b)) {
      const s = cell.score;
      const pm = (1000 / (6 * cell.sp)).toFixed(0);
      if (!s) { console.log(`| ${cell.c.name} | ${cell.sp}x (${pm}) | ${cell.error} | - | - | - | - |`); continue; }
      console.log(`| ${cell.c.name} | ${cell.sp}x (${pm}) | ${fmt(s)} | ${s['backlog max s']} / ${s['backlog p95 s']} s | ${s.tier} | ${s['passes/s']} | ${cell.simWall}${cell.filled ? ' (fill run)' : ''} |`);
    }
  }
  console.log(`\n${cells.length} cells, ${((Date.now() - t0) / 1000).toFixed(0)} s wall${keep ? `; runs kept in ${outDir}` : ''}`);
  fs.writeFileSync(path.join(outDir, 'sweep.json'), JSON.stringify(cells.map(({ b, c, sp, score, wall, simWall, filled, error }) => ({ build: b.name, root: b.root, clip: c.name, id: c.id, from: c.from, to: c.to, speed: sp, score, wall, simWall, filled, error })), null, 1));
  if (!keep) fs.rmSync(outDir, { recursive: true, force: true });
  process.exit(cells.some((c) => c.error) ? 1 : 0);
})().catch((e) => { console.error(e.stack); process.exit(1); });
