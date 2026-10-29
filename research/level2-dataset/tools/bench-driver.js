// bench-driver.js — Fable's benchmark driver, derived from test/voice-follow/component-driver.js
// with a FIDELITY FIX (recognizer/follower objects exposed as in production).
// Headless diagnostic driver for the actual VoiceFollow component. The component,
// full Realm search, ONNX recognizer, follower and decision policy run unchanged.
// Only React rendering, Electron path lookup, and microphone hardware are mocked.
// A test-only bridge is inserted in memory; nothing is added to the shipped UI.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const babel = require('@babel/core');
const DRIVER_SHA256 = require('crypto')
  .createHash('sha256')
  .update(fs.readFileSync(__filename))
  .digest('hex');

// App code under test: VF_DRIVER_ROOT (a worktree) or this worktree. The harness (this file,
// runners, scorers, truth) stays fixed, so base and candidate run under the same harness.
const ROOT = process.env.VF_DRIVER_ROOT
  ? path.resolve(process.env.VF_DRIVER_ROOT)
  : path.resolve(__dirname, '../../..');
// Cached deterministic replay (REPLAY.md): VF_EMIS_CACHE=<cache root> turns it on.
//   VF_EMIS_MODE=replay (default)  every model pass is served from the cache; a miss is a hard error
//   VF_EMIS_MODE=record            the real model runs for windows not yet cached and stores them
// Either way the run is DETERMINISTIC: every decision completes before the next chunk, model
// results return in call order after all other pending work (as when a pass takes ~50-100 ms),
// and the component's Date follows the audio clock.
const EMIS_CACHE = process.env.VF_EMIS_CACHE || '';
const EMIS_MODE = process.env.VF_EMIS_MODE || 'replay';
const DETERMINISTIC = !!EMIS_CACHE || process.env.VF_DETERMINISTIC === '1';
const DATE0 = Date.UTC(2026, 0, 1);
// Simulated slow PC (SIM-SLOWPC.md): VF_SIM_PASS_MS=<ms per 4 s model pass> (with VF_EMIS_CACHE).
// The component, the engines and engine/pace run on a virtual clock owned by this driver: the
// microphone delivers at real-time pace on it, each model pass costs VF_SIM_PASS_MS x window/4 s
// of it (VF_SIM_SCALE=0: flat), VF_SIM_JS_MS is charged after each engine decode, and
// everything else (audio queue + backlog bound, tier self-test and live stepping, followers)
// runs unmodified. VF_SIM_MODEL=serial makes concurrent passes queue (default: each pass costs
// its own time, as the VM's padded engine did). VF_EMIS_MODE=record fills missing windows with
// the real model into a separate overlay store (<cache>/sim/...), never into the shared cache.
const SIM = process.env.VF_SIM_PASS_MS
  ? {
      passMs: Number(process.env.VF_SIM_PASS_MS),
      scale: process.env.VF_SIM_SCALE !== '0',
      jsMs: Number(process.env.VF_SIM_JS_MS || 0),
      serial: process.env.VF_SIM_MODEL === 'serial',
    }
  : null;
const COMPONENT = path.join(ROOT, 'www/main/addons/voice-follow/components/VoiceFollow.jsx');

// Deterministic mode only: build the canonical corpus index once per process (the TextIndex is
// read-only after construction) and keep its rows on disk, keyed by the Realm file + reader
// source; compile the component once per source text. Saves ~20 s of start-up per clip.
const CORPUS = new Map();
function sharedCorpus(readCorpus, TextIndex, userData, retainRealm) {
  const realmFile = path.join(userData, 'sttmdesktop-evergreen-v2.realm');
  const st = fs.statSync(realmFile);
  const src = fs.readFileSync(path.join(ROOT, 'test/voice-follow/canonical-corpus.js'), 'utf8');
  const memo = `${ROOT}|${userData}`;
  if (!CORPUS.has(memo)) {
    const key = require('crypto').createHash('sha1').update(`${realmFile}|${st.size}|${st.mtimeMs}|${src}`).digest('hex').slice(0, 16);
    const file = path.join(EMIS_CACHE || require('os').tmpdir(), 'corpus', `${key}.json`);
    CORPUS.set(memo, (async () => {
      let rows;
      if (fs.existsSync(file)) rows = JSON.parse(fs.readFileSync(file, 'utf8'));
      else {
        rows = await readCorpus(userData, { retainRealm });
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(`${file}.${process.pid}`, JSON.stringify(rows));
        fs.renameSync(`${file}.${process.pid}`, file);
      }
      return { rows, index: new TextIndex(rows) };
    })());
  }
  return CORPUS.get(memo);
}
function compileCached(code, file, transform) {
  if (!DETERMINISTIC) return transform();
  const key = require('crypto').createHash('sha1').update(`${require('@babel/core').version}|${file}|${code}`).digest('hex');
  const f = path.join(EMIS_CACHE || require('os').tmpdir(), 'babel', `${key}.js`);
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  const out = transform();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(`${f}.${process.pid}`, out);
  fs.renameSync(`${f}.${process.pid}`, f);
  return out;
}

async function createDriver({
  model,
  userData,
  sampleRate = 16000,
  onEvent = () => {},
  source,
  engineOverride,
  initialNavigator = {},
  onState = () => {},
  audioHooks = {},
  databaseHooks = {},
  retrievalHooks = {},
  eventClock,
  traceRecognizerInputs = false,
  cacheId = process.env.VF_EMIS_ID || '',
} = {}) {
  // Simulated slow PC: the virtual clock, and the host's Date / performance.now on it. engine/
  // infer.js and engine/pace.js are plain Node modules (outside the vm context) and read
  // Date.now() / performance.now() to time passes, run the self-test and step tiers, so the
  // host globals themselves must follow the virtual clock (restored by stop()).
  let sim = null;
  const realClock = { Date, ownNow: Object.prototype.hasOwnProperty.call(performance, 'now') ? performance.now : null };
  const restoreClock = () => {
    if (!sim) return;
    globalThis.Date = realClock.Date;
    if (realClock.ownNow) Object.defineProperty(performance, 'now', { value: realClock.ownNow, configurable: true, writable: true });
    else delete performance.now;
  };
  let SimDate = null;
  if (SIM) {
    if (!EMIS_CACHE || engineOverride) throw new Error('VF_SIM_PASS_MS needs the emissions cache (VF_EMIS_CACHE)');
    if (!(SIM.passMs > 0)) throw new Error('VF_SIM_PASS_MS must be > 0');
    const { SimClock } = require(path.join(__dirname, 'sim-clock'));
    // eslint-disable-next-line no-use-before-define
    sim = new SimClock({ idle: () => simIdle(), check: () => simCheck() });
    const RealDate = Date;
    SimDate = class extends RealDate {
      constructor(...a) {
        if (a.length) super(...a);
        else super(Math.floor(DATE0 + sim.t));
      }

      static now() {
        return Math.floor(DATE0 + sim.t);
      }
    };
    globalThis.Date = SimDate;
    // (a plain assignment is silently ignored by Node's Performance object)
    Object.defineProperty(performance, 'now', { value: () => sim.t, configurable: true, writable: true });
    if (performance.now() !== sim.t) throw new Error('sim: could not virtualize performance.now');
    if (process.env.VF_SIM_DEBUG) {
      setInterval(() => console.error(`[sim] t ${(sim.t / 1000).toFixed(2)} s, events fired ${sim.fired}, queued ${sim.heap.length}, io ${ioPending.size}, model ${realPending.size}, decisions ${pending.size}`), 5000).unref();
    }
  }
  const { Infer, norm } = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/infer'));
  const { Recognizer } = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/recognizer'));
  const { Follower } = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/follower'));
  const { SP } = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/sentencepiece'));
  const { partialRatio } = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/fuzz'));
  // Thread cap: ORT defaults intraOp threads to all cores; several benchmark
  // processes then oversubscribe the machine. VF_ORT_THREADS (default 4) caps it.
  const realInfer = async () => {
    const ort = require(path.join(ROOT, 'node_modules/onnxruntime-node'));
    const VOCAB = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/assets/vocab'));
    const n = parseInt(process.env.VF_ORT_THREADS || '4', 10);
    const sess = await ort.InferenceSession.create(model, { intraOpNumThreads: n, interOpNumThreads: 1 });
    return new Infer(sess, VOCAB);
  };
  let cache = null;
  let infer = null;
  if (!engineOverride && EMIS_CACHE) {
    if (!cacheId) throw new Error('VF_EMIS_CACHE needs a clip id (createDriver cacheId / VF_EMIS_ID)');
    const { Store, storeDir, windowKey, CacheMiss } = require(path.join(__dirname, 'emis-cache'));
    const codec = process.env.VF_EMIS_CODEC || 'q16';
    const dir = storeDir({ root: EMIS_CACHE, model, codec, clip: cacheId });
    const store = new Store(dir, { write: EMIS_MODE === 'record' && !SIM, codec });
    const VOCAB = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/assets/vocab'));
    infer = new Infer(null, VOCAB);
    const real = EMIS_MODE === 'record' ? await realInfer() : null;
    cache = { store, dir, hits: 0, misses: 0, recorded: 0, missErrors: [], real };
    if (SIM) {
      // Windows the awaited cache never saw (decodes moved by merged pushes, tier hops and
      // windows) live in an overlay store; record mode fills it with the real model.
      const simDir = storeDir({ root: path.join(EMIS_CACHE, 'sim'), model, codec, clip: cacheId });
      cache.overlay = new Store(simDir, { write: EMIS_MODE === 'record', codec });
      cache.simDir = simDir;
      cache.selfTest = 0;
      const passes = { n: 0, costMs: 0, calls: 0, free: 0 };
      cache.passes = passes;
      // One model pass, in the build's own seam: Infer.run when the build has it (the tiers'
      // emissions() = memo + pass timing for engine/pace, which must run unmodified), else
      // Infer.emissions. A real pass in record mode goes through run() too, so the real
      // machine's timing never reaches pace.
      const pass = async (buf) => {
        const t0 = sim.t;
        const key = windowKey(buf);
        let out = store.get(key) || cache.overlay.get(key);
        if (out) cache.hits += 1;
        else if (simSelfTest) {
          // the self-test's noise windows: only their (virtual) time matters
          cache.selfTest += 1;
          const frames = Math.max(1, Math.floor(buf.length / 640));
          const C = VOCAB.length + 1;
          out = { data: new Float32Array(frames * C).fill(-30), frames, C };
        } else if (real) {
          const job = (real.run ? real.run(buf) : real.emissions(buf)).then((o) => {
            cache.overlay.put(key, o);
            return cache.overlay.get(key); // what a replay will be served (codec round trip)
          });
          realPending.add(job);
          try {
            out = await job;
          } finally {
            realPending.delete(job);
          }
          cache.recorded += 1;
        } else {
          cache.misses += 1;
          const err = new CacheMiss(key, cacheId);
          cache.missErrors.push(err);
          throw err;
        }
        const cost = SIM.passMs * (SIM.scale ? buf.length / (4 * 16000) : 1);
        let start = t0;
        if (SIM.serial) {
          start = Math.max(t0, passes.free);
          passes.free = start + cost;
        }
        passes.n += 1;
        passes.costMs += cost;
        await sim.until(start + cost);
        return out;
      };
      if (typeof Infer.prototype.run === 'function') {
        infer.run = pass;
        const appEmissions = infer.emissions.bind(infer);
        infer.emissions = (buf) => {
          passes.calls += 1;
          return appEmissions(buf);
        };
      } else {
        infer.emissions = (buf) => {
          passes.calls += 1;
          return pass(buf);
        };
      }
    }
    // FIFO: results come back in call order in both modes (ORT may finish two concurrent
    // passes in either order; the app's outcome must not depend on that here).
    let fifo = Promise.resolve();
    if (!SIM) infer.emissions = (buf) => {
      const key = windowKey(buf);
      const job = fifo.then(async () => {
        let out = store.get(key);
        if (out) cache.hits += 1;
        else if (real) {
          out = await real.emissions(buf); // the true f32 output: a record run is a real run
          store.put(key, out);
          cache.recorded += 1;
        } else {
          cache.misses += 1;
          const err = new CacheMiss(key, cacheId);
          cache.missErrors.push(err);
          throw err;
        }
        await quiesce();
        return out;
      }).catch((e) => {
        // The component swallows per-chunk errors; a broken model pass must still stop the run.
        if (!cache.missErrors.includes(e)) cache.missErrors.push(e);
        throw e;
      });
      fifo = job.catch(() => {});
      return job;
    };
  } else if (!engineOverride) infer = await realInfer();
  const sp = SP.load();
  const modules = new Map();
  const realmHandles = new Set();
  const pending = new Set();
  const ioPending = new Set(); // database / retrieval work only (what a model pass waits behind)
  const realPending = new Set(); // simulated slow PC: real model passes being recorded
  const simStats = { consumed: 0, selfTest: null, pace: null };
  let simSelfTest = false;
  // Simulated slow PC: the clock moves only once every piece of real asynchronous work
  // (database, retrieval, a recorded pass) has finished: two quiet turns of the event loop.
  async function simIdle() {
    let quiet = 0;
    for (let i = 0; i < 100000; i += 1) {
      await new Promise(setImmediate);
      if (ioPending.size || realPending.size) {
        quiet = 0;
        const all = Promise.allSettled([...ioPending, ...realPending]);
        if (process.env.VF_SIM_DEBUG) {
          let timer;
          const slow = new Promise((r) => { timer = setTimeout(() => r('slow'), 10000); });
          if ((await Promise.race([all, slow])) === 'slow') console.error(`[sim] waiting on real work at ${(sim.t / 1000).toFixed(2)} s: io ${ioPending.size} model ${realPending.size}`, [...ioPending].map((x) => x.label || '?'));
          clearTimeout(timer);
        }
        await all;
      } else if (++quiet >= 2) return;
    }
    throw new Error('sim: real work never settled');
  }
  // A cache miss stops the run at once (the component swallows per-chunk errors).
  function simCheck() {
    if (cache && cache.missErrors.length) throw cache.missErrors[0];
  }
  let bridge;
  let port;
  let now = 0;
  const errors = [];
  const traceFile = process.env.VF_EVENT_TRACE && cacheId
    ? path.join(process.env.VF_EVENT_TRACE, `${cacheId}.events.jsonl`)
    : null;
  const traceLines = [];
  const flushTrace = () => {
    if (!traceFile) return;
    fs.mkdirSync(path.dirname(traceFile), { recursive: true });
    fs.writeFileSync(traceFile, traceLines.length ? `${traceLines.join('\n')}\n` : '');
  };
  const emit = (type, fields = {}) => {
    const ev = { t: eventClock ? eventClock() : now, type, ...fields };
    if (traceFile) {
      // wall-clock fields are never compared
      const { inferenceMs, stack, ...keep } = ev;
      traceLines.push(JSON.stringify(keep));
    }
    return onEvent(ev);
  };
  const track = (p, io = true) => {
    pending.add(p);
    if (io) ioPending.add(p);
    p.then(
      () => {
        pending.delete(p);
        ioPending.delete(p);
      },
      (e) => {
        pending.delete(p);
        ioPending.delete(p);
        errors.push(e);
        emit('component-error', { message: String(e), stack: e.stack });
      },
    );
    return p;
  };
  // Deterministic mode bookkeeping for calls the component handles itself (a rejection is the
  // component's business, as before): tracked for settle()/quiesce(), never reported.
  const trackQuiet = (p) => {
    const q = Promise.resolve(p).then(() => {}, () => {});
    pending.add(q);
    ioPending.add(q);
    q.then(() => {
      pending.delete(q);
      ioPending.delete(q);
    });
    return p;
  };
  // Deterministic mode: a model pass returns only once every other piece of pending
  // database/retrieval work has finished (as on a real machine, where a pass takes
  // 50-100 ms and that work a few ms), so interleavings never depend on timing.
  async function quiesce() {
    for (let i = 0; i < 50; i += 1) {
      await new Promise(setImmediate);
      if (!ioPending.size) return;
      await Promise.allSettled([...ioPending]);
    }
  }
  const actions = {
    userSettings: { setBaniLength: (length) => emit('length', { length }) },
    navigator: {
      setActiveVerseId: (verseId) => emit('verse', { verseId }),
      setLineNumber: () => {},
      setIsMiscSlide: (visible) => {
        if (bridge) bridge.isMiscSlideRef.current = visible;
        emit('seeking', { visible });
      },
      setMiscSlideText: () => {},
      // Bani follow opens a Bani the way Sundar Gutka does; record it as content
      // 'bani:<id>' so every scoring tool treats it like any shown shabad.
      setIsSundarGutkaBani: () => {},
      setIsCeremonyBani: () => {},
      setSingleDisplayActiveTab: () => {},
      setSundarGutkaBaniId: (baniId) => emit('shabad', { shabadId: `bani:${baniId}` }),
    },
    app: { setOverlayScreen: () => {} },
  };
  const state = { navigator: initialNavigator, userSettings: { baniLength: process.env.VF_TEST_BANI_LENGTH || 'short' } };
  const react = {
    useState: (value) => [value, onState],
    useRef: (value) => ({ current: value }),
    useCallback: (fn) => fn,
    useEffect: () => {},
    createElement: () => null,
  };
  let recognizerGeneration = 0;
  const nativeEngine = {
    norm,
    partialRatio,
    ready: async () => infer,
    isReady: () => true,
    createRecognizer: async (opts) => {
      const generation = ++recognizerGeneration;
      const recInfer = traceRecognizerInputs ? Object.create(infer) : infer;
      if (traceRecognizerInputs) {
        recInfer.emissions = (pcm) => {
          emit('recognizer-window', {
            generation,
            samples: pcm.length,
            floatPcmSha256: require('crypto')
              .createHash('sha256')
              .update(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength))
              .digest('hex'),
          });
          return infer.emissions(pcm);
        };
        emit('recognizer-created', { generation, ...opts });
      }
      const rec = new Recognizer(recInfer, opts);
      const wrapped = Object.create(rec); // fidelity: expose rec.buf / rec.infer like production
      wrapped.push = async (pcm) => {
        simStats.consumed += pcm.length;
        const before = performance.now();
        const out = await rec.push(pcm);
        if (out) emit('transcript', { ...out, inferenceMs: performance.now() - before });
        if (out && sim && SIM.jsMs > 0) await sim.sleep(SIM.jsMs);
        return out;
      };
      return wrapped;
    },
    createFollower: async (lines, opts) => {
      const fol = new Follower(infer, sp, lines, { ...opts, ...JSON.parse(process.env.VF_FOLLOWER_OPTS || '{}'), ...(process.env.VF_FTRACE ? { onTrace: (x) => emit('ftrace', x) } : {}) });
      const wrappedFol = Object.create(fol); // fidelity: keep Follower fields visible
      wrappedFol.push = async (pcm) => {
        const out = await fol.push(pcm);
        if (out) emit('follower', out);
        if (out && sim && SIM.jsMs > 0) await sim.sleep(SIM.jsMs);
        return out;
      };
      return wrappedFol;
    },
  };
  // Paath follower (Banis), when this build's engine has one: same construction as
  // engine.createPaathFollower.
  try {
    const { FollowerV2 } = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/follower2'));
    const NITNEM = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/assets/nitnem-lines'));
    nativeEngine.createPaathFollower = async (lines, opts = {}) => {
      const background = Object.entries(NITNEM)
        .filter(([id]) => Number(id) !== Number(opts.baniId))
        .flatMap(([, l]) => l);
      const fol = new FollowerV2(infer, lines, { background, ...opts });
      emit('paath-follower', { baniId: opts.baniId, lines: lines.length });
      const wrappedFol = Object.create(fol);
      wrappedFol.push = async (pcm) => {
        const out = await fol.push(pcm);
        if (out) emit('follower', out);
        if (out && sim && SIM.jsMs > 0) await sim.sleep(SIM.jsMs);
        return out;
      };
      return wrappedFol;
    };
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
  }
  const engine = engineOverride ? { norm, partialRatio, ...engineOverride } : nativeEngine;
  // Simulated slow PC: the build's performance tiers (engine/pace), when it has them, exactly as
  // engine/index.js ready() does: the self-test times its passes on the virtual clock.
  if (sim) {
    let pace = null;
    try {
      pace = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/pace'));
    } catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND') throw e;
    }
    if (pace) {
      if (pace.describe().selfTestMs != null) throw new Error('one simulated driver per process (engine/pace already self-tested)');
      simSelfTest = true;
      try {
        simStats.selfTest = await sim.runUntil(pace.selfTest(infer));
      } finally {
        simSelfTest = false;
      }
      nativeEngine.pace = pace;
      simStats.pace = pace;
    }
  }
  class AudioContext {
    constructor() {
      this.sampleRate = sampleRate;
      this.audioWorklet = { addModule: audioHooks.addModule || (async () => {}) };
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
    close() {
      audioHooks.onContextClosed?.();
    }
  }
  class AudioWorkletNode {
    constructor() {
      this.port = {};
      port = this.port;
      audioHooks.onNodeCreated?.();
    }
    disconnect() {}
  }
  // Deterministic mode: the component's clock is the audio clock (live, wall time ~= audio
  // time; under --fast wall time runs 3-10x faster than the audio and varies run to run).
  const RealDate = Date;
  class AudioDate extends RealDate {
    constructor(...a) {
      if (a.length) super(...a);
      else super(DATE0 + Math.round(now * 1000));
    }

    static now() {
      return DATE0 + Math.round(now * 1000);
    }
  }
  const context = vm.createContext({
    ...(DETERMINISTIC ? { Date: sim ? SimDate : AudioDate } : {}),
    console,
    Buffer,
    Float32Array,
    Float64Array,
    Int32Array,
    BigInt64Array,
    Map,
    Set,
    Promise,
    performance,
    ...(sim
      ? {
          setTimeout: sim.setTimeout.bind(sim),
          clearTimeout: sim.clearTimeout.bind(sim),
          setInterval: sim.setInterval.bind(sim),
          clearInterval: sim.clearTimeout.bind(sim),
        }
      : { setTimeout, clearTimeout }),
    AbortController,
    window: { AudioContext },
    AudioWorkletNode,
    navigator: {
      mediaDevices: {
        getUserMedia: audioHooks.getUserMedia || (async () => ({ getTracks: () => [] })),
      },
    },
    Blob: class {},
    URL: { createObjectURL: () => 'test-worklet', revokeObjectURL() {} },
    __capture: (value) => {
      bridge = value;
    },
    __recordSwitch: (value) => emit('switch-comparison', value),
    __recordBackstop: (value) => emit('backstop-diagnostic', value),
    __trackDecision: (promise) => track(promise, false),
  });
  function load(file, componentSource) {
    if (modules.has(file)) return modules.get(file).exports;
    const mod = { exports: {} };
    modules.set(file, mod);
    const localRequire = createRequire(file);
    function requireForTest(id) {
      if (id === 'realm') {
        const Realm = localRequire(id);
        return {
          open: async (config) => {
            const realm = await Realm.open(config);
            realmHandles.add(realm);
            return realm;
          },
        };
      }
      if (id === 'react') return react;
      if (id === 'easy-peasy')
        return { useStoreState: (f) => f(state), useStoreActions: (f) => f(actions) };
      if (id === 'electron') return { app: { getPath: () => userData } };
      if (id.endsWith('/hooks/use-new-shabad'))
        return { useNewShabad: () => (shabadId, verseId) => emit('shabad', { shabadId, verseId }) };
      if (id.endsWith('/utils/update-multipane'))
        return () => (baniType, id2, verseId) => emit('pane', { baniType, paneShabad: id2, verseId });
      if (id.endsWith('/utils/load-bani')) {
        // Real Bani rows, mapped exactly as navigator/utils/load-bani.js does.
        return {
          loadBani: (baniId, baniLength) => {
            const job = (async () => {
              const db = load(path.join(ROOT, 'www/main/banidb/index.js'));
              const rows = await db.loadBani(baniId, baniLength);
              return Array.from(rows)
                .filter((r) => r.MangalPosition !== 'above')
                .map((r) => r.Custom || r.Verse || r)
                .filter(Boolean);
            })();
            return DETERMINISTIC ? trackQuiet(job) : job;
          },
        };
      }
      if (id.endsWith('/constants/slidedb')) return { slideStrings: { waheguru: '' } };
      if (id === '../engine') return engine;
      if (id === '../engine/retrieval/renderer-client') {
        // Headless behavior replay uses the exact index through an asynchronous
        // adapter. Real Electron IPC/helper transport is verified separately;
        // this adapter must not be described as a paced runtime/capture test.
        return {
          createRendererRetrieval: () => {
            if (retrievalHooks.createClient) return retrievalHooks.createClient();
            if (engineOverride) {
              // Existing lifecycle tests inject acoustic engines and never score
              // retrieval. Decision tests supply an explicit controllable client.
              return {
                state: 'ready',
                ready: Promise.resolve({ rows: 0 }),
                search: async () => [],
                dispose: async () => {},
              };
            }
            const { readCorpus } = require(path.join(ROOT, 'test/voice-follow/canonical-corpus'));
            const {
              TextIndex,
            } = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/retrieval/text-index'));
            let index;
            const client = { state: 'starting', size: 0 };
            client.ready = (DETERMINISTIC
              ? sharedCorpus(readCorpus, TextIndex, userData, (realm) => realmHandles.add(realm))
              : readCorpus(userData, {
                  retainRealm: (realm) => realmHandles.add(realm),
                }).then((rows) => ({ rows, index: new TextIndex(rows) }))
            ).then(({ rows, index: built }) => {
              if (client.state === 'closed') throw new Error('Retrieval closed');
              index = built;
              client.state = 'ready';
              client.size = new Set(rows.map((row) => row.shabadId)).size;
              return { rows: rows.length };
            });
            track(client.ready.catch(() => {}));
            client.search = (text, cap, { signal } = {}) => {
              const job = (async () => {
                await client.ready;
                if (retrievalHooks.beforeSearch) await retrievalHooks.beforeSearch(text, cap);
                if (client.state === 'closed' || signal?.aborted) {
                  const error = new Error('Retrieval cancelled');
                  error.name = 'AbortError';
                  throw error;
                }
                const candidates = index.search(text, cap);
                emit('text-retrieval', { candidates });
                return candidates;
              })();
              track(job.catch(() => {}));
              return job;
            };
            client.dispose = async () => {
              client.state = 'closed';
            };
            return client;
          },
        };
      }
      if (id === '../../../banidb') {
        const db = load(path.join(ROOT, 'www/main/banidb/index.js'));
        const wrapped = { ...db };
        if (DETERMINISTIC) {
          // every database call is tracked, so settle()/quiesce() wait for it
          for (const [key, fn] of Object.entries(db)) {
            if (typeof fn !== 'function') continue;
            wrapped[key] = (...args) => {
              const r = fn(...args);
              return r && typeof r.then === 'function' ? trackQuiet(r) : r;
            };
          }
        }
        for (const key of ['query', 'loadShabad', 'loadFirstLetterIndex', 'getVerse']) {
          wrapped[key] = (...args) =>
            track(
              db[key](...args).then((result) => {
                const finish = () => {
                  if (key === 'query')
                    emit('retrieval', {
                      query: args[0],
                      searchType: args[1],
                      ids: Array.from(result, (r) => r.Shabads[0]?.ShabadID),
                    });
                  return result;
                };
                return databaseHooks.beforeResult
                  ? Promise.resolve(databaseHooks.beforeResult(key, args)).then(finish)
                  : finish();
              }),
            );
        }
        return wrapped;
      }
      if (id.startsWith('.') && file.includes('/banidb/')) return load(localRequire.resolve(id));
      if (id.endsWith('/filter-verse-items')) return load(localRequire.resolve(id));
      // Autopilot panel redesign (experimental-release 58b6e170): UI-only imports.
      if (id.endsWith('/common/i18n')) return { i18n: { t: (key) => key } };
      if (id.endsWith('/common/sttm-ui')) return { VoiceWave: () => null };
      if (id === 'react-dom') return { createPortal: (el) => el };
      if (id === './autopilotSlot') return { useAutopilotSlot: () => null, setAutopilotSlot: () => {} };
      if (id === './AudioCaptureIcon.jsx' || id === './AudioCaptureIcon') return { AudioCaptureIcon: () => null, default: () => null };
      if (id === './HwCheck' || id === './HwCheck.jsx') return { default: () => null, __esModule: true };
      return localRequire(id);
    }
    let code = componentSource || fs.readFileSync(file, 'utf8');
    if (file === COMPONENT) {
      if (eventClock || DETERMINISTIC) {
        // Tracking only affects final draining; live delivery never awaits it.
        // Deterministic mode: settle() waits for each decision before the next chunk.
        const n = code.split(/handleTranscript\((r?out\.text)\)/).length;
        code = code.replace(
          /handleTranscript\((r?out\.text)\)/g,
          '__trackDecision(handleTranscript($1))',
        );
        if (DETERMINISTIC && n < 3) throw new Error('handleTranscript call anchor changed; update bench-driver.');
      }
      const comparisonMarker = '        setSwitchView({';
      if (code.split(comparisonMarker).length !== 2)
        throw new Error('Switch-comparison marker changed');
      code = code.replace(
        comparisonMarker,
        `        __recordSwitch({ current: curId, currentScore: sCurFull,
          candidate: leadSlot.shabadId, candidateScore: leadSlot.lastScore,
          wins: leadSlot.wins, hypLen: hypFull.length });
${comparisonMarker}`,
      );
      // Optional: trace the shared/single-line hold (cycle 5) when present.
      const holdMarker = "          const cap = shared ? SHARED_LINE_HOLD_DECODES : SINGLE_LINE_HOLD_DECODES;";
      if (code.includes(holdMarker)) {
        code = code.replace(holdMarker, `${holdMarker}
          __recordSwitch({ hold: true, candidate: slot.shabadId, shared, heldDecodes: nowD - bank.first, wins: slot.wins });`);
      }
      // Trace the return slot. The call's 4th argument differs between cycles
      // (acousticCfg vs an object literal), so anchor on the call head only and
      // FAIL LOUDLY if it is gone — a silently skipped hook reads as "the return
      // slot never ran", which is a false finding, not a measurement.
      const retRe = /( *)const step = nextSwitchWins\(rs\.wins, m\.s, sCurFull,/;
      if (!retRe.test(code)) throw new Error('Return-slot trace anchor changed; update bench-driver.');
      code = code.replace(retRe, (full, indent) =>
        `${indent}__recordSwitch({ ret: true, prev: prev.id, prevScore: m.s, current: curId, currentScore: sCurFull, wins: rs.wins, hypLen: hypFull.length });\n${full}`);
      // Bench-only knob: VF_MIN_LETTERS lowers the first-letter gate that skips
      // the whole judge (return slot + acoustic backstop included).
      if (process.env.VF_MIN_LETTERS) {
        const ml = Number(process.env.VF_MIN_LETTERS);
        code = code.replace(/const DETECT_MIN_LETTERS = \d+;/, `const DETECT_MIN_LETTERS = ${ml};`);
      }
      // Trace the SEARCHING-phase first-lock gate: every value the lock rule looks at,
      // per decode, and the canonical-text check. Loud failure if the anchors move.
      const lockRe = /( *)if \(phaseRef\.current === 'searching'\) \{\n/;
      if (!lockRe.test(code)) throw new Error('Lock-gate anchor changed; update bench-driver.');
      code = code.replace(lockRe, (full, indent) =>
        `${full}${indent}  __recordSwitch({ lockGate: true, fl: fl.length, lead, best, count: st.count, cand: cand.shabadId });\n`);
      const lockTextRe = /( *)(?:const|let) leaders = await searchCanonicalText\(text, 2[^;\n]*, abort\.signal\);\n/;
      if (!lockTextRe.test(code)) throw new Error('Lock-text anchor changed; update bench-driver.');
      code = code.replace(lockTextRe, (full, indent) =>
        `${full}${indent}__recordSwitch({ lockText: true, cand: cand.shabadId, l0: leaders && leaders[0] && leaders[0].shabadId, s0: leaders && leaders[0] && leaders[0].score, l1: leaders && leaders[1] && leaders[1].shabadId, s1: leaders && leaders[1] && leaders[1].score });\n`);
      // Trace EVERY candidate the switch judge scores per decode (vote + backstop),
      // so alternative judge rules can be simulated offline from saved traces.
      const stepRe = /( *)const step = nextSwitchWins\(slot\.wins, sCand, sCurFull, acousticCfg\);\n/;
      if (!stepRe.test(code)) throw new Error('stepSlot anchor changed; update bench-driver.');
      code = code.replace(stepRe, (full, indent) =>
        `${full}${indent}__recordSwitch({ judge: true, cand: slot.shabadId, sCand, sCur: sCurFull, wins: step.wins, held: !!step.held, hypLen: hypFull.length });\n`);
      // ---- Overnight experiments (bench-only, env-gated; shipped code untouched) ----
      // A1  VF_EXP_STALE=<decodes>: while FOLLOWING, if the recogniser keeps producing
      //     speech-length fragments but none has matched the current shabad (>=0.5) for
      //     that many decodes (~0.5 s each), put up the Waheguru seeking slide; take it
      //     down as soon as the current shabad matches again. Decode-counted, so replay
      //     speed does not matter.
      if (process.env.VF_EXP_STALE) {
        const N = Number(process.env.VF_EXP_STALE);
        const staleRe = /( *)const sCurFull = Math\.max\(sCurWindow, sCurAll\);\n/;
        if (!staleRe.test(code)) throw new Error('A1 anchor changed');
        code = code.replace(staleRe, (full, indent) => `${full}${indent}{
${indent}  const W = globalThis.__vfStale || (globalThis.__vfStale = { decodes: 0, lastGood: 0, shown: false });
${indent}  W.decodes += 1;
${indent}  if (sCurFull >= 0.5) {
${indent}    W.lastGood = W.decodes;
${indent}    if (W.shown) { W.shown = false; seekingRef.current = false; try { setIsMiscSlide(false); } catch (_) {} __recordSwitch({ stale: 'down' }); }
${indent}  } else if (hypFull.length >= SWITCH_HYP_MIN && W.decodes - W.lastGood > ${N} && !W.shown && !seekingRef.current && !isMiscSlideRef.current) {
${indent}    W.shown = true; seekingRef.current = true;
${indent}    try { setMiscSlideText(slideStrings.waheguru); setIsMiscSlide(true); __recordSwitch({ stale: 'up', sinceGood: W.decodes - W.lastGood }); } catch (_) { seekingRef.current = false; W.shown = false; }
${indent}  }
${indent}}
`);
        const staleResetRe = /( *)switchCandRef\.current = null; \/\/ clear any in-flight switch evaluation\n/;
        if (!staleResetRe.test(code)) throw new Error('A1 reset anchor changed');
        code = code.replace(staleResetRe, (full, indent) => `${full}${indent}if (globalThis.__vfStale) { globalThis.__vfStale.lastGood = globalThis.__vfStale.decodes; globalThis.__vfStale.shown = false; }\n`);
      }
      // A2  VF_EXP_RETURN_EVERY=1: judge the RETURN slot on every decode, before the
      //     database search that a newer transcript may cancel. Same scores, same bars,
      //     same commit; the original post-search return block is skipped for the decode.
      if (process.env.VF_EXP_RETURN_EVERY) {
        const preRe = /( *)const textCandidates = await searchCanonicalText\(text, BACKSTOP_TOP_N \+ 1, abort\.signal\);\n/;
        if (!preRe.test(code)) throw new Error('A2 anchor changed');
        code = code.replace(preRe, (full, indent) => `${indent}{
${indent}  const prev = prevShabadRef.current;
${indent}  const curId0 = currentShabadIdRef.current;
${indent}  if (prev && prev.id !== curId0 && prev.profile && prev.profile.linesNorm) {
${indent}    const hypFull0 = vfNorm(text).slice(-SWITCH_HYP_SLICE);
${indent}    const sCurW0 = cursorLineScore(hypFull0, curLinesNormRef.current, curCursorRef.current, CUR_SCORE_BACK, CUR_SCORE_AHEAD);
${indent}    const hypW0 = tokenize(text).map(vfNorm).filter(Boolean);
${indent}    const sCurA0 = Math.max(maxLineScore(hypFull0, curLinesNormRef.current, SWITCH_CAND_MIN_LINE_CHARS), orderFreeLineScore(hypW0, curWordsNormRef.current, SWITCH_CAND_MIN_LINE_CHARS));
${indent}    const sCur0 = Math.max(sCurW0, sCurA0);
${indent}    const cfg0 = { min: SWITCH_ACOUSTIC_MIN, margin: SWITCH_ACOUSTIC_MARGIN, strongMin: SWITCH_STRONG_MIN, strongMargin: SWITCH_STRONG_MARGIN, hypLen: hypFull0.length, hypMin: SWITCH_HYP_MIN };
${indent}    prev.decodesSince += 1;
${indent}    if (prev.decodesSince > RETURN_WINDOW_DECODES) { prevShabadRef.current = null; returnSlotRef.current = null; }
${indent}    else {
${indent}      let rs = returnSlotRef.current;
${indent}      if (!rs || rs.shabadId !== prev.id) { rs = { shabadId: prev.id, wins: 0, index: -1, lastScore: null }; returnSlotRef.current = rs; }
${indent}      const m = bestLineMatch(hypFull0, prev.profile.linesNorm, SWITCH_CAND_MIN_LINE_CHARS);
${indent}      if (m.index >= 0) { const step = nextSwitchWins(rs.wins, m.s, sCur0, cfg0); rs.wins = step.wins; if (!step.held) { rs.lastScore = m.s; rs.index = m.index; } __recordSwitch({ ret: true, pre: true, prev: prev.id, prevScore: m.s, current: curId0, currentScore: sCur0, wins: rs.wins, hypLen: hypFull0.length }); }
${indent}      else rs.wins = Math.max(0, rs.wins - 1);
${indent}      if (rs.wins >= RETURN_CONFIRM && rs.index >= 0 && !lockingRef.current) {
${indent}        const v = prev.profile.verses[rs.index] || {};
${indent}        let verse = null;
${indent}        try { verse = v.verseId ? await banidb.getVerse(prev.id, v.verseId) : null; } catch (_) { verse = null; }
${indent}        if (!isCurrentTranscript() || lockingRef.current || returnSlotRef.current !== rs) return;
${indent}        if (verse) { returnSlotRef.current = null; autopilotLock({ shabadId: prev.id, verseId: v.verseId, verse }); return; }
${indent}      }
${indent}    }
${indent}  }
${indent}}
${full}`);
        const origRe = /( *)\/\/ --- Return slot: the shabad we just left, judged in its own slot\. ---\n( *)\{\n/;
        if (!origRe.test(code)) throw new Error('A2 original-block anchor changed');
        code = code.replace(origRe, (full, i1, i2) => `${i1}// --- Return slot (A2: already judged before the search this decode) ---\n${i2}if (false) {\n`);
      }
      // Control for Bani follow: VF_EXP_NO_BANI=1 never switches up to a Bani.
      if (process.env.VF_EXP_NO_BANI) {
        const baniRe = /= findBaniSequence\(/g;
        if (!baniRe.test(code)) throw new Error('Bani-follow anchor changed; update bench-driver.');
        code = code.replace(baniRe, '= null && findBaniSequence(');
        const paathRe = /const paathBani = lines && lines\.get\(/;
        if (!paathRe.test(code)) throw new Error('Paath-Bani anchor changed; update bench-driver.');
        code = code.replace(paathRe, 'const paathBani = null && lines.get(');
        // Straight-through reading opens no Bani either (so a paath recording of
        // consecutive Guru Granth Sahib shabads exercises sequence following).
        const readRe = /const PAATH_READ_BANIS = \[[^\]]*\];/;
        if (!readRe.test(code)) throw new Error('PAATH_READ_BANIS anchor changed; update bench-driver.');
        code = code.replace(readRe, 'const PAATH_READ_BANIS = [];');
      }
      // Trace the two early returns that skip the WHOLE judge (return slot and
      // acoustic backstop included), so their cost can be measured.
      const letterRe = /( *)if \(fl\.length < DETECT_MIN_LETTERS\) return;/;
      if (!letterRe.test(code)) throw new Error('Letter-gate anchor changed; update bench-driver.');
      code = code.replace(letterRe, (full, indent) =>
        `${indent}if (fl.length < DETECT_MIN_LETTERS) { __recordSwitch({ gate: 'letters', flLen: fl.length }); return; }`);
      const votesRe = /( *)\}\n( *)return;\n( *)\}\n( *)emptyStreakRef\.current = 0;/;
      if (!votesRe.test(code)) throw new Error('Votes-gate anchor changed; update bench-driver.');
      code = code.replace(votesRe, (full, i1, i2, i3, i4) =>
        `${i1}}\n${i2}__recordSwitch({ gate: 'votes' });\n${i2}return;\n${i3}}\n${i4}emptyStreakRef.current = 0;`);
      const marker = "  const listening = status === 'listening' || status === 'connecting';";
      if (!code.includes(marker))
        throw new Error('Component test bridge marker changed; update driver explicitly.');
      code = code.replace(
        marker,
        `
        __capture({ start, startDetect, startAutopilot, stop, autopilotLock, handleTranscript, chainRef, isMiscSlideRef,
          snapshot: () => ({ phase: phaseRef.current, current: currentShabadIdRef.current,
            locking: lockingRef.current, votes: [...detectVotesRef.current.entries()],
            vote: switchCandRef.current && { id: switchCandRef.current.shabadId, wins: switchCandRef.current.wins, score: switchCandRef.current.lastScore },
            backstop: backstopRef.current && { id: backstopRef.current.shabadId, wins: backstopRef.current.wins, score: backstopRef.current.lastScore },
            cacheSize: lineCacheRef.current.size, indexSize: (typeof flIndexRef !== 'undefined' ? flIndexRef.current?.size : (typeof warmIndex !== 'undefined' && warmIndex.get && warmIndex.get() ? 1 : 0)) || 0,
            retrievalReady: typeof flIndexRef !== 'undefined' ? !!flIndexRef.current : !!(typeof warmIndex !== 'undefined' && warmIndex.get && warmIndex.get()),
            seeking: seekingRef.current, cursor: curCursorRef.current }) });
        ${marker}`,
      );
    }
    if (file.endsWith('.jsx') || code.includes('export const')) {
      // Bench-only knob: VF_RETURN_CFG='{"min":0.5,"margin":0}' rewrites the return-slot bar.
      if (process.env.VF_RETURN_CFG) {
        const rc = JSON.parse(process.env.VF_RETURN_CFG);
        if (rc.min != null) code = code.replace(/const RETURN_MIN = [0-9.]+;/, `const RETURN_MIN = ${rc.min};`);
        if (rc.margin != null) code = code.replace(/const RETURN_MARGIN = [0-9.]+;/, `const RETURN_MARGIN = ${rc.margin};`);
      }
      const source = code;
      code = compileCached(source, file, () => babel.transformSync(source, {
        filename: file,
        configFile: false,
        babelrc: false,
        presets: [
          [require.resolve('@babel/preset-env'), { targets: { node: '18' } }],
          require.resolve('@babel/preset-react'),
        ],
      }).code);
    }
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename: file })(
      requireForTest,
      mod,
      mod.exports,
    );
    return mod.exports;
  }
  const exported = load(COMPONENT, source);
  exported.default({ isOpen: true, onScreenClose() {} });
  async function settle() {
    for (let i = 0; i < 100; i += 1) {
      await new Promise(setImmediate);
      if (pending.size) await Promise.allSettled([...pending]);
      if (errors.length) throw errors.shift();
      if (!pending.size && !bridge.snapshot().locking) return;
    }
    throw new Error('Component did not settle');
  }
  return {
    // Raw startup entry points allow cancellation tests to complete without
    // requiring an audio handler that a cancelled start must never install.
    begin: (mode = 'autopilot') =>
      ({ autopilot: bridge.startAutopilot, detect: bridge.startDetect, manual: bridge.start })[
        mode
      ](),
    start: async () => {
      await bridge.startAutopilot();
      await settle();
      if (!port?.onmessage) throw new Error('No audio handler');
    },
    startManual: async () => {
      await bridge.start();
      await settle();
      if (!port?.onmessage) throw new Error('No manual audio handler');
    },
    push: async (pcm, t) => {
      now = t;
      port.onmessage({ data: pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) });
      await bridge.chainRef.current;
      await settle();
      // The component swallows per-chunk errors (one bad chunk must not stop the mic), so a
      // cache miss is surfaced here: replay never falls back to the model.
      if (cache && cache.missErrors.length) {
        flushTrace(); // keep the events up to the miss for diagnosis
        throw cache.missErrors[0];
      }
      return bridge.snapshot();
    },
    cacheStats: () =>
      cache && { dir: cache.dir, hits: cache.hits, misses: cache.misses, recorded: cache.recorded,
        ...(sim ? { simDir: cache.simDir, selfTestPasses: cache.selfTest, passes: cache.passes.n, emissionsCalls: cache.passes.calls, passCostMs: Math.round(cache.passes.costMs) } : {}) },
    // ---- Simulated slow PC (VF_SIM_PASS_MS; SIM-SLOWPC.md) ----
    sim: sim && {
      clock: sim,
      stats: simStats,
      start: async () => {
        await sim.runUntil(bridge.startAutopilot());
        await settle();
        if (!port?.onmessage) throw new Error('No audio handler');
      },
      // The microphone at real-time pace on the virtual clock: chunk k arrives at its audio end
      // time (never awaited, as the worklet does); every sampleMs the audio waiting for the
      // recognizer is sampled (delivered minus consumed, like renton-stress). Then drains.
      feed: async (pcm, { chunk = 2048, sampleMs = 1000, onSample } = {}) => {
        const t0 = sim.t;
        let p = 0;
        let enqueued = 0;
        let fed = false;
        let resolveFed;
        const allFed = new Promise((r) => { resolveFed = r; });
        const samples = [];
        const consumed0 = simStats.consumed;
        const sample = () => {
          const s = { wall: +((sim.t - t0) / 1000).toFixed(1), audio: +(enqueued / sampleRate).toFixed(1), lag: +((enqueued - (simStats.consumed - consumed0)) / sampleRate).toFixed(2), phase: bridge.snapshot().phase };
          samples.push(s);
          if (onSample) onSample(s);
        };
        const tick = () => {
          if (fed) return;
          sample();
          sim.at(sim.t + sampleMs, tick);
        };
        sim.at(t0 + sampleMs, tick);
        const next = () => {
          if (p >= pcm.length) {
            fed = true;
            resolveFed();
            return;
          }
          const c = pcm.subarray(p, Math.min(p + chunk, pcm.length));
          p += c.length;
          const audioT = p / sampleRate;
          sim.at(t0 + audioT * 1000, () => {
            now = audioT;
            enqueued += c.length;
            if (!port?.onmessage) throw new Error('No audio handler');
            port.onmessage({ data: c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength) });
            next();
          });
        };
        next();
        await sim.runUntil(allFed);
        const tDone = sim.t;
        // drain: the queued audio and every decision still in flight
        await sim.runUntil((async () => {
          for (;;) {
            const chain = bridge.chainRef.current;
            await chain;
            await Promise.allSettled([...pending]);
            if (chain === bridge.chainRef.current && !pending.size) return;
          }
        })());
        await settle();
        samples.push({ wall: +((sim.t - t0) / 1000).toFixed(1), audio: +(enqueued / sampleRate).toFixed(1), lag: 0, drainS: +((sim.t - tDone) / 1000).toFixed(1), phase: bridge.snapshot().phase });
        return { samples, enqueued };
      },
    },
    // Wall-paced producers must deliver without waiting for either inference or
    // decisions. This preserves the component's own queue/backlog behavior.
    enqueue: (pcm, t) => {
      now = t;
      if (!port?.onmessage) throw new Error('No audio handler');
      port.onmessage({ data: pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) });
      return bridge.chainRef.current;
    },
    drain: async () => {
      await bridge.chainRef.current;
      await settle();
    },
    transcript: async (text, t) => {
      now = t;
      await bridge.handleTranscript(text);
      await settle();
      return bridge.snapshot();
    },
    lock: async (candidate, opts) => {
      await bridge.autopilotLock(candidate, opts);
      await settle();
    },
    stopSession: async () => {
      bridge.stop();
      await settle();
    },
    cancelSession: () => bridge.stop(),
    snapshot: () => bridge.snapshot(),
    stop: async () => {
      bridge.stop();
      try {
        // Simulated: work still in flight finishes on the virtual clock; after a cache miss the
        // clock is dead (a decision may wait on the missing pass forever), so nothing is awaited.
        if (sim && !(cache && cache.missErrors.length)) await sim.runUntil(settle());
        else if (!sim) await settle();
      } finally {
        // settle awaits tracked work before surfacing its error. Native resources
        // still need releasing when a completed decision failed.
        try {
          if (infer && infer.sess) await infer.sess.release();
          if (cache && cache.real) await cache.real.sess.release();
          if (cache) {
            if (cache.missErrors.length) throw cache.missErrors[0];
            if (process.env.VF_EMIS_STATS !== '0')
              console.error(`[emis-cache] ${cacheId} ${EMIS_MODE} hits ${cache.hits} recorded ${cache.recorded} misses ${cache.misses}`);
            cache.store.close();
          }
        } finally {
          flushTrace();
          for (const realm of realmHandles) if (!realm.isClosed) realm.close();
          realmHandles.clear();
          if (cache && cache.overlay) cache.overlay.close();
          restoreClock();
        }
      }
    },
  };
}

module.exports = { createDriver, COMPONENT, DRIVER_SHA256 };
