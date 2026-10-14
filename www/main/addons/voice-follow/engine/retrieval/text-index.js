// Weighted character-gram retrieval. Normalized strings are internal search keys only;
// results contain canonical IDs/scores, never generated display text.
// Keep this normalization identical to infer.norm without loading native ONNX.
const norm = (s) => (s || '').replace(/[\s।॥|0-9੦-੯.,;:!?-]+/g, '');

const baseLetters = (s) =>
  norm(s)
    .normalize('NFC')
    .replace(/[\u0a3c-\u0a4d\u0a51\u0a70\u0a71\u0a75]/g, '');
const grams = (s, n) => {
  const out = new Set();
  for (let i = 0; i + n <= s.length; i += 1) out.add(s.slice(i, i + n));
  return out;
};
class TextIndex {
  constructor(rows) {
    this.rows = rows;
    this.indexes = [this.build(norm, 3), this.build(baseLetters, 3)];
  }

  build(normalize, n) {
    const postings = new Map();
    this.rows.forEach((row, i) => {
      grams(normalize(row.text), n).forEach((gram) => {
        if (!postings.has(gram)) postings.set(gram, []);
        postings.get(gram).push(i);
      });
    });
    return { postings, normalize, n };
  }

  search(text, cap = 60) {
    const merged = new Map();
    this.indexes.forEach(({ postings, normalize, n }) => {
      const query = grams(normalize(text), n);
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
