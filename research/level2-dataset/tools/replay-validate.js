#!/usr/bin/env node
/* replay-validate.js — does a cached replay reproduce a real run? (acceptance test, REPLAY.md)
 *   node replay-validate.js --suite <l2|paath|aarti|fremont|renton|asa> --ref <dir> --replay <dir> [--label x]
 * <dir>s hold the runner's per-clip JSON files ({events: [...]}). Events are compared exactly as the
 * reference runner saved them (same types, same fields; wall-clock fields dropped), clip by clip:
 *   identical clips, identical events % = 1 - edit distance / (n + m), first divergence;
 * then both dirs are scored with the suite's scorer and the largest metric difference is reported.
 */
const fs = require('fs');
const path = require('path');
const { SUITES } = require('./vf-suites');
const { editDistance } = require('./vf-check');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const suiteName = arg('suite');
const ref = path.resolve(arg('ref'));
const rep = path.resolve(arg('replay'));
const VOLATILE = new Set(['inferenceMs', 'stack', 'wall_s']);
const key = (e) => JSON.stringify(e, (k, v) => (VOLATILE.has(k) ? undefined : typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e6) / 1e6 : v));
const skip = new Set(['results.json', 'score.json', 'renton-score.json', 'rescored.json', 'arbiter-listen.json']);
const files = fs.readdirSync(ref).filter((f) => f.endsWith('.json') && !skip.has(f)).sort();
let nClips = 0;
let same = 0;
let sumNM = 0;
let sumD = 0;
const rows = [];
for (const f of files) {
  const a = JSON.parse(fs.readFileSync(path.join(ref, f)));
  if (!a.events) continue;
  const bf = path.join(rep, f);
  if (!fs.existsSync(bf)) { rows.push(`  ${f}: not in replay`); continue; }
  const b = JSON.parse(fs.readFileSync(bf));
  const types = new Set(a.events.map((e) => e.type));
  const A = a.events.map(key);
  const B = b.events.filter((e) => types.has(e.type) || e.type === 'component-error').map(key);
  const d = editDistance(A, B);
  nClips++;
  sumNM += A.length + B.length;
  sumD += d.d;
  if (!d.d) same++;
  else {
    const at = (arr, i) => (i < arr.length ? JSON.parse(arr[i]) : null);
    const ea = at(A, d.first);
    const eb = at(B, d.first);
    rows.push(`  ${f.replace('.json', '')}: ${d.d}${d.capped ? '+' : ''} of ${A.length}/${B.length} events differ; first at ref ${ea ? `${ea.type}@${(+ea.t).toFixed(2)} ${ea.shabadId ?? ea.verseId ?? ea.text ?? ''}` : 'end'} vs replay ${eb ? `${eb.type}@${(+eb.t).toFixed(2)} ${eb.shabadId ?? eb.verseId ?? eb.text ?? ''}` : 'end'}`);
  }
}
const suite = SUITES[suiteName];
let mA = {};
let mB = {};
const tmp = (dir) => {
  // score a copy so the scorer's own output files never touch the reference
  const t = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vfval-'));
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.json') && !skip.has(f)) fs.copyFileSync(path.join(dir, f), path.join(t, f));
  return t;
};
try { mA = suite.score(tmp(ref)); } catch (e) { console.error(`scorer failed on ref: ${e.message.split('\n')[0]}`); }
try { mB = suite.score(tmp(rep)); } catch (e) { console.error(`scorer failed on replay: ${e.message.split('\n')[0]}`); }
let maxDiff = 0;
let maxName = '-';
const diffs = [];
for (const k of new Set([...Object.keys(mA), ...Object.keys(mB)])) {
  const x = mA[k];
  const y = mB[k];
  if (x == null || y == null) { if (x !== y) diffs.push(`${k}: ${x} vs ${y}`); continue; }
  const d = Math.abs(x - y);
  if (d > 1e-9) diffs.push(`${k}: ${x} -> ${y}`);
  if (d > maxDiff) { maxDiff = d; maxName = k; }
}
const label = arg('label', suiteName);
console.log(`| ${label} | ${nClips} | ${same}/${nClips} | ${sumNM ? (100 * (1 - sumD / sumNM)).toFixed(2) : '-'}% | ${maxDiff ? `${+maxDiff.toFixed(3)} (${maxName})` : '0'} |`);
for (const r of rows) console.log(r);
for (const d of diffs) console.log(`  metric ${d}`);
