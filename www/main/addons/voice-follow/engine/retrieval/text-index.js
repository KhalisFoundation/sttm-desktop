// Weighted character-gram retrieval. Results contain canonical IDs/scores, never generated
// display text. Each pangti is kept exactly as the database gives it: its letter grams are read
// in place through a Compared view that skips spaces, dandas, numbers and punctuation (and, for
// the letters-only index, vowel signs) while reading; no altered copy of the pangti is made.
// Plain module (no native ONNX), so the retrieval worker can load it.
const { Compared } = require('../compared');

// Letters-only index: vowel signs and other marks are skipped, and a letter written with a nukta
// (ਸ਼ ਖ਼ ਗ਼ ਜ਼ ਫ਼ ਲ਼) is read as its letter.
const isMark = (cp) =>
  (cp >= 0x0a3c && cp <= 0x0a4d) ||
  cp === 0x0a51 ||
  cp === 0x0a70 ||
  cp === 0x0a71 ||
  cp === 0x0a75;
const NUKTA_LETTER = new Map(
  [0x0a33, 0x0a36, 0x0a59, 0x0a5a, 0x0a5b, 0x0a5e].map((cp) => [
    cp,
    String.fromCodePoint(cp).normalize('NFD').codePointAt(0),
  ]),
);
const LETTERS = { skip: isMark, fold: (cp) => NUKTA_LETTER.get(cp) || cp };
const asIs = (s) => new Compared(s);
const lettersOnly = (s) => new Compared(s, LETTERS);
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
class TextIndex {
  constructor(rows) {
    this.rows = rows;
    this.indexes = [this.build(asIs, 3), this.build(lettersOnly, 3)];
  }

  build(view, n) {
    const postings = new Map();
    this.rows.forEach((row, i) => {
      grams(view(row.text), n).forEach((gram) => {
        if (!postings.has(gram)) postings.set(gram, []);
        postings.get(gram).push(i);
      });
    });
    return { postings, view, n };
  }

  search(text, cap = 60) {
    const merged = new Map();
    this.indexes.forEach(({ postings, view, n }) => {
      const query = grams(view(text), n);
      if (query.size < 2) return;
      const scores = new Map();
      let weight = 0;
      query.forEach((gram) => {
        const ids = postings.get(gram) || [];
        const idf = Math.log(1 + this.rows.length / (1 + ids.length));
        weight += idf;
        ids.forEach((id) => scores.set(id, (scores.get(id) || 0) + idf));
      });
      scores.forEach((score, i) => {
        const row = this.rows[i];
        const normalized = score / weight;
        if (normalized > (merged.get(row.shabadId)?.score || 0))
          merged.set(row.shabadId, {
            shabadId: row.shabadId,
            verseId: row.verseId,
            score: normalized,
          });
      });
    });
    return [...merged.values()]
      .sort((a, b) => b.score - a.score || a.shabadId - b.shabadId)
      .slice(0, cap);
  }
}

module.exports = { TextIndex };
