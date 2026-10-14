// JS port of karansea_engine.py KaranseaEngine: streaming CTC + online
// token-passing line decoder + CTC word alignment. Mirrors push().
const { resampleTo16k, norm, SR, BLANK } = require('./infer');
const { partialRatio, partialRatioAlignment } = require('./fuzz');

const NEG = -1e30;

const DEFAULTS = {
  windowS: 4.0, hopS: 0.25, minHyp: 3, guard: 0.55, advCost: 0.03,
  jumpCost: 0.28, rahaoBonus: 0.18, revisitBonus: 0.10, decay: 0.90,
  dwell: 3, dwellAdv: 1, dwellBack: 2, skipSpan: 2, backSpan: 1, backCost: 0.14,
  margin: 0.05, marginGate: 0.10, initConfirm: 4, release: 14,
  acousticGate: 0.0, acousticWin: 3.0, acousticTopm: 5,
  // Evidence bar for any move other than "next line": the fragment must match the
  // challenger line clearly better than the current line (a word shared by both
  // lines is not evidence of a jump). 0 disables.
  jumpEmisGap: 0.0,
  // A fragment shorter than this (normalized chars) cannot move the cursor anywhere
  // but the next line: one common word is not evidence of a jump. 0 disables.
  minHypJump: 8,
  // Decodes a 2..skipSpan-line skip must persist (default: same as dwellAdv).
  dwellSkip: null,
};

function argmax(a) { let bi = 0, bv = -Infinity; for (let i = 0; i < a.length; i++) if (a[i] > bv) { bv = a[i]; bi = i; } return bi; }

class Follower {
  constructor(infer, sp, lines, { inputSr = 48000, ...opts } = {}) {
    this.infer = infer;
    this.sp = sp;
    this.inputSr = inputSr;
    const c = { ...DEFAULTS, ...opts };
    this.c = c;

    this.lineText = lines.map((l) => (l.words || []).join(' '));
    this.linesNorm = this.lineText.map((t) => norm(t));
    this.linesTok = this.lineText.map((t) => sp.encode(t));
    this.lineWords = lines.map((l) => [...(l.words || [])]);
    this.wa = this.lineWords.map((ws) => this._buildWordAlign(ws));
    this.nwords = lines.map((l) => Math.max(1, (l.words || []).length));
    this.verseIds = lines.map((l) => l.verseId);
    this.isRahao = this.lineText.map((t) => t.includes('ਰਹਾਉ'));

    this.win = Math.floor(c.windowS * SR);
    this.hop = Math.floor(c.hopS * SR);

    const L = lines.length;
    this.buf = new Float32Array(0);
    this.acc = 0;
    this.score = new Float64Array(L);
    this.cur = null;
    this.challenger = null;
    this.dwell = 0;
    this.initCand = null;
    this.initCount = 0;
    this.miss = 0;
    this.visited = new Set();
    this.wiLine = null;
    this.maxWi = -1;
  }

  _greedy(emis) { return this.infer.greedy(emis); }

  _buildWordAlign(words) {
    const wtok = words.map((w) => this.sp.encode(w));
    const y = [], tw = [];
    wtok.forEach((tk, wi) => tk.forEach((tid) => { y.push(tid); tw.push(wi); }));
    const U = y.length;
    if (U === 0) return null;
    const S = 2 * U + 1;
    const ext = new Int32Array(S).fill(BLANK);
    for (let i = 0; i < U; i++) ext[2 * i + 1] = y[i];
    const allow2 = new Uint8Array(S);
    for (let s = 2; s < S; s++) allow2[s] = (ext[s] !== BLANK && ext[s] !== ext[s - 2]) ? 1 : 0;
    const s2w = new Int32Array(S);
    for (let s = 0; s < S; s++) {
      if (s % 2 === 1) s2w[s] = tw[(s - 1) / 2];
      else { const j = s / 2 - 1; s2w[s] = j >= 0 ? tw[j] : 0; }
    }
    return { ext, allow2, s2w };
  }

  // lp accessor: emis={data,frames,C}; lpAt(t,idx)=data[t*C+idx]
  _wordIndexCtc(emis, cur) {
    const wa = this.wa[cur];
    if (!wa) return -1;
    const { ext, allow2, s2w } = wa;
    const { data, frames, C } = emis;
    const S = ext.length;
    if (frames === 0 || S === 0) return -1;
    let a = new Float64Array(S);
    for (let s = 0; s < S; s++) a[s] = data[0 * C + ext[s]];   // free entry
    for (let t = 1; t < frames; t++) {
      const na = new Float64Array(S);
      const base = t * C;
      for (let s = 0; s < S; s++) {
        let m = a[s];
        if (s >= 1 && a[s - 1] > m) m = a[s - 1];
        if (allow2[s] && s >= 2 && a[s - 2] > m) m = a[s - 2];
        na[s] = data[base + ext[s]] + m;
      }
      a = na;
    }
    return s2w[argmax(a)];
  }

  _ctcScore(emis, y, tRange) {
    // prefix-free CTC forward log-lik of token seq y over recent frames, /T
    const { data, C } = emis;
    const [t0, t1] = tRange;   // [start, end)
    const T = t1 - t0, U = y.length;
    if (U === 0 || T === 0) return -50.0;
    const S = 2 * U + 1;
    const ext = new Int32Array(S).fill(BLANK);
    for (let i = 0; i < U; i++) ext[2 * i + 1] = y[i];
    const allow2 = new Uint8Array(S);
    for (let s = 2; s < S; s++) allow2[s] = (ext[s] !== BLANK && ext[s] !== ext[s - 2]) ? 1 : 0;
    let a = new Float64Array(S).fill(NEG);
    for (let s = 0; s < S; s++) a[s] = data[t0 * C + ext[s]];
    const lae = (x, y2) => { const m = Math.max(x, y2); return m === -Infinity ? m : m + Math.log(Math.exp(x - m) + Math.exp(y2 - m)); };
    for (let ti = 1; ti < T; ti++) {
      const na = new Float64Array(S);
      const base = (t0 + ti) * C;
      for (let s = 0; s < S; s++) {
        let v = a[s];
        const s1 = s >= 1 ? a[s - 1] : NEG;
        const s2 = (allow2[s] && s >= 2) ? a[s - 2] : NEG;
        na[s] = data[base + ext[s]] + lae(lae(v, s1), s2);
      }
      a = na;
    }
    let m = -Infinity; for (const v of a) if (v > m) m = v;
    let sum = 0; for (const v of a) sum += Math.exp(v - m);
    return (m + Math.log(sum)) / T;
  }

  _viterbi(emis) {
    const c = this.c;
    const L = this.linesNorm.length;
    const prev = new Float64Array(L);
    for (let l = 0; l < L; l++) prev[l] = this.score[l] * c.decay;
    let pmax = -Infinity; for (const v of prev) if (v > pmax) pmax = v;
    const jumpBase = pmax - c.jumpCost;
    const nw = new Float64Array(L);
    for (let l = 0; l < L; l++) {
      let best = prev[l];
      for (let d = 1; d <= c.skipSpan; d++) if (l - d >= 0) best = Math.max(best, prev[l - d] - c.advCost * d);
      for (let d = 1; d <= c.backSpan; d++) if (l + d < L) best = Math.max(best, prev[l + d] - c.backCost * d);
      let j = jumpBase;
      if (this.isRahao[l]) j += c.rahaoBonus;
      if (this.visited.has(l)) j += c.revisitBonus;
      best = Math.max(best, j);
      nw[l] = emis[l] + best;
    }
    let nmax = -Infinity; for (const v of nw) if (v > nmax) nmax = v;
    for (let l = 0; l < L; l++) nw[l] -= nmax;
    this.score = nw;
    return argmax(nw);
  }

  _freeze() {
    this.miss += 1;
    this.initCand = null; this.initCount = 0;
    if (this.c.release && this.miss >= this.c.release && this.cur !== null) {
      this.cur = null; this.challenger = null; this.dwell = 0;
      this.score = new Float64Array(this.linesNorm.length);
      return { verseIndex: -1, verseId: null, wordIndex: -1, lineIndex: null, confidence: 0.0 };
    }
    return null;
  }

  async push(pcm) {
    const c = this.c;
    const res = resampleTo16k(pcm, this.inputSr);
    if (res.length) {
      let merged = new Float32Array(this.buf.length + res.length);
      merged.set(this.buf, 0); merged.set(res, this.buf.length);
      if (merged.length > this.win) merged = merged.slice(merged.length - this.win);
      this.buf = merged;
      this.acc += res.length;
    }
    if (this.acc < this.hop || this.buf.length < SR) return null;
    this.acc = 0;

    const emis0 = await this.infer.emissions(this.buf);
    const hyp = norm(this.infer.decode(this._greedy(emis0)));
    if (hyp.length < c.minHyp) return this._freeze();

    const emis = this.linesNorm.map((ln) => (ln ? partialRatio(hyp, ln) / 100.0 : 0.0));
    let emax = -Infinity; for (const v of emis) if (v > emax) emax = v;
    if (emax < c.guard) return this._freeze();
    if (c.marginGate > 0 && emis.length >= 2) {
      const sorted = [...emis].sort((a, b) => a - b);
      if (sorted[sorted.length - 1] - sorted[sorted.length - 2] < c.marginGate) return this._freeze();
    }
    if (c.acousticGate > 0) {
      const stride = (this.buf.length / SR) / Math.max(1, emis0.frames);
      const af = Math.max(1, Math.floor(c.acousticWin / stride));
      const t0 = Math.max(0, emis0.frames - af);
      const idx = emis.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, c.acousticTopm).map((x) => x[1]);
      const top1 = idx[0];
      const acs = {};
      for (const ci of idx) {
        const yk = this.linesTok[ci];
        const lc = this.linesNorm[ci].length;
        const frac = lc === 0 ? 1.0 : Math.min(1.0, hyp.length / lc);
        const kk = Math.max(1, Math.round(frac * yk.length));
        acs[ci] = this._ctcScore(emis0, yk.slice(0, kk), [t0, emis0.frames]);
      }
      let bestAc = idx[0]; for (const ci of idx) if (acs[ci] > acs[bestAc]) bestAc = ci;
      const vals = Object.values(acs).sort((a, b) => a - b);
      const med = vals[Math.floor((vals.length - 1) / 2)] * 0.5 + vals[Math.ceil((vals.length - 1) / 2)] * 0.5;
      if (bestAc !== top1 || (acs[top1] - med) < c.acousticGate) return this._freeze();
    }

    this.miss = 0;
    const top = this._viterbi(emis);
    if (c.onTrace) c.onTrace({ hyp, top, cur: this.cur, emisTop: emis[top], emisCur: this.cur == null ? null : emis[this.cur], scoreTop: this.score[top], scoreCur: this.cur == null ? null : this.score[this.cur], dwell: this.dwell, challenger: this.challenger });

    if (this.cur === null) {
      if (top === this.initCand) this.initCount += 1;
      else { this.initCand = top; this.initCount = 1; }
      if (this.initCount >= c.initConfirm) { this.cur = top; this.initCand = null; this.initCount = 0; }
      else return null;
    } else if (top === this.cur) {
      this.challenger = null; this.dwell = 0;
    } else {
      if (top === this.challenger) this.dwell += 1;
      else { this.challenger = top; this.dwell = 1; }
      const d = top - this.cur;
      let need;
      if (d === 1) need = c.dwellAdv;
      else if (d >= 2 && d <= c.skipSpan) need = c.dwellSkip == null ? c.dwellAdv : c.dwellSkip;
      else if (d >= -c.backSpan && d <= -1) need = c.dwellBack;
      else need = c.dwell;
      const evid = d === 1 || ((c.jumpEmisGap <= 0 || emis[top] - emis[this.cur] >= c.jumpEmisGap) && hyp.length >= c.minHypJump);
      if (evid && this.dwell >= need && this.score[top] >= this.score[this.cur] + c.margin) {
        this.cur = top; this.challenger = null; this.dwell = 0;
      }
    }
    this.visited.add(this.cur);

    const cur = this.cur;
    const conf = Math.max(0.0, Math.min(1.0, emis[cur]));

    let wi = this._wordIndexCtc(emis0, cur);
    if (wi < 0) {
      const ln = this.linesNorm[cur];
      if (ln) {
        const al = partialRatioAlignment(hyp, ln);
        if (al && ln.length > 0) {
          const frac = al.destEnd / ln.length;
          wi = Math.min(this.nwords[cur] - 1, Math.max(0, Math.floor(frac * this.nwords[cur])));
        }
      }
    }
    if (cur !== this.wiLine) { this.wiLine = cur; this.maxWi = -1; }
    if (wi >= 0) this.maxWi = Math.max(this.maxWi, wi);
    wi = this.maxWi;

    return {
      verseIndex: cur,
      verseId: this.verseIds[cur],
      wordIndex: wi,
      lineIndex: cur,
      confidence: Number(conf.toFixed(3)),
    };
  }
}

module.exports = { Follower, DEFAULTS };
