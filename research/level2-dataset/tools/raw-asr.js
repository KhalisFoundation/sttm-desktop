// Raw hearing accuracy per model, harness-free: each 4 s window's transcript vs the TRUE Shabad's own text.
// aCER/aWER = edit distance to the best-matching stretch of the true Shabad (semi-global), / hypothesis length.
// right chars = hyp length - edits (>=0), averaged over ALL windows (silence counts as 0) = raw hearing power.
const fs = require('fs'); const path = require('path'); const os = require('os');
const DS = path.join(__dirname, '..');
const { parseCsv } = require('./vf-manifest');
const TR = path.join(DS, 'results/hearing/transcripts');
const SAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, 'hearing-sample.json'), 'utf8')).clips;
const cdir = path.join(os.homedir(), 'personal/live-darbar-venues/cache/corpus');
const cf = fs.readdirSync(cdir).filter((x) => x.endsWith('.json')).map((x) => path.join(cdir, x)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
const corpus = JSON.parse(fs.readFileSync(cf, 'utf8'));
const linesOf = new Map();
corpus.forEach((r) => (r.shabadIds || [r.shabadId]).forEach((s) => { if (!linesOf.has(s)) linesOf.set(s, []); linesOf.get(s).push(r.text); }));
const shabadIds = [...linesOf.keys()];
const normC = (s) => (s || '').replace(/[\s।॥|0-9੦-੯.,;:!?-]+/g, '');
const words = (s) => (s || '').replace(/[।॥|0-9੦-੯.,;:!?-]+/g, ' ').split(/\s+/).filter(Boolean);
function semi(h, r) { // min edits aligning all of h to any substring of r
  const n = h.length; if (!n) return 0; let prev = new Array(n + 1); for (let i = 0; i <= n; i++) prev[i] = i;
  let best = n;
  for (let j = 1; j <= r.length; j++) { const cur = new Array(n + 1); cur[0] = 0;
    for (let i = 1; i <= n; i++) cur[i] = Math.min(prev[i] + 1, cur[i - 1] + 1, prev[i - 1] + (h[i - 1] === r[j - 1] ? 0 : 1));
    if (cur[n] < best) best = cur[n]; prev = cur; }
  return best;
}
const models = fs.readdirSync(TR).filter((d) => fs.existsSync(path.join(TR, d, 'meta.json')));
const agg = {}; // tier -> model -> stats
for (const clip of SAMPLE) {
  const rd = (f) => (fs.existsSync(path.join(clip.truth, f)) ? parseCsv(fs.readFileSync(path.join(clip.truth, f), 'utf8')) : []);
  const sh = rd('shabads.csv').filter((r) => r.start_s !== '' && r.end_s !== '').map((r) => ({ ids: String(r.shabadId).split('|').filter((x) => !/^bani:/.test(x)).map(Number), a: +r.start_s, b: +r.end_s }));
  const refAt = (c) => { const ids = new Set(); sh.forEach((r) => { if (r.a <= c && r.b >= c) r.ids.forEach((x) => ids.add(x)); }); return [...ids]; };
  const tx = {}; for (const m of models) { const f = path.join(TR, m, `${clip.id}.jsonl`); if (fs.existsSync(f)) tx[m] = new Map(fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.t, r.text])); }
  const ms = Object.keys(tx); if (ms.length < models.length) continue; // only clips every model transcribed
  const ts = [...tx[ms[0]].keys()].filter((t) => ms.every((m) => tx[m].has(t)));
  for (const t of ts) {
    const ids = refAt(t - 2); if (!ids.length) continue;
    const refC = ids.map((i) => (linesOf.get(i) || []).map(normC).join('')).join('');
    const refW = ids.flatMap((i) => (linesOf.get(i) || []).flatMap(words));
    if (!refC) continue;
    const ctl = shabadIds[(shabadIds.indexOf(ids[0]) + 997) % shabadIds.length];
    const ctlC = (linesOf.get(ctl) || []).map(normC).join('');
    for (const m of ms) {
      const A = ((agg[clip.tier] ||= {})[m] ||= { win: 0, txt: 0, hc: 0, ec: 0, hw: 0, ew: 0, right: 0, ctlE: 0, ctlH: 0 });
      const h = normC(tx[m].get(t)); const hw = words(tx[m].get(t));
      A.win++; if (!h) continue; A.txt++;
      const e = semi(h, refC); A.hc += h.length; A.ec += e; A.right += Math.max(0, h.length - e);
      const ew = semi(hw, refW); A.hw += hw.length; A.ew += ew;
      if (A.txt % 3 === 0) { A.ctlE += semi(h, ctlC); A.ctlH += h.length; }
    }
  }
  process.stderr.write(`${clip.id} `);
}
const out = [];
for (const [tier, mm] of Object.entries(agg)) for (const [m, A] of Object.entries(mm))
  out.push({ tier, model: m, windows: A.win, textPct: +(100 * A.txt / A.win).toFixed(1), aCER: +(100 * A.ec / A.hc).toFixed(1), aWER: +(100 * A.ew / A.hw).toFixed(1), rightCharsPerWin: +(A.right / A.win).toFixed(2), chanceCER: A.ctlH ? +(100 * A.ctlE / A.ctlH).toFixed(1) : null });
fs.writeFileSync(path.join(DS, 'results/hearing/raw-asr.json'), JSON.stringify(out, null, 1));
console.log('\n' + out.map((r) => Object.values(r).join('\t')).join('\n'));
