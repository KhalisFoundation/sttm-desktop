#!/usr/bin/env node
/* renton-bench.js — run the real VoiceFollow component headless over tonight's Renton parts
 * (rt11_*.wav, fresh Start at clip t=0) and save every screen event. Score with renton-score.js.
 * Usage: node -r ./no-shadow-preload.js renton-bench.js --out <dir> [--only rt11_rehras,...] [--fast]
 */
const fs = require('fs');
const path = require('path');
const { createDriver } = require(path.join(__dirname, 'bench-driver'));
const CLIPS = process.env.VF_CLIPS || '/Users/asingh02/personal/live-darbar-venues/clips';
const MODEL = require('./speech-pack').speechModel().onnx;
const USERDATA = process.env.VF_BANIDB_USER_DATA || path.join(process.env.HOME, 'Library/Application Support/SikhiToTheMax');
const SR = 16000, CHUNK = 2048;
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const PARTS = ['rt11_rehras', 'rt11_aarti', 'rt11_sohila', 'rt11_hukamnama', 'rt11_kirtan1', 'rt11_fareed1', 'rt11_fareed2'];
const ONLY = arg('only', '') ? new Set(arg('only', '').split(',')) : null;
const FAST = process.argv.includes('--fast');
const OUT = arg('out'); fs.mkdirSync(OUT, { recursive: true });
function readWav(file) {
  const b = fs.readFileSync(file); let off = 12;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4);
    if (id === 'data') { const n = Math.floor(sz / 2), out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = b.readInt16LE(off + 8 + i * 2) / 32768; return out; }
    off += 8 + sz + (sz & 1);
  }
  throw new Error('no data chunk');
}
(async () => {
  for (const part of PARTS) {
    if (ONLY && !ONLY.has(part)) continue;
    const pcm = readWav(path.join(CLIPS, `${part}.wav`));
    const events = []; const t0 = Date.now();
    const driver = await createDriver({ model: MODEL, userData: USERDATA, cacheId: part, onEvent: (ev) => {
      if (['shabad', 'seeking', 'verse', 'length', 'pane', 'component-error'].includes(ev.type)) events.push({ t: ev.t, type: ev.type, shabadId: ev.shabadId, verseId: ev.verseId, visible: ev.visible, length: ev.length, message: ev.message });
    } });
    await driver.start();
    const wall0 = Date.now();
    for (let p = 0; p < pcm.length; p += CHUNK) {
      const chunk = pcm.subarray(p, Math.min(p + CHUNK, pcm.length));
      const audioT = (p + chunk.length) / SR;
      await driver.push(chunk, audioT);
      if (!FAST) { const ahead = audioT * 1000 - (Date.now() - wall0); if (ahead > 2) await new Promise((r) => setTimeout(r, ahead)); }
    }
    await driver.stop();
    fs.writeFileSync(path.join(OUT, `${part}.json`), JSON.stringify({ part, dur: pcm.length / SR, wall_s: (Date.now() - t0) / 1000, events }, null, 0));
    const sh = events.filter((e) => e.type === 'shabad').map((e) => `${e.shabadId}@${e.t.toFixed(1)}`);
    console.log(`${part} | ${((Date.now() - t0) / 1000).toFixed(0)} s wall | verses ${events.filter((e) => e.type === 'verse').length} | errors ${events.filter((e) => e.type === 'component-error').length} | shown ${sh.slice(0, 10).join(' ')}`);
  }
})().catch((e) => { console.error(e.stack); process.exit(1); });
