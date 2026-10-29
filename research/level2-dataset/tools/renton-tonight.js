#!/usr/bin/env node
/* renton-tonight.js <out dir> — tonight's REAL screen (human.jsonl = what the projector showed, VF moves
 * and sevadaar taps alike) cut into the rt11_* parts in renton-bench.js format, so renton-score.js
 * scores what the sangat saw with the same rules as the replays.
 */
const fs = require('fs');
const path = require('path');
const V = process.env.VF || '/private/tmp/claude-501/-Users-asingh02-personal-sttm-desktop/7dc20a33-cab3-495f-b630-6acf57f0287c/scratchpad/vf-fix';
const S1 = '2026-10-12T00-36-21-730Z', S2 = '2026-10-12T01-18-07-299Z';
const PARTS = { rt11_rehras: [S1, 0, 1716], rt11_aarti: [S1, 1760, 2486.8], rt11_kirtan1: [S2, 0, 505], rt11_fareed1: [S2, 510, 980],
  rt11_fareed2: [S2, 1010, 1445], rt11_hukamnama: [S2, 3900, 4142], rt11_sohila: [S2, 4215, 4540] };
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
for (const [part, [ses, a, b]] of Object.entries(PARTS)) {
  const rows = fs.readFileSync(path.join(V, 'data', ses, 'human.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse).sort((x, y) => x.t - y.t);
  const events = [];
  let prev = null;
  for (const r of rows) {
    if (r.t > b) break;
    if (r.t < a) { prev = r; continue; }
    if (prev) { push(prev, 0); prev = null; }
    push(r, r.t - a);
  }
  if (prev) push(prev, 0);
  function push(r, t) {
    const sid = r.bani != null ? `bani:${r.bani}` : r.shabadId;
    const last = [...events].reverse().find((e) => e.type === 'shabad');
    if (!last || last.shabadId !== sid) events.push({ t, type: 'shabad', shabadId: sid });
    if (r.verseId !== '' && r.verseId != null) events.push({ t, type: 'verse', verseId: r.verseId });
  }
  fs.writeFileSync(path.join(out, `${part}.json`), JSON.stringify({ part, dur: b - a, events }));
}
