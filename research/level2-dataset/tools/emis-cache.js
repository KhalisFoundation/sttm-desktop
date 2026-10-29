// emis-cache.js — model-output cache for deterministic replay (see REPLAY.md).
//
// The seam is Infer.emissions(buf): one ONNX pass over one audio window -> CTC log-probs.
// The recognizer, both followers and the search-phase acoustic check all call it, so a
// cache here lets every line of decision code above it run for real.
//
// Key = sha1 of the window's exact float32 samples + its length. A window is the engine's
// whole input, so the key already covers the call type (recognizer / follower / follower2 /
// acoustic check), the window/hop config and the chunk phase: any change to those gives a
// different window and therefore a MISS, never a wrong hit. The model is pinned by its
// file hash in the directory name; a new model file = a new, empty cache.
//
// Layout: <root>/<model sha256[0:12]>-<codec>/<clip>/{emis.bin, index.jsonl, meta.json}
//   emis.bin     append-only records (deflate-raw of one encoded window)
//   index.jsonl  one line per record: {k, o, n, f, r, C}
//
// Codec 'q16' (default, ~half of f32 after deflate): per frame the exact argmax id (u16) and
// exact max log-prob (f32), and every log-prob as a u16 code: 1/1024-nat steps down to -60
// (abs error <= 0.0005), 1/4-nat steps below (essentially impossible tokens, relative error
// <= 0.2%). Decoding restores the exact max at the exact argmax and keeps every other value
// strictly below it, so greedy decoding (every transcript) and Infer.confidence are BIT-EXACT;
// only consumers of non-max log-probs see the rounding (the follower's word index CTC and the
// search-phase acoustic check's _ctcScore, both averages over frames). 'f32' = raw output.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const os = require('os');

const DEFAULT_ROOT = path.join(os.homedir(), 'personal/live-darbar-venues/cache');
// q16 code -> log-prob: fine steps of 1/1024 nat down to -60 (abs error <= 0.0005), then 1/4 nat
// steps down to -1083.75 (a token that is essentially impossible: abs error <= 0.125, relative
// <= 0.2%). Clamping at a small floor would change _ctcScore for lines whose tokens were never heard.
const Q = 1024;
const FINE = 61440; // codes [0, FINE) = fine region, -v * Q
const FINE_MIN = -FINE / Q; // -60
const COARSE = 4;
const toQ = (v) => {
  if (!(v < 0)) return 0; // v >= 0 (or NaN)
  if (v > FINE_MIN) return Math.min(FINE - 1, Math.round(-v * Q));
  return Math.min(65535, FINE + Math.round((FINE_MIN - v) * COARSE));
};
const fromQ = (q) => (q < FINE ? -q / Q : FINE_MIN - (q - FINE) / COARSE);

function windowKey(buf) {
  const h = crypto.createHash('sha1');
  h.update(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength));
  return `${h.digest('hex')}:${buf.length}`;
}

// sha256 of the model file, remembered by path+size+mtime (hashing 184 MB takes ~0.5 s).
function modelSha(modelPath, root = DEFAULT_ROOT) {
  const st = fs.statSync(modelPath);
  const real = fs.realpathSync(modelPath);
  const memo = path.join(root, 'model-sha.json');
  let m = {};
  try { m = JSON.parse(fs.readFileSync(memo, 'utf8')); } catch (_) { /* first use */ }
  const id = `${real}|${st.size}|${st.mtimeMs}`;
  if (m[id]) return m[id];
  const sha = crypto.createHash('sha256').update(fs.readFileSync(real)).digest('hex');
  m[id] = sha;
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(memo, JSON.stringify(m, null, 1));
  return sha;
}

function encode({ data, frames, C }, codec) {
  const rows = Math.floor(data.length / C);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(frames, 0); head.writeUInt32LE(rows, 4); head.writeUInt32LE(C, 8);
  if (codec === 'f32') {
    return Buffer.concat([head, Buffer.from(data.buffer, data.byteOffset, rows * C * 4)]);
  }
  const arg = new Uint16Array(rows);
  const mx = new Float32Array(rows);
  const q = new Uint16Array(rows * C);
  for (let t = 0; t < rows; t++) {
    const off = t * C;
    let best = 0;
    let bestv = -Infinity;
    for (let c = 0; c < C; c++) {
      const v = data[off + c];
      if (v > bestv) { bestv = v; best = c; } // same scan as Infer.greedy (first max wins)
      q[off + c] = toQ(v);
    }
    arg[t] = best;
    mx[t] = bestv;
  }
  return Buffer.concat([head, Buffer.from(arg.buffer), Buffer.from(mx.buffer), Buffer.from(q.buffer)]);
}

function decode(buf, codec) {
  const frames = buf.readUInt32LE(0);
  const rows = buf.readUInt32LE(4);
  const C = buf.readUInt32LE(8);
  // copy into fresh aligned memory
  const body = new Uint8Array(buf.length - 12);
  body.set(buf.subarray(12));
  if (codec === 'f32') return { data: new Float32Array(body.buffer, 0, rows * C), frames, C };
  // copies, not views: the f32 block starts at byte rows*2, which is not 4-aligned when rows is odd
  const arg = new Uint16Array(body.slice(0, rows * 2).buffer);
  const mx = new Float32Array(body.slice(rows * 2, rows * 6).buffer);
  const q = new Uint16Array(body.slice(rows * 6, rows * 6 + rows * C * 2).buffer);
  const data = new Float32Array(rows * C);
  for (let t = 0; t < rows; t++) {
    const off = t * C;
    const m = mx[t];
    const a = arg[t];
    // strictly below the max (f32), so the argmax and the first-max rule are preserved
    const below = Math.fround(m - Math.max(1e-6, Math.abs(m) * 1e-6));
    for (let c = 0; c < C; c++) {
      const v = fromQ(q[off + c]);
      data[off + c] = v >= below ? below : v;
    }
    data[off + a] = m;
  }
  return { data, frames, C };
}

class CacheMiss extends Error {
  constructor(key, clip) {
    super(`EMISSIONS CACHE MISS clip=${clip} window=${key} (replay never runs the model; rebuild with VF_EMIS_MODE=record under the bench lock)`);
    this.name = 'CacheMiss';
    this.key = key;
  }
}

// One clip's store. write=true appends new windows (record mode).
class Store {
  constructor(dir, { write = false, codec = 'q16' } = {}) {
    this.dir = dir;
    this.codec = codec;
    this.index = new Map();
    this.write = write;
    this.added = 0;
    const idx = path.join(dir, 'index.jsonl');
    const bin = path.join(dir, 'emis.bin');
    if (write) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(idx)) {
      let size = fs.existsSync(bin) ? fs.statSync(bin).size : 0;
      for (const line of fs.readFileSync(idx, 'utf8').split('\n')) {
        if (!line) continue;
        let e;
        try { e = JSON.parse(line); } catch (_) { continue; } // torn last line after a kill
        if (e.o + e.n <= size) this.index.set(e.k, e);
      }
      size = 0;
    }
    this.fd = fs.existsSync(bin) || write ? fs.openSync(bin, write ? 'a+' : 'r') : null;
    this.end = this.fd != null ? fs.fstatSync(this.fd).size : 0;
  }

  has(key) { return this.index.has(key); }

  get(key) {
    const e = this.index.get(key);
    if (!e) return null;
    const raw = Buffer.alloc(e.n);
    fs.readSync(this.fd, raw, 0, e.n, e.o);
    return decode(zlib.inflateRawSync(raw), this.codec);
  }

  put(key, emis) {
    if (!this.write) throw new Error('store is read-only');
    if (this.index.has(key)) return;
    const raw = zlib.deflateRawSync(encode(emis, this.codec), { level: 1 });
    const o = this.end;
    fs.writeSync(this.fd, raw, 0, raw.length, o);
    this.end += raw.length;
    const e = { k: key, o, n: raw.length, f: emis.frames, r: Math.floor(emis.data.length / emis.C), C: emis.C };
    fs.appendFileSync(path.join(this.dir, 'index.jsonl'), `${JSON.stringify(e)}\n`);
    this.index.set(key, e);
    this.added += 1;
  }

  close() { if (this.fd != null) fs.closeSync(this.fd); this.fd = null; }
}

function storeDir({ root = DEFAULT_ROOT, model, codec = 'q16', clip }) {
  return path.join(root, `${modelSha(model, root).slice(0, 12)}-${codec}`, clip);
}

module.exports = { windowKey, modelSha, encode, decode, Store, CacheMiss, storeDir, DEFAULT_ROOT };

// CLI: node emis-cache.js transcode <cache root> <model sha12> <from codec> <to codec> [clip ...]
//      node emis-cache.js stats <cache root>
if (require.main === module) {
  const [cmd, root, ...rest] = process.argv.slice(2);
  if (cmd === 'transcode') {
    const [sha, from, to, ...clips] = rest;
    const src = path.join(root, `${sha}-${from}`);
    for (const clip of clips.length ? clips : fs.readdirSync(src)) {
      const a = new Store(path.join(src, clip), { codec: from });
      const b = new Store(path.join(root, `${sha}-${to}`, clip), { write: true, codec: to });
      for (const k of a.index.keys()) b.put(k, a.get(k));
      console.log(`${clip}: ${a.index.size} windows -> ${b.added} new (${to})`);
      a.close();
      b.close();
    }
  } else if (cmd === 'stats') {
    for (const d of fs.readdirSync(root).filter((x) => /^[0-9a-f]{12}-/.test(x))) {
      let n = 0;
      let bytes = 0;
      let clips = 0;
      for (const clip of fs.readdirSync(path.join(root, d))) {
        const idx = path.join(root, d, clip, 'index.jsonl');
        if (!fs.existsSync(idx)) continue;
        clips += 1;
        n += fs.readFileSync(idx, 'utf8').split('\n').filter(Boolean).length;
        bytes += fs.statSync(path.join(root, d, clip, 'emis.bin')).size;
      }
      console.log(`${d}: ${clips} clips, ${n} windows, ${(bytes / 1e6).toFixed(1)} MB`);
    }
  } else console.log('usage: emis-cache.js transcode <root> <sha12> <from> <to> [clip...] | stats <root>');
}
