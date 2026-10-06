// Minimal SentencePiece unigram ENCODE (text -> ids) in JS.
// Driven by pieces+scores exported from the model; matches sp.encode for the
// known Gurmukhi vocabulary. Only the encode direction (needed for word-level
// CTC alignment); decode uses the id->piece vocab directly.
const PIECES = require('./assets/pieces'); // [{p, s}] pieces + scores

class SP {
  constructor(pieces) {
    this.id = new Map();      // piece string -> id
    this.score = new Map();   // piece string -> log-prob score
    this.vocab = [];          // id -> piece
    let minScore = Infinity;
    let maxLen = 1;
    pieces.forEach((e, i) => {
      this.id.set(e.p, i);
      this.score.set(e.p, e.s);
      this.vocab[i] = e.p;
      if (e.s < minScore) minScore = e.s;
      const len = [...e.p].length;
      if (len > maxLen) maxLen = len;
    });
    this.unkPenalty = minScore - 10.0;  // only chosen when no real piece fits
    this.maxLen = maxLen;
  }

  static load(pieces = PIECES) { return new SP(pieces); }

  encode(text) {
    // add_dummy_prefix + escape spaces as ▁ (U+2581)
    const norm = '▁' + (text || '').replace(/ /g, '▁');
    let syms = [...norm];               // start from single codepoints
    if (syms.length === 0) return [];
    // BPE: repeatedly merge the adjacent pair whose concatenation is a known
    // piece with the highest score (earliest merge). Leftmost wins on ties.
    for (;;) {
      let bestScore = -Infinity, bestI = -1;
      for (let i = 0; i < syms.length - 1; i++) {
        const merged = syms[i] + syms[i + 1];
        const sc = this.score.get(merged);
        if (sc !== undefined && sc > bestScore) { bestScore = sc; bestI = i; }
      }
      if (bestI < 0) break;
      syms.splice(bestI, 2, syms[bestI] + syms[bestI + 1]);
    }
    return syms.map((s) => (this.id.has(s) ? this.id.get(s) : 0));  // 0 = unk
  }
}

module.exports = { SP };
