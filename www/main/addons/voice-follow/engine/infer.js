// Shared karansea CTC inference core (JS port of the numpy bits).
const ort = require('onnxruntime-node');
const VOCAB = require('./assets/vocab'); // id -> piece

const SR = 16000;
const BLANK = 256;

// strip whitespace, dandas, Gurmukhi/ASCII digits, punctuation (matches _STRIP)
const STRIP = /[\s।॥|0-9੦-੯.,;:!?\-]+/g;
const norm = (s) => (s || '').replace(STRIP, '');

function resampleTo16k(pcm, inSr) {
  if (inSr === SR) return pcm;
  const n = Math.round((pcm.length * SR) / inSr);
  if (n <= 0) return new Float32Array(0);
  const out = new Float32Array(n);
  const last = pcm.length - 1;
  for (let k = 0; k < n; k++) {
    const x = (k * pcm.length) / n;      // linspace(0,len,n,endpoint=False)
    if (x <= 0) { out[k] = pcm[0]; continue; }
    if (x >= last) { out[k] = pcm[last]; continue; }
    const i0 = Math.floor(x);
    const frac = x - i0;
    out[k] = pcm[i0] * (1 - frac) + pcm[i0 + 1] * frac;
  }
  return out;
}

class Infer {
  constructor(sess, vocab) { this.sess = sess; this.vocab = vocab; }

  static async create(modelPath, vocab = VOCAB) {
    const sess = await ort.InferenceSession.create(modelPath);
    return new Infer(sess, vocab);
  }

  // buf: Float32Array @16k -> {data:Float32Array flat, frames, C}
  async emissions(buf) {
    const feeds = {
      audio: new ort.Tensor('float32', buf, [1, buf.length]),
      audio_len: new ort.Tensor('int64', BigInt64Array.from([BigInt(buf.length)]), [1]),
    };
    const out = await this.sess.run(feeds);
    const lp = out.log_probs;
    const [, , C] = lp.dims;
    const frames = Number(out.out_len.data[0]);
    return { data: lp.data, frames, C };
  }

  greedy({ data, frames, C }) {
    const ids = [];
    let prev = -1;
    for (let t = 0; t < frames; t++) {
      let best = 0, bestv = -Infinity;
      const off = t * C;
      for (let c = 0; c < C; c++) {
        const v = data[off + c];
        if (v > bestv) { bestv = v; best = c; }
      }
      if (best !== prev && best !== BLANK) ids.push(best);
      prev = best;
    }
    return ids;
  }

  decode(ids) {
    let s = '';
    for (const id of ids) s += this.vocab[id];
    return s.replace(/▁/g, ' ').trim();
  }

  // mean over used frames of exp(max_c lp[t,c])  (matches Python conf)
  confidence({ data, frames, C }) {
    let sum = 0;
    for (let t = 0; t < frames; t++) {
      let m = -Infinity;
      const off = t * C;
      for (let c = 0; c < C; c++) if (data[off + c] > m) m = data[off + c];
      sum += Math.exp(m);
    }
    return frames ? sum / frames : 0;
  }
}

module.exports = { Infer, resampleTo16k, norm, SR, BLANK };
