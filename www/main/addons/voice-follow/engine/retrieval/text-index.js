// Weighted character-gram retrieval. Results contain canonical IDs/scores, never generated
// display text. Each pangti is kept exactly as the database gives it and read in place through a
// Compared view that skips only spaces, dandas, numbers and punctuation while reading; no altered
// copy of the pangti is made and no lagan matra or letter of Gurbani is skipped or exchanged.
// Plain module (no native ONNX), so the retrieval worker can load it.
//
// Two indexes:
//  1. as written: runs of three compared characters, every lagan matra included.
//  2. heard-lenient: the speech model often leaves out lagan matras it did not hear clearly. Here
//     a pangti is read as units (a letter with the marks written on it: its lagan matras, tippi,
//     bindi, addak, nukta, halant) and every mark of the pangti stays part of the comparison. A
//     heard unit matches a pangti unit when the letters are the same and every mark the model
//     heard is written there too; a mark the pangti has and the heard text lacks is allowed (the
//     model did not hear it). The leniency is only for what was heard: a heard mark the pangti
//     does not have is a mismatch, and the pangti is never read without its marks.
const { Compared } = require('../compared');

const asIs = (s) => new Compared(s);
// The distinct runs of n compared characters (search keys, not text), read with a sliding
// window of n characters.
const grams = (v, n) => {
  const out = new Set();
  if (v.length < n) return out;
  const win = [];
  for (let k = 0; k < n - 1; k += 1) win.push(v.code(k));
  for (let i = n - 1; i < v.length; i += 1) {
    win.push(v.code(i));
    out.add(
      n === 3 && win[0] < 0x10000 && win[1] < 0x10000 && win[2] < 0x10000
        ? String.fromCharCode(win[0], win[1], win[2])
        : String.fromCodePoint(...win),
    );
    win.shift();
  }
  return out;
};

// ---- units: a letter and the marks written on it -------------------------------------------
// Marks: U+0A01-0A03 (adhak bindi, bindi, visarga), U+0A3C-0A4D (nukta, lagan matras, halant),
// U+0A51, U+0A70 (tippi), U+0A71 (addak), U+0A75. Each has its own bit.
const MARK_BIT = new Map();
[
  0x0a01,
  0x0a02,
  0x0a03,
  ...Array.from({ length: 0x0a4d - 0x0a3c + 1 }, (_, k) => 0x0a3c + k),
  0x0a51,
  0x0a70,
  0x0a71,
  0x0a75,
].forEach((cp, k) => MARK_BIT.set(cp, 2 ** k));
const NUKTA = 0x0a3c;
// BaniDB writes ਲ਼ ਸ਼ ਖ਼ ਗ਼ ਜ਼ ਫ਼ as one character: compared as its letter with a nukta written on it
// (its canonical decomposition, per code point; the text is not changed).
const NUKTA_LETTER = new Map(
  [0x0a33, 0x0a36, 0x0a59, 0x0a5a, 0x0a5b, 0x0a5e].map((cp) => [
    cp,
    String.fromCodePoint(cp).normalize('NFD').codePointAt(0),
  ]),
);
// Units of a text: parallel arrays of letters and mark sets.
function units(text) {
  const v = new Compared(text);
  const l = [];
  const m = [];
  for (let k = 0; k < v.length; k += 1) {
    const cp = v.code(k);
    const bit = MARK_BIT.get(cp);
    if (bit) {
      if (m.length) m[m.length - 1] |= bit; // eslint-disable-line no-bitwise
    } else if (NUKTA_LETTER.has(cp)) {
      l.push(NUKTA_LETTER.get(cp));
      m.push(MARK_BIT.get(NUKTA));
    } else {
      l.push(cp);
      m.push(0);
    }
  }
  return { l, m };
}
// Every mark the model heard is written on the pangti unit (heard ⊆ pangti).
// eslint-disable-next-line no-bitwise
const heardMarksWritten = (heard, pangti) => (heard & ~pangti) === 0;
const unitKey = (l, i) => String.fromCodePoint(l[i], l[i + 1], l[i + 2]);

class TextIndex {
  constructor(rows) {
    this.rows = rows;
    this.exact = this.build(rows);
    this.lenient = this.buildUnits(rows);
  }

  build(rows) {
    const postings = new Map();
    rows.forEach((row, i) => {
      grams(asIs(row.text), 3).forEach((gram) => {
        if (!postings.has(gram)) postings.set(gram, []);
        postings.get(gram).push(i);
      });
    });
    return postings;
  }

  // Postings by the three letters of a run of three units, each with the marks written on those
  // units: [row, marks0, marks1, marks2, ...] flat.
  buildUnits(rows) {
    const postings = new Map();
    rows.forEach((row, i) => {
      const { l, m } = units(row.text);
      const seen = new Set();
      for (let k = 0; k + 3 <= l.length; k += 1) {
        const key = unitKey(l, k);
        const sig = `${key}|${m[k]}|${m[k + 1]}|${m[k + 2]}`;
        if (seen.has(sig)) continue; // eslint-disable-line no-continue
        seen.add(sig);
        if (!postings.has(key)) postings.set(key, { flat: [], rows: new Set() });
        const p = postings.get(key);
        p.flat.push(i, m[k], m[k + 1], m[k + 2]);
        p.rows.add(i);
      }
    });
    return postings;
  }

  searchExact(text, merged) {
    const query = grams(asIs(text), 3);
    if (query.size < 2) return;
    const scores = new Map();
    let weight = 0;
    query.forEach((gram) => {
      const ids = this.exact.get(gram) || [];
      const idf = Math.log(1 + this.rows.length / (1 + ids.length));
      weight += idf;
      ids.forEach((id) => scores.set(id, (scores.get(id) || 0) + idf));
    });
    this.mergeScores(scores, weight, merged);
  }

  searchLenient(text, merged) {
    const { l, m } = units(text);
    const query = new Map(); // key + heard marks -> [key, marks]
    for (let k = 0; k + 3 <= l.length; k += 1) {
      const key = unitKey(l, k);
      query.set(`${key}|${m[k]}|${m[k + 1]}|${m[k + 2]}`, [key, m[k], m[k + 1], m[k + 2]]);
    }
    if (query.size < 2) return;
    const scores = new Map();
    let weight = 0;
    query.forEach(([key, h0, h1, h2]) => {
      const p = this.lenient.get(key);
      const idf = Math.log(1 + this.rows.length / (1 + (p ? p.rows.size : 0)));
      weight += idf;
      if (!p) return;
      const hit = new Set();
      for (let j = 0; j < p.flat.length; j += 4) {
        if (
          heardMarksWritten(h0, p.flat[j + 1]) &&
          heardMarksWritten(h1, p.flat[j + 2]) &&
          heardMarksWritten(h2, p.flat[j + 3])
        )
          hit.add(p.flat[j]);
      }
      hit.forEach((id) => scores.set(id, (scores.get(id) || 0) + idf));
    });
    this.mergeScores(scores, weight, merged);
  }

  mergeScores(scores, weight, merged) {
    scores.forEach((score, i) => {
      const row = this.rows[i];
      const compared = score / weight;
      if (compared > (merged.get(row.shabadId)?.score || 0))
        merged.set(row.shabadId, { shabadId: row.shabadId, verseId: row.verseId, score: compared });
    });
  }

  search(text, cap = 60) {
    const merged = new Map();
    this.searchExact(text, merged);
    this.searchLenient(text, merged);
    return [...merged.values()]
      .sort((a, b) => b.score - a.score || a.shabadId - b.shabadId)
      .slice(0, cap);
  }
}

module.exports = { TextIndex };
