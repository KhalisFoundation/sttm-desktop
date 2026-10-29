/* gab-publish.js — gab publish <main scorecard.json> --hard <hard scorecard.json> --name "<build name>" [--status merged|candidate]
 *                               [--note "..."] [--order N] [--base <commit>] [--preview <dir>] [--dry-run] [--allow-dirty] [--site-only]
 *                 gab publish --batch <batch.json> [--preview <dir>] [--dry-run]
 *                               (--akhand <gab akhand scorecard.json> / batch "akhand": the GAB-Akhand Kirtan scorecard of the same build, optional)
 *                               batch.json = [{ "main": "<file>", "hard": "<file>", "name", "status", "order", "base", "note" }, ...]:
 *                               every build in one commit per repo (use it when the GAB version changes: all rows re-scored)
 *
 * Tiers: a build's result holds the main GAB rows (`rows`) and the GAB-Hard rows (`hard.rows`), each from its own
 * scorecard (gab run --set main / --set hard of the same commit). Each tier gets its own "vs base" verdict (`vs`,
 * `hard.vs`); a main scorecard is never accepted in the hard slot or the other way round, and tiers are never mixed.
 *
 * Publishes one build's GAB result to the leaderboard Space khalisfoundation/GAB-leaderboard (private, static, free):
 *   results/<slug>.json   the build's rows (behaviours, Banis, named sets; no per-clip detail), build name, commit,
 *                         Voice-Follow feature version, GAB version, split, tier, date, status
 *   results/index.json    the list the page loads (an entry with the same slug is replaced)
 *   index.html, README.md, gab-names.json (from tools/gab-space/); the retired page files (RETIRED) are deleted from the Space
 *   Display names: gab-space/gab-names.json (system name Gurbani Autopilot + label/kind per commit, fallback '<version> · <--name>');
 *   each result gets label + kind; the page ranks builds best first and colours each column better/worse.
 * and keeps a short table in the dataset card (khalisfoundation/GurbaniAutopilotBench README.md, only between
 * <!-- GAB-LEADERBOARD:START --> / <!-- GAB-LEADERBOARD:END -->; the rest of the card is never touched), plus the full
 * scorecard under scores/gab/<slug>/ in the dataset. The Space reads only its own files: no token, no secret.
 * Refused: a test-split scorecard (the test split is never published), a GAB version other than this tool's, a build
 * with uncommitted edits (unless --allow-dirty). A behaviour with clips the replay could not finish from the cache
 * (they need new speech-model windows) is published as "incomplete", without numbers.
 * One commit per repo (huggingface_hub; token from ~/.vf-hf-token, never printed, never uploaded).
 * Every publish recomputes each row's "vs base" verdict (gab compare's guardrails): a candidate against --base <commit>
 * (required for a candidate), a merged build against the merged build before it (by --order).
 * --preview <dir>: write the Space as it would be into <dir> (to serve locally), push nothing.
 * --site-only: push the page files, the recomputed verdicts and names, and the card's Leaderboard section if it changed; no new result. --replace <slug>: the new row takes the place of
 * that earlier row (its results file is deleted), e.g. a candidate that has since been merged.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const G = require('./gab-score');

const DATASET = 'khalisfoundation/GurbaniAutopilotBench';
const SPACE = 'khalisfoundation/GAB-leaderboard';
const SPACE_URL = `https://huggingface.co/spaces/${SPACE}`;
const SITE = path.join(__dirname, 'gab-space');
const RETIRED = ['about.html', 'reconcile.json'];
const START = '<!-- GAB-LEADERBOARD:START -->';
const END = '<!-- GAB-LEADERBOARD:END -->';
const UV = fs.existsSync(path.join(os.homedir(), '.local/bin/uv')) ? path.join(os.homedir(), '.local/bin/uv') : 'uv';
// display names (gab-space/gab-names.json): the system's name (Gurbani Autopilot) and a plain label + kind per build commit.
// Results keep their stable name/slug; the page and the dataset card show label/kind. A build missing from the file
// gets '<Voice-Follow version> · <--name>' (a release if merged, an experiment if a candidate).
const NAMES_FILE = path.join(SITE, 'gab-names.json');
const loadNames = () => JSON.parse(fs.readFileSync(NAMES_FILE, 'utf8'));
function nameOf(res, names = loadNames()) {
  const m = names.builds[String(res.commit).slice(0, 8)];
  if (m) return { label: m.label, kind: m.kind };
  const kind = res.status === 'merged' ? 'release' : 'experiment';
  return { label: [res.vf_feature_version, res.name].filter(Boolean).join(' · '), kind };
}
// the full display text: '<system> <label>' for a release, 'Experiment: <label>' for an experiment
const shownName = (res, names = loadNames()) => { const n = nameOf(res, names); return n.kind === 'experiment' ? `Experiment: ${n.label}` : `${names.system.gurmukhi} ${n.label}`; };
const token = () => process.env.HF_TOKEN || fs.readFileSync(path.join(os.homedir(), '.vf-hf-token'), 'utf8').trim();

async function hfText(kind, repo, file) {
  const r = await fetch(`https://huggingface.co/${kind === 'space' ? 'spaces/' : 'datasets/'}${repo}/resolve/main/${file}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HF ${r.status} reading ${repo}/${file}`);
  return r.text();
}

// scorecard -> the compact result the page shows
const KEEP = ['key', 'level', 'title', 'note', 'clips', 'hours', 'sessions', 'right_shabad_pct', 'shabad_clips', 'wrong_s_per_h', 'blank_pct', 'pangti_pct', 'pangti_near_pct', 'pangti_basis', 'pangti_clips', 'pangti_never_shown',
  'behind_p50_s', 'behind_p90_s', 'behind_n', 'lines', 'find_p50_s', 'find_p90_s', 'find_n', 'find_cold_n', 'not_found', 'switch_p50_s', 'switch_p90_s', 'switch_n', 'switch_missed',
  'switch_within10_n', 'switch_later_n', 'stayed_main_n', 'parmaan_n', 'parmaan_shown', 'thin'];
function tierRows(card) {
  const cacheMiss = (card.notRun || []).filter((n) => /left the cache|not in the local or Azure cache/.test(n.why));
  return card.rows.filter((r) => r.level !== 'all').map((r) => {
    const o = Object.fromEntries(KEEP.filter((k) => r[k] !== undefined).map((k) => [k, r[k]]));
    if (r.mic) o.mic = Object.fromEntries(Object.entries(r.mic).map(([cls, m]) => [cls, m]));
    const scope = r.level === 'set' ? (G.loadSets().sets.find((x) => x.key === r.key) || {}).folder : r.key;
    const miss = scope ? cacheMiss.filter((n) => n.folder === scope || n.folder.startsWith(`${scope}/`)) : [];
    // VF_PARTIAL=1 (owner, Oct 16): keep the numbers from the recordings that did replay, marked partial (the page shows
    // them with an asterisk); the missing recordings need speech-model output only the machine that first recorded them can add
    if (miss.length && process.env.VF_PARTIAL === '1') return { ...o, partial: miss.length, note: `partial: scored on ${o.clips} recordings; ${miss.length} more need speech-model output not recorded yet` };
    if (miss.length) return { key: r.key, level: r.level, title: r.title, clips: 0, incomplete: miss.length, note: `incomplete: ${miss.length} clips need speech-model windows that are not in the cache yet (gab fill), so this build has no comparable number here` };
    return o;
  });
}
const notRunOf = (card) => (card.notRun || []).map((n) => ({ id: n.id.split('_')[0], why: n.why }));
function checkCard(card, want, allowDirty) {
  if (card.gab !== G.GAB_VERSION) throw new Error(`scorecard is ${card.gab}, this tool publishes ${G.GAB_VERSION}`);
  if ((card.set || 'pre-tier') !== want) throw new Error(`the ${want} slot needs a --set ${want} scorecard (got ${card.set || 'a pre-tier scorecard'}); tiers are never mixed`);
  if (/^test/.test(card.split) || /test/.test(card.split.split(' ')[0])) throw new Error('test-split numbers are never published (GAB.md, split rule)');
  if (card.build.dirty && !allowDirty) throw new Error('the build had uncommitted edits; commit them and re-run gab (or pass --allow-dirty)');
}
function resultOf(card, hardCard, { name, status, note, order, base, platform }, akhandCard = null) {
  if (hardCard && hardCard.build.commit !== card.build.commit) throw new Error(`main and hard scorecards are different builds (${card.build.commit} vs ${hardCard.build.commit})`);
  if (akhandCard && akhandCard.build.commit !== card.build.commit) throw new Error(`main and akhand scorecards are different builds (${card.build.commit} vs ${akhandCard.build.commit})`);
  const tierPart = (c, set) => (c ? { set, set_title: c.setTitle || G.tierTitle(set), manifest: c.manifest.sha, split: c.split.split(' ')[0], tier: c.tier, not_run: notRunOf(c), rows: tierRows(c) } : null);
  return {
    gab: card.gab, platform: platform || null, name, status, note: note || null, order: order ?? null, base: base || null,
    commit: card.build.commit, vf_feature_version: card.build.featureVersion || null, subject: card.build.subject || null,
    split: card.split.split(' ')[0], tier: card.tier, date: card.createdAt.slice(0, 10), manifest: card.manifest.sha,
    set: 'main', set_title: card.setTitle || G.tierTitle('main'),
    not_run: notRunOf(card),
    rows: tierRows(card),
    hard: tierPart(hardCard, 'hard'),
    // GAB-Akhand Kirtan (v1.3): optional; a result without it shows 'not scored yet' in that column
    akhand: tierPart(akhandCard, 'akhand'),
  };
}
// "vs its base" verdict for every row, with gab compare's guardrail logic (G.compare): a candidate against the build it
// was made from (--base <commit>), a merged build against the merged build before it (by order). Recomputed for every
// result on every publish, so a new or re-scored build never leaves a stale verdict.
// one tier of a result as a scorecard for G.compare (main: res.rows; hard: res.hard.rows)
const part = (res, set) => (set === 'main' ? res : res[set]);
const asCard = (res, set = 'main') => ({ set, build: { name: res.name, commit: res.commit }, manifest: { sha: part(res, set).manifest }, tier: part(res, set).tier, split: part(res, set).split, rows: part(res, set).rows });
const TITLE = { '1-kirtan-shabad': 'Kirtan', '2-bani-recited': 'Bani recited', '3-bani-sung-like-kirtan': 'Bani sung', '4-akhand-paath': 'Akhand Paath', '5-akhand-kirtan': 'Akhand Kirtan' };
function verdicts(all) {
  for (const set of ['main', 'hard', 'akhand']) verdictsFor(all.filter((r) => part(r, set)), set);
  return all;
}
function verdictsFor(all, set) {
  const put = (res, vs) => { part(res, set).vs = vs; };
  const byOrder = [...all].sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.date.localeCompare(b.date));
  for (const res of all) {
    let ref = null;
    let kind = null;
    if (res.status === 'merged') {
      ref = byOrder.filter((x) => x.status === 'merged' && (x.order ?? 99) < (res.order ?? 99)).pop() || null;
      kind = 'previous merged build';
    } else if (res.base) {
      ref = all.find((x) => x !== res && String(x.commit).startsWith(String(res.base).slice(0, 8))) || null;
      kind = 'its base';
    }
    if (!ref) { put(res, res.status === 'merged' ? { kind: 'first merged build', against: null } : { kind: 'its base', against: res.base || null, missing: true }); continue; }
    const c = G.compare(asCard(ref, set), asCard(res, set));
    const pick = (r) => ({ row: r.key, title: TITLE[r.key] || (r.key.startsWith('set:') ? r.key.slice(4) : r.key), scope: r.scope, metric: r.metric, a: r.a, b: r.b });
    // information-only named clip sets of earlier reports (L2-41, Aarti-50, ...) that got worse are listed too, apart
    const LINE_M = /sangat sees the right pangti|seconds behind/;
    const rowIn = (x, key) => part(x, set).rows.find((r) => r.key === key);
    const infoWorse = c.rows.filter((r) => r.verdict === 'worse (info)' && r.scope === 'all clips' && r.key.startsWith('set:') && !/\(info\)/.test(r.metric)
      && (!LINE_M.test(r.metric) || (lineShown(rowIn(ref, r.key)) && lineShown(rowIn(res, r.key)))));
    const incomplete = part(res, set).rows.filter((r) => r.level === 'behaviour' && r.incomplete && part(ref, set).rows.some((x) => x.key === r.key && x.clips)).map((r) => TITLE[r.key] || r.key);
    put(res, { kind, against: ref.name, against_commit: ref.commit, pass: c.pass, worse: c.worse.map(pick), better_n: c.better.length, better: c.better.map(pick), info_worse: infoWorse.map(pick), not_compared: incomplete });
  }
}
const slugOf = (name, commit) => `${name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)}-${String(commit).slice(0, 8)}`;

// the short table in the dataset card: one line per build, a few headline numbers per behaviour
// a line number is a headline only on human or ear-checked line answers and at least THIN clips
const lineShown = (r) => r && r.pangti_pct != null && r.pangti_basis !== 'aligned' && r.pangti_clips >= G.THIN;
function section(entries) {
  // Card copy of the leaderboard, kept short: released versions in date order with traffic-light marks
  // (relative to the other versions: 🟢 best, 🟡 in between, 🔴 worst; no mark when all are equal),
  // then "ideas being tested" as changes against the version in the app now. Commit ids go in a fold.
  const names = loadNames();
  const kindOf = (e) => ((names.builds || {})[String(e.commit).slice(0, 8)] || {}).kind || (e.status === 'merged' ? 'release' : 'experiment');
  const labelOf = (e) => ((names.builds || {})[String(e.commit).slice(0, 8)] || {}).label || shownName(e, names);
  const get = (rows, key, k) => { const r = (rows || []).find((x) => x.key === key); return r && r.clips && r[k] != null ? Number(r[k]) : null; };
  const COLS = [
    { t: 'Kirtan: right Shabad', v: (e) => get(e.rows, '1-kirtan-shabad', 'right_shabad_pct'), u: '%', dir: 1 },
    { t: 'Kirtan: wrong Shabad (s per hour)', v: (e) => get(e.rows, '1-kirtan-shabad', 'wrong_s_per_h'), u: '', dir: -1 },
    { t: 'Bani recited: right Bani', v: (e) => get(e.rows, '2-bani-recited', 'right_shabad_pct'), u: '%', dir: 1 },
    { t: 'Bani sung: right Bani', v: (e) => get(e.rows, '3-bani-sung-like-kirtan', 'right_shabad_pct'), u: '%', dir: 1 },
    { t: 'Bani sung: wrong Bani (s per hour)', v: (e) => get(e.rows, '3-bani-sung-like-kirtan', 'wrong_s_per_h'), u: '', dir: -1 },
    { t: 'GAB-Hard kirtan: right Shabad', v: (e) => (e.hard ? get(e.hard.rows, '1-kirtan-shabad', 'right_shabad_pct') : null), u: '%', dir: 1 },
    { t: 'Akhand Kirtan: right Shabad', v: (e) => (e.akhand ? (get(e.akhand.rows, '5-akhand-kirtan', 'right_shabad_pct') ?? get(e.akhand.rows, '1-kirtan-shabad', 'right_shabad_pct')) : null), u: '%', dir: 1 },
  ];
  const rel = entries.filter((e) => kindOf(e) !== 'experiment');
  const exp = entries.filter((e) => kindOf(e) === 'experiment');
  const now = [...entries].filter((e) => kindOf(e) === 'release').pop();
  const mark = (c, v) => {
    const vals = rel.map((e) => c.v(e)).filter((x) => x != null);
    if (v == null) return '–';
    const lo = Math.min(...vals); const hi = Math.max(...vals);
    if (hi === lo) return `${v}${c.u}`;
    const t = c.dir > 0 ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo);
    return `${t >= 0.67 ? '🟢' : t > 0.33 ? '🟡' : '🔴'} ${v}${c.u}`;
  };
  const relRows = rel.map((e) => `| ${e === now ? `**${labelOf(e)}** ← in the app now` : labelOf(e)} | ${COLS.map((c) => mark(c, c.v(e))).join(' | ')} |`);
  // An idea is compared with the version it was built from (its --base), not with the latest release.
  const baseOf = (e) => (e.base && entries.find((x) => String(x.commit).startsWith(String(e.base).slice(0, 8)))) || now;
  const delta = (c, e) => {
    const bE = baseOf(e); const v = c.v(e); const b = bE ? c.v(bE) : null;
    if (v == null) return 'not scored yet';
    if (b == null) return `${v}${c.u}`;
    const d = Math.round((v - b) * 10) / 10;
    if (d === 0) return `➖ ${v}${c.u}`;
    const better = d * c.dir > 0;
    return `${better ? '🟢' : '🔴'} ${v}${c.u} (${d > 0 ? '+' : ''}${d})`;
  };
  const expRows = exp.map((e) => `| ${labelOf(e)}<br><sub>vs ${baseOf(e) ? labelOf(baseOf(e)) : '-'}</sub> | ${COLS.map((c) => delta(c, e)).join(' | ')} |`);
  const head = `| Version | ${COLS.map((c) => c.t).join(' | ')} |`;
  const sep = `|---|${COLS.map(() => '---:').join('|')}|`;
  const commits = entries.map((e) => `- ${kindOf(e) === 'experiment' ? `Idea: ${labelOf(e)}` : `${names.system.latin} ${labelOf(e)}`}: \`${String(e.commit).slice(0, 12)}\`${e.vf_feature_version ? ` (Voice-Follow ${e.vf_feature_version})` : ''}`);
  return [START, '## Leaderboard', '',
    `**${names.system.latin}** is STTM Desktop's Voice-Follow. Full, sortable leaderboard: [${SPACE}](${SPACE_URL}). ${G.GAB_VERSION}, practice recordings only (the test set is never shown).`, '',
    '🟢 best · 🟡 in between · 🔴 worst, compared with the other versions in the same column. Higher % is better; fewer wrong-Shabad seconds is better.', '',
    '### Versions', '', head, sep, ...relRows, '',
    ...(expRows.length ? ['### Ideas being tested (not in the app)', '', 'Each idea is compared with the version it was built from: 🟢 better, 🔴 worse, ➖ same.', '', head, sep, ...expRows, ''] : []),
    'Main GAB is everyday Gurdwara audio (livestream and mixer feeds, studio paath). GAB-Hard is the Fremont hall laptop-mic recordings, tracked apart. GAB-Akhand Kirtan is smagam kirtan (many singers, the sangat singing along, many instruments), tracked apart. Pangti numbers (right pangti %) are shown under each Shabad number on the leaderboard; outside GAB-Hard they rest on audited two-model aligned keys (a person confirmed 20 of 20 random ones).', '',
    '<details><summary>Exact code tested (commit ids)</summary>', '', ...commits, '', '</details>', '', END].join('\n');
}

function push(repo, type, ops, msg, S) {
  const py = `
import os, sys, json
from huggingface_hub import HfApi, CommitOperationAdd, CommitOperationDelete
api = HfApi(token=os.environ['HF_TOKEN'])
repo, typ, msg, s = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
ops = [CommitOperationAdd(dst, os.path.join(s, src)) if src else CommitOperationDelete(dst) for dst, src in json.load(open(os.path.join(s, 'ops.json')))]
# VF_HF_CREATE_PR=1: a token that may only open pull requests publishes as one PR per repo (a maintainer merges it)
pr = os.environ.get('VF_HF_CREATE_PR') == '1'
r = api.create_commit(repo_id=repo, repo_type=typ, operations=ops, commit_message=msg, create_pr=pr)
print('opened PR' if pr else 'committed', len(ops), 'files to', repo, r.pr_url if pr else r.oid)
`;
  fs.writeFileSync(path.join(S, 'push.py'), py);
  fs.writeFileSync(path.join(S, 'ops.json'), JSON.stringify(ops));
  return execFileSync(UV, ['run', '-q', '--no-project', '--with', 'huggingface_hub', 'python', '-I', path.join(S, 'push.py'), repo, type, msg, S], { encoding: 'utf8', env: { ...process.env, HF_TOKEN: token() } }).trim();
}

async function main(args) {
  const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
  const dry = args.includes('--dry-run');
  const siteOnly = args.includes('--site-only');
  const allowDirty = args.includes('--allow-dirty');
  const S = fs.mkdtempSync(path.join(os.tmpdir(), 'gab-publish-'));
  try {
    const spaceOps = [];
    for (const f of ['index.html', 'README.md', 'gab-names.json', 'timeline.html', 'annotate.html']) { fs.copyFileSync(path.join(SITE, f), path.join(S, `site-${f}`)); spaceOps.push([f, `site-${f}`]); }
    // the one-table page (Oct 14 2026) replaced the tabs: these files are removed from the Space when still there
    for (const f of RETIRED) if (await hfText('space', SPACE, f) != null) spaceOps.push([f, null]);
    let msg = 'GAB leaderboard: page files';
    // the builds to publish now: [{ res, slug, card, hardCard }] (one, or a --batch)
    const pub = [];
    const readCard = (f, allowIncomplete = false) => {
      const card = JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'));
      // A run where some clip did not replay (cache miss / replay error) is not a result. Exception (batch entry
      // "allowIncomplete": true): an older build whose cache gaps cannot be filled without mixing platforms; only cache
      // misses are allowed, and every behaviour holding one is published as 'not scored' (tierRows), never as a number.
      if (card.incomplete && card.incomplete.length) {
        const errs = card.incomplete.filter((m) => m.why !== 'cache miss');
        if (!allowIncomplete || errs.length) throw new Error(`${f} is INCOMPLETE (${card.incomplete.length} clip run(s) did not replay); fill and rerun before publishing`);
        console.log(`  ${f}: ${card.incomplete.length} cache-miss clip runs; their behaviours are published as 'not scored' (allowIncomplete)`);
      }
      return card;
    };
    const addOne = (o) => {
      const card = readCard(o.main, !!o.allowIncomplete);
      checkCard(card, 'main', allowDirty);
      if (!o.hard) throw new Error(`${o.name}: every build needs its GAB-Hard scorecard too (--hard <gab run --set hard scorecard.json>)`);
      const hardCard = readCard(o.hard, !!o.allowIncomplete);
      checkCard(hardCard, 'hard', allowDirty);
      const akhandCard = o.akhand ? readCard(o.akhand, !!o.allowIncomplete) : null;
      if (akhandCard) checkCard(akhandCard, 'akhand', allowDirty);
      const status = (o.status || 'merged') === 'merged' ? 'merged' : 'candidate, not merged';
      if (status !== 'merged' && !o.base) throw new Error(`${o.name}: a candidate needs --base <commit of the build it was made from> (its "vs base" verdict)`);
      const res = resultOf(card, hardCard, { name: o.name.replace(/\|/g, '/'), status, note: o.note, order: o.order != null ? Number(o.order) : null, base: o.base, platform: o.platform }, akhandCard);
      pub.push({ res, slug: slugOf(o.name, card.build.commit), card, hardCard, akhandCard, files: o });
    };
    if (opt('batch')) for (const o of JSON.parse(fs.readFileSync(opt('batch'), 'utf8'))) addOne(o);
    else if (!siteOnly) {
      const file = args.find((a) => !a.startsWith('--') && a.endsWith('.json') && a !== opt('hard') && a !== opt('akhand'));
      if (!file || !opt('name')) throw new Error('gab publish <main scorecard.json> --hard <hard scorecard.json> --name "<build name>" [--status merged|candidate]   (or --batch <batch.json>)');
      addOne({ main: file, hard: opt('hard'), akhand: opt('akhand'), name: opt('name'), status: opt('status'), order: opt('order'), base: opt('base'), note: opt('note') });
    }
    const prev = JSON.parse(await hfText('space', SPACE, 'results/index.json') || '{"results":[]}');
    // --replace <slug>: the new result takes the place of an earlier row (a candidate that has since been merged)
    const gone = (opt('replace') || '').split(',').filter(Boolean);
    for (const g of gone) { const e = prev.results.find((x) => x.slug === g); if (!e) throw new Error(`--replace ${g}: no such row`); spaceOps.push([`results/${e.file}`, null]); }
    const slugs = new Set(pub.map((p) => p.slug));
    const index = { results: [...prev.results.filter((x) => !slugs.has(x.slug) && !gone.includes(x.slug)), ...pub.map((p) => ({ slug: p.slug, file: `${p.slug}.json`, name: p.res.name, commit: p.res.commit, date: p.res.date, order: p.res.order }))] };
    for (const p of pub) console.log(`row: ${p.res.name} | ${p.res.status} | ${p.res.commit} | Voice-Follow ${p.res.vf_feature_version || 'not stamped'} | ${p.res.gab} | ${p.res.split} ${p.res.tier} | ${p.res.date} | main ${p.card.rows.filter((r) => r.level === 'behaviour').reduce((a, r) => a + (r.clips || 0), 0)} clips, hard ${p.hardCard.rows.filter((r) => r.level === 'behaviour').reduce((a, r) => a + (r.clips || 0), 0)} clips`);
    if (pub.length) msg = pub.length === 1 ? `GAB leaderboard: ${pub[0].res.name} (${pub[0].res.commit}, ${pub[0].res.split}, ${pub[0].res.tier}, main + hard${pub[0].akhandCard ? ' + akhand' : ''})` : `GAB leaderboard: ${G.GAB_VERSION}, ${pub.length} builds re-scored (main GAB + GAB-Hard${pub.some((p) => p.akhandCard) ? ' + GAB-Akhand Kirtan' : ''})`;
    fs.writeFileSync(path.join(S, 'index.json'), JSON.stringify(index, null, 1));
    spaceOps.push(['results/index.json', 'index.json']);
    // every result (read fresh), with its "vs base" verdicts recomputed per tier; each results file is rewritten.
    // A kept result of another GAB version (or without a GAB-Hard part) would be compared across versions: refused.
    const all = [];
    for (const e of index.results) {
      const p = pub.find((x) => x.slug === e.slug);
      const res = p ? p.res : JSON.parse(await hfText('space', SPACE, `results/${e.file}`));
      // VF_KEEP_OLDER_GAB=1 (Oct 18 2026): a kept row of an earlier GAB version stays on the board marked as such
      // (its own numbers, never compared with this version's rows); otherwise refused as before
      if (res.gab !== G.GAB_VERSION || !res.hard) {
        if (!process.env.VF_KEEP_OLDER_GAB || !res.hard) throw new Error(`results/${e.file} is ${res.gab}${res.hard ? '' : ' without GAB-Hard'}: re-score every build and publish them together with --batch`);
        res.older_gab = true;
      } else delete res.older_gab;
      all.push(res);
    }
    verdicts(all.filter((r) => !r.older_gab));
    const names = loadNames();
    for (const res of all) Object.assign(res, nameOf(res, names));
    index.results.forEach((e, i) => { fs.writeFileSync(path.join(S, `result-${i}.json`), JSON.stringify(all[i], null, 1)); spaceOps.push([`results/${e.file}`, `result-${i}.json`]); });
    const sorted = [...all].sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.date.localeCompare(b.date));
    const vsText = (v) => (v && v.against ? `${v.against}: ${v.pass ? 'PASS' : `FAIL (${v.worse.map((w) => `${w.title} ${w.scope} ${w.metric} ${w.a} -> ${w.b}`).join('; ')})`}${v.info_worse && v.info_worse.length ? ` | info rows worse: ${v.info_worse.map((w) => `${w.title} ${w.metric} ${w.a} -> ${w.b}`).join('; ')}` : ''}` : '-');
    for (const r of sorted) console.log(`${r.name}\n   main vs ${r.vs.kind}: ${vsText(r.vs)}\n   hard vs ${r.hard.vs.kind}: ${vsText(r.hard.vs)}${r.akhand ? `\n   akhand vs ${r.akhand.vs.kind}: ${vsText(r.akhand.vs)}` : ''}`);
    // second-by-second timelines (timeline.html): gab run writes timeline.json next to each scorecard; each one found is
    // uploaded as timeline/<slug>-<set>.json and listed in timeline/index.json (per set, builds in leaderboard order)
    const tlPrev = JSON.parse(await hfText('space', SPACE, 'timeline/index.json') || '{"tiers":[]}');
    const TL_TITLE = { main: 'GAB (Gurdwara audio)', hard: 'GAB-Hard (Fremont hall, laptop mic; pangti keys)', akhand: 'GAB-Akhand Kirtan (smagam)' };
    let tlN = 0;
    for (const p of pub) {
      for (const [set, f] of [['main', p.files.main], ['hard', p.files.hard], ['akhand', p.files.akhand]]) {
        const tf = f && path.join(path.dirname(path.resolve(f)), 'timeline.json');
        if (!tf || !fs.existsSync(tf)) { if (f) console.log(`  timeline: none next to ${f} (gab run writes timeline.json; older runs: node gab-timeline.js <gab run --keep dir>)`); continue; }
        const file = `${p.slug}-${set}.json`;
        fs.copyFileSync(tf, path.join(S, `tl-${file}`)); spaceOps.push([`timeline/${file}`, `tl-${file}`]); tlN++;
        let t = tlPrev.tiers.find((x) => x.key === set);
        if (!t) { t = { key: set, title: TL_TITLE[set] || set, builds: [] }; tlPrev.tiers.push(t); }
        const nm0 = nameOf(p.res); const nm = { ...nm0, label: [...new Set(String(nm0.label).split(' · '))].join(' · ') };
        t.builds = t.builds.filter((b) => b.slug !== p.slug && !(b.commit && String(b.commit).slice(0, 8) === String(p.res.commit).slice(0, 8)));
        t.builds.push({ slug: p.slug, file, label: nm.kind === 'experiment' ? `Experiment: ${nm.label}` : `${loadNames().system.latin} ${nm.label}`, commit: String(p.res.commit).slice(0, 8), note: nm.kind, order: p.res.order ?? null, date: p.res.date });
        t.builds.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || String(a.date || '').localeCompare(String(b.date || '')));
      }
    }
    if (tlN) {
      const ORDER = ['hard', 'main', 'akhand'];
      tlPrev.tiers.sort((a, b) => (ORDER.indexOf(a.key) + 1 || 9) - (ORDER.indexOf(b.key) + 1 || 9));
      fs.writeFileSync(path.join(S, 'timeline-index.json'), JSON.stringify(tlPrev, null, 1));
      spaceOps.push(['timeline/index.json', 'timeline-index.json']);
      console.log(`timeline: ${tlN} file(s) for ${pub.length} build(s)`);
    }
    // --preview <dir>: write the Space as it would be (page files + results) into <dir> and stop (nothing pushed)
    if (opt('preview')) {
      const P = path.resolve(opt('preview'));
      fs.mkdirSync(path.join(P, 'results'), { recursive: true }); fs.mkdirSync(path.join(P, 'timeline'), { recursive: true });
      for (const [dst, src] of spaceOps) if (src) fs.copyFileSync(path.join(S, src), path.join(P, dst));
      console.log(`preview written to ${P}`);
      return;
    }
    if (dry) { console.log(`dry run: would commit ${spaceOps.map((o) => o[0]).join(', ')} to ${SPACE}${pub.length ? ` and the Leaderboard section (if its numbers changed) + scores/gab/<slug>/ for ${pub.length} builds to ${DATASET}` : ''}`); return; }
    console.log(push(SPACE, 'space', spaceOps, msg, S));
    // dataset card: rebuild the short table from every published result, only between the markers; left alone when
    // its numbers did not change. Full scorecards (main + hard) under scores/gab/<slug>/ (added or replaced, never deleted).
    const readme = await hfText('dataset', DATASET, 'README.md');
    if (!readme) throw new Error('could not read README.md from the dataset');
    const newReadme = readme.includes(START)
      ? readme.slice(0, readme.indexOf(START)) + section(sorted) + readme.slice(readme.indexOf(END) + END.length)
      : `${readme.replace(/\s*$/, '')}\n\n${section(sorted)}\n`;
    fs.writeFileSync(path.join(S, 'README.md'), newReadme);
    fs.writeFileSync(path.join(S, 'LEADERBOARD.md'), `# GAB leaderboard\n\nThe leaderboard moved to the private Space [${SPACE}](${SPACE_URL}) (Oct 14 2026; now ${G.GAB_VERSION}: main GAB + GAB-Hard). The GAB v1.0 rows that were here are retired: their kirtan line number counted recordings where nothing was ever shown as 0%, their find time was measured from a window that opened mid-Shabad (so mostly 0 s), and the headline mixed behaviours. Full scorecards per build: scores/gab/.\n`);
    const dsOps = [];
    if (!pub.length && newReadme === readme) { console.log('dataset card: Leaderboard section unchanged, not touched'); return; }
    pub.forEach((p, i) => {
      fs.copyFileSync(path.resolve(p.files.main), path.join(S, `sc-${i}.json`));
      fs.writeFileSync(path.join(S, `sc-${i}.md`), `${G.markdown(p.card)}\n`);
      fs.copyFileSync(path.resolve(p.files.hard), path.join(S, `sch-${i}.json`));
      fs.writeFileSync(path.join(S, `sch-${i}.md`), `${G.markdown(p.hardCard)}\n`);
      dsOps.push([`scores/gab/${p.slug}/scorecard.json`, `sc-${i}.json`], [`scores/gab/${p.slug}/scorecard.md`, `sc-${i}.md`], [`scores/gab/${p.slug}/scorecard-hard.json`, `sch-${i}.json`], [`scores/gab/${p.slug}/scorecard-hard.md`, `sch-${i}.md`]);
      if (p.akhandCard) {
        fs.copyFileSync(path.resolve(p.files.akhand), path.join(S, `sca-${i}.json`));
        fs.writeFileSync(path.join(S, `sca-${i}.md`), `${G.markdown(p.akhandCard)}\n`);
        dsOps.push([`scores/gab/${p.slug}/scorecard-akhand.json`, `sca-${i}.json`], [`scores/gab/${p.slug}/scorecard-akhand.md`, `sca-${i}.md`]);
      }
    });
    if (newReadme !== readme) dsOps.push(['README.md', 'README.md'], ['LEADERBOARD.md', 'LEADERBOARD.md']);
    else console.log('dataset card: Leaderboard section unchanged, not touched');
    console.log(push(DATASET, 'dataset', dsOps, msg, S));
    console.log(`published: ${SPACE_URL} (${pub.length} new results) and the dataset card's Leaderboard section`);
  } finally { fs.rmSync(S, { recursive: true, force: true }); }
}

module.exports = { main, resultOf, section, verdicts, slugOf, lineShown, nameOf, shownName, push, hfText };
