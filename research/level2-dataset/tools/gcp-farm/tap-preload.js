// GAB farm: records the exact audio stream each runner feeds the app (per clip / cache id), so
// farm-universe.js can enumerate every window an engine could ask for. Loaded with
// NODE_OPTIONS="--require <this>" next to a normal record/replay; changes nothing in the run.
// Env: VF_TAP_DIR (output dir), VF_TAP_DRIVER (path of bench-driver.js the runner loads).
const fs = require('fs');
const path = require('path');
const DIR = process.env.VF_TAP_DIR;
const DRV = process.env.VF_TAP_DRIVER;
if (DIR && DRV && fs.existsSync(DRV)) {
  const mod = require(path.resolve(DRV));
  const orig = mod.createDriver;
  mod.createDriver = async function tapped(opts = {}) {
    const d = await orig(opts);
    const id = opts.cacheId || process.env.VF_EMIS_ID || 'unknown';
    const sr = opts.sampleRate || 16000;
    const chunks = [];
    const marks = []; // {start: chunk index} for every start()/startManual()/startDetect...
    let total = 0;
    const flush = () => {
      fs.mkdirSync(DIR, { recursive: true });
      const fd = fs.openSync(path.join(DIR, `${id}.f32.tmp`), 'w');
      for (const c of chunks) fs.writeSync(fd, Buffer.from(c.buffer, c.byteOffset, c.byteLength));
      fs.closeSync(fd);
      fs.renameSync(path.join(DIR, `${id}.f32.tmp`), path.join(DIR, `${id}.f32`));
      fs.writeFileSync(path.join(DIR, `${id}.json`), JSON.stringify({ id, sr, samples: total, chunkLens: chunks.map((c) => c.length), marks }));
    };
    for (const k of Object.keys(d)) {
      if (typeof d[k] !== 'function') continue;
      if (/^(start|lock)/.test(k)) { const f = d[k]; d[k] = (...a) => { marks.push({ kind: k, chunk: chunks.length }); return f(...a); }; }
    }
    const push = d.push;
    d.push = (pcm, t) => { const c = Float32Array.from(pcm); chunks.push(c); total += c.length; return push(pcm, t); };
    const stop = d.stop;
    d.stop = async (...a) => { marks.push({ kind: 'stop', chunk: chunks.length }); try { return await stop(...a); } finally { flush(); } };
    process.on('exit', () => { try { if (!fs.existsSync(path.join(DIR, `${id}.json`))) flush(); } catch (_) { /* best effort */ } });
    return d;
  };
}
