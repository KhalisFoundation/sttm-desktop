/* vf-manifest.js — vf-check --manifest: run a content folder or the whole Voice-Follow benchmark
 * (Hugging Face khalisfoundation/GurbaniAutopilotBench) from its manifest.csv, from the model-output
 * cache, and write a scorecard with the four plain-language questions per content folder.
 *
 *   node vf-check.js --manifest <manifest.csv | hf:khalisfoundation/GurbaniAutopilotBench> --cand <app worktree>
 *                    [--folder 3-bani-sung-like-kirtan/aarti] [--out <dir>] [--jobs N] [--no-lock]
 *
 * Every clip row names its replay-suite job(s) (`suite_jobs`, e.g. `paath:pt35;aarti:aa28`); the suites' own
 * runners replay them and the suites' own scorers (rescore / paath-score / aarti-score / khalis-arbiter /
 * renton-score / nw-score) score them, once per (content folder, suite), on just that folder's clips. The scorer
 * metrics are then placed under the four questions by name (MAP below). Question 2 (the line question) is the
 * sangat view (sangat-score.js: right pangti on screen, text-compared, ON + catching up % of the time it is sung or
 * read), kept apart by truth provenance (human | aligned); the suites' own line metrics stay in scorecard.json
 * (`old_right_line`). A clip with no suite job or no cache entry is listed as "not run".
 * Output: <out>/scorecard.json + scorecard.md.
 *   --from <dir>   score an existing replay (a vf-check side dir, e.g. <run>/cand, with <suite>/<clip>.json and
 *                  <suite>/trace/) instead of replaying: no lock, no model, no replay.
 *   --truth <dir>  local copy of the dataset (lines.csv / shabads.csv); default: the manifest's own folder for a
 *                  local manifest, or the per-clip csv files fetched from Hugging Face for hf:.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const Q = ['found_quickly', 'right_line', 'seconds_behind', 'new_shabad'];
const QTITLE = { found_quickly: '1. found within 10 s / wrong page', right_line: '2. sangat sees the right pangti (ON + catching up, sangat view)', seconds_behind: '3. seconds behind (typical / worst)', new_shabad: '4. seconds to the new Shabad / wrong switches' };
// metric name (as the suite's score() returns it) -> question; regexes are tested in order, first wins
const MAP = {
  l2: [[/found <=10 s|never found|right %|wrong %|searching %|longest wrong s/, 'found_quickly'], [/found <=/, 'found_quickly']],
  paath: [[/Bani %|wrong %|none %|sub-Bani %|member shabad %/, 'found_quickly']],
  aarti: [[/wrong switches/, 'new_shabad'], [/piece exact %|heard line %/, 'right_line'], [/found|median find s|right %|wrong %|none %/, 'found_quickly']],
  fremont: [[/flips/, 'new_shabad'], [/median line lag s/, 'seconds_behind'], [/line exact %|line within 1 %|verses reached|arbiter|line \+-3 s %/, 'right_line'], [/shabad right %|wrong %|searching %/, 'found_quickly']],
  renton: [[/lag median s|lag p90 s|stretches >5 s/, 'seconds_behind'], [/line exact %|line within 1 %|lines reached/, 'right_line'], [/first on screen s|wrong s/, 'new_shabad'], [/Bani right %|wrong %/, 'found_quickly']],
  jaspal: [[/parmaan|return|wrong switches/, 'new_shabad'], [/catch-up lag/, 'seconds_behind'], [/sangat line/, 'right_line'], [/Shabad right|Shabad wrong|searching|find|not found|wrong s\/h/, 'found_quickly']],
  asa: [[/lag median s|behind %|premature/, 'seconds_behind'], [/line within 1 %|line exact %|lines reached/, 'right_line'], [/replay s/, 'new_shabad'], [/Bani right %/, 'found_quickly']],
};
const NA = { l2: { new_shabad: 'n/a (one Shabad per clip; a wrong page is counted under 1)', right_line: 'not measured (no line truth in the suite)', seconds_behind: 'not measured' },
  paath: { new_shabad: 'n/a (one Bani per clip)', right_line: 'not measured', seconds_behind: 'not measured' } };

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [h, ...rest] = rows;
  return rest.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}

const hfToken = () => process.env.HF_TOKEN || (fs.existsSync(path.join(process.env.HOME, '.vf-hf-token')) ? fs.readFileSync(path.join(process.env.HOME, '.vf-hf-token'), 'utf8').trim() : '');
// the per-clip truth csv files of the selected rows -> <dir>/<folder>/<id>/, with manifest.csv at <dir>
async function fetchTruth(repo, rows, manifestText, dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.csv'), manifestText);
  const token = hfToken();
  for (const r of rows) {
    const d = path.join(dir, r.content_folder, r.id);
    fs.mkdirSync(d, { recursive: true });
    for (const f of ['lines.csv', 'shabads.csv']) {
      if (fs.existsSync(path.join(d, f))) continue;
      const res = await fetch(`https://huggingface.co/datasets/${repo}/resolve/main/${r.content_folder}/${r.id}/${f}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) fs.writeFileSync(path.join(d, f), await res.text());
    }
  }
  return dir;
}

// old content folder names (2-paath-bani, 3-bani-sung) are read as the new ones (folder-names.js); the name on disk is kept
function canonRows(rows) {
  const { canonFolder } = require('./folder-names');
  for (const r of rows) { const c = canonFolder(r.content_folder); if (c !== r.content_folder) { r.folder_on_disk = r.content_folder; r.content_folder = c; } }
  return rows;
}
async function loadManifest(spec, outRoot) {
  if (spec.startsWith('hf:')) {
    const repo = spec.slice(3);
    const url = `https://huggingface.co/datasets/${repo}/resolve/main/manifest.csv`;
    const token = hfToken();
    const r = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!r.ok) throw new Error(`manifest download failed: ${r.status} ${url}`);
    const text = await r.text();
    fs.writeFileSync(path.join(outRoot, 'manifest.csv'), text);
    return { rows: canonRows(parseCsv(text)), from: url, repo, text };
  }
  const file = path.resolve(spec);
  return { rows: canonRows(parseCsv(fs.readFileSync(file, 'utf8'))), from: file, root: path.dirname(file) };
}

async function run(vf) {
  const { arg, flag, selectJobs, makeTasks, runLocked, CACHE, SUITES, DS, TOOLS, sha1, now, fmtS } = vf;
  const cand = path.resolve(arg('cand') || '');
  if (!arg('from') && (!arg('cand') || !fs.existsSync(path.join(cand, 'www')))) throw new Error('--manifest needs --cand <app worktree> (the build under test), or --from <existing replay dir>');
  const folderFilter = require('./folder-names').canonFolder(arg('folder', ''));
  const outRoot = path.resolve(arg('out', path.join(DS, 'results', 'vf-check', `manifest-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`)));
  fs.mkdirSync(outRoot, { recursive: true });
  const t0 = now();
  const man = await loadManifest(arg('manifest'), outRoot);
  const { rows, from } = man;
  const fromDir = arg('from') ? path.resolve(arg('from')) : null;
  const sel = rows.filter((r) => !folderFilter || r.content_folder === folderFilter || r.content_folder.startsWith(`${folderFilter}/`) || r.content_folder.startsWith(folderFilter));
  let tree = 'dirty';
  try { if (!execFileSync('git', ['-C', cand, 'status', '--porcelain', '--', 'www'], { encoding: 'utf8' }).trim()) tree = execFileSync('git', ['-C', cand, 'rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (_) { /* not a git tree */ }
  const log = [];
  const say = (s = '') => { console.log(s); log.push(s); };
  say(`# vf-check --manifest ${new Date().toISOString().slice(0, 16)}`);
  say(`manifest ${from} (${rows.length} clips${folderFilter ? `, folder ${folderFilter}: ${sel.length}` : ''})  ${fromDir ? `scoring the existing replay ${fromDir} (nothing replayed)` : `cand ${cand} (${tree})`}`);

  // expand suite_jobs -> jobs, remembering which content folder each (suite, clip) belongs to
  const want = {}; // suite -> Set(clip)
  const folderOf = {}; // `${suite}/${clip}` -> content folder
  const folderIdOf = {}; // `${suite}/${clip}` -> manifest clip id (pt35 carries both paath:pt35 and aarti:aa28)
  const notRun = []; // [id, folder, why]
  for (const r of sel) {
    const jobs = (r.suite_jobs || '').split(';').filter(Boolean);
    if (!jobs.length) { notRun.push([r.id, r.content_folder, `no replay-suite job${r.notes ? ` (${r.notes})` : ''}`]); continue; }
    if (r.cache === 'no') { notRun.push([r.id, r.content_folder, 'no model-output cache entry (record it first: vf-check --record --only)']); continue; }
    for (const sj of jobs) {
      const [suite, clip] = sj.split(':');
      if (!SUITES[suite]) { notRun.push([r.id, r.content_folder, `unknown suite ${suite}`]); continue; }
      (want[suite] = want[suite] || new Set()).add(clip);
      folderOf[`${suite}/${clip}`] = r.content_folder;
      folderIdOf[`${suite}/${clip}`] = r.id;
    }
  }
  const jobs = [];
  for (const [suite, clips] of Object.entries(want)) {
    const js = selectJobs([suite], { only: clips, sentinel: false });
    const got = new Set(js.map((j) => j.clip));
    for (const c of clips) if (!got.has(c)) notRun.push([c, folderOf[`${suite}/${c}`], `suite ${suite} has no job for it`]);
    jobs.push(...js);
  }
  const audio = jobs.reduce((a, j) => a + j.dur, 0);
  say(`${arg('from') ? 'scoring' : 'replaying'} ${jobs.length} clip runs (${fmtS(audio)} of audio) in ${Object.keys(want).length} suites; ${notRun.length} clips not run; out ${outRoot}`);
  if (flag('plan')) { for (const j of jobs) say(`  ${j.suite}/${j.clip} -> ${folderOf[`${j.suite}/${j.clip}`]}`); return; }

  // pull missing cache entries from the shared copy (never records), then replay the candidate once
  if (!fromDir && !flag('no-pull') && jobs.length) {
    try {
      const msha = require('./emis-cache').modelSha(vf.MODEL, CACHE);
      const r = await require('./remote-cache').pull({ root: CACHE, model: msha.slice(0, 12), codec: vf.CODEC, clips: jobs.map((j) => ({ id: j.id, wav: j.wav })), log: () => {} });
      if (r.pulled) say(`pulled ${r.pulled} clips (${(r.bytes / 1e6).toFixed(1)} MB) from the shared cache`);
    } catch (e) { say(`(shared cache not reachable: ${String(e.message).slice(0, 120)})`); }
  }
  const t1 = now();
  let st;
  if (fromDir) {
    // an existing replay: a clip is "run" when its runner output is there
    st = { wall: 0, lockWait: 0, status: {} };
    for (const j of jobs) st.status[`cand/${j.suite}/${j.id}`] = fs.existsSync(path.join(fromDir, j.suite, j.outFile)) ? { code: 0 } : { code: 1, err: `not in ${fromDir}` };
  } else {
    const tasks = makeTasks(jobs, 'cand', cand, outRoot, 'replay');
    st = tasks.length ? await runLocked({ jobs: vf.JOBS, tasks }, path.join(outRoot, 'replay.plan.json')) : { wall: 0, lockWait: 0, status: {} };
  }
  const runDir = fromDir || path.join(outRoot, 'cand');
  const replayWall = now() - t1;
  const missed = [];
  const failed = [];
  for (const j of jobs) {
    const s = st.status[`cand/${j.suite}/${j.id}`];
    if (!s) failed.push([j, 'not run']);
    else if (s.missed) missed.push(j);
    else if (s.code) failed.push([j, s.err || `exit ${s.code}`]);
  }

  // score once per (content folder, suite) on that folder's clips only
  const t2 = now();
  if (fromDir) tree = 'existing replay (--from)';
  const card = { manifest: from, cand: fromDir || cand, tree, folders: {}, notRun: notRun.map(([id, folder, why]) => ({ id, folder, why })), cacheMisses: missed.map((j) => `${j.suite}/${j.id}`), errors: failed.map(([j, e]) => ({ clip: `${j.suite}/${j.id}`, error: e })) };
  const folders = [...new Set(sel.map((r) => r.content_folder))].sort();
  // sangat view per clip (one result per manifest clip; pt35 is replayed by two suites: the first suite_jobs entry wins)
  const sv = require('./sangat-score');
  let sds = null;
  try {
    const troot = arg('truth') ? path.resolve(arg('truth')) : man.root || (man.repo ? await fetchTruth(man.repo, sel, man.text, path.join(outRoot, 'truth')) : null);
    sds = troot && sv.loadDataset(troot);
  } catch (e) { say(`(sangat view: truth not available: ${String(e.message).slice(0, 120)})`); }
  const sangat = {};
  if (sds) {
    for (const r of sel) {
      const j = jobs.find((x) => folderIdOf[`${x.suite}/${x.clip}`] === r.id && !missed.includes(x) && !failed.some(([y]) => y === x));
      if (!j) continue;
      const tr = path.join(runDir, j.suite, 'trace', `${j.id}.events.jsonl`);
      const f = fs.existsSync(tr) ? tr : path.join(runDir, j.suite, j.outFile);
      try { sangat[r.id] = { suite: j.suite, ...sv.scoreClip(sds, r, f) }; } catch (e) { sangat[r.id] = { error: String(e.message).split('\n')[0] }; }
    }
  }
  const pctTxt = (s) => `${s.right_pct}% (ON ${s.on_pct}${s.catching_pct ? ` + catching up ${s.catching_pct}` : ''})`;
  for (const folder of folders) {
    const F = { clips: sel.filter((r) => r.content_folder === folder).length, run: 0, suites: {}, questions: Object.fromEntries(Q.map((q) => [q, {}])) };
    for (const suite of Object.keys(want)) {
      const sj = jobs.filter((j) => j.suite === suite && folderOf[`${suite}/${j.clip}`] === folder && !missed.includes(j) && !failed.some(([x]) => x === j));
      if (!sj.length) continue;
      const dir = path.join(outRoot, 'score', folder.replace(/\//g, '_'), suite);
      fs.mkdirSync(path.join(dir, 'trace'), { recursive: true });
      for (const j of sj) {
        const from1 = path.join(runDir, suite);
        fs.copyFileSync(path.join(from1, j.outFile), path.join(dir, j.outFile));
        const tr = path.join(from1, 'trace', `${j.id}.events.jsonl`);
        if (fs.existsSync(tr)) fs.copyFileSync(tr, path.join(dir, 'trace', `${j.id}.events.jsonl`));
      }
      let m = {};
      try { m = SUITES[suite].score(dir); } catch (e) { m = { error: String(e.message).split('\n')[0] }; }
      F.ran = F.ran || new Set();
      for (const j of sj) F.ran.add(folderIdOf[`${suite}/${j.clip}`] || j.clip);
      F.run = F.ran.size;
      F.suites[suite] = { clips: sj.map((j) => j.clip), metrics: m };
      for (const [name, v] of Object.entries(m)) {
        if (name === 'error' || v == null) continue;
        const rule = (MAP[suite] || []).find(([re]) => re.test(name));
        if (rule) F.questions[rule[1]][`${suite}: ${name}`] = v;
      }
      for (const [q, why] of Object.entries(NA[suite] || {})) if (!Object.keys(F.questions[q]).length) F.questions[q]._note = why;
    }
    // question 2 = the sangat view; the suites' own line metrics move to old_right_line (json only)
    F.old_right_line = F.questions.right_line;
    F.questions.right_line = {};
    const cl = sel.filter((r) => r.content_folder === folder).map((r) => sangat[r.id]).filter((c) => c && !c.error);
    F.sangat = sv.aggregate(cl, () => folder).map(({ ids, ...g }) => ({ ...g, clips: ids }));
    for (const g of F.sangat.sort((a, b) => (a.level === b.level ? (a.provenance === 'human' ? -1 : 1) : a.level === 'line' ? -1 : 1))) {
      if (!g.summary) continue;
      const k = `${g.level === 'line' ? 'right pangti' : 'right Shabad/Bani text'} [${g.provenance}${g.provenance === 'human' ? '' : ', not a headline'}; ${g.n} clip${g.n > 1 ? 's' : ''}]`;
      F.questions.right_line[k] = `${pctTxt(g.summary)}, wrong page ${g.summary.wrong_s_per_h} s/h${g.level === 'line' ? `, catch-up lag ${g.summary.lag_p50}/${g.summary.lag_p90} s` : ''}, longest not-ON ${g.summary.longest_not_on_s} s`;
    }
    if (cl.length && !F.sangat.some((g) => g.level === 'line')) F.questions.right_line._note2 = 'line level not available (Shabad-level truth only)';
    if (!sds) F.questions.right_line._note = 'not measured (no benchmark truth for the sangat view)';
    for (const q of Q) if (!Object.keys(F.questions[q]).filter((k) => k !== '_note').length && !F.questions[q]._note) F.questions[q]._note = F.run ? 'not measured (no suite metric answers it for these clips)' : 'not measured (no clip of this folder was run)';
    delete F.ran;
    card.folders[folder] = F;
  }
  card.sangat = Object.fromEntries(Object.entries(sangat).map(([id, c]) => [id, c.error ? c : { suite: c.suite, truth: c.truth, line: c.line.summary ? { provenance: c.line.provenance, ...c.line.summary } : { why: c.line.why }, shabad: c.shabad.summary ? { provenance: c.shabad.provenance, ...c.shabad.summary } : { why: c.shabad.why } }]));
  sv.close();
  card.timings = { total: now() - t0, replay: replayWall, lockWait: st.lockWait, score: now() - t2 };

  // scorecard.md: one row per content folder, the four questions as columns
  const fmt = (o) => { const ks = Object.keys(o).filter((k) => !k.startsWith('_note')); return ks.length ? ks.map((k) => `${k} ${o[k]}`).join('; ') + (o._note2 ? `; ${o._note2}` : '') : o._note || 'not measured'; };
  say('');
  say(`| content folder | clips run / listed | ${Q.map((q) => QTITLE[q]).join(' | ')} |`);
  say(`|---|---|${Q.map(() => '---').join('|')}|`);
  for (const [folder, F] of Object.entries(card.folders)) say(`| \`${folder}\` | ${F.run} / ${F.clips} | ${Q.map((q) => fmt(F.questions[q])).join(' | ')} |`);
  // by split x Gurdwara (default): the sangat view of every clip that ran, grouped by its manifest split and gurdwara
  if (!flag('no-split-table')) {
    const byId = new Map(sel.map((r) => [r.id, r]));
    const cl = Object.entries(sangat).filter(([, c]) => c && !c.error).map(([id, c]) => ({ ...c, id }));
    const key = (c) => { const r = byId.get(c.id) || {}; return `${r.split || '?'} | ${r.gurdwara || '?'} | ${c.folder}`; };
    const ag = sv.aggregate(cl, key).sort((a, b) => a.key.localeCompare(b.key) || a.level.localeCompare(b.level));
    card.bySplitGurdwara = ag.map(({ ids, ...g }) => ({ ...g, clips: ids }));
    say('');
    say('| split | Gurdwara | content folder | level | truth | clips | sangat sees the right pangti / Shabad | wrong page s/h | catch-up lag p50 s |');
    say('|---|---|---|---|---|---|---|---|---|');
    for (const g of ag) if (g.summary) say(`| ${g.key} | ${g.level} | ${g.provenance} | ${g.n} | ${g.summary.right_pct}% | ${g.summary.wrong_s_per_h} | ${g.level === 'line' ? g.summary.lag_p50 ?? '-' : '-'} |`);
  }
  if (notRun.length) { say(''); say('Not run:'); for (const [id, folder, why] of notRun) say(`  ${folder}/${id}: ${why}`); }
  if (missed.length) { say(''); say(`CACHE MISSES (no model was run; record them with vf-check --record --only ...): ${missed.map((j) => `${j.suite}/${j.id}`).join(' ')}`); }
  if (failed.length) { say(''); say('ERRORS:'); for (const [j, e] of failed) say(`  ${j.suite}/${j.id}: ${e}`); }
  say('');
  say(`DONE | total ${fmtS(now() - t0)} (lock wait ${fmtS(st.lockWait || 0)}, replay ${fmtS(st.wall || 0)}, scoring ${fmtS(card.timings.score)}) | scorecard ${path.join(outRoot, 'scorecard.json')}`);
  fs.writeFileSync(path.join(outRoot, 'scorecard.md'), `${log.join('\n')}\n`);
  fs.writeFileSync(path.join(outRoot, 'scorecard.json'), JSON.stringify(card, null, 1));
  process.exitCode = missed.length || failed.length ? 1 : 0;
}

module.exports = { run, parseCsv, canonRows, MAP };
