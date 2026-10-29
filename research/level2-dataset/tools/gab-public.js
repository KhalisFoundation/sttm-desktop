#!/usr/bin/env node
// gab-public: build a PUBLIC-SAFE copy of the private GAB Space (khalisfoundation/GAB-leaderboard).
//
//   node gab-public.js <private-space-dir> <out-dir>
//
// <private-space-dir> = a local snapshot of the private Space (huggingface_hub snapshot_download, repo_type="space").
// Keeps only recordings with a public YouTube source (clip.yt set; this includes Karanbir Singh's public benchmark
// set kbv1). Drops every other recording (hall laptop-mic recordings, tester/app sessions), sets left with no
// recordings, the private leaderboard (results/*: it mixes in private recordings and has no per-recording data to
// recompute from), the labeller, the names file and anything that is not needed. The public index.html is a summary
// computed in the browser from the kept timeline rows only (gab-space-public/index.html) plus the Karanbir Singh
// outside-check block copied from the private index.html. Finishes with a scan for team names, cloud links, tokens and
// local paths; exits 1 if anything is found (nothing to publish then). Never uploads anything.
'use strict';
const fs = require('fs');
const path = require('path');

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: node gab-public.js <private-space-dir> <out-dir>'); process.exit(2); }
const TPL = path.join(__dirname, 'gab-space-public');
const rd = (p) => fs.readFileSync(path.join(src, p), 'utf8');
const wr = (p, s) => { fs.mkdirSync(path.dirname(path.join(out, p)), { recursive: true }); fs.writeFileSync(path.join(out, p), s); };

// public titles per set; an unknown set keeps its own title only if it passes the scan below
const TITLES = {
  main: 'Kirtan (Gurdwara Sahib broadcasts on YouTube)',
  akhand: 'Akhand Kirtan (smagam recordings on YouTube)',
  kbv1: "Karanbir Singh's benchmark v1 (4 kirtan recordings × 3 starts)",
};
const isPublic = (c) => !!(c.yt && c.yt.v) && !/sttm_desktop|session/i.test(c.id);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const idx = JSON.parse(rd('timeline/index.json'));
const stats = { kept: 0, dropped: 0, droppedSets: [], perSet: {} };
const tiers = [];
for (const t of idx.tiers) {
  const builds = [];
  for (const b of t.builds) {
    const d = JSON.parse(rd('timeline/' + b.file));
    const keep = d.clips.filter(isPublic);
    const ps = (stats.perSet[t.key] ||= {}); ps[b.file] = { kept: keep.length, dropped: d.clips.length - keep.length };
    stats.kept += keep.length; stats.dropped += d.clips.length - keep.length;
    if (!keep.length) continue;
    // keep only the texts the kept rows use, renumbered
    const map = new Map(); const texts = [];
    const ref = (i) => { if (i < 0) return i; if (!map.has(i)) { map.set(i, texts.length); texts.push(d.texts[i]); } return map.get(i); };
    const clips = keep.map((c) => ({
      id: c.id, folder: c.folder, gurdwara: c.gurdwara || '', dur: c.dur, basis: c.basis, kb: c.kb,
      yt: { v: c.yt.v, at: c.yt.at }, n: c.n, runs: c.runs.map((r) => [r[0], r[1], r[2], ref(r[3]), ref(r[4])]),
    }));
    wr('timeline/' + b.file, JSON.stringify({ gab: d.gab, label: d.label, commit: d.commit, set: d.set,
      split: 'practice recordings (held-out test set not included)', texts, clips }));
    builds.push({ slug: b.slug, file: b.file, label: b.label, commit: b.commit, note: b.note });
  }
  if (builds.length) tiers.push({ key: t.key, title: TITLES[t.key] || t.title, builds });
  else stats.droppedSets.push(t.key);
}
wr('timeline/index.json', JSON.stringify({ tiers }, null, 1));

// timeline.html unchanged (layout owned by the private Space)
wr('timeline.html', rd('timeline.html'));
// index.html = public summary + the Karanbir Singh outside check from the private page
let kb = (rd('index.html').match(/<details class="ext"[\s\S]*?<\/details>/) || [''])[0];
wr('index.html', fs.readFileSync(path.join(TPL, 'index.html'), 'utf8').replace('<!--KARANBIR-->', kb));
wr('README.md', fs.readFileSync(path.join(TPL, 'README.md'), 'utf8'));
wr('.gitattributes', '*.json text\n');

// ---- scan
const BAD = [/\bArash/i, /\bJashan/i, /Gauravjeet/i, /Harpreet/i, /\bPreet\b/i, /Jaspal/i, /Surinder/i, /\btester/i,
  /azure/i, /blob\.core/i, /sig=/i, /\/Users\//, /\/private\/tmp/, /\bhf_[A-Za-z0-9]{6,}/, /token/i, /sttm_desktop_20/,
  /datasets\/khalisfoundation/i, /GurbaniAutopilotBench/, /laptop mic/i, /\.wav\b|\.mp3\b|\.m4a\b/i];
const hits = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      for (const re of BAD) { const m = line.match(re); if (m) hits.push(`${path.relative(out, p)}:${i + 1}: ${m[0]}  …${line.slice(Math.max(0, m.index - 40), m.index + 40)}…`); }
    });
  }
})(out);
console.log(JSON.stringify(stats, null, 1));
console.log('sets kept:', tiers.map((t) => `${t.key} (${t.builds.length} builds)`).join(', '));
if (hits.length) { console.log('SCAN HITS (do not publish until reviewed):\n' + hits.join('\n')); process.exit(1); }
console.log('scan: clean ->', out);
