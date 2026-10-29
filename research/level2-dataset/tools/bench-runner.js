#!/usr/bin/env node
/* bench-runner.js — Level 2 benchmark: run the REAL VoiceFollow component (headless,
 * full BaniDB, native ONNX, shipped decision policy) over human-verified clips and
 * score the five headline metrics. No labels are given to the app.
 *
 * Truth: human-fully-sheet.json (parsed from the user's read-only sheet tab).
 * Audio: live-darbar-venues/clips/clipNN_<video>_<s>-<e>.wav (30s lead-in, 10s tail).
 *
 * Usage: node bench-runner.js [--only clip03,clip07] [--out results/<name>]
 *   env MODEL=/path/model.int8.onnx  VF_BANIDB_USER_DATA=~/Library/Application Support/SikhiToTheMax
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '../../..');
const { createDriver } = require(path.join(__dirname, 'bench-driver'));
const DS = require('./gab-data').DS;
const CLIPS = process.env.VF_CLIPS || '/Users/asingh02/personal/live-darbar-venues/clips';
const MODEL = require('./speech-pack').speechModel().onnx;
const USERDATA = process.env.VF_BANIDB_USER_DATA || path.join(process.env.HOME, 'Library/Application Support/SikhiToTheMax');
const LEAD = 30, TAIL = 10, SR = 16000, CHUNK = 2048, STEP = 0.1;
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const ONLY = arg('only', '') ? new Set(arg('only', '').split(',')) : null;
const TRACE_ALL = process.argv.includes('--trace-all');
const FAST = process.argv.includes('--fast'); // no real-time pacing (see push loop)
const OUT = arg('out', path.join(DS, 'results', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')));
fs.mkdirSync(OUT, { recursive: true });

function readWav(file) {
  const b = fs.readFileSync(file); let off = 12;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4);
    if (id === 'data') { const n = Math.floor(sz / 2), out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = b.readInt16LE(off + 8 + i * 2) / 32768; return out; }
    off += 8 + sz + (sz & 1);
  }
  throw new Error('no data chunk');
}

// Screen timeline -> metrics for one clip. events: [{t, type, shabadId?, visible?}]
function score(events, truthSids, dur) {
  const ok = new Set(Array.isArray(truthSids) ? truthSids : [truthSids]);
  // state over time: shabad on screen (null = none) and seeking slide visible
  let sid = null, seeking = false, i = 0;
  const ev = events.filter((e) => e.type === 'shabad' || e.type === 'seeking').sort((a, b) => a.t - b.t);
  let right = 0, wrong = 0, searching = 0, firstCorrect = null, flips = 0, lastShown = null, longestWrong = 0, curWrong = 0;
  for (let t = 0; t < dur; t += STEP) {
    while (i < ev.length && ev[i].t <= t) {
      const e = ev[i++];
      if (e.type === 'shabad') { if (lastShown != null && e.shabadId !== lastShown && !(ok.has(e.shabadId) && ok.has(lastShown))) flips++; lastShown = e.shabadId; sid = e.shabadId; }
      if (e.type === 'seeking') seeking = e.visible;
    }
    const shown = seeking ? null : sid;
    if (ok.has(shown)) { right += STEP; if (firstCorrect == null) firstCorrect = t; curWrong = 0; }
    else if (shown == null) { searching += STEP; curWrong = 0; }
    else { wrong += STEP; curWrong += STEP; longestWrong = Math.max(longestWrong, curWrong); }
  }
  return { dur: +dur.toFixed(1), right: +(right / dur).toFixed(4), wrong: +(wrong / dur).toFixed(4), searching: +(searching / dur).toFixed(4),
    firstCorrect_s: firstCorrect == null ? null : +firstCorrect.toFixed(1), found: firstCorrect != null, flips, longestWrong_s: +longestWrong.toFixed(1) };
}

(async () => {
  // --truth <file> selects the truth set (default Level 2 tab); --prefix names clips (clip / l3clip).
  const rows = JSON.parse(fs.readFileSync(path.join(DS, arg('truth', 'human-fully-sheet.json'))));
  const PREFIX = arg('prefix', 'clip');
  const notes = fs.existsSync(path.join(DS, 'clip-notes.json')) ? JSON.parse(fs.readFileSync(path.join(DS, 'clip-notes.json'))) : {};
  const results = [];
  for (let k = 0; k < rows.length; k++) {
    const row = rows[k]; const name = `${PREFIX}${String(k + 1).padStart(2, '0')}`;
    if (ONLY && !ONLY.has(name)) continue;
    if (row.shabad_ids.length !== 1) { console.error(`${name}: ambiguous truth, skipped`); continue; }
    const s = Math.max(0, row.start_s - LEAD), e = row.end_s + TAIL;
    const wav = path.join(CLIPS, `${name}_${row.video_id}_${s}-${e}.wav`);
    if (!fs.existsSync(wav)) { console.error(`${name}: no audio yet`); continue; }
    const lead = row.start_s - s; // seconds of audio before truth start
    const pcm = readWav(wav);
    const events = [];
    const t0 = Date.now();
    const driver = await createDriver({ model: MODEL, userData: USERDATA, cacheId: path.basename(wav, '.wav'), onEvent: (ev) => { if (TRACE_ALL) { const { t, ...rest } = ev; events.push({ t: t - lead, ...rest }); return; } if (ev.type === 'shabad' || ev.type === 'seeking' || ev.type === 'component-error') events.push({ t: ev.t - lead, type: ev.type, shabadId: ev.shabadId, visible: ev.visible, message: ev.message }); } });
    await driver.start();
    // Real-time pacing (fidelity): the component fires each decision without awaiting
    // it and cancels the previous decision's text search when the next transcript
    // arrives. Fed faster than real time, ~75% of decisions were cancelled and the
    // judge went blind for up to 2 minutes. Never let audio time run ahead of wall
    // time, exactly like a microphone. --fast disables (comparisons only).
    const wall0 = Date.now();
    for (let p = 0; p < pcm.length; p += CHUNK) {
      const chunk = pcm.subarray(p, Math.min(p + CHUNK, pcm.length));
      const audioT = (p + chunk.length) / SR;
      await driver.push(chunk, audioT);
      if (!FAST) {
        const ahead = audioT * 1000 - (Date.now() - wall0);
        if (ahead > 2) await new Promise((r) => setTimeout(r, ahead));
      }
    }
    await driver.stop();
    const truthDur = row.end_s - row.start_s;
    // events before t=0 (during lead-in) count as state at t=0; score from truth start to truth end
    const note = notes[name] || {};
    const m = score(events.map((x) => ({ ...x, t: Math.max(0, x.t) })), [row.shabad_ids[0], ...(note.also_correct || [])], truthDur);
    const rec = { clip: name, gurdwara: row.gurdwara.split(',')[0], video_id: row.video_id, truth_shabad: row.shabad_ids[0], start_s: row.start_s, end_s: row.end_s,
      line: row.line, note: note.kind || null, ...m, shownSequence: events.filter((x) => x.type === 'shabad').map((x) => `${x.shabadId}@${x.t.toFixed(1)}`), errors: events.filter((x) => x.type === 'component-error').length, wall_s: +((Date.now() - t0) / 1000).toFixed(0) };
    results.push(rec);
    fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ row, events, metrics: m }, null, 1));
    console.log(`${name} ${rec.gurdwara.padEnd(22)} truth ${String(rec.truth_shabad).padStart(6)} | found ${m.found ? String(m.firstCorrect_s).padStart(6) + 's' : '   NEVER'} | right ${(m.right * 100).toFixed(0).padStart(3)}% wrong ${(m.wrong * 100).toFixed(0).padStart(3)}% search ${(m.searching * 100).toFixed(0).padStart(3)}% | flips ${m.flips} | shown ${rec.shownSequence.slice(0, 6).join(' ')}`);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  }
  // summary
  const groups = { overall: results }; for (const r of results) (groups[r.gurdwara] ||= []).push(r);
  const lines = ['# Level 2 benchmark — MVP 4.0 (pr-2202 @ 42380ecc), shipped config', '', `Clips: ${results.length}. Truth: Human-Fully Sheet (read-only). App run headless with full BaniDB; no labels given to the app.`, '',
    '| group | clips | found ≤10s | ≤20s | ≤30s | ≤60s | never | right page | wrong page | searching | flip-flops (total) | median first-correct | longest wrong |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  const pct = (n, d) => d ? `${Math.round(100 * n / d)}% (${n}/${d})` : '-';
  for (const [g, rs] of Object.entries(groups)) {
    const n = rs.length, T = rs.reduce((a, r) => a + r.dur, 0);
    const within = (s) => rs.filter((r) => r.found && r.firstCorrect_s <= s).length;
    const fc = rs.filter((r) => r.found).map((r) => r.firstCorrect_s).sort((a, b) => a - b);
    lines.push(`| ${g} | ${n} | ${pct(within(10), n)} | ${pct(within(20), n)} | ${pct(within(30), n)} | ${pct(within(60), n)} | ${rs.filter((r) => !r.found).length} | ${(100 * rs.reduce((a, r) => a + r.right * r.dur, 0) / T).toFixed(1)}% | ${(100 * rs.reduce((a, r) => a + r.wrong * r.dur, 0) / T).toFixed(1)}% | ${(100 * rs.reduce((a, r) => a + r.searching * r.dur, 0) / T).toFixed(1)}% | ${rs.reduce((a, r) => a + r.flips, 0)} | ${fc.length ? fc[Math.floor(fc.length / 2)] + 's' : '-'} | ${Math.max(0, ...rs.map((r) => r.longestWrong_s))}s |`);
  }
  lines.push('', 'Right/wrong/searching are time-weighted over the truth windows. Found = correct shabad on screen at any point in the clip; seconds measured from the human-marked first sung line.');
  fs.writeFileSync(path.join(OUT, 'SUMMARY.md'), lines.join('\n') + '\n');
  console.log('\n' + lines.join('\n'));
})().catch((e) => { console.error(e.stack); process.exit(1); });
