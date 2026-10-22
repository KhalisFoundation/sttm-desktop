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
const { resampleTo16k, SR } = require('./infer');
const pace = require('./pace');
const { spoken } = require('./spoken');

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
  // Akhand Paath (opts.anticipate, set only for a reading window of Sri Guru Granth Sahib Ji
  // read Ang after Ang): the next pangti is almost certain, so it goes up as the current
  // one's last letters are heard (they are decoded a moment after they are said, so the
  // change lands in the reader's breath pause), not after the next one's first letters.
  // Off (false) everywhere else: Banis and Shabads follow exactly as before.
  anticipate: false,
  antLetters: 0, // letters of the current pangti still unheard when the next one goes up
  antScore: 0.5, // ...with the match at least this good (per heard letter)
  antShort: 10, // a pangti this short (letters) needs no earlier fix inside it first
  antTail: 6, // after an early change, the old pangti's last letters still heard = still here
  antBackDwell: 2, // ...while its earlier letters (the reader went back to it) = back after this
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

// Letters only, with marks that recognition often drops or adds removed, so that
// spelling noise costs little.
const SIMPLE = /[\s।॥|0-9੦-੯.,;:!?\-ੰਂੱ਼੍]/g; // eslint-disable-line no-misleading-character-class
// NFD first: BaniDB writes ਸ਼ ਖ਼ ਗ਼ ਜ਼ ਫ਼ ਲ਼ as single characters, the model as letter + dot.
const simplify = (s) => (s || '').normalize('NFD').replace(SIMPLE, '');

const MATCH = 2;
const MISMATCH = -1;
const GAP = -1;

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
    // Stream of letters; lineAt[k] = line of letter k; lineStart[i] = first letter.
    const text = [];
    const lineAt = [];
    const wordAt = [];
    const lineStart = [];
    const lineEnd = [];
    lines.forEach((l, i) => {
      lineStart.push(text.length);
      // The line as it is said aloud (ੴ, ਮਹਲਾ ੧ ...), letters only. Each written word is
      // expanded on its own, so wordAt maps every spoken letter to the word that says it
      // (a numeral after ਮਹਲਾ belongs to the ਮਹਲਾ word; verse numbers say nothing).
      let written = (l.text || (l.words || []).join(' ')).split(/[\s॥।]+/).filter(Boolean);
      // A row with no Gurmukhi letter at all (Asa di Vaar's 24 "❁" dividers) is never said:
      // as a one-letter line it was the "next line" after every pauri, so the screen left
      // the pauri's last line for the divider while that line was still being sung.
      if (!/[਀-੿]/.test(simplify(spoken(written.join(' '))))) written = [];
      const shown = (l.words && l.words.length ? l.words : written).map((x) => simplify(spoken(x)));
      let wi = 0;
      written.forEach((wd, k) => {
        const next = written[k + 1] || '';
        // ਮਹਲਾ/ਮਃ + numeral (or ਪਾਤਿਸ਼ਾਹੀ ੧੦) are said together: expand them as a pair.
        const pair = /^(ਮਹਲਾ|ਮਃ|ਪਾਤਿਸ਼?ਾਹੀ)$/.test(wd.normalize('NFC')) && /^[੦-੯]+/.test(next);
        let say = pair ? `${wd} ${next}` : wd;
        if (!pair && /^[੦-੯॥।]+$/.test(wd)) say = ''; // verse numbers say nothing
        const said = simplify(spoken(say));
        if (!said) return;
        // the written word this letter run belongs to, in l.words' numbering
        while (wi < shown.length - 1 && !shown[wi]) wi += 1;
        [...said].forEach((ch) => {
          text.push(ch);
          lineAt.push(i);
          wordAt.push(Math.min(wi, Math.max(0, shown.length - 1)));
        });
        wi += 1;
      });
      lineEnd.push(text.length - 1);
    });
    Object.assign(this, { text, lineAt, wordAt, lineStart, lineEnd });
    this.lastEnd = -1;
    // Other Gurbani (lines), minus any line this Bani also has: shared text (So Dar in
    // Japji and Rehras, Gagan mai thaal in Sohila and Aarti) is evidence for both.
    if (opts.background) {
      const own = new Set(lines.map((l) => simplify(spoken(l.text || (l.words || []).join(' ')))));
      const bg = []
        .concat(opts.background)
        .map((t) => simplify(spoken(t)))
        .filter((t) => t && !own.has(t));
      this.bg = [...bg.join('|')];
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
    this.ant = null; // Akhand Paath: the pangti left early for the next one (see anticipate)
    this.prog = { line: null, mid: false }; // a fix inside the current pangti before its end
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
    this.ant = null;
    return true;
  }

  // Akhand Paath: carry on from another follower over the same audio (the reading window
  // moved on to the next Shabads): the same audio buffer and listening clock, so no second
  // of audio is lost and no window is decoded twice, at pangti `line` of this text.
  // `antLine`: the pangti of this text left early for `line` (see anticipate), or null.
  adopt(prev, line, antLine = null) {
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
    this.ant = Number.isInteger(antLine) && antLine >= 0 ? antLine : null;
    this.prog = { line, mid: !!(prev.prog && prev.prog.mid && prev.cur != null) };
    return true;
  }

  // The next pangti that has something to say (a row with no letters is skipped), or -1.
  nextSaid(line) {
    for (let k = line + 1; k < this.lineStart.length; k += 1) {
      if (this.lineEnd[k] >= this.lineStart[k]) return k;
    }
    return -1;
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
      cur[0] = 0;
      const hc = h[i - 1];
      for (let j = 1; j <= m; j++) {
        const d = prev[j - 1] + (hc === this.text[a + j - 1] ? MATCH : MISMATCH);
        const u = prev[j] + GAP;
        const l = cur[j - 1] + GAP;
        let v = d > u ? d : u;
        if (l > v) v = l;
        cur[j] = v > 0 ? v : 0;
      }
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
      cur[0] = 0;
      const hc = h[i - 1];
      for (let j = 1; j <= m; j++) {
        const d = prev[j - 1] + (hc === this.bg[j - 1] ? MATCH : MISMATCH);
        const u = prev[j] + GAP;
        const l = cur[j - 1] + GAP;
        let v = d > u ? d : u;
        if (l > v) v = l;
        cur[j] = v > 0 ? v : 0;
        if (i >= n - 2) {
          const w = v - (n - i);
          if (w > best) best = w;
        }
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
      if (G.end - this.lineStart[line] + 1 < c.enterLetters && line > 0) return null;
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
        this.ant = null;
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
    // Only the first letters of the next line heard: not enough yet.
    if (
      line > this.cur &&
      (Lc.end - this.lineStart[line] + 1 < c.enterLetters ||
        this.gainOver(Lc, line - 1) < c.enterGain)
    ) {
      line -= 1;
      while (line > this.cur && this.lineEnd[line] < this.lineStart[line]) line -= 1;
    }
    if (c.anticipate && this.ant != null) {
      const at = this.lineAt[Lc.end];
      // After an early change the pangti just left is still in the window: its last
      // letters say nothing new (the reader is in the breath pause, or about to start).
      if (at === this.ant && line < this.cur && Lc.end >= this.lineEnd[this.ant] - c.antTail) {
        line = this.cur;
      }
      if (at === this.cur) this.ant = null; // the new pangti is being heard: it stands
    }
    if (line === this.cur) {
      this.cand = null;
      this.foreign = 0;
      if (c.anticipate) {
        const nx = this.anticipateFrom(Lc);
        if (nx >= 0) return this.out(nx, Lc.score);
      }
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
    // Back to a pangti left early (Akhand Paath): the reader is reading it again, follow soon.
    let need = line === this.cur - 1 && c.backDwell1 ? c.backDwell1 : c.backDwell;
    if (c.anticipate && this.ant != null && line === this.ant) need = c.antBackDwell;
    if (this.confirm(line, need)) {
      this.ant = null;
      this.cur = line;
      this.noMatch = 0;
      this.cand = null;
      return this.out(line, Lc.score, Lc.end);
    }
    return null;
  }

  // Akhand Paath (opts.anticipate): the local match Lc ends inside the current pangti.
  // Once only its last antLetters letters are unheard (and it was really being read: a fix
  // inside it earlier, unless it is a short one), the next pangti goes up. Returns that
  // pangti, or -1 (stay).
  anticipateFrom(Lc) {
    const { c } = this;
    const { cur } = this;
    if (this.prog.line !== cur) this.prog = { line: cur, mid: false };
    if (this.lineAt[Lc.end] !== cur || Lc.score < c.antScore) return -1;
    const s = this.lineStart[cur];
    const e = this.lineEnd[cur];
    const len = e - s + 1;
    if (e - Lc.end > c.antLetters) {
      if (Lc.end - s + 1 >= Math.min(3, len)) this.prog.mid = true;
      return -1;
    }
    if (!this.prog.mid && len > c.antShort) return -1;
    const nx = this.nextSaid(cur);
    if (nx < 0) return -1;
    this.ant = cur;
    this.cur = nx;
    this.prog = { line: nx, mid: false };
    this.noMatch = 0;
    return nx;
  }

  // Nothing here fits: if other Gurbani keeps fitting better, stop showing a line.
  release(h, Lc, bg) {
    if (this.c.noMatchHops && (!Lc || Lc.score < this.c.minScore)) {
      this.noMatch += 1;
      if (this.noMatch >= this.c.noMatchHops) {
        this.lastCur = this.cur;
        this.cur = null;
        this.ant = null;
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
    this.ant = null;
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
      'antBackDwell',
    ].forEach((k) => {
      if (c[k]) c[k] = Math.max(1, Math.round(c[k] / scale));
    });
    return c;
  }

  async push(pcm) {
    const res = resampleTo16k(pcm, this.inputSr);
    this.win = Math.floor(pace.windowS(this.sung ? 'follower' : 'paath', this.base.windowS) * SR);
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
    const hopS = pace.hopS('follower', this.base.hopS);
    if (hopS !== this.hopS) {
      this.hopS = hopS;
      this.hop = Math.floor(hopS * SR);
      this.c = this.scaled(hopS / this.base.hopS);
    }
    if ((this.acc < this.hop && !pace.onBeat(pcm)) || this.buf.length < SR) return null;
    this.acc = 0;
    const emis = await this.infer.emissions(this.buf);
    const h = [...simplify(this.infer.decode(this.infer.greedy(emis)))];
    if (h.length < this.c.minHyp) return null;
    return this.decide(h);
  }
}

module.exports = { FollowerV2, DEFAULTS, simplify };
