// node memo-determinism.js <app root> <16 kHz mono wav> [model.onnx]
// Same 4 s / 10 s window through the app's Infer twice (fresh + repeated + interleaved): are outputs byte-identical?
const path = require('path');
const ROOT = process.argv[2];
const wav = process.argv[3];
const { Infer } = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/infer.js'));
const fs = require('fs');
(async () => {
  const model = process.argv[4] || path.join(require('os').homedir(), 'Library/Application Support/SikhiToTheMax/voice-follow/model.int8.onnx');
  const inf = await Infer.create(model);
  inf.memo = null; // always run the model
  const b = fs.readFileSync(wav); const dataOff = b.indexOf('data') + 8;
  const pcm16 = new Int16Array(b.buffer.slice(b.byteOffset + dataOff, b.byteOffset + b.length - ((b.length - dataOff) % 2)));
  const sr = b.readUInt32LE(24);
  if (sr !== 16000) throw new Error('need 16k wav, got ' + sr);
  const win = (t, s) => Float32Array.from(pcm16.subarray(t * 16000, (t + s) * 16000), (v) => v / 32768);
  let same = 0, n = 0;
  for (let k = 0; k < 20; k++) {
    const a = win(30 + k * 7, k % 4 === 0 ? 10 : 4);
    const other = win(200 + k, 4);
    const o1 = await inf.emissions(a);
    const d1 = Buffer.from(o1.data.buffer.slice(0)).toString('base64');
    await inf.emissions(other);
    const o2 = await inf.emissions(a.slice(0));
    const d2 = Buffer.from(o2.data.buffer.slice(0)).toString('base64');
    n++; if (d1 === d2 && o1.frames === o2.frames) same++;
  }
  console.log(`identical outputs: ${same}/${n}`);
})();
