// JS port of karansea_recognize.py KaranseaRecognizer.
const { resampleTo16k, norm, SR } = require('./infer');

class Recognizer {
  constructor(infer, { inputSr = 48000, windowS = 10.0, hopS = 0.6, minHyp = 2 } = {}) {
    this.infer = infer;
    this.inputSr = inputSr;
    this.win = Math.floor(windowS * SR);
    this.hop = Math.floor(hopS * SR);
    this.minHyp = minHyp;
    this.buf = new Float32Array(0);
    this.acc = 0;
  }

  async push(pcm) {
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

    const emis = await this.infer.emissions(this.buf);
    const hyp = this.infer.decode(this.infer.greedy(emis));
    if (norm(hyp).length < this.minHyp) return null;
    return {
      text: hyp,
      confidence: Number(this.infer.confidence(emis).toFixed(3)),
      audioSec: Number((this.buf.length / SR).toFixed(1)),
    };
  }
}

module.exports = { Recognizer };
