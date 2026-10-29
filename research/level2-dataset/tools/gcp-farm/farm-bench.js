// farm-bench.js <app root> <model> <wav> : ORT throughput at VF_ORT_THREADS and bit-identity across thread counts
const path = require('path');
const [APP, MODEL, WAV] = process.argv.slice(2);
const fs = require('fs');
const crypto = require('crypto');
function readWav(file) { const b = fs.readFileSync(file); let off = 12; while (off + 8 <= b.length) { const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4); if (id === 'data') { const n = Math.floor(sz / 2), out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = b.readInt16LE(off + 8 + i * 2) / 32768; return out; } off += 8 + sz + (sz & 1); } }
(async () => {
  const ort = require(path.join(APP, 'node_modules/onnxruntime-node'));
  const { Infer } = require(path.join(APP, 'www/main/addons/voice-follow/engine/infer'));
  const VOCAB = require(path.join(APP, 'www/main/addons/voice-follow/engine/assets/vocab'));
  const pcm = readWav(WAV);
  const out = {};
  for (const th of (process.env.THREADS || '2,3').split(',').map(Number)) {
    const sess = await ort.InferenceSession.create(MODEL, { intraOpNumThreads: th, interOpNumThreads: 1 });
    const inf = new Infer(sess, VOCAB); inf.memo = null;
    const hashes = [];
    let t0 = Date.now(); let inS = 0;
    for (const L of [64000, 160000, 16384, 40960]) for (let k = 0; k < 8; k++) {
      const e = 200000 + k * 8192; const buf = pcm.slice(e - L, e);
      const o = await inf.emissions(buf); inS += L / 16000;
      hashes.push(crypto.createHash('sha1').update(Buffer.from(o.data.buffer, o.data.byteOffset, o.data.byteLength)).digest('hex').slice(0, 10));
    }
    const s = (Date.now() - t0) / 1000;
    out[th] = hashes;
    console.log(`threads ${th}: ${inS.toFixed(0)} s input in ${s.toFixed(1)} s = ${(inS / s).toFixed(1)} input-s/s`);
    await sess.release();
  }
  const ks = Object.keys(out);
  if (ks.length > 1) console.log('bit-identical across thread counts:', out[ks[0]].every((h, i) => ks.every((k) => out[k][i] === h)), out[ks[0]].filter((h, i) => out[ks[1]][i] !== h).length, 'differ');
})();
