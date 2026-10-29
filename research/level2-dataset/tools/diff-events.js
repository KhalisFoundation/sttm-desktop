#!/usr/bin/env node
// diff-events.js <base dir> <cand dir> — per clip, compare the shown sequence (shabad + seeking events, 0.1 s)
// and list every clip that differs, with both sequences. Exit summary: identical / differ / missing.
const fs = require('fs');
const path = require('path');
const [A, B] = process.argv.slice(2);
const seq = (f) => JSON.parse(fs.readFileSync(f)).events.filter((e) => e.type === 'shabad' || e.type === 'seeking')
  .map((e) => (e.type === 'shabad' ? `${e.shabadId}@${e.t.toFixed(1)}` : `${e.visible ? 'S+' : 'S-'}@${e.t.toFixed(1)}`));
let same = 0, diff = 0, missing = 0;
for (const f of fs.readdirSync(B).filter((x) => /^[a-z]+\d\d(_.*)?\.json$/.test(x)).sort()) {
  const a = path.join(A, f);
  if (!fs.existsSync(a)) { missing++; console.log(`${f}: no base`); continue; }
  const sa = seq(a), sb = seq(path.join(B, f));
  if (JSON.stringify(sa) === JSON.stringify(sb)) { same++; continue; }
  diff++;
  console.log(`${f.replace('.json', '')}\n   base ${sa.slice(0, 10).join(' ')}\n   9.0  ${sb.slice(0, 10).join(' ')}`);
}
console.log(`identical ${same} | differ ${diff} | no base ${missing}`);
