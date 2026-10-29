#!/usr/bin/env node
/* khalis-arbiter.js — who is right when the app and the sevadaar show different lines?
 * The sevadaar's click is a label, not ground truth: sevadaars move early (when the ragi starts a
 * line) or late. For every moment the app shows a different line of the SAME Shabad than the
 * sevadaar, look at what the recognizer heard around that moment and compare it with both lines.
 *   app-right   heard text matches the app's line clearly better
 *   human-right heard text matches the sevadaar's line clearly better
 *   unclear     too little text, or both lines match about equally (shared words, refrains)
 * Also: tolerance scores (app counts as right on the sevadaar's line OR the line the sevadaar left
 * within N seconds), and a listen list of the longest disagreements for an ear check.
 * Usage: node khalis-arbiter.js --tests khalis-tests.json --trace <dir with kh*.json incl transcripts>
 *          [--app <dir with kh*.json to judge, default = --trace>] [--listen 10]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const anvaad = require(path.join(ROOT, 'node_modules/anvaad-js'));
const { norm } = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/infer'));
const { partialRatio } = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/fuzz'));
const Realm = require(path.join(ROOT, 'node_modules/realm'));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const STEP = 0.5, BEFORE = 1.0, AFTER = 4.0, MIN_CHARS = 6, MARGIN = 12, MIN_SCORE = 50;
(async () => {
  const dir = path.join(process.env.HOME, 'Library/Application Support/SikhiToTheMax');
  const sj = JSON.parse(fs.readFileSync(path.join(dir, 'realm-schema-evergreen.json')));
  const realm = await Realm.open({ path: path.join(dir, 'sttmdesktop-evergreen-v2.realm'), schema: sj.schemas, schemaVersion: sj.schemaVersion, readOnly: true });
  const lineText = new Map();
  const textOf = (vid) => {
    if (!lineText.has(vid)) { const v = realm.objects('Verse').filtered('ID == $0', vid)[0]; lineText.set(vid, v ? norm(anvaad.unicode(v.Gurmukhi)) : ''); }
    return lineText.get(vid);
  };
  const tests = JSON.parse(fs.readFileSync(arg('tests')));
  const traceDir = arg('trace'); const appDir = arg('app', traceDir);
  const all = { agree: 0, appRight: 0, humanRight: 0, unclear: 0, otherShabad: 0 };
  const tol = { 0: 0, 3: 0, 5: 0, 8: 0 }; let tolTotal = 0;
  const listen = [];
  for (const row of tests) {
    const tf = path.join(traceDir, `${row.name}.json`), af = path.join(appDir, `${row.name}.json`);
    if (!fs.existsSync(tf) || !fs.existsSync(af)) continue;
    const tr = JSON.parse(fs.readFileSync(tf)).events.filter((e) => e.type === 'transcript' && e.text);
    const ev = JSON.parse(fs.readFileSync(af)).events;
    const appVerse = ev.filter((e) => e.type === 'verse').sort((a, b) => a.t - b.t);
    const appShabad = ev.filter((e) => e.type === 'shabad').sort((a, b) => a.t - b.t);
    const tl = row.timeline; const t0 = tl[0].t; const end = row.seconds;
    const c = { agree: 0, appRight: 0, humanRight: 0, unclear: 0, otherShabad: 0 };
    let run = null;
    const at = (list, t, key) => { let v = null; for (const e of list) { if (e.t > t) break; v = e[key]; } return v; };
    for (let t = t0; t < end; t += STEP) {
      let k = 0; while (k + 1 < tl.length && tl[k + 1].t <= t) k++;
      const h = tl[k]; const aV = at(appVerse, t, 'verseId'); const aS = at(appShabad, t, 'shabadId');
      // tolerance: app line equals the human's line, or the line the human left within N s
      tolTotal += STEP;
      for (const n of Object.keys(tol)) {
        const prev = k > 0 && t - h.t <= Number(n) ? tl[k - 1].verseId : null;
        const nextSoon = k + 1 < tl.length && tl[k + 1].t - t <= Number(n) ? tl[k + 1].verseId : null;
        if (aV != null && (aV === h.verseId || (Number(n) > 0 && (aV === prev || aV === nextSoon)))) tol[n] += STEP;
      }
      if (aS !== h.shabadId) { c.otherShabad += STEP; if (run) { listen.push(run); run = null; } continue; }
      if (aV === h.verseId) { c.agree += STEP; if (run) { listen.push(run); run = null; } continue; }
      const heard = tr.filter((x) => x.t >= t - BEFORE && x.t <= t + AFTER).map((x) => norm(x.text)).join(' ').trim();
      let verdict = 'unclear';
      if (heard.replace(/\s/g, '').length >= MIN_CHARS && aV != null) {
        const sa = partialRatio(heard, textOf(aV)), sh = partialRatio(heard, textOf(h.verseId));
        if (sa >= MIN_SCORE && sa - sh >= MARGIN) verdict = 'appRight';
        else if (sh >= MIN_SCORE && sh - sa >= MARGIN) verdict = 'humanRight';
      }
      c[verdict] += STEP;
      if (run && run.app === aV && run.human === h.verseId) { run.end = t + STEP; run[verdict] = (run[verdict] || 0) + STEP; }
      else { if (run) listen.push(run); run = { clip: row.name, start: +t.toFixed(1), end: t + STEP, app: aV, human: h.verseId, [verdict]: STEP }; }
    }
    if (run) listen.push(run);
    const T = Object.values(c).reduce((a, b) => a + b, 0);
    console.log(`${row.name.slice(0, 4)} | same line ${(100 * c.agree / T).toFixed(0)}% | different line: app right ${(100 * c.appRight / T).toFixed(0)}%, human right ${(100 * c.humanRight / T).toFixed(0)}%, unclear ${(100 * c.unclear / T).toFixed(0)}% | other Shabad ${(100 * c.otherShabad / T).toFixed(0)}%`);
    for (const key of Object.keys(all)) all[key] += c[key];
  }
  const T = Object.values(all).reduce((a, b) => a + b, 0);
  const p = (x) => `${(100 * x / T).toFixed(1)}%`;
  console.log(`\nALL | same line ${p(all.agree)} | app right ${p(all.appRight)} | human right ${p(all.humanRight)} | unclear ${p(all.unclear)} | other Shabad ${p(all.otherShabad)}`);
  console.log(`line credit with tolerance: exact ${(100 * tol[0] / tolTotal).toFixed(1)}% | +-3 s ${(100 * tol[3] / tolTotal).toFixed(1)}% | +-5 s ${(100 * tol[5] / tolTotal).toFixed(1)}% | +-8 s ${(100 * tol[8] / tolTotal).toFixed(1)}%`);
  console.log(`same line OR app judged right by the singing: ${p(all.agree + all.appRight)}`);
  const top = listen.map((r) => ({ ...r, end: +r.end.toFixed(1), dur: +(r.end - r.start).toFixed(1) })).sort((a, b) => b.dur - a.dur).slice(0, Number(arg('listen', 10)));
  fs.writeFileSync(path.join(appDir, 'arbiter-listen.json'), JSON.stringify(top.map((r) => ({ ...r, appLine: textOf(r.app), humanLine: textOf(r.human) })), null, 1));
  console.log('\nlongest disagreements:'); top.forEach((r) => console.log(`${r.clip.slice(0, 4)} ${r.start}-${r.end}s (${r.dur}s) app ${r.app} vs human ${r.human} | app-right ${r.appRight || 0}s human-right ${r.humanRight || 0}s unclear ${r.unclear || 0}s`));
  realm.close(); process.exit(0);
})().catch((e) => { console.error(e.stack); process.exit(1); });
