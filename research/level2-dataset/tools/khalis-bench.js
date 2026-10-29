#!/usr/bin/env node
/* khalis-bench.js — line-level benchmark on Jaspal's HF recordings (khalisfoundation/sttm_desktop_*).
 * Truth: verse_timestamps.csv = the sevadaar's verse at each moment (khalis-tests.json, built by truth.js:
 * verseId -> shabadId, line). The app runs headless over the WAV; we record every shabad and verse it
 * shows and score, over the time from the first human verse to the end:
 *   shabad right/wrong/searching (time-weighted), line exact / within one line (time-weighted, while
 *   the right shabad is up), line lag (median seconds from a human verse change to the app showing
 *   that verse), flips.
 * Usage: node khalis-bench.js --tests <khalis-tests.json> [--only kh01,kh02] [--out results/<name>] [--fast]
 */
const fs = require('fs');
const path = require('path');
const { createDriver } = require(path.join(__dirname, 'bench-driver'));
const CLIPS = process.env.VF_CLIPS || '/Users/asingh02/personal/live-darbar-venues/clips';
const MODEL = process.env.MODEL || '/Users/asingh02/AAI/models/karansea-shabad-ctc/model.int8.onnx';
const USERDATA = process.env.VF_BANIDB_USER_DATA || path.join(process.env.HOME, 'Library/Application Support/SikhiToTheMax');
const SR = 16000, CHUNK = 2048, STEP = 0.1;
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const ONLY = arg('only', '') ? new Set(arg('only', '').split(',')) : null;
const FAST = process.argv.includes('--fast');
const TRACE = process.argv.includes('--trace');
const TRACE_ALL = process.argv.includes('--trace-all');
const OUT = arg('out', path.join(__dirname, '..', 'results', `khalis-${Date.now()}`));
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
function score(events, timeline, dur) {
  const ev = events.filter((e) => e.type === 'shabad' || e.type === 'seeking' || e.type === 'verse').sort((a, b) => a.t - b.t);
  const t0 = timeline[0].t;
  let sid = null, seeking = false, verse = null, i = 0, k = 0;
  let right = 0, wrong = 0, searching = 0, exact = 0, near = 0, flips = 0, lastShown = null;
  const sameText = (a, b) => a != null && b != null && a === b;
  for (let t = t0; t < dur; t += STEP) {
    while (i < ev.length && ev[i].t <= t) {
      const e = ev[i++];
      if (e.type === 'shabad') { if (lastShown != null && e.shabadId !== lastShown) flips++; lastShown = e.shabadId; sid = e.shabadId; }
      if (e.type === 'seeking') seeking = e.visible;
      if (e.type === 'verse') verse = e.verseId;
    }
    while (k + 1 < timeline.length && timeline[k + 1].t <= t) k++;
    const truth = timeline[k];
    const shown = seeking ? null : sid;
    if (truth.shabadId == null) continue;
    if (sameText(shown, truth.shabadId)) {
      right += STEP;
      if (verse === truth.verseId) { exact += STEP; near += STEP; }
      else if (verse != null && Math.abs(verse - truth.verseId) <= 1) near += STEP;
    } else if (shown == null) searching += STEP;
    else wrong += STEP;
  }
  // lag: for each human verse change, when did the app first show that verse (within 60 s)?
  const lags = [];
  const verseEv = ev.filter((e) => e.type === 'verse');
  for (const tv of timeline) {
    const hit = verseEv.find((e) => e.verseId === tv.verseId && e.t >= tv.t - 5 && e.t <= tv.t + 60);
    if (hit) lags.push(+(hit.t - tv.t).toFixed(1));
  }
  lags.sort((a, b) => a - b);
  const T = dur - t0;
  return { dur: +T.toFixed(1), right: +(right / T).toFixed(4), wrong: +(wrong / T).toFixed(4), searching: +(searching / T).toFixed(4),
    lineExact: +(exact / T).toFixed(4), lineNear: +(near / T).toFixed(4), flips,
    verseChanges: timeline.length, versesReached: lags.length, lagMedian: lags.length ? lags[Math.floor(lags.length / 2)] : null };
}
(async () => {
  const tests = JSON.parse(fs.readFileSync(arg('tests')));
  const results = [];
  for (const row of tests) {
    if (ONLY && !ONLY.has(row.name)) continue;
    const wav = path.join(CLIPS, row.clip);
    const pcm = readWav(wav); const events = []; const t0 = Date.now();
    const driver = await createDriver({ model: MODEL, userData: USERDATA, cacheId: path.basename(row.clip, '.wav'), onEvent: (ev) => {
      if (TRACE_ALL) { events.push(ev); return; }
      if (TRACE && ev.type === 'transcript') { events.push({ t: ev.t, type: 'transcript', text: ev.text, confidence: ev.confidence }); return; }
      if (['shabad', 'seeking', 'verse', 'component-error'].includes(ev.type)) events.push({ t: ev.t, type: ev.type, shabadId: ev.shabadId, verseId: ev.verseId, visible: ev.visible, message: ev.message });
    } });
    await driver.start();
    const wall0 = Date.now();
    for (let p = 0; p < pcm.length; p += CHUNK) {
      const chunk = pcm.subarray(p, Math.min(p + CHUNK, pcm.length));
      const audioT = (p + chunk.length) / SR;
      await driver.push(chunk, audioT);
      if (!FAST) { const ahead = audioT * 1000 - (Date.now() - wall0); if (ahead > 2) await new Promise((r) => setTimeout(r, ahead)); }
    }
    await driver.stop();
    const sc = score(events, row.timeline, pcm.length / SR);
    const rec = { clip: row.name, dataset: row.dataset, shabads: row.shabads, ...sc, errors: events.filter((x) => x.type === 'component-error').length, wall_s: +((Date.now() - t0) / 1000).toFixed(0),
      shownSequence: events.filter((x) => x.type === 'shabad').map((x) => `${x.shabadId}@${x.t.toFixed(1)}`) };
    results.push(rec);
    fs.writeFileSync(path.join(OUT, `${row.name}.json`), JSON.stringify({ row, events, metrics: sc }, null, 1));
    console.log(`${row.name} | shabad right ${(sc.right * 100).toFixed(0)}% wrong ${(sc.wrong * 100).toFixed(0)}% search ${(sc.searching * 100).toFixed(0)}% | line exact ${(sc.lineExact * 100).toFixed(0)}% near ${(sc.lineNear * 100).toFixed(0)}% | verses ${sc.versesReached}/${sc.verseChanges} lag ${sc.lagMedian}s | flips ${sc.flips} | truth ${row.shabads.join(',')} shown ${rec.shownSequence.slice(0, 8).join(' ')}`);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  }
  const T = results.reduce((a, r) => a + r.dur, 0);
  const w = (k) => (100 * results.reduce((a, r) => a + r[k] * r.dur, 0) / T).toFixed(1);
  const sum = `| build | clips | shabad right | wrong | searching | line exact | line within 1 | verses reached | median lag | flips |\n|---|---|---|---|---|---|---|---|---|---|\n| ${arg('label', path.basename(OUT))} | ${results.length} | ${w('right')}% | ${w('wrong')}% | ${w('searching')}% | ${w('lineExact')}% | ${w('lineNear')}% | ${results.reduce((a, r) => a + r.versesReached, 0)}/${results.reduce((a, r) => a + r.verseChanges, 0)} | ${(results.map((r) => r.lagMedian).filter((x) => x != null).sort((a, b) => a - b)[Math.floor(results.length / 2)]) ?? '-'}s | ${results.reduce((a, r) => a + r.flips, 0)} |`;
  fs.writeFileSync(path.join(OUT, 'SUMMARY.md'), sum + '\n'); console.log('\n' + sum);
})().catch((e) => { console.error(e.stack); process.exit(1); });
