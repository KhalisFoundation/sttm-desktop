// kbv1-eval.js <gab run --keep dir> <outDir>   then: python3 -I <his repo>/eval.py --pred <outDir> --gt <his repo>/test --collar 1
// Karanbir v1 set: python3 kbv1-prep.py; vf-check --record --roots <builds> --suites kbv1 (VF_EMIS_CODEC=q16, Mac);
//   gab run <build> --manifest ../kbv1-bench --keep (VF_EMIS_CODEC=q16)
// : our replay screen events -> Karanbir benchmark submission JSON
// (one file per case, times in the original recording's seconds, line_idx of his GT; other pangti -> 999)
const fs = require('fs'); const path = require('path');
const T = __dirname;
const sv = require(path.join(T, 'sangat-score'));
const GT = path.join(process.env.HOME, 'AAI/models/benchmark/live-gurbani-captioning-benchmark-v1-main/test');
const [run, out] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(GT).filter((x) => x.endsWith('.json'))) {
  const case_ = f.slice(0, -5); const gt = JSON.parse(fs.readFileSync(path.join(GT, f), 'utf8'));
  const cid = `kbv1_${case_.replace('_cold', '_c')}`;
  let ev = path.join(run, 'replay/base/kbv1/trace', `${cid}.events.jsonl`);
  if (!fs.existsSync(ev)) ev = path.join(run, 'replay/base/kbv1', `${cid}.json`);
  if (!fs.existsSync(ev)) { console.log('missing', cid); continue; }
  const off = Number(gt.uem.start);
  const states = sv.screenStates(sv.loadEvents(ev).events);
  const segs = [];
  states.forEach((st, i) => {
    if (i === 0) return;
    const end = i + 1 < states.length ? states[i + 1].t : gt.total_duration - off;
    if (st.seeking || (st.verse == null && st.shabad == null)) return;
    // submit what the screen showed, by canonical ids (his eval.py resolves verse_id; a pangti of another Shabad = no match)
    segs.push({ start: +(st.t + off).toFixed(2), end: +(end + off).toFixed(2), ...(st.verse != null ? { verse_id: st.verse } : {}), ...(st.shabad != null ? { shabad_id: Number(st.shabad) || st.shabad } : {}) });
  });
  fs.writeFileSync(path.join(out, f), JSON.stringify({ video_id: gt.video_id, segments: segs }));
}
sv.close();
