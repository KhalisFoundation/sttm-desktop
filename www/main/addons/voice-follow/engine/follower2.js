// Follower v2 (Bani / paath): tracks WHERE in the text the reciter is, not which whole
// line the last few seconds sound most like. Benchmark, truth and tuning:
// research/follower-bench (55 recitation clips of 7 Banis, line-level truth).
//
// The Bani is one stream of letters with line boundaries. Each window's transcript is
// aligned (local alignment, letter level) against that stream, and the place where the
// END of the transcript lands is the reciter's current position. So a new line shows as
// soon as its first syllables are heard, and a short line can't be swallowed by its
// neighbours in the window.
//
// Continuity: the search first looks just around the current position (a little back,
// several lines ahead), with the next stretch of text favoured; moving forward there
// needs no confirmation. A jump elsewhere must beat the local match clearly and hold
// for several windows. Same streaming contract as the v1 Follower: push(pcm) returns
// { verseIndex, verseId, lineIndex, wordIndex, confidence } or null.
/* eslint-disable max-classes-per-file */ // the follower and the compared stream it reads
const { resampleTo16k, SR } = require('./infer');
const pace = require('./pace');
const { spokenPair, EK_OANKAR, EK_OANKAR_SAID } = require('./spoken');
const { compared, isIgnored, hashCompared, sameCompared } = require('./compared');

// Tuned on research/follower-bench at a 0.125 s listening step; ships at 0.25 s, the same
// model cost as the line follower (a gurdwara PC that already decodes slower than real
// time cannot afford twice the passes). At 0.25 s: Renton Rehras median lag 0.39 s vs
// 0.29 s at 0.125 s, 55 recited clips within one line 97.4% vs 97.9%. Dwell counts are
// in windows; on a slower device windows are merged, so they simply cover more time.
const DEFAULTS = {
  windowS: 4.0,
  hopS: 0.25,
  minHyp: 4, // letters heard before anything is decided
  back: 4, // lines before the current one searched locally
  ahead: 6, // lines after the current one searched locally
  minScore: 0.35, // alignment score per heard letter (max 1) to trust a position
  enterLetters: 2, // letters of a new line that must be heard before showing it
  enterGain: 3, // ...and they must improve the match by this much (2 per matched letter)
  skipDwell: 1, // windows a move past the next line must persist
  skipGain: 6, // ...and how much better it must match than staying within the next line
  backDwell: 4, // windows a backward move (repeat) must persist
  backDwell1: 0, // ...a step back of exactly one line (0 = same as backDwell)
  jumpDwell: 4, // windows a far jump must persist
  jumpMargin: 0.15, // a far jump must beat the local match by this (per letter)
  jumpScore: 0.35, // ...and match at least this well
  lockDwell: 3, // windows the first position must persist
  lockScore: 0.6, // ...and how well it must match (a wrong first line is worse than a moment of nothing)
  // Next-line prior: within the local search, each line further than the next one
  // ahead (or any line behind) costs this much per heard letter, so of two equally
  // good matches the nearer one ahead wins.
  distCost: 0.03,
  tieSlack: 0.05, // matches this close (per heard letter) to the best count as equal
  // The whole-Bani search (for jumps) is the costly part on long Banis; while the local
  // match is good it runs only every globalEvery windows.
  globalEvery: 1,
  // Is it really THIS Bani? Positions are trusted only when this Bani matches what was
  // heard clearly better than other Gurbani does (opts.background: text of other
  // Banis). Common words make some stretch of any long Bani match any Gurbani a bit.
  lockMargin: 0.15, // locking on / jumping: this Bani vs other Gurbani, per heard letter
  moveMargin: 0, // moving to another line
  releaseHops: 40, // windows in a row where other Gurbani fits better: stop showing a line
  releaseMargin: 0.2, // ...by at least this much (per heard letter)
  // ...or simply nothing here matches what is heard for this many windows in a row
  // (someone reading a Bani that is not in the comparison set; talk; katha). 0 = off.
  noMatchHops: 24, // windows with words heard (3 s of speech at the 0.125 s step)
  // Catch-up: in paath the reader almost always just moves on. If the local match keeps
  // landing on a line further ahead (even without a clear gain over the next line), go
  // there after this many windows in a row (1 s at the 0.25 s step), so lag can never
  // compound. 0 = off.
  catchHops: 4,
  catchScore: 0.5, // ...each of those windows matching at least this well (per letter)
  // Akhand Paath only (opts.akhand): entering the next pangti once the current one's end was
  // heard (within akhEndSlack letters of it).
  akhEnterLetters: 1,
  akhEnterGain: 3,
  akhEndSlack: 2,
  // A pangti mark (tippi, bindi, addak, nukta, halant) the heard unit lacks, per mark, in
  // alignment points (a matched unit is worth 2): missing / a different mark in its place.
  markMiss: 0.1,
  markWrong: 0.25,
};
// Sung Banis (kirtan-style, not read): Asa di Vaar (BaniDB Bani 90). Ragis repeat a pauri
// or a chhant stanza from its top (a jump 4-6 lines back, which the recited profile treats
// as a far jump needing a clear margin and a long dwell), dwell on a line, and sing the
// chhant refrain over and over. Measured on Khalsa School Newton (Oct 11, 2026) and a
// YouTube Asa di Vaar (research: scratchpad asa/sweep*.txt): the local window reaches back
// to the pauri's start, a move back of 2+ lines (a repeat) confirms in 2 windows while a
// one-line step back keeps the recited 4 (it is a flicker, not a repeat), the next-line prior is
// weaker, a 2-line skip needs less gain, and a pause (alaap, a held note) must last 12 s,
// not 6, before the line is let go. Recited Banis keep DEFAULTS untouched.
// Keyed by opts.baniId, so the engine and the headless bench build the same follower.
const SUNG_BANIS = {
  90: { back: 8, backDwell: 2, backDwell1: 4, distCost: 0.01, skipGain: 3, noMatchHops: 48 },
};

const MATCH = 2;
const MISMATCH = -1;
const GAP = -1;

// How a pangti is compared with what is heard. The pangti is read in place, every character as
// the database gives it; spaces, dandas and numbers are skipped while comparing (compared.js).
// Each compared unit is a letter or vowel sign together with the marks written on it (tippi,
// bindi, addak, nukta, halant). A unit matches a heard unit with the same letter; a mark the
// pangti has and the heard unit lacks (or holds a different one in its place) costs
// markMiss / markWrong. Every mark stays part of the comparison. Only the heard side (the
// speech model's output) is read leniently: its marks never cost anything.
const MARK_BITS = { 0x0a70: 1, 0x0a02: 2, 0x0a71: 4, 0x0a3c: 8, 0x0a4d: 16 }; // ੰ ਂ ੱ ਼ ੍
const markBit = (cp) => MARK_BITS[cp] || 0;
// BaniDB writes ਲ਼ ਸ਼ ਖ਼ ਗ਼ ਜ਼ ਫ਼ as one character; the speech model as letter + nukta. Compared
// per code point by its canonical decomposition: the letter, and the nukta as its mark.
const GURMUKHI = 0x0a00;
const LETTER_OF = new Int32Array(0x80);
const OWN_MARKS = new Uint8Array(0x80);
for (let k = 0; k < 0x80; k += 1) {
  const parts = Array.from(String.fromCodePoint(GURMUKHI + k).normalize('NFD'), (c) =>
    c.codePointAt(0),
  );
  [LETTER_OF[k]] = parts;
  parts.slice(1).forEach((cp) => {
    OWN_MARKS[k] |= markBit(cp); // eslint-disable-line no-bitwise
  });
}
const inBlock = (cp) => cp >= GURMUKHI && cp < GURMUKHI + 0x80;
const letterOf = (cp) => (inBlock(cp) ? LETTER_OF[cp - GURMUKHI] : cp);
const ownMarks = (cp) => (inBlock(cp) ? OWN_MARKS[cp - GURMUKHI] : 0);

// Heard text (the speech model's output only) as units: { l: letters, m: mark bits }.
function heardUnits(s) {
  const l = [];
  const m = [];
  Array.from((s || '').normalize('NFD')).forEach((ch) => {
    if (isIgnored(ch)) return;
    const cp = ch.codePointAt(0);
    const b = markBit(cp);
    if (b) {
      if (m.length) m[m.length - 1] |= b; // eslint-disable-line no-bitwise
    } else {
      l.push(cp);
      m.push(0);
    }
  });
  return { l: Int32Array.from(l), m: Uint8Array.from(m), length: l.length };
}

// The stream of compared units of a whole text (a Bani, or the other Gurbani), each unit
// pointing back to the pangti code point it reads (`code`, as given). A spoken reading
// (spoken.js) is a second path over its span: both the written units and the reading's units
// are columns, and the column after the span may be reached from either.
class Stream {
  constructor() {
    Object.assign(this, { code: [], mk: [], pA: [], pB: [], lineAt: [], wordAt: [], depth: [] });
    this.leave = []; // cost of going on from this column (the end of a written path, see span)
    this.tails = [{ col: -1, depth: 0 }]; // where the next column continues from (1 or 2 paths)
    this.line = 0;
    this.word = 0;
  }

  // a new line: letters are counted from its start
  startLine(line) {
    this.line = line;
    this.tails = this.tails.map((t) => ({ col: t.col, depth: 0 }));
  }

  column(cp, marks) {
    const [t0, t1] = this.tails;
    const col = this.code.length;
    this.code.push(cp);
    this.mk.push(marks);
    this.pA.push(t0.col);
    this.pB.push(t1 ? t1.col : -1);
    this.leave.push(0);
    this.lineAt.push(this.line);
    this.wordAt.push(this.word);
    this.depth.push(t0.depth + 1); // along the first path (the spoken one, when there are two)
    this.tails = [{ col, depth: t0.depth + 1 }];
  }

  // the compared units of `text` (a pangti word as given, or a spoken reading)
  units(text, spokenToo = true) {
    let last = -1;
    for (let i = 0; i < text.length;) {
      const cp = text.codePointAt(i);
      const ch = String.fromCodePoint(cp);
      i += ch.length;
      if (!isIgnored(ch)) {
        const b = markBit(cp);
        if (b) {
          if (last >= 0) this.mk[last] |= b; // eslint-disable-line no-bitwise
        } else if (cp === EK_OANKAR && spokenToo) {
          this.span(() => this.column(cp, 0), EK_OANKAR_SAID);
          last = -1;
        } else {
          this.column(cp, ownMarks(cp));
          last = this.code.length - 1;
        }
      }
    }
  }

  // The written units (`written()` adds them) or the spoken reading, as two paths. Going on
  // from the written path costs what leaving the reading's extra units unheard would (a gap
  // each): the numeral of ਮਹਲਾ ੫ is said, so the written path must not let the reading be
  // passed over for free (ਆਸਾ ਮਹਲਾ ... would then fit every ਆਸਾ ਮਹਲਾ heading alike).
  span(written, reading) {
    const from = this.tails;
    const c0 = this.code.length;
    this.units(reading, false);
    const said = this.code.length - c0;
    const saidEnd = this.tails[0];
    this.tails = from;
    const c1 = this.code.length;
    written();
    const wrote = this.code.length - c1;
    const writtenEnd = this.tails[0];
    if (writtenEnd.col === saidEnd.col) {
      this.tails = [saidEnd];
      return;
    }
    if (writtenEnd.col >= 0) this.leave[writtenEnd.col] = -GAP * Math.max(0, said - wrote);
    this.tails = [saidEnd, writtenEnd];
  }

  separator() {
    this.column(-1, 0); // never matches anything heard (between lines of other Gurbani)
  }

  // A line given as words (each a piece of the pangti as written). `wordNo(k)` is the
  // number the k-th word's units are shown under.
  addLine(words, wordNo = () => 0) {
    words.forEach((wd, k) => {
      this.word = wordNo(k);
      const pair = spokenPair(wd, words[k + 1]);
      if (pair && pair.reading) this.span(() => this.units(wd), pair.reading);
      else this.units(wd);
    });
  }

  done() {
    const out = {
      code: Int32Array.from(this.code),
      mk: Uint8Array.from(this.mk),
      pA: Int32Array.from(this.pA),
      pB: Int32Array.from(this.pB),
      leave: Float32Array.from(this.leave),
      lineAt: this.lineAt,
      wordAt: this.wordAt,
      depth: Int32Array.from(this.depth),
    };
    // columns not simply after the one before them (a path start, or two paths joining)
    out.join = Uint8Array.from(this.pA, (p, j) => (p !== j - 1 || this.pB[j] >= 0 ? 1 : 0));
    out.length = this.code.length;
    return out;
  }
}

// Does a line say anything (any Gurmukhi letter)? Asa di Vaar's "❁" dividers do not.
const saysSomething = (words) =>
  words.some((w) => {
    const v = compared(w);
    for (let k = 0; k < v.length; k += 1) {
      const cp = v.code(k);
      if (inBlock(cp) && !markBit(cp)) return true;
    }
    return false;
  });
// Does a word have anything compared (a letter, vowel sign or mark)?
const hasCompared = (w) => compared(w).length > 0;

// What a pangti unit's marks cost when matched by a heard unit with the same letter, indexed
// [pangti marks * 32 + heard marks]: each pangti mark the heard unit lacks costs markMiss, or
// markWrong when the heard unit holds a different mark in its place. Heard marks the pangti
// does not have cost nothing (leniency is for the heard side only).
const bitCount = (x) => {
  let k = 0;
  for (let v = x; v; v >>= 1) k += v & 1; // eslint-disable-line no-bitwise
  return k;
};
function markCosts(c) {
  const t = new Float32Array(32 * 32);
  for (let p = 0; p < 32; p += 1) {
    for (let q = 0; q < 32; q += 1) {
      /* eslint-disable no-bitwise */
      const lacks = bitCount(p & ~q);
      const other = (q & ~p) !== 0;
      /* eslint-enable no-bitwise */
      t[p * 32 + q] = lacks * (other ? c.markWrong : c.markMiss);
    }
  }
  return t;
}

// One row of the local alignment of heard unit (letter hl, marks hm) against stream columns
// a..a+m-1, from the row before (`prev`) into `cur`. Index 0 is the boundary (score 0); a
// column whose path comes from before the window starts from the boundary too.
/* eslint-disable no-param-reassign */ // fills the caller's row in place (hot loop)
function fillRow(S, a, m, hl, hm, prev, cur, MC) {
  const { code, mk, join, pA, pB, leave } = S;
  cur[0] = 0;
  for (let j = 1; j <= m; j++) {
    const g = a + j - 1;
    const pc = code[g];
    const s = hl === letterOf(pc) ? MATCH - MC[mk[g] * 32 + hm] : MISMATCH;
    let d;
    let l;
    if (join[g] === 0) {
      d = prev[j - 1] + s;
      l = cur[j - 1];
    } else {
      const x = pA[g] >= a ? pA[g] - a + 1 : 0;
      d = prev[x] + s;
      l = cur[x];
      if (pB[g] >= 0) {
        const y = pB[g] >= a ? pB[g] - a + 1 : 0;
        const w = leave[pB[g]];
        if (prev[y] + s - w > d) d = prev[y] + s - w;
        if (cur[y] - w > l) l = cur[y] - w;
      }
    }
    l += GAP;
    const u = prev[j] + GAP;
    let v = d > u ? d : u;
    if (l > v) v = l;
    cur[j] = v > 0 ? v : 0;
  }
}
/* eslint-enable no-param-reassign */

class FollowerV2 {
  constructor(infer, lines, opts = {}) {
    this.infer = infer;
    this.c = { ...DEFAULTS, ...(SUNG_BANIS[opts.baniId] || {}), ...opts };
    this.base = this.c; // the profile as configured; this.c is its tier-scaled copy
    this.sung = !!SUNG_BANIS[opts.baniId]; // sung Banis keep the full window in every tier
    // A read Bani: the only following the performance tiers apply to. Aarti (Bani 22) is sung like
    // kirtan, so it never gets the tiers even when it follows on this follower.
    this.readBani = !this.sung && Number(opts.baniId) !== 22;
    this.hopS = this.c.hopS;
    this.inputSr = opts.inputSr || 48000;
    this.verseIds = lines.map((l) => l.verseId);
    // Stream of compared units (see Stream above); lineAt[k] = line of unit k, lineStart[i] =
    // its first unit, lineEnd[i] its last, lineLen[i] how many units it says (along the spoken
    // reading where there is one).
    const st = new Stream();
    const lineStart = [];
    const lineEnd = [];
    const lineLen = [];
    lines.forEach((l, i) => {
      lineStart.push(st.code.length);
      st.startLine(i);
      // Each written word is read in place; a word said together with the numeral after it
      // (ਮਹਲਾ ੧ ...) gets its spoken reading as a second path, and its units belong to it.
      let written = (l.text || (l.words || []).join(' ')).split(/[\s॥।]+/).filter(Boolean);
      // A row with no Gurmukhi letter at all (Asa di Vaar's 24 "❁" dividers) is never said:
      // as a one-letter line it was the "next line" after every pauri, so the screen left
      // the pauri's last line for the divider while that line was still being sung.
      if (!saysSomething(written)) written = [];
      const shown = (l.words && l.words.length ? l.words : written).map(hasCompared);
      // the written word each unit belongs to, in l.words' numbering (words with nothing
      // compared, such as verse numbers, are passed over)
      const wordNo = [];
      let wi = 0;
      written.forEach((wd, k) => {
        if (!hasCompared(wd)) return;
        while (wi < shown.length - 1 && !shown[wi]) wi += 1;
        wordNo[k] = Math.min(wi, Math.max(0, shown.length - 1));
        wi += 1;
      });
      st.addLine(written, (k) => wordNo[k] || 0);
      lineEnd.push(st.code.length - 1);
      lineLen.push(st.code.length > lineStart[i] ? st.tails[0].depth : 0);
    });
    const text = st.done();
    Object.assign(this, {
      text,
      lineAt: text.lineAt,
      wordAt: text.wordAt,
      lineStart,
      lineEnd,
      lineLen,
    });
    this.markCost = markCosts(this.c);
    this.lastEnd = -1;
    // Other Gurbani (lines), minus any line this Bani also has: shared text (So Dar in
    // Japji and Rehras, Gagan mai thaal in Sohila and Aarti) is evidence for both. Lines are
    // matched as written (compared views), never through an altered copy.
    if (opts.background) {
      const own = new Map();
      lines.forEach((l) => {
        const v = compared(l.text || (l.words || []).join(' '));
        const key = hashCompared(v);
        if (!own.has(key)) own.set(key, []);
        own.get(key).push(v);
      });
      const isOwn = (v) => (own.get(hashCompared(v)) || []).some((o) => sameCompared(o, v));
      const bg = new Stream();
      let any = false;
      [].concat(opts.background).forEach((t) => {
        const v = compared(t);
        const words = (t || '').split(/[\s॥।]+/).filter(Boolean);
        if (!v.length || isOwn(v) || !words.some(hasCompared)) return;
        if (any) bg.separator();
        any = true;
        bg.addLine(words);
      });
      this.bg = any ? bg.done() : null;
    } else this.bg = null;
    this.foreign = 0; // windows in a row that other Gurbani explains better
    this.noMatch = 0; // windows in a row where nothing near the current line matched
    this.win = Math.floor(this.c.windowS * SR);
    this.hop = Math.floor(this.c.hopS * SR);
    this.buf = new Float32Array(0);
    this.acc = 0;
    this.cur = null; // current line
    this.lastCur = null; // line before the last release: where a re-lock looks first
    this.cand = null; // pending move { line, n }
    this.ahead = 0; // windows in a row the local match landed past the next line
    // Where the app locked on (index into lines): a first match that is equally good in
    // several places (refrains) picks the one nearest this.
    if (Number.isInteger(opts.startLine) && opts.startLine >= 0) this.lastCur = opts.startLine;
    // A Bani opened from a line the app was already following (the two-shabads rule, the
    // reading rule) starts AT that line instead of re-locking from nothing: on poor audio
    // (Newton, a laptop mic in a hall) the fresh lock took tens of seconds, during which the
    // Bani pane sat on its first line.
    if (opts.startAt && Number.isInteger(opts.startLine) && opts.startLine >= 0) {
      this.cur = Math.min(opts.startLine, lines.length - 1);
    }
    this.tick = 0;
    // Bound here: test wrappers built with Object.create(follower) must still move THIS
    // follower, not set fields on the wrapper.
    this.seek = this.seek.bind(this);
    this.adopt = this.adopt.bind(this);
  }

  // The sevadaar moved the screen to `line`: follow on from there.
  seek(line) {
    if (!Number.isInteger(line) || line < 0 || line >= this.lineStart.length) return false;
    this.cur = line;
    this.lastCur = line;
    this.cand = null;
    this.ahead = 0;
    this.noMatch = 0;
    this.foreign = 0;
    this.lastEnd = -1;
    return true;
  }

  // Akhand Paath: carry on from another follower over the same audio (the reading window
  // moved on to the next Shabads): the same audio buffer and listening clock, so no second
  // of audio is lost and no window is decoded twice, at pangti `line` of this text.
  adopt(prev, line) {
    if (!prev || !Number.isInteger(line) || line < 0 || line >= this.lineStart.length) return false;
    if (prev.buf) this.buf = prev.buf;
    if (Number.isFinite(prev.acc)) this.acc = prev.acc;
    if (Number.isFinite(prev.hopS) && prev.hopS !== this.hopS) {
      this.hopS = prev.hopS;
      this.hop = Math.floor(prev.hopS * SR);
      this.c = this.scaled(prev.hopS / this.base.hopS);
    }
    if (Number.isFinite(prev.tick)) this.tick = prev.tick;
    this.cur = line;
    this.lastCur = line;
    this.cand = null;
    this.ahead = 0;
    this.noMatch = 0;
    this.foreign = 0;
    this.lastEnd = -1;
    return true;
  }

  // Best end position in text[a..b] for an alignment that ends at the end of the heard
  // letters (the last 2 may be left out: a word cut off mid-way). Returns
  // { end, score } with score per heard letter in [0, 1].
  align(h, a, b, from = null, near = null) {
    const n = h.length;
    const m = b - a + 1;
    if (m <= 0 || n === 0) return null;
    let prev = new Float32Array(m + 1);
    let cur = new Float32Array(m + 1);
    const tail = []; // rows n-2..n
    for (let i = 1; i <= n; i++) {
      fillRow(this.text, a, m, h.l[i - 1], h.m[i - 1], prev, cur, this.markCost);
      if (i >= n - 2) tail.push({ row: cur.slice(), drop: n - i });
      [prev, cur] = [cur, prev];
    }
    let best = { end: -1, raw: -1 };
    const prior = (k) => {
      if (from === null) return 0;
      const d = this.lineAt[k] - from;
      const steps = d >= 0 ? Math.max(0, d - 1) : -d; // current and next line free
      return this.c.distCost * MATCH * n * steps;
    };
    const ends = new Float32Array(m).fill(-1); // best score per end position
    tail.forEach(({ row, drop }) => {
      for (let j = 1; j <= m; j++) {
        const v = row[j] - drop * 1.0 - (row[j] > 0 ? prior(a + j - 1) : 0);
        if (v > ends[j - 1]) ends[j - 1] = v;
        if (v > best.raw) best = { end: a + j - 1, raw: v };
      }
    });
    // The same words can occur in several places (ੴ ਸਤਿਗੁਰ ਪ੍ਰਸਾਦਿ, refrains): of the
    // places that match as well as the best, take the one nearest ahead of `near`.
    if (near !== null && best.end >= 0) {
      const tie = best.raw - this.c.tieSlack * MATCH * n;
      let pick = best.end;
      let pickD = Infinity;
      for (let j = 0; j < m; j++) {
        const d = this.lineAt[a + j] - near;
        const dist = d >= 0 ? d : 1000 - d; // ahead first, then behind
        if (ends[j] >= tie && (dist < pickD || (dist === pickD && ends[j] > ends[pick - a]))) {
          pickD = dist;
          pick = a + j;
        }
      }
      best = { end: pick, raw: ends[pick - a] };
    }
    return { end: best.end, score: best.raw / (MATCH * n), raw: best.raw, ends, a };
  }

  // How much better ending at `end` is than ending anywhere up to the end of line `upto`
  // (raw alignment score): real evidence of having moved on, not a stray matched mark.
  gainOver(r, upto) {
    const lim = Math.min(this.lineEnd[upto], r.a + r.ends.length - 1) - r.a;
    let prev = 0;
    for (let j = 0; j <= lim; j++) if (r.ends[j] > prev) prev = r.ends[j];
    return r.raw - prev;
  }

  // Best score of the heard letters (ending at their end) anywhere in other Gurbani.
  bgScore(h) {
    if (!this.bg) return 0;
    const n = h.length;
    const m = this.bg.length;
    let prev = new Float32Array(m + 1);
    let cur = new Float32Array(m + 1);
    let best = 0;
    for (let i = 1; i <= n; i++) {
      fillRow(this.bg, 0, m, h.l[i - 1], h.m[i - 1], prev, cur, this.markCost);
      if (i >= n - 2) {
        const drop = n - i;
        for (let j = 1; j <= m; j++) if (cur[j] - drop > best) best = cur[j] - drop;
      }
      [prev, cur] = [cur, prev];
    }
    return best / (MATCH * n);
  }

  out(line, score, end = -1) {
    if (end >= 0 && this.lineAt[end] === line) this.lastEnd = end;
    else if (this.lastEnd < 0 || this.lineAt[this.lastEnd] !== line) this.lastEnd = -1;
    const wordIndex = this.lastEnd >= 0 ? this.wordAt[this.lastEnd] : -1;
    return {
      verseIndex: line,
      verseId: this.verseIds[line],
      lineIndex: line,
      wordIndex,
      confidence: +Math.max(0, Math.min(1, score)).toFixed(3),
    };
  }

  // A pending move must be proposed `need` windows in a row to happen. A forward move
  // also counts as confirmed by steady forward progress (each window at or past the
  // last proposal): in fast recitation the position moves on every window.
  confirm(line, need, forward = false) {
    if (
      this.cand &&
      (this.cand.line === line || (forward && line >= this.cand.line && this.cand.forward))
    ) {
      this.cand.n += 1;
      this.cand.line = line;
    } else this.cand = { line, n: 1, forward };
    return this.cand.n >= need;
  }

  decide(h) {
    const { c } = this;
    const last = this.text.length - 1;
    this.tick += 1;
    const aheadRun = this.ahead; // catch-up run so far; any other outcome ends it
    this.ahead = 0;
    let B = null; // other-Gurbani score, computed only when about to change something
    const bg = () => {
      if (B === null) B = this.bgScore(h);
      return B;
    };
    if (this.cur === null) {
      const G = this.align(h, 0, last, null, this.lastCur);
      if (!G || G.score < c.lockScore || G.score - bg() < c.lockMargin) {
        this.cand = null;
        return null;
      }
      const line = this.lineAt[G.end];
      if (this.text.depth[G.end] < c.enterLetters && line > 0) return null;
      if (!this.confirm(line, c.lockDwell)) return null;
      this.cur = line;
      this.noMatch = 0;
      this.cand = null;
      return this.out(line, G.score, G.end);
    }
    const a = this.lineStart[Math.max(0, this.cur - c.back)];
    const b = this.lineEnd[Math.min(this.lineEnd.length - 1, this.cur + c.ahead)];
    const Lc = this.align(h, a, b, this.cur);
    const needGlobal =
      !Lc || Lc.score < c.minScore + c.jumpMargin || this.tick % c.globalEvery === 0 || this.cand;
    const G = needGlobal ? this.align(h, 0, last, null, this.cur) : null;
    // Far jump: the whole-Bani match is elsewhere and clearly better.
    if (
      G &&
      G.score >= Math.max(c.minScore, c.jumpScore) &&
      (G.end < a || G.end > b) &&
      (!Lc || G.score >= Lc.score + c.jumpMargin) &&
      G.score - bg() >= c.lockMargin
    ) {
      const line = this.lineAt[G.end];
      if (this.confirm(line, c.jumpDwell)) {
        this.cur = line;
        this.noMatch = 0;
        this.cand = null;
        return this.out(line, G.score, G.end);
      }
      return null;
    }
    if (!Lc || Lc.score < c.minScore) {
      this.cand = null;
      return this.release(h, Lc, bg);
    }
    this.noMatch = 0; // something here matched
    let line = this.lineAt[Lc.end];
    // Only the first letters of the next line heard: not enough yet. Akhand Paath
    // (opts.akhand): once the current pangti's end has been heard, the very next pangti
    // needs only akhEnterLetters of its own (read Ang after Ang, it is almost certain).
    const endHeard =
      c.akhand &&
      line === this.cur + 1 &&
      this.lastEnd >= 0 &&
      this.lineAt[this.lastEnd] === this.cur &&
      this.text.depth[this.lastEnd] >= this.lineLen[this.cur] - c.akhEndSlack;
    const needLetters = endHeard ? c.akhEnterLetters : c.enterLetters;
    const needGain = endHeard ? c.akhEnterGain : c.enterGain;
    if (
      line > this.cur &&
      (this.text.depth[Lc.end] < needLetters || this.gainOver(Lc, line - 1) < needGain)
    ) {
      line -= 1;
      while (line > this.cur && this.lineEnd[line] < this.lineStart[line]) line -= 1;
    }
    if (line === this.cur) {
      this.cand = null;
      this.foreign = 0;
      return this.out(line, Lc.score, Lc.end);
    }
    if (Lc.score - bg() < c.moveMargin) {
      this.cand = null;
      return this.release(h, Lc, bg);
    }
    this.foreign = 0;
    const skipOk = line > this.cur + 1 && this.gainOver(Lc, this.cur + 1) >= c.skipGain;
    if (line === this.cur + 1 || (skipOk && this.confirm(line, c.skipDwell, true))) {
      this.cur = line;
      this.noMatch = 0;
      this.cand = null;
      return this.out(line, Lc.score, Lc.end);
    }
    if (line > this.cur) {
      // Catch-up: steadily matching further ahead -> move there.
      this.ahead = Lc.score >= c.catchScore ? aheadRun + 1 : 0;
      if (c.catchHops && this.ahead >= c.catchHops) {
        this.cur = line;
        this.noMatch = 0;
        this.cand = null;
        this.ahead = 0;
        return this.out(line, Lc.score, Lc.end);
      }
      return null;
    }
    // A one-line step back (a flicker between neighbours) may need longer than a real repeat.
    if (this.confirm(line, line === this.cur - 1 && c.backDwell1 ? c.backDwell1 : c.backDwell)) {
      this.cur = line;
      this.noMatch = 0;
      this.cand = null;
      return this.out(line, Lc.score, Lc.end);
    }
    return null;
  }

  // Nothing here fits: if other Gurbani keeps fitting better, stop showing a line.
  release(h, Lc, bg) {
    if (this.c.noMatchHops && (!Lc || Lc.score < this.c.minScore)) {
      this.noMatch += 1;
      if (this.noMatch >= this.c.noMatchHops) {
        this.lastCur = this.cur;
        this.cur = null;
        this.cand = null;
        this.foreign = 0;
        this.noMatch = 0;
        return { verseIndex: -1, verseId: null, lineIndex: null, wordIndex: -1, confidence: 0 };
      }
    }
    if (!this.bg || (Lc && bg() - Lc.score <= this.c.releaseMargin)) {
      this.foreign = 0;
      return null;
    }
    this.foreign += 1;
    if (this.foreign < this.c.releaseHops) return null;
    this.lastCur = this.cur;
    this.cur = null;
    this.cand = null;
    this.foreign = 0;
    this.noMatch = 0;
    return { verseIndex: -1, verseId: null, lineIndex: null, wordIndex: -1, confidence: 0 };
  }

  // The profile for a hop `scale` times the configured one: every dwell counted in windows
  // is divided by it (never below 1 window), so a slower tier confirms moves after the
  // same wall-clock time. scale 1 = the profile itself.
  scaled(scale) {
    if (scale === 1) return this.base;
    const c = { ...this.base };
    [
      'skipDwell',
      'backDwell',
      'backDwell1',
      'jumpDwell',
      'lockDwell',
      'releaseHops',
      'noMatchHops',
      'catchHops',
    ].forEach((k) => {
      if (c[k]) c[k] = Math.max(1, Math.round(c[k] / scale));
    });
    return c;
  }

  async push(pcm) {
    const res = resampleTo16k(pcm, this.inputSr);
    const kind = this.c.akhand ? 'akhand' : 'paath';
    this.win = Math.floor(pace.windowS(this.sung ? 'follower' : kind, this.base.windowS) * SR);
    if (res.length) {
      let merged = new Float32Array(this.buf.length + res.length);
      merged.set(this.buf, 0);
      merged.set(res, this.buf.length);
      if (merged.length > this.win) merged = merged.slice(merged.length - this.win);
      this.buf = merged;
      this.acc += res.length;
    }
    // Performance tier: a longer hop, with the window-counted dwells scaled so they keep
    // their wall-clock meaning (see scaled()).
    const hopS = pace.hopS(this.c.akhand ? 'akhand' : 'follower', this.base.hopS);
    if (hopS !== this.hopS) {
      this.hopS = hopS;
      this.hop = Math.floor(hopS * SR);
      this.c = this.scaled(hopS / this.base.hopS);
    }
    if ((this.acc < this.hop && !pace.onBeat(pcm)) || this.buf.length < SR) return null;
    this.acc = 0;
    const emis = await this.infer.emissions(this.buf);
    const h = heardUnits(this.infer.decode(this.infer.greedy(emis)));
    if (h.length < this.c.minHyp) return null;
    return this.decide(h);
  }
}

module.exports = { FollowerV2, DEFAULTS, heardUnits };
