/* gab-score.js — the ONE GAB scorecard (Gurbani Autopilot Bench), library for gab.js. See GAB.md.
 *
 * GAB v1.2 (Oct 14 2026): two tiers (gab-sets.json `tiers`): main = everything except GAB-Hard; hard = the Fremont hall
 * laptop-mic recordings. A scorecard is one tier (`set`), never both; compare refuses two different tiers.
 * v1.1 -> v1.2 also adds 'same or neighbouring pangti' (information). v1.0 numbers are not comparable (GAB.md).
 * Input: replay outputs (vf-check side dirs: <suite>/trace/<cache id>.events.jsonl) + the benchmark manifest rows.
 * Every clip is scored by sangat-score.js against the benchmark truth (lines.csv / shabads.csv), text-compared.
 * Rows: one per behaviour (the four content folders), the Banis under them, and the named clip sets of earlier
 * reports (gab-sets.json). Per row:
 *   right Shabad/Bani %      Shabad level, human truth: % of the voiced time a text of the Shabad/Bani being sung or
 *                            read is on screen (ON; the Shabad-level sangat view)
 *   sangat sees the pangti % line level: ON + CATCHING UP (< 1 s into a new pangti) of the voiced time, on the best
 *                            line truth the row has: human > aligned + ear-checked > aligned (the basis is printed).
 *                            Only clips where the app put something on screen count (as kirtan-score); clips with
 *                            line truth where nothing was ever shown are counted apart ("never shown"): their loss is
 *                            already in right Shabad % and "not found".
 *   same or neighbouring %  ON + CATCHING UP + BEHIND + AHEAD (one pangti off either way), same truth basis: in kirtan
 *                            the ragi sings two pangtis as one phrase, and the answer key marks the partner as wrong
 *   seconds behind p50/p90   line level, same truth basis: a new pangti starts -> first on screen
 *   wrong Shabad s/h         Shabad level: seconds a text from another Shabad/Bani is up, per hour voiced
 *   find p50/p90 (n)         the first Shabad/Bani of each clip: from t=0 when the clip was cut from inside a
 *                            performance (cold start: the app is started while it is sung), else from its start;
 *                            "not found" = never shown inside its window
 *   switch                   every later Shabad/Bani that differs from the one before it, from its start, when the
 *                            screen showed something else as it began: found within 10 s / later / never, p50/p90 over
 *                            found; a return to a main Shabad the screen never left = 'stayed on main' (counted apart);
 *                            parmaans (a Shabad quoted inside another) also counted shown / not shown
 *   coverage                 clips, hours, and the n behind each number; fewer than 3 = "thin" (flagged)
 * Mic path (gab-micpath.json): mixer-feed vs room-mic per row, and their 50/50 mean, as a second view.
 * Deterministic: same traces + same truth -> byte-identical JSON apart from `createdAt` and `timings`.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// GAB v1.5 (Oct 18 2026): dataset PRs through #19 (new Sung Bani + kirtan recordings, Renton keys); x86 model output
const GAB_VERSION = 'GAB v1.5';
// ---------------------------------------------------------------- tiers -------------
// gab-sets.json `tiers`: { main: { excludeTiers: ['hard', 'akhand'] }, hard: { gurdwara: '<regex>' }, akhand: { gurdwara: '<regex>', notes: '<tag regex>' } }
function tierOf(row, sets = loadSets()) {
  const T = sets.tiers || { main: {} };
  // a tier rule matches on the gurdwara / source name OR a tag in the notes (`tags: akhand-kirtan`), so new
  // recordings of that kind join the tier from their manifest row alone; first matching tier wins (file order)
  const hit = (t) => (t.gurdwara && new RegExp(t.gurdwara, 'i').test(row.gurdwara || '')) || (t.notes && new RegExp(t.notes, 'i').test(row.notes || ''));
  for (const [k, t] of Object.entries(T)) if (hit(t)) return k;
  return Object.keys(T).find((k) => !T[k].gurdwara && !T[k].notes) || 'main';
}
const inTier = (row, tier, sets) => tier === 'all' || tierOf(row, sets) === tier;
const tierTitle = (tier, sets = loadSets()) => ((sets.tiers || {})[tier] || {}).title || tier;
const { TOP, canonFolder } = require('./folder-names');
const TOP_TITLE = { '1-kirtan-shabad': 'Kirtan of a Shabad', '2-bani-recited': 'Bani recited (paath)', '3-bani-sung-like-kirtan': 'Bani sung like kirtan', '4-akhand-paath': 'Akhand Paath (Ang after Ang)', '5-akhand-kirtan': 'Akhand Kirtan (smagam, many singers)' };
const THIN = 3;
const r1 = (x) => (x == null || Number.isNaN(x) ? null : +x.toFixed(1));
const r2 = (x) => (x == null || Number.isNaN(x) ? null : +x.toFixed(2));
const quant = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const loadSets = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'gab-sets.json'), 'utf8'));

// ---------------------------------------------------------------- mic path ----------
function micPathOf(row, cfg) {
  for (const [re, cls, why, acoustics] of cfg.byGurdwara) if (new RegExp(re, 'i').test(row.gurdwara || '') && (!acoustics || acoustics === row.acoustics)) return { cls, why };
  const a = cfg.byAcoustics[row.acoustics];
  if (a) return { cls: a, why: `acoustics=${row.acoustics}` };
  return { cls: 'unknown', why: `gurdwara "${row.gurdwara}", acoustics=${row.acoustics || '?'}` };
}
const loadMicCfg = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'gab-micpath.json'), 'utf8'));

// ---------------------------------------------------------------- per clip -----------
// line truth basis: human (lines_source human: sevadaar screen, tapping) > aligned + ear-checked > aligned
// broadcast-caption (Akhand Paath): the publisher's burned-in pangti slides, matched to the STTM DB and frame-checked
// by an independent verifier; made by neither our aligner nor our speech model, so it counts as a headline basis
const BASES = ['human', 'broadcast-caption', 'aligned+ear-checked', 'aligned'];
const BASIS_TITLE = { human: 'human', 'broadcast-caption': 'publisher slides, frame-checked', 'aligned+ear-checked': 'aligned, ear-checked', aligned: 'aligned (our own aligner, unaudited)' };
function basisOf(linesSource, audit) {
  if (/^human/.test(String(linesSource || ''))) return 'human';
  if (/^broadcast-caption/.test(String(linesSource || ''))) return 'broadcast-caption';
  if (audit && audit.confirmed) return 'aligned+ear-checked';
  return 'aligned';
}
function scoreClip(sv, ds, row, eventsFile, suite, sets) {
  const c = sv.scoreClip(ds, row, eventsFile, {});
  const lineTruth = !!(c.truth && c.truth.linesSource);
  const basis = lineTruth ? basisOf(c.truth.linesSource, c.truth.audit) : null;
  const events = sv.findEvents(ds, row, eventsFile, { coldFirst: !!sets.coldFirst[suite] });
  return {
    id: row.id, folder: canonFolder(row.content_folder),
    line: c.line && c.line.acc ? { basis, acc: c.line.acc, audit: c.truth.audit || null } : { why: c.line && c.line.why, basis },
    neverShown: lineTruth && !(c.line && c.line.acc),
    shabad: c.shabad && c.shabad.acc ? { provenance: c.shabad.provenance, acc: c.shabad.acc } : { why: c.shabad && c.shabad.why },
    events,
    // Akhand Paath (Ang after Ang): each Shabad crossing, from the new Shabad's first pangti (its header, read just
    // before, is unlabelled) to the new Shabad on screen
    cross: canonFolder(row.content_folder) === '4-akhand-paath' ? crossings(sv, ds, row, eventsFile) : [],
  };
}
function crossings(sv, ds, row, eventsFile) {
  // the first moment (from 5 s before the previous Shabad's end) the next Shabad is on screen;
  // null = not shown before the next Shabad's own end
  // (on screen = the Shabad's id, or a pangti of its text inside a Bani the app opened, e.g. a Vaar)
  const T = sv.loadTruth(ds, row);
  const sh = T.shabads.slice().sort((x, y) => x.start - y.start);
  const st = sv.screenStates(sv.loadEvents(eventsFile).events);
  const out = [];
  for (let i = 1; i < sh.length; i++) {
    const ids = new Set(sh[i].ids.map(String));
    const texts = T.lines.filter((l) => l.start >= sh[i].start - 0.5 && l.start < sh[i].end).map((l) => l.norm);
    const isNext = (x) => ids.has(String(x.shabad)) || (x.verse != null && texts.some((t) => sv.same(sv.norm(sv.textOf(x.verse) || ''), t)));
    const hit = st.find((x) => x.t >= sh[i - 1].end - 5 && x.t <= sh[i].end && !x.seeking && isNext(x));
    // seconds after the new Shabad's first pangti begins (negative = already up while its header was read)
    out.push(hit ? +(hit.t - sh[i].start).toFixed(1) : null);
  }
  return out;
}

// ---------------------------------------------------------------- aggregation --------
// same or neighbouring pangti: ON + CATCHING UP + BEHIND + AHEAD, from the bucket seconds (not the rounded %s)
const nearPct = (acc) => (acc && acc.voiced > 0 ? +(100 * (acc.b.on + acc.b.catching + acc.b.behind + acc.b.ahead) / acc.voiced).toFixed(1) : null);
function lineGroup(sv, clips, basis) {
  const withTruth = clips.filter((c) => c.line.basis === basis);
  const scored = withTruth.filter((c) => c.line.acc);
  const m = sv.merge(scored.map((c) => c.line.acc));
  const s = sv.summarize(m);
  if (!withTruth.length) return null;
  const audit = scored.reduce((a, c) => { const x = c.line.audit; if (x) for (const k of Object.keys(a)) a[k] += x[k] || 0; return a; }, { checked: 0, confirmed: 0, unsure: 0, rejected: 0 });
  return { basis, pct: s ? s.right_pct : null, near_pct: s ? nearPct(m) : null, clips: scored.length, never_shown: withTruth.length - scored.length, voiced_min: s ? r1(s.voiced_s / 60) : 0,
    behind_p50_s: s ? s.lag_p50 : null, behind_p90_s: s ? s.lag_p90 : null, behind_n: s ? s.lines - s.lines_missed : 0, lines_missed: s ? s.lines_missed : 0,
    audit: audit.checked ? audit : null };
}
function group(sv, clips) {
  const sh = sv.summarize(sv.merge(clips.map((c) => c.shabad.acc).filter(Boolean)));
  const lines = BASES.map((b) => lineGroup(sv, clips, b)).filter(Boolean);
  const head = lines.find((g) => g.clips) || lines[0] || null;
  const ev = clips.flatMap((c) => c.events);
  const finds = ev.filter((e) => e.kind === 'cold' || e.kind === 'begins');
  // a parmaan (a Shabad quoted inside another) is its own count, not a switch
  const sw = ev.filter((e) => e.kind === 'switch' && !e.parmaan);
  const pm = ev.filter((e) => e.kind === 'switch' && e.parmaan);
  const ok = (a) => a.filter((e) => e.find != null).map((e) => e.find);
  const hours = clips.reduce((a, c) => a + (c.dur || 0), 0) / 3600;
  const g = {
    clips: clips.length, hours: r2(hours), sessions: new Set(clips.map((c) => c.session || c.id)).size,
    right_shabad_pct: sh ? sh.right_pct : null, shabad_clips: clips.filter((c) => c.shabad.acc).length, shabad_voiced_min: sh ? r1(sh.voiced_s / 60) : null,
    wrong_s_per_h: sh ? sh.wrong_s_per_h : null, blank_pct: sh ? sh.blank_pct : null,
    // headline line metrics on the best basis present; every basis kept in `lines`
    pangti_pct: head ? head.pct : null, pangti_near_pct: head ? head.near_pct : null, pangti_basis: head ? head.basis : null, pangti_clips: head ? head.clips : 0, pangti_never_shown: head ? head.never_shown : 0,
    behind_p50_s: head ? head.behind_p50_s : null, behind_p90_s: head ? head.behind_p90_s : null, behind_n: head ? head.behind_n : 0,
    lines,
    find_p50_s: r1(quant(ok(finds), 0.5)), find_p90_s: r1(quant(ok(finds), 0.9)), find_n: finds.length, not_found: finds.length - ok(finds).length,
    find_cold_n: finds.filter((e) => e.kind === 'cold').length,
    // switches: only events where the screen showed something else when the new Shabad/Bani began (returns to a
    // main Shabad the screen never left are 'stayed', counted apart); found within 10 s / later / never; p50 over found
    switch_p50_s: r1(quant(ok(sw), 0.5)), switch_p90_s: r1(quant(ok(sw), 0.9)), switch_n: sw.length, switch_missed: sw.length - ok(sw).length,
    switch_within10_n: ok(sw).filter((x) => x <= 10).length, switch_later_n: ok(sw).filter((x) => x > 10).length,
    stayed_main_n: ev.filter((e) => e.kind === 'stayed').length,
    parmaan_n: pm.length, parmaan_shown: ok(pm).length,
  };
  // Akhand Paath: Shabad crossings (every next Shabad), delay from its first pangti (negative = up during the header); lines reached = pangtis that reached the screen of all labelled pangtis
  const cr = clips.flatMap((c) => c.cross || []);
  if (cr.length) {
    const found = cr.filter((x) => x != null);
    Object.assign(g, { cross_n: cr.length, cross_missed: cr.length - found.length, cross_p50_s: r1(quant(found, 0.5)), cross_p90_s: r1(quant(found, 0.9)),
      lines_total: head ? head.behind_n + head.lines_missed : null });
  }
  g.thin = ['pangti_clips', 'find_n', 'switch_n'].filter((k) => g[k] > 0 && g[k] < THIN).concat(g.clips < THIN ? ['clips'] : []);
  return g;
}
// the metrics a mic split / 50/50 is shown for (averaged 50/50 between mixer-feed and room-mic)
const MIC_METRICS = ['right_shabad_pct', 'pangti_pct', 'behind_p50_s', 'wrong_s_per_h', 'find_p50_s'];
function micSplit(sv, clips) {
  const by = {};
  for (const cls of ['mixer-feed', 'room-mic', 'studio', 'unknown']) {
    const cs = clips.filter((c) => c.mic === cls);
    if (cs.length) { const g = group(sv, cs); by[cls] = Object.fromEntries(['clips', 'hours', ...MIC_METRICS, 'pangti_basis', 'pangti_clips', 'find_n'].map((k) => [k, g[k]])); }
  }
  const w = {};
  for (const m of MIC_METRICS) {
    const a = by['mixer-feed'] && by['mixer-feed'][m];
    const b = by['room-mic'] && by['room-mic'][m];
    w[m] = a != null && b != null ? r2((a + b) / 2) : null;
    if (a != null && b != null) w[`${m}_basis`] = '50/50';
    else if (a != null || b != null) w[`${m}_basis`] = a != null ? 'mixer-feed only' : 'room-mic only';
  }
  return { ...by, '50/50': w };
}

const setMatch = (s, c) => (!s.suite || (c.suiteJobs || '').split(';').some((j) => j.startsWith(`${s.suite}:`))) && (!s.folder || c.folder === s.folder || c.folder.startsWith(`${s.folder}/`)) && (!s.split || c.split === s.split) && (!s.gurdwara || new RegExp(s.gurdwara, 'i').test(c.gurdwara || ''));
// rows: each behaviour (top folder), its Banis (incl. expected ones with no clip), the named sets, and all folders
function build(sv, clips, sets, tier = 'main') {
  const rows = [];
  const push = (key, level, title, cs, extra = {}) => { rows.push({ key, level, title, ...(cs.length ? { ...group(sv, cs), mic: micSplit(sv, cs) } : { clips: 0 }), ...extra }); };
  for (const top of TOP) {
    const cs = clips.filter((c) => c.folder.split('/')[0] === top);
    const none = tier !== 'main' ? `no ${tierTitle(tier, sets)} recording of this behaviour has a replay runner` : top === '4-akhand-paath' ? 'no Akhand Paath clip with times in this split (suite apaath: the clips with publisher-slide line answers)' : 'no clip of this behaviour was run';
    push(top, 'behaviour', TOP_TITLE[top], cs, cs.length ? {} : { note: none });
    // the Banis each behaviour should cover are listed (as 'no clips yet') in the main tier only
    const subs = [...new Set([...cs.map((c) => c.folder).filter((f) => f.includes('/')), ...(tier !== 'main' ? [] : (sets.expectBanis[top] || []).map((b) => `${top}/${b}`))])].sort();
    for (const sub of subs) { const x = cs.filter((c) => c.folder === sub); push(sub, 'bani', sub.split('/').slice(1).join('/'), x, x.length ? {} : { note: 'no clips yet in this split' }); }
  }
  for (const s of sets.sets) { if (s.tier && s.tier !== tier) continue; const x = clips.filter((c) => setMatch(s, c)); if (x.length) push(s.key, 'set', s.title, x); }
  push('all', 'all', 'All behaviours together (mixed; not a headline)', clips);
  return rows;
}

// ---------------------------------------------------------------- scorecard ----------
// clips: [{ row, suite, events }]; returns the scorecard object (json)
function scorecard({ sv, ds, clips: runs, meta }) {
  const cfg = loadMicCfg();
  const sets = loadSets();
  const t0 = Date.now();
  const clips = [];
  const errors = [];
  for (const { row, suite, events } of runs) {
    try {
      const c = scoreClip(sv, ds, row, events, suite, sets);
      const mp = micPathOf(row, cfg);
      clips.push({ ...c, suite, suiteJobs: row.suite_jobs, split: row.split, session: row.session || null, gurdwara: row.gurdwara, mic: mp.cls, dur: Number(row.duration_s) || 0 });
    } catch (e) { errors.push({ id: row.id, error: String(e.message).split('\n')[0] }); }
  }
  clips.sort((a, b) => a.id.localeCompare(b.id));
  const rows = build(sv, clips, sets, meta.set || 'main');
  const micAssumptions = {};
  for (const r of runs) { const mp = micPathOf(r.row, cfg); micAssumptions[`${r.row.gurdwara} [${r.row.acoustics}]`] = `${mp.cls} (${mp.why})`; }
  return {
    gab: GAB_VERSION,
    ...meta,
    setTitle: tierTitle(meta.set || 'main', sets),
    rows,
    micAssumptions: Object.fromEntries(Object.entries(micAssumptions).sort()),
    clips: clips.map((c) => {
      const s = c.shabad.acc ? sv.summarize(c.shabad.acc) : null;
      const l = c.line.acc ? sv.summarize(c.line.acc) : null;
      return { id: c.id, folder: c.folder, suite: c.suite, split: c.split, mic: c.mic, hours: r2(c.dur / 3600),
        right_shabad_pct: s ? s.right_pct : null, wrong_s_per_h: s ? s.wrong_s_per_h : null,
        pangti_pct: l ? l.right_pct : null, pangti_near_pct: l ? nearPct(c.line.acc) : null, pangti_basis: c.line.basis || null, never_shown: c.neverShown, behind_p50_s: l ? l.lag_p50 : null,
        audit: c.line.audit || null, events: c.events };
    }),
    scoreErrors: errors,
    timings: { ...(meta.timings || {}), score_s: r1((Date.now() - t0) / 1000) },
  };
}

// ---------------------------------------------------------------- markdown -----------
const f = (v, unit = '') => (v == null ? '-' : `${v}${unit}`);
const thin = (r, k) => (r.thin && r.thin.includes(k) ? ' (thin)' : '');
function cellsOf(r) {
  if (!r.clips) return [r.note || '-', '', '', '', '', '', '', ''];
  const basis = r.pangti_basis ? BASIS_TITLE[r.pangti_basis] : null;
  const head = r.lines && r.lines.find((g) => g.basis === r.pangti_basis);
  const audit = head && head.audit ? `; ear check ${head.audit.confirmed} of ${head.audit.checked} line starts confirmed${head.audit.unsure ? `, ${head.audit.unsure} unsure` : ''}${head.audit.rejected ? `, ${head.audit.rejected} rejected (not scored)` : ''}` : '';
  const pangti = r.pangti_pct != null ? `${r.pangti_basis === 'aligned' ? '' : '**'}${r.pangti_pct}%${r.pangti_basis === 'aligned' ? '' : '**'} (${basis}; ${r.pangti_clips} clips${r.pangti_never_shown ? `, +${r.pangti_never_shown} never shown` : ''}${audit})${thin(r, 'pangti_clips')}` : r.pangti_never_shown ? `- (${r.pangti_never_shown} clips with line truth, nothing ever shown)` : '- (no line truth)';
  const near = r.pangti_near_pct != null ? `${r.pangti_near_pct}%` : '-';
  const behind = r.behind_p50_s != null ? `${r.behind_p50_s} / ${r.behind_p90_s} (${r.behind_n} pangtis, ${basis})` : '-';
  const find = r.find_n ? `${f(r.find_p50_s)} / ${f(r.find_p90_s)} (n ${r.find_n}${r.find_cold_n ? `, ${r.find_cold_n} cold` : ''}${r.not_found ? `, ${r.not_found} not found` : ''})${thin(r, 'find_n')}` : '-';
  const stayed = r.stayed_main_n ? `; ${r.stayed_main_n} stayed on main Shabad` : '';
  const pm = r.parmaan_n ? `; parmaan shown ${r.parmaan_shown} of ${r.parmaan_n}` : '';
  const sw = r.switch_n ? `${r.switch_within10_n ?? '-'} within 10 s / ${r.switch_later_n ?? '-'} later / ${r.switch_missed} never (n ${r.switch_n}); p50 ${f(r.switch_p50_s)} s over found${stayed}${pm}${thin(r, 'switch_n')}` : `- (no switch in these clips${stayed}${pm})`;
  return [`${r.clips} · ${r.hours} h${thin(r, 'clips')}`, `${f(r.right_shabad_pct, '%')}`, pangti, near, behind, f(r.wrong_s_per_h), find, sw];
}
function markdown(card) {
  const L = [];
  L.push(`## ${card.gab} scorecard — ${card.setTitle || 'GAB'} — ${card.build.name || card.build.commit || card.build.root}`);
  L.push('');
  L.push(`build \`${card.build.root}\` @ ${card.build.commit || '?'}${card.build.dirty ? ' (uncommitted edits)' : ''}${card.build.featureVersion ? ` · Voice-Follow ${card.build.featureVersion}` : ''}${card.model ? ` · speech model **${card.model.name}** (${card.model.sha12})` : ''} · manifest ${card.manifest.sha} (${card.manifest.rows} rows) · set **${card.set || 'pre-tier (mixed)'}** · tier **${card.tier}** · split **${card.split}**${card.folders ? ` · folders ${card.folders}` : ''} · ${card.createdAt}`);
  L.push('');
  L.push('| behaviour | clips · audio | right Shabad/Bani on screen (human truth) | sangat sees the right pangti (truth basis; coverage) | same or neighbouring pangti | seconds behind p50 / p90 | wrong Shabad s per hour | time to find p50 / p90 s | switch: found within 10 s / later / never; p50 |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of card.rows.filter((x) => x.level === 'behaviour' || x.level === 'bani')) {
    const name = r.level === 'behaviour' ? `**${r.title}**` : `&nbsp;&nbsp;${r.title}`;
    L.push(`| ${name} | ${cellsOf(r).join(' | ')} |`);
  }
  const ap = card.rows.find((x) => x.key === '4-akhand-paath' && x.clips);
  if (ap) {
    L.push('');
    L.push(`Akhand Paath (Ang after Ang): in sequence (right Shabad up) ${f(ap.right_shabad_pct, '%')} · wrong ${ap.wrong_s_per_h != null ? r1(ap.wrong_s_per_h / 36) : '-'}% (${f(ap.wrong_s_per_h)} s/h) · searching/blank ${f(ap.blank_pct, '%')} · behind the reader p50 / p90 ${f(ap.behind_p50_s)} / ${f(ap.behind_p90_s)} s · pangtis reached ${ap.behind_n} of ${f(ap.lines_total)} · Shabad crossings ${f(ap.cross_n)} (${f(ap.cross_missed)} not shown), new Shabad up p50 / p90 ${f(ap.cross_p50_s)} / ${f(ap.cross_p90_s)} s after its first pangti begins (negative = during its header)`);
  }
  L.push('');
  L.push('Named clip sets of earlier reports (so an old number can be checked on its own clips):');
  L.push('');
  L.push('| set | clips · audio | right Shabad/Bani | sangat sees the right pangti | same or neighbouring | seconds behind p50 / p90 | wrong s/h | find p50 / p90 s | switch: within 10 s / later / never; p50 |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of card.rows.filter((x) => x.level === 'set' || x.level === 'all')) L.push(`| ${r.title} | ${cellsOf(r).join(' | ')} |`);
  L.push('');
  L.push('Mic path, second view (50/50 = mean of mixer feed and room mic):');
  L.push('');
  L.push('| behaviour | mic path | clips | right Shabad/Bani | sangat sees the right pangti | seconds behind p50 | wrong Shabad s/h | find p50 s |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const r of card.rows.filter((x) => x.level === 'behaviour' && x.clips)) {
    for (const cls of ['mixer-feed', 'room-mic', '50/50', 'studio', 'unknown']) {
      const m = r.mic[cls];
      if (!m) continue;
      if (cls === '50/50') {
        if (!MIC_METRICS.some((k) => m[k] != null)) continue;
        const v = (k, u = '') => (m[k] != null ? `**${m[k]}${u}**` : m[`${k}_basis`] ? `(${m[`${k}_basis`]})` : '-');
        L.push(`| ${r.title} | **50/50** | | ${v('right_shabad_pct', '%')} | ${v('pangti_pct', '%')} | ${v('behind_p50_s')} | ${v('wrong_s_per_h')} | ${v('find_p50_s')} |`);
      } else L.push(`| ${r.title} | ${cls} | ${m.clips} | ${f(m.right_shabad_pct, '%')} | ${m.pangti_pct != null ? `${m.pangti_pct}% (${BASIS_TITLE[m.pangti_basis]}, ${m.pangti_clips})` : '-'} | ${f(m.behind_p50_s)} | ${f(m.wrong_s_per_h)} | ${f(m.find_p50_s)} |`);
    }
  }
  L.push('');
  L.push(`Mic path assumptions (gab-micpath.json): ${Object.entries(card.micAssumptions).map(([g, a]) => `${g} = ${a.split(' (')[0]}`).join('; ')}.`);
  L.push('');
  L.push('How to read: right Shabad/Bani % and wrong s/h rest on human answer keys for every clip. Same or neighbouring pangti adds the time the screen is one pangti behind or ahead (in kirtan the ragi sings two pangtis as one phrase, and the answer key marks the partner as wrong); information only. Sangat-sees-pangti % and seconds behind need line-level answer keys; their basis is printed (human = the sevadaar\'s screen or a person; aligned, ear-checked = made by our aligner and spot-checked by ear; aligned = made by our aligner only, not a headline). Find = first Shabad/Bani of a clip ("cold" = the app was started while it was being sung, timed from t=0); switch = a later, different Shabad/Bani, timed from its start, counted only when the screen showed something else when it began (a return to the main Shabad after a parmaan that the screen never left is "stayed on main Shabad", correct, not a switch); p50 is over found switches only, so read it with "never"; a parmaan is also counted as shown / not shown. (thin) = fewer than 3 clips or events behind the number.');
  if (card.notRun && card.notRun.length) {
    const by = {};
    for (const n of card.notRun) (by[n.why] = by[n.why] || []).push(n.id);
    L.push('');
    L.push(`Not run (${card.notRun.length}): ${Object.entries(by).map(([why, ids]) => `${why}: ${ids.length > 8 ? `${ids.slice(0, 8).map((i) => i.split('_')[0]).join(', ')} +${ids.length - 8}` : ids.map((i) => i.split('_')[0]).join(', ')}`).join('; ')}.`);
  }
  if (card.scoreErrors && card.scoreErrors.length) L.push(`\nScoring errors: ${card.scoreErrors.map((e) => `${e.id}: ${e.error}`).join('; ')}`);
  const t = card.timings || {};
  L.push('');
  L.push(`Timing: total ${f(t.total_s)} s (replay ${f(t.replay_s)} s, scoring ${f(t.score_s)} s), ${t.clip_runs ?? '?'} clip runs, ${t.reused ?? '?'} reused; load average ${t.load ?? '?'}.`);
  return L.join('\n');
}

// ---------------------------------------------------------------- compare ------------
// metric -> [direction (+1 higher better), tolerance before a change counts as worse]
const GUARD = {
  right_shabad_pct: [1, 0.1, 'right Shabad/Bani %'],
  pangti_pct: [1, 0.1, 'sangat sees the right pangti %'],
  behind_p50_s: [-1, 0.05, 'seconds behind p50'],
  behind_p90_s: [-1, 0.1, 'seconds behind p90'],
  wrong_s_per_h: [-1, 1, 'wrong Shabad s/h'],
  find_p50_s: [-1, 0.2, 'time to find p50 s'],
  not_found: [-1, 0, 'not found'],
  switch_p50_s: [-1, 0.2, 'switch time p50 s'],
  switch_missed: [-1, 0, 'switches never found'],
};
const INFO = { pangti_near_pct: [1, 0.1, 'same or neighbouring pangti % (info)'], cross_p50_s: [-1, 0.2, 'Akhand Paath crossing delay p50 s (info)'], cross_p90_s: [-1, 0.2, 'Akhand Paath crossing delay p90 s (info)'], cross_missed: [-1, 0, 'Akhand Paath crossings not shown (info)'], find_p90_s: [-1, 0.2, 'time to find p90 s (info)'], switch_p90_s: [-1, 0.2, 'switch time p90 s (info)'], pangti_never_shown: [-1, 0, 'line-truth clips never shown (info)'], parmaan_shown: [1, 0, 'parmaans shown (info)'],
  // info only: its denominator moves (a build that stays on the main Shabad turns a switch into 'stayed')
  switch_within10_n: [1, 0, 'switches found within 10 s (info)'] };
function compare(A, B) {
  const ta = A.set || 'pre-tier (mixed)';
  const tb = B.set || 'pre-tier (mixed)';
  if (ta !== tb) throw new Error(`GAB tiers are never mixed: A is ${ta}, B is ${tb} (re-run both with the same --set)`);
  const out = { gab: GAB_VERSION, set: ta, a: A.build, b: B.build, manifest: [A.manifest.sha, B.manifest.sha], tier: A.tier, split: A.split, rows: [], pass: true, worse: [], better: [] };
  if (A.manifest.sha !== B.manifest.sha) out.warning = 'the two scorecards used different manifests';
  const byKey = (card) => new Map(card.rows.map((r) => [r.key, r]));
  const ma = byKey(A);
  const mb = byKey(B);
  // line numbers are guarded only on line answers that are a headline: human or ear-checked, at least THIN clips
  const LINE = new Set(['pangti_pct', 'behind_p50_s', 'behind_p90_s']);
  const lineHead = (r) => !!r && r.pangti_basis && r.pangti_basis !== 'aligned' && r.pangti_clips >= THIN;
  const judge = (key, scope, a, b, spec, guarded0) => {
    for (const [m, [dir, tol, label0]] of Object.entries(spec)) {
      const guarded = guarded0 && (!LINE.has(m) || (lineHead(a) && lineHead(b)));
      const label = guarded0 && !guarded ? `${label0} (info: aligner-only or thin line answers)` : label0;
      const x = a ? a[m] : null;
      const y = b ? b[m] : null;
      if (x == null && y == null) continue;
      let verdict = 'same';
      if (x == null || y == null) verdict = 'n/a';
      else if (Math.abs(y - x) < 1e-9) verdict = 'same';
      else if (dir * (y - x) > tol) verdict = 'better';
      else if (dir * (y - x) < -tol) verdict = guarded ? 'WORSE' : 'worse (info)';
      else verdict = 'within tolerance';
      const rec = { key, scope, metric: label, a: x, b: y, verdict };
      out.rows.push(rec);
      if (verdict === 'WORSE') { out.pass = false; out.worse.push(rec); }
      if (verdict === 'better') out.better.push(rec);
    }
  };
  for (const [key, ra] of ma) {
    const rb = mb.get(key);
    if (!ra.clips && !(rb && rb.clips)) continue;
    // guarded: each behaviour, all clips and per mic path; per-Bani rows, sets and the mixed all-row are information
    const guarded = ra.level === 'behaviour';
    judge(key, 'all clips', ra, rb, GUARD, guarded);
    judge(key, 'all clips', ra, rb, INFO, false);
    for (const cls of ['mixer-feed', 'room-mic', '50/50']) {
      const xa = ra.mic && ra.mic[cls];
      const xb = rb && rb.mic && rb.mic[cls];
      if (!xa && !xb) continue;
      judge(key, cls, xa, xb, Object.fromEntries(MIC_METRICS.map((m) => [m, GUARD[m]])), guarded);
    }
  }
  return out;
}
function compareMarkdown(c, A, B) {
  const L = [];
  L.push(`## ${c.gab} compare (${c.set}) — A: ${A.build.name || A.build.commit} vs B: ${B.build.name || B.build.commit}`);
  L.push('');
  L.push(`A \`${A.build.root}\` @ ${A.build.commit}${A.build.dirty ? ' (dirty)' : ''}${A.model ? ` (model ${A.model.name})` : ''} · B \`${B.build.root}\` @ ${B.build.commit}${B.build.dirty ? ' (dirty)' : ''}${B.model ? ` (model ${B.model.name})` : ''} · manifest ${c.manifest[0]} · tier ${c.tier} · split ${c.split}${c.warning ? ` · WARNING: ${c.warning}` : ''}`);
  L.push('');
  L.push('| row | scope | metric | A | B | verdict |');
  L.push('|---|---|---|---|---|---|');
  const title = (k) => (k === 'all' ? 'All behaviours' : TOP_TITLE[k] || k);
  const nSame = c.rows.filter((r) => r.verdict === 'same' || r.verdict === 'n/a').length;
  for (const r of c.rows) {
    if (r.verdict === 'same' || r.verdict === 'n/a') continue;
    L.push(`| ${title(r.key)} | ${r.scope} | ${r.metric} | ${f(r.a)} | ${f(r.b)} | ${r.verdict === 'WORSE' ? '**WORSE**' : r.verdict === 'better' ? '**better**' : r.verdict} |`);
  }
  L.push(`| (${nSame} more metric cells unchanged) | | | | | |`);
  L.push('');
  if (c.incomplete && c.incomplete.length) L.push(`GUARDRAILS: INCOMPLETE (no verdict: ${c.incomplete.length} clip run(s) did not replay: ${c.incomplete.map((m) => `${m.key} (${m.why})`).join(', ')}) · ${c.better.length} better / ${c.worse.length} worse on the clips that did run`);
  else L.push(`GUARDRAILS: ${c.pass ? 'PASS (no guarded metric worse)' : `FAIL (${c.worse.length} worse: ${c.worse.map((w) => `${title(w.key)} ${w.scope} ${w.metric} ${w.a} -> ${w.b}`).join('; ')})`} · ${c.better.length} better`);
  L.push('Guarded = each behaviour, all clips and per mic path (mixer feed, room mic, 50/50); per-Bani rows, named sets and the mixed all-behaviours row are information only, and so are pangti % and seconds behind when they rest on aligner-only line answers or fewer than 3 clips. Tolerances: right % 0.1 pt, seconds behind 0.05 s (p50) / 0.1 s (p90), wrong s/h 1, find / switch time 0.2 s, not found / switches never found 0.');
  return L.join('\n');
}

const manifestSha = (text) => sha1(text).slice(0, 12);
module.exports = { GAB_VERSION, tierOf, inTier, tierTitle, TOP, TOP_TITLE, BASIS_TITLE, scorecard, markdown, compare, compareMarkdown, micPathOf, loadMicCfg, loadSets, manifestSha, GUARD, THIN };
