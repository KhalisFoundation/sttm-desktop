// vf-suites.js — the regression suites vf-check.js replays (see REPLAY.md "Add a suite").
// Each suite: jobs() -> [{ id, clip, args, only, outFile, wav, dur }] (one clip per job; id = the cache id;
// the runner is called as <args> --only <only,only,...> --out <dir> and writes <outFile> per clip),
// score(dir) -> { metric: value } using the suite's existing scorer, and metrics: [[name, dir]],
// where dir is +1 (higher is better), -1 (lower is better) or 0 (informational, never fails).
// smoke = the ~10-clip after-every-edit tier (vf-check --tier smoke, < 1 min); sentinel = per-suite subset.
// Runners/scorers are the existing tools; jobs run with --fast (every chunk awaited) and a cache.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const TOOLS = __dirname;
const DS = path.join(__dirname, '..');
const CLIPS = process.env.VF_CLIPS || '/Users/asingh02/personal/live-darbar-venues/clips';
const durOf = (wav) => {
  try { return Math.max(0, (fs.statSync(wav).size - 44) / 32000); } catch (_) { return 0; }
};
const node = (args, env = {}) =>
  execFileSync(process.execPath, args, { cwd: TOOLS, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
const num = (s) => { const t = s == null ? '' : String(s).replace(/[^\d.-]/g, ''); return t === '' || t === '-' ? null : Number(t); };
const pick = (text, re) => { const m = text.match(re); return m ? m.slice(1).map(num) : []; };

// bench-runner.js truth sheets: same clip naming and skip rules as the runner.
function sheetJobs(truthFile, prefix, extra = []) {
  const rows = JSON.parse(fs.readFileSync(path.join(DS, truthFile)));
  const jobs = [];
  rows.forEach((row, k) => {
    const name = `${prefix}${String(k + 1).padStart(2, '0')}`;
    if (!row.shabad_ids || row.shabad_ids.length !== 1) return;
    const s = Math.max(0, row.start_s - 30);
    const e = row.end_s + 10;
    const wav = path.join(CLIPS, `${name}_${row.video_id}_${s}-${e}.wav`);
    if (!fs.existsSync(wav)) return;
    jobs.push({ id: path.basename(wav, '.wav'), clip: name, wav, dur: durOf(wav), only: name, outFile: `${name}.json`,
      args: ['bench-runner.js', '--fast', '--truth', truthFile, '--prefix', prefix, ...extra] });
  });
  return jobs;
}

// hf-ingest.js ledger -> one job per kirtan recording (content 1-kirtan-shabad), filtered by VF_SPLIT
function jaspalJobs() {
  const ledger = JSON.parse(fs.readFileSync(path.join(DS, 'hf-jaspal', 'ledger.json')));
  const splits = process.env.VF_SPLIT ? new Set(process.env.VF_SPLIT.split(',')) : null;
  return Object.values(ledger.datasets)
    .filter((d) => d.status === 'pulled' && !d.audioProblem && (d.content || '1-kirtan-shabad') === '1-kirtan-shabad' && (!splits || splits.has(d.split)))
    .sort((a, b) => a.clipId.localeCompare(b.clipId))
    .map((d) => {
      const wav = path.join(CLIPS, `${d.clipName}.wav`);
      return { id: d.clipName, clip: d.clipId, wav, dur: durOf(wav), only: d.clipName, outFile: `${d.clipName}.json`, split: d.split, gurdwara: d.gurdwara,
        args: ['khalis-bench.js', '--fast', '--trace', '--tests', path.join(DS, 'khalis-tests.json')] };
    });
}

const SUITES = {
  l2: {
    title: 'Level-2 kirtan (41)',
    smoke: ['clip02', 'clip05', 'clip13'],
    sentinel: ['clip01', 'clip05', 'clip09', 'clip13', 'clip17', 'clip21', 'clip25', 'clip29', 'clip33', 'clip37', 'clip40', 'clip41'],
    jobs: () => sheetJobs('human-fully-sheet.json', 'clip'),
    metrics: [['right %', 1], ['wrong %', -1], ['searching %', -1], ['found <=10 s', 1], ['found <=20 s', 1], ['found <=30 s', 1], ['never found', -1], ['longest wrong s', -1]],
    score(dir) {
      const out = node(['rescore.js', dir]); // copy-aware rescore (clip-notes corrections), as in the release report
      const [f10, f20, f30, never] = pick(out, /found <=10s (\d+)\/\d+ \| <=20s (\d+)\/\d+ \| <=30s (\d+)\/\d+ \| never (\d+)/);
      const [right, wrong, searching, longest] = pick(out, /right ([\d.]+)% \| wrong ([\d.]+)% \| searching ([\d.]+)% \| longest wrong ([\d.-]+)s/);
      return { 'right %': right, 'wrong %': wrong, 'searching %': searching, 'found <=10 s': f10, 'found <=20 s': f20, 'found <=30 s': f30, 'never found': never, 'longest wrong s': longest };
    },
  },
  paath: {
    title: 'Paath (60 with audio)',
    smoke: ['pt01', 'pt19', 'pt28'],
    sentinel: ['pt01', 'pt05', 'pt09', 'pt12', 'pt15', 'pt19', 'pt23', 'pt28', 'pt35', 'pt41'],
    jobs: () => sheetJobs('paath-tests.json', 'pt'),
    metrics: [['Bani %', 1], ['sub-Bani %', 0], ['member shabad %', 0], ['wrong %', -1], ['none %', -1]],
    score(dir) {
      const out = node(['paath-score.js', dir]);
      const [bani, sub, shab, wrong, none] = pick(out, /ALL \d+ clips: bani ([\d.]+)% \| sub ([\d.]+)% \| shabad ([\d.]+)% \| WRONG ([\d.]+)% \| none ([\d.]+)%/);
      return { 'Bani %': bani, 'sub-Bani %': sub, 'member shabad %': shab, 'wrong %': wrong, 'none %': none };
    },
  },
  aarti: {
    title: 'Aarti (50)',
    smoke: ['aa28', 'aa41'],
    sentinel: ['aa01', 'aa10', 'aa20', 'aa30', 'aa40', 'aa45', 'aa50'],
    jobs: () => sheetJobs('aarti-tests.json', 'aa', ['--trace-all']),
    metrics: [['right %', 1], ['wrong %', -1], ['none %', -1], ['piece exact %', 1], ['heard line %', 1], ['found', 1], ['found <=30 s', 1], ['found <=60 s', 1], ['median find s', -1], ['wrong switches', -1]],
    score(dir) {
      const out = node([path.join(DS, 'aarti/aarti-score.js'), dir]);
      const line = out.split('\n').find((l) => l.startsWith('RIGHT (Aarti text up)')) || '';
      const [right, wrong, none, piece, heard] = pick(line, /RIGHT \(Aarti text up\) ([\d.]+)% \| WRONG ([\d.]+)% \| NONE ([\d.]+)% \| piece-exact ([\w.-]+)% \| heard-line ([\w.-]+)%/).map((x) => (Number.isNaN(x) ? null : x));
      const [found, , w30, w60, med] = pick(line, /found (\d+)\/(\d+), within 30 s (\d+), within 60 s (\d+), median ([\d.-]+) s/);
      const [ws] = pick(line, /wrong switches (\d+)/);
      return { 'right %': right, 'wrong %': wrong, 'none %': none, 'piece exact %': piece, 'heard line %': heard, found, 'found <=30 s': w30, 'found <=60 s': w60, 'median find s': med, 'wrong switches': ws };
    },
  },
  fremont: {
    title: 'Fremont line-level (5)',
    smoke: ['kh05'],
    sentinel: ['kh01', 'kh03', 'kh05'],
    jobs: () => {
      const tests = JSON.parse(fs.readFileSync(path.join(DS, 'khalis-tests.json')));
      return tests.filter((r) => new RegExp(process.env.VF_FREMONT_CLIPS || '^kh0[1-5]_').test(r.name)).map((r) => {
        const wav = path.join(CLIPS, r.clip);
        return { id: path.basename(r.clip, '.wav'), clip: r.name.slice(0, 4), wav, dur: durOf(wav), only: r.name, outFile: `${r.name}.json`,
          args: ['khalis-bench.js', '--fast', '--trace', '--tests', path.join(DS, 'khalis-tests.json')] };
      });
    },
    metrics: [['shabad right %', 1], ['wrong %', -1], ['searching %', -1], ['line exact %', 1], ['line within 1 %', 1], ['verses reached', 1], ['median line lag s', -1], ['flips', -1], ['arbiter same/app-right %', 1], ['line +-3 s %', 1]],
    score(dir) {
      const rs = fs.readdirSync(dir).filter((f) => /^kh\d\d_.*\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f))).metrics);
      const T = rs.reduce((a, r) => a + r.dur, 0);
      const w = (k) => +(100 * rs.reduce((a, r) => a + r[k] * r.dur, 0) / T).toFixed(2);
      const lags = rs.map((r) => r.lagMedian).filter((x) => x != null).sort((a, b) => a - b);
      const out = node(['khalis-arbiter.js', '--tests', path.join(DS, 'khalis-tests.json'), '--trace', dir]);
      const [same] = pick(out, /same line OR app judged right by the singing: ([\d.]+)%/);
      const [, tol3] = pick(out, /line credit with tolerance: exact ([\d.]+)% \| \+-3 s ([\d.]+)%/);
      return { 'shabad right %': w('right'), 'wrong %': w('wrong'), 'searching %': w('searching'), 'line exact %': w('lineExact'), 'line within 1 %': w('lineNear'),
        'verses reached': rs.reduce((a, r) => a + r.versesReached, 0), 'median line lag s': lags.length ? lags[Math.floor(rs.length / 2)] ?? null : null,
        flips: rs.reduce((a, r) => a + r.flips, 0), 'arbiter same/app-right %': same, 'line +-3 s %': tol3 };
    },
  },
  // Fremont-style sevadaar-screen recordings pulled by hf-ingest.js (all kirtan clips, every split; kh01-kh05 are
  // also the fremont suite). VF_SPLIT=train,dev (vf-check --split) keeps only those splits. Scored by kirtan-score.js:
  // Shabad level, line level (sangat view), find time, parmaan follow / return, wrong-Shabad s per hour, wrong
  // switches; per split and per Gurdwara.
  jaspal: {
    title: 'Fremont sevadaar-screen recordings (hf-ingest)',
    optIn: true, // run only when named, until its cache is complete and pushed
    smoke: [],
    sentinel: ['kh01', 'kh04', 'kh12', 'kh20', 'kh27'],
    jobs: () => jaspalJobs(),
    metrics: null, // built from the splits present (see score)
    score(dir) { return require('./kirtan-score').suiteMetrics(dir); },
    direction: (name) => require('./kirtan-score').direction(name),
  },
  // Karanbir Singh's Live Captioning for Gurbani Kirtan benchmark v1 (github.com/karanbirsingh/live-gurbani-captioning-
  // benchmark-v1; annotations CC BY 4.0): 4 YouTube kirtan recordings x 3 starts (0 / 33 / 66 %), each case cut at its
  // UEM start (kbv1-prep.py), hand-reviewed pangti times. Runner: khalis-bench.js. Cache recorded on the Mac (codec q16).
  kbv1: {
    title: 'Karanbir v1 (12 cases)',
    optIn: true,
    smoke: [],
    sentinel: [],
    jobs: () => (fs.existsSync(path.join(DS, 'kbv1-tests.json')) ? JSON.parse(fs.readFileSync(path.join(DS, 'kbv1-tests.json'))) : []).map((t) => {
      const wav = path.join(CLIPS, t.clip);
      return { id: t.name, clip: t.name, wav, dur: durOf(wav), only: t.name, outFile: `${t.name}.json`, args: ['khalis-bench.js', '--fast', '--trace', '--tests', path.join(DS, 'kbv1-tests.json')] };
    }),
    metrics: null,
    score(dir) { return require('./kirtan-score').suiteMetrics(dir); },
    direction: (name) => require('./kirtan-score').direction(name),
  },
  // Akhand / Sehaj Paath, reading Sri Guru Granth Sahib Ji Ang after Ang (benchmark folder 4-akhand-paath): manifest
  // rows with suite_jobs apaath:<id> (publisher-slide line answers, lines.csv / shabads.csv), whole clips from t=0,
  // Bani routes on as in the app. optIn: vf-check runs them only when named; GAB plays them from its manifest and
  // scores them with sangat-score (in-sequence %, wrong s/h, seconds behind, Shabad crossings).
  apaath: {
    title: 'Akhand Paath, Ang after Ang (publisher-slide line answers)',
    optIn: true,
    smoke: [],
    sentinel: [],
    jobs: () => require('./akhand-bench').akhandRows().map(({ id, wav }) => ({ id, clip: id, wav, dur: durOf(wav), only: id, outFile: `${id}.json`, args: ['akhand-bench.js', '--fast'] })),
    metrics: null,
    score(dir) {
      const sv = require('./sangat-score');
      const ds = sv.loadDataset(require('./akhand-bench').BENCH);
      const m = {};
      const tr = path.join(dir, 'trace');
      for (const f of fs.existsSync(tr) ? fs.readdirSync(tr).filter((x) => x.endsWith('.events.jsonl')) : []) {
        const id = f.replace(/\.events\.jsonl$/, '');
        const row = ds.find(id, 'apaath');
        if (!row) continue;
        const c = sv.scoreClip(ds, row, path.join(tr, f), {});
        const s = c.shabad && c.shabad.acc ? sv.summarize(c.shabad.acc) : null;
        const l = c.line && c.line.acc ? sv.summarize(c.line.acc) : null;
        Object.assign(m, { [`${id} in-sequence %`]: s ? s.right_pct : null, [`${id} wrong s/h`]: s ? s.wrong_s_per_h : null, [`${id} behind p50 s`]: l ? l.lag_p50 : null });
      }
      sv.close();
      return m;
    },
    direction: (name) => (/in-sequence/.test(name) ? 1 : -1),
  },
  // Human-verified main-tab rows of the Level-2 Google Sheet added to GAB on Oct 14 2026 (Cycle 10 cuts:
  // <prefix>NN_<video>_<start-30>-<end+10>.wav, the same runner and naming as l2). optIn: vf-check runs them only
  // when named; GAB plays them from its manifest. Their cache was recorded on x86 (GCP vf-record), see GAB.md.
  rfinds: {
    title: 'Renton Finds darbars (81, Sep 25 reviewer)',
    optIn: true,
    smoke: [],
    sentinel: ['rn01', 'rn20', 'rn40', 'rn60', 'rn80'],
    jobs: () => sheetJobs('renton-finds-truth.json', 'rn'),
    metrics: null,
    score(dir) { return SUITES.l2.score(dir); },
    direction: (name) => (/right|found <=/.test(name) ? 1 : -1),
  },
  yuba: {
    title: 'Gurdwara Yuba City (Jas Gurbani recordings, 17)',
    optIn: true,
    smoke: [],
    sentinel: ['yuba01', 'yuba07', 'yuba13'],
    jobs: () => sheetJobs('yuba-jas.json', 'yuba'),
    metrics: null,
    score(dir) { return SUITES.l2.score(dir); },
    direction: (name) => (/right|found <=/.test(name) ? 1 : -1),
  },
  l3: {
    title: 'Level 3 smagams (AKJ Toronto 2022, Manchester 2024)',
    optIn: true,
    smoke: [],
    sentinel: ['l3clip01', 'l3clip05', 'l3clip15'],
    jobs: () => sheetJobs('level3-human-sheet.json', 'l3clip'),
    metrics: null,
    score(dir) { return SUITES.l2.score(dir); },
    direction: (name) => (/right|found <=/.test(name) ? 1 : -1),
  },
  renton: {
    title: 'Renton Oct 11 parts (7)',
    smoke: ['rt11_hukamnama'],
    sentinel: ['rt11_sohila', 'rt11_hukamnama', 'rt11_kirtan1'],
    jobs: () => ['rt11_rehras', 'rt11_aarti', 'rt11_sohila', 'rt11_hukamnama', 'rt11_kirtan1', 'rt11_fareed1', 'rt11_fareed2'].map((p) => {
      const wav = path.join(CLIPS, `${p}.wav`);
      return { id: p, clip: p, wav, dur: durOf(wav), only: p, outFile: `${p}.json`, args: ['renton-bench.js', '--fast'] };
    }),
    metrics: null, // built from the parts present (see score)
    score(dir) {
      node(['renton-score.js', dir], { REHRAS_TRUTH: path.join(DS, 'results/rt11_rehrasX.app.truth.json') });
      const res = Object.values(JSON.parse(fs.readFileSync(path.join(dir, 'renton-score.json'))))[0];
      const m = {};
      for (const r of res.paath) {
        const p = r.part.replace('rt11_', '');
        Object.assign(m, { [`${p} Bani right %`]: r.baniRight, [`${p} wrong %`]: r.wrong, [`${p} line exact %`]: r.lineExact, [`${p} line within 1 %`]: r.lineWithin1,
          [`${p} lines reached`]: num(String(r.linesReached).split('/')[0]), [`${p} lag median s`]: r.lagMedian, [`${p} lag p90 s`]: r.lagP90, [`${p} stretches >5 s`]: r.stretchesOver5s });
      }
      for (const r of res.kirtan) {
        const p = r.part.replace('rt11_', '');
        for (const x of r.targets) m[`${p} ${x.shabad} first on screen s`] = x.now == null ? 9999 : x.now;
        m[`${p} wrong s`] = r.wrong_s;
      }
      return m;
    },
    direction: (name) => (/right|exact|within|reached/.test(name) ? 1 : -1),
  },
  asa: {
    title: 'Asa di Vaar Newton + YouTube',
    smoke: [],
    sentinel: ['nw11_asa1', 'ytasa1_4IXk2t_Irqo_900-1620'],
    jobs: () => {
      const parts = ['nw11_asa1', 'nw11_asa2', 'nw11_kirtan2', 'nw11_kirtan3', 'nw11_kirtan4', 'ytasa1_4IXk2t_Irqo_900-1620'];
      const sess = path.join(CLIPS, 'nw11_session.wav');
      return [{ id: 'nw11_session', clip: 'nw11_session', wav: sess, dur: durOf(sess), outFile: 'nw11_session.json', args: ['nw-bench.js', '--mode', 'session'], root: true },
        ...parts.map((p) => { const wav = path.join(CLIPS, `${p}.wav`); return { id: p, clip: p, wav, dur: durOf(wav), only: p, outFile: `${p}.json`, args: ['nw-bench.js', '--mode', 'parts'], root: true }; })];
    },
    metrics: null,
    score(dir) {
      node(['nw-score.js', dir]);
      const res = Object.values(JSON.parse(fs.readFileSync(path.join(dir, 'score.json'))))[0];
      const m = {};
      for (const r of res.vaar) {
        const k = `${r.run === r.part ? r.part : `${r.run}/${r.part}`}`;
        Object.assign(m, { [`${k} Bani right %`]: r.baniRight, [`${k} line within 1 %`]: r.lineWithin1, [`${k} line exact %`]: r.lineExact,
          [`${k} lines reached`]: num(String(r.linesReached).split('/')[0]), [`${k} lag median s`]: r.lagMedian, [`${k} behind %`]: r.behindPct, [`${k} premature`]: r.premature });
      }
      for (const r of res.shabads) m[`${r.run} ${r.shabad}@${r.real} replay s`] = r.replay == null ? 9999 : r.replay;
      return m;
    },
    direction: (name) => (/right|exact|within|reached/.test(name) ? 1 : -1),
  },
};

module.exports = { SUITES, CLIPS, DS, TOOLS };
