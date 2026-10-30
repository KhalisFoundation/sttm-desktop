// Minimal SentencePiece unigram ENCODE (text -> ids) in JS.
// Driven by pieces+scores exported from the model; matches sp.encode for the
// known Gurmukhi vocabulary. Only the encode direction (needed for word-level
// CTC alignment); decode uses the id->piece vocab directly.
const MODEL = require('./speech-model').active(); // pieces + scores of the active model

class SP {
  // blank: the model's CTC blank id. It is never a token, so a piece that shares its id (a model
  // with blank 0 = its first piece) is left out and its text is spelt with smaller pieces.
  constructor(pieces, blank = -1) {
    this.id = new Map();      // piece string -> id
    this.score = new Map();   // piece string -> log-prob score
    this.vocab = [];          // id -> piece
    this.unk = 0;
    let minScore = Infinity;
    let maxLen = 1;
    pieces.forEach((e, i) => {
      if (e.p === '<unk>') this.unk = i;
      if (i === blank) return;
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

  static load(pieces = MODEL.pieces) { return new SP(pieces, MODEL.blank); }

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
    return syms.map((s) => (this.id.has(s) ? this.id.get(s) : this.unk));
  }
}

module.exports = { SP };
