#!/usr/bin/env node
// Score per-Bani paath clips: node tools/paath-score.js <results dir> [truth.json]
// Whole clip audio (lead-in + truth + tail) is the same paath, so the whole clip is scored.
// Per clip, share of time the screen shows:
//   BANI  the right Bani (Anand 6/40 and both Savaiye count as right),
//   SUB   another Bani that sits inside it (Chaupai/Anand opened during Rehras),
//   SHAB  a single shabad that belongs to the right Bani at ANY length,
//   WRONG anything else, NONE nothing yet.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const Realm = require(path.join(ROOT, 'node_modules/realm'));

const dir = process.argv[2];
const truth = JSON.parse(fs.readFileSync(path.join(__dirname, '..', process.argv[3] || 'paath-tests.json')));
const APP = path.join(process.env.HOME, 'Library/Application Support/SikhiToTheMax');
const sch = JSON.parse(fs.readFileSync(path.join(APP, 'realm-schema-evergreen.json')));
const realm = new Realm({ path: path.join(APP, 'sttmdesktop-evergreen-v2.realm'), schema: sch.schemas, schemaVersion: sch.schemaVersion, readOnly: true });
const members = new Map(); // bani -> Set(shabad) at any length
realm.objects('Banis_Shabad').forEach((x) => {
  const b = x.Bani && x.Bani.ID;
  const s = x.Shabad && x.Shabad.ShabadID;
  if (b == null || s == null) return;
  if (!members.has(b)) members.set(b, new Set());
  members.get(b).add(s);
});
const anvaad = require(path.join(ROOT, 'node_modules/anvaad-js'));
const { sameGurbani } = require(path.join(ROOT, 'www/main/addons/voice-follow/components/switchPolicy.js'));
// Lines per shabad from the Bani rows (fast), and for any other shown shabad on demand.
const rowLines = new Map();
realm.objects('Banis_Shabad').forEach((x) => {
  const s = x.Shabad && x.Shabad.ShabadID;
  if (s == null || !x.Verse) return;
  const l = rowLines.get(s) || new Set();
  l.add(anvaad.unicode(x.Verse.Gurmukhi));
  rowLines.set(s, l);
});
const linesOf = (sid) => {
  if (!rowLines.has(sid)) {
    rowLines.set(sid, new Set(realm.objects('Verse').filtered('ANY Shabads.ShabadID == $0', sid).map((v) => anvaad.unicode(v.Gurmukhi))));
  }
  return [...rowLines.get(sid)];
};
const copyCache = new Map();
// COPY: a shown shabad that is the same Gurbani text as a shabad of the right Bani.
const isCopyOf = (sid, members) => {
  if (!copyCache.has(sid)) {
    const mine = linesOf(sid);
    copyCache.set(sid, [...members].some((m) => m !== sid && sameGurbani(mine, linesOf(m))));
  }
  return copyCache.get(sid);
};
const SAME = { 10: [10, 1000], 1000: [10, 1000], 6: [6, 7], 7: [6, 7] };
const SUB = { 21: [9, 1000, 10] };

const out = [];
const tot = {};
for (let k = 0; k < truth.length; k++) {
  const name = `pt${String(k + 1).padStart(2, '0')}`;
  const f = path.join(dir, `${name}.json`);
  if (!fs.existsSync(f)) continue;
  const row = truth[k];
  const b = row.bani_id;
  const ok = SAME[b] || [b];
  const sub = SUB[b] || [];
  const inBani = new Set(ok.flatMap((x) => [...(members.get(x) || [])]));
  const j = JSON.parse(fs.readFileSync(f));
  const lead = Math.min(30, row.start_s);
  const WARM = Number(process.env.WARM || 0); // seconds of cold start not scored
  const t0 = -lead + WARM;
  const t1 = row.end_s - row.start_s + 10;
  const ev = j.events.filter((e) => e.type === 'shabad').sort((a, c) => a.t - c.t);
  const acc = { BANI: 0, SUB: 0, SHAB: 0, COPY: 0, WRONG: 0, NONE: 0 };
  let cur = null;
  let at = t0;
  const tStart = -lead;
  let baniAt = null;
  const shown = [];
  const cls = (id) => {
    if (id == null) return 'NONE';
    if (typeof id === 'string' && id.startsWith('bani:')) {
      const x = Number(id.slice(5));
      if (ok.includes(x)) return 'BANI';
      if (sub.includes(x)) return 'SUB';
      return 'WRONG';
    }
    if (inBani.has(id)) return 'SHAB';
    return isCopyOf(id, inBani) ? 'COPY' : 'WRONG';
  };
  for (const e of ev) {
    const t = Math.max(t0, Math.min(t1, e.t));
    acc[cls(cur)] += t - at;
    at = t;
    cur = e.shabadId;
    if (shown[shown.length - 1] !== cur) shown.push(cur);
    if (baniAt == null && cls(cur) === 'BANI') baniAt = Math.round(e.t - tStart);
  }
  acc[cls(cur)] += t1 - at;
  const len = t1 - t0;
  const pct = Object.fromEntries(Object.entries(acc).map(([key, v]) => [key, Math.round((100 * v) / len)]));
  Object.entries(acc).forEach(([key, v]) => { tot[key] = (tot[key] || 0) + v; });
  tot.len = (tot.len || 0) + len;
  pct.TEXT = pct.BANI + pct.SUB + pct.SHAB + pct.COPY;
  out.push({ clip: name, bani: row.line, at: row.start_s, ...pct, baniAt, shown: shown.join(' > ') });
}
for (const r of out) {
  console.log(`${r.clip} ${r.bani.padEnd(19)} @${String(r.at).padStart(4)}s  RIGHT-TEXT ${String(r.TEXT).padStart(3)}%  bani ${String(r.BANI).padStart(3)}%  sub ${String(r.SUB).padStart(3)}%  shabad ${String(r.SHAB).padStart(3)}%  WRONG ${String(r.WRONG).padStart(3)}%  none ${String(r.NONE).padStart(3)}%  bani-open@${r.baniAt ?? '-'}s | ${r.shown}`);
}
const P = (key) => Math.round((1000 * tot[key]) / tot.len) / 10;
console.log(`\nALL ${out.length} clips: bani ${P('BANI')}% | sub ${P('SUB')}% | shabad ${P('SHAB')}% | WRONG ${P('WRONG')}% | none ${P('NONE')}%`);
const per = {};
out.forEach((r) => { (per[r.bani] = per[r.bani] || []).push(r); });
Object.entries(per).forEach(([bn, rs]) => {
  const m = (key) => Math.round(rs.reduce((s, r) => s + r[key], 0) / rs.length);
  console.log(`  ${bn.padEnd(19)} RIGHT-TEXT ${m('TEXT')}%  bani ${m('BANI')}%  shabad ${m('SHAB')}%  WRONG ${m('WRONG')}%  none ${m('NONE')}%`);
});
