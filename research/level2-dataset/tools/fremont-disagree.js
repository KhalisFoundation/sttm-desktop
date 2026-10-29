// Builds yes/no review items where the app's screen line and the sevadaar's screen line differ (Fremont kh01-05).
const fs = require('fs'), path = require('path');
const S = require('./sangat-score');
const OUT = process.argv[2];
const RUN = process.argv[3];
const CL = path.join(require('os').homedir(), 'personal/live-darbar-venues/clips');
const tests = require('../khalis-tests.json').filter((t) => /^kh0[1-5]/.test(t.name));
const realmMod = require('./sangat-score');
// raw Gurmukhi lookup via the scorer's realm (unicode, not normalised)
const Realm = require(path.resolve(__dirname, '../../../node_modules/realm'));
const anvaad = require(path.resolve(__dirname, '../../../node_modules/anvaad-js'));
const APP = path.join(require('os').homedir(), 'Library/Application Support/SikhiToTheMax');
const sch = JSON.parse(fs.readFileSync(path.join(APP, 'realm-schema-evergreen.json'), 'utf8'));
const realm = new Realm({ path: path.join(APP, 'sttmdesktop-evergreen-v2.realm'), schema: sch.schemas, schemaVersion: sch.schemaVersion, readOnly: true });
const txt = (id) => { if (id == null) return ''; const v = realm.objectForPrimaryKey('Verse', Number(id)); return v && v.Gurmukhi ? anvaad.unicode(v.Gurmukhi) : ''; };
const eps = [];
for (const t of tests) {
  const f = fs.readdirSync(RUN).find((x) => x.startsWith(t.name.slice(0, 4)) && x.endsWith('.json'));
  const ev = require(path.join(RUN, f)).events.filter((e) => e.type === 'verse' || e.type === 'shabad').sort((a, b) => a.t - b.t);
  const tl = t.timeline.slice().sort((a, b) => a.t - b.t);
  const at = (arr, tt) => { let v = null; for (const e of arr) { if (e.t <= tt) v = e.verseId; else break; } return v; };
  let cur = null;
  const close = (end) => { if (cur && end - cur.t0 >= 2) eps.push({ ...cur, t1: end, before: cur.before }); cur = null; };
  for (let tt = 0; tt < t.seconds; tt += 0.5) {
    const a = at(ev, tt), h = at(tl, tt);
    const differ = a != null && h != null && a !== h && !S.same(S.norm(txt(a)), S.norm(txt(h)));
    if (differ && (!cur || cur.a !== a || cur.h !== h)) { close(tt); cur = { clip: t.name, wav: t.clip, t0: tt, a, h, before: at(tl, tt - 1) }; }
    else if (!differ) close(tt);
  }
  close(t.seconds);
}
// 30 items spread across clips, longest episodes first within each clip
const byClip = {}; for (const e of eps) (byClip[e.clip] = byClip[e.clip] || []).push(e);
const pick = []; const clips = Object.keys(byClip);
for (const c of clips) byClip[c].sort((x, y) => (y.t1 - y.t0) - (x.t1 - x.t0));
for (let r = 0; pick.length < 30 && r < 40; r++) for (const c of clips) if (byClip[c][r] && pick.length < 30) pick.push(byClip[c][r]);
const { execFileSync } = require('child_process');
const items = pick.map((e, i) => {
  const from = Math.max(0, e.t0 - 8), to = e.t0 + 10;
  const name = `${e.clip.slice(0, 4)}-${Math.round(e.t0 * 10)}.wav`;
  execFileSync('python3', ['-I', '-c', `
import wave,sys
w=wave.open(sys.argv[1]); sr=w.getframerate(); a=float(sys.argv[2]); b=float(sys.argv[3])
w.setpos(int(a*sr)); fr=w.readframes(int((b-a)*sr)); o=wave.open(sys.argv[4],'wb'); o.setnchannels(w.getnchannels()); o.setsampwidth(w.getsampwidth()); o.setframerate(sr); o.writeframes(fr); o.close()`,
    path.join(CL, e.wav), String(from), String(to), path.join(OUT, 'clips', name)]);
  return { id: `fremont-${String(i + 1).padStart(2, '0')}`, set: 'Fremont', recording: e.clip.slice(0, 4), t0: e.t0, t1: e.t1,
    seconds: Math.round(e.t1 - e.t0), marker: e.t0 - from, clip: `clips/${name}`, appLine: txt(e.a), sevadaarLine: txt(e.h), beforeLine: txt(e.before), appVerse: e.a, sevadaarVerse: e.h };
});
fs.writeFileSync(path.join(OUT, 'items.json'), JSON.stringify(items, null, 1));
console.log(eps.length, 'disagreement episodes;', items.length, 'items; seconds covered', Math.round(pick.reduce((s, e) => s + e.t1 - e.t0, 0)), 'of', Math.round(eps.reduce((s, e) => s + e.t1 - e.t0, 0)));
realm.close();
