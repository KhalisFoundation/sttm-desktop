// Scoring helper for Bani follow. When the app shows 'bani:<id>', what is on the
// projector is the Bani at the line last set by setActiveVerseId, so it is right
// exactly when that line belongs to a correct shabad (or the truth is the Bani).
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
let verseShabads = null;
function load() {
  if (verseShabads) return verseShabads;
  verseShabads = new Map();
  try {
    const Realm = require(path.join(ROOT, 'node_modules/realm'));
    // On the AWS box HOME is /home/ubuntu; the benchmark scripts export VF_BANIDB_USER_DATA.
    const APP = process.env.VF_BANIDB_USER_DATA || path.join(process.env.HOME, 'Library/Application Support/SikhiToTheMax');
    const sch = JSON.parse(fs.readFileSync(path.join(APP, 'realm-schema-evergreen.json')));
    const realm = new Realm({ path: path.join(APP, 'sttmdesktop-evergreen-v2.realm'), schema: sch.schemas, schemaVersion: sch.schemaVersion, readOnly: true });
    realm.objects('Banis_Shabad').forEach((r) => {
      const v = r.Verse && r.Verse.ID;
      const s = r.Shabad && r.Shabad.ShabadID;
      if (v == null || s == null) return;
      const l = verseShabads.get(v) || [];
      if (!l.includes(s)) l.push(s);
      verseShabads.set(v, l);
    });
    realm.close();
  } catch (e) {
    process.stderr.write(`bani-aware: ${e.message}\n`);
  }
  return verseShabads;
}
// COPIES=1: a shabad that is the same Gurbani text as a correct one (sameGurbani, the
// app's own check: Kabir's salok stored as 4997 and 2129) shows the same words, so it
// counts as right too. Off by default so raw numbers stay comparable.
const COPIES = !!process.env.COPIES;
let shabadLines = null;
const sameCache = new Map();
function linesOf(sid) {
  if (!shabadLines) {
    shabadLines = new Map();
    const Realm = require(path.join(ROOT, 'node_modules/realm'));
    const anvaad = require(path.join(ROOT, 'node_modules/anvaad-js'));
    const APP = process.env.VF_BANIDB_USER_DATA || path.join(process.env.HOME, 'Library/Application Support/SikhiToTheMax');
    const sch = JSON.parse(fs.readFileSync(path.join(APP, 'realm-schema-evergreen.json')));
    const realm = new Realm({ path: path.join(APP, 'sttmdesktop-evergreen-v2.realm'), schema: sch.schemas, schemaVersion: sch.schemaVersion, readOnly: true });
    shabadLines.realm = realm;
    shabadLines.anvaad = anvaad;
  }
  if (!shabadLines.has(sid)) {
    const vs = shabadLines.realm.objects('Verse').filtered('ANY Shabads.ShabadID == $0', sid);
    shabadLines.set(sid, vs.map((v) => shabadLines.anvaad.unicode(v.Gurmukhi)));
  }
  return shabadLines.get(sid);
}
function sameText(a, b) {
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  if (!sameCache.has(key)) {
    const { sameGurbani } = require(path.resolve(ROOT, 'www/main/addons/voice-follow/components/switchPolicy.js'));
    sameCache.set(key, sameGurbani(linesOf(a), linesOf(b)));
  }
  return sameCache.get(key);
}
const copyOfOk = (sid, ok) =>
  COPIES && typeof sid === 'number' && [...ok].some((o) => typeof o === 'number' && o !== sid && sameText(sid, o));
// isRight(shown, ok, lastVerse): ok is the Set of correct ids (numbers and/or 'bani:<id>').
function isRight(shown, ok, lastVerse) {
  if (ok.has(shown)) return true;
  if (typeof shown === 'number') return copyOfOk(shown, ok);
  if (typeof shown !== 'string' || !shown.startsWith('bani:')) return false;
  if (lastVerse == null) return false;
  return (load().get(lastVerse) || []).some((s) => ok.has(s) || copyOfOk(s, ok));
}
module.exports = { isRight };
