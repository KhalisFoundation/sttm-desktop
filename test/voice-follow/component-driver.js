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

const ROOT = path.resolve(__dirname, '../..');
const COMPONENT = path.join(ROOT, 'www/main/addons/voice-follow/components/VoiceFollow.jsx');

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
} = {}) {
  const { Infer, norm } = require('../../www/main/addons/voice-follow/engine/infer');
  const { Recognizer } = require('../../www/main/addons/voice-follow/engine/recognizer');
  const { Follower } = require('../../www/main/addons/voice-follow/engine/follower');
  const { SP } = require('../../www/main/addons/voice-follow/engine/sentencepiece');
  const { partialRatio } = require('../../www/main/addons/voice-follow/engine/fuzz');
  const infer = engineOverride ? null : await Infer.create(model);
  const sp = SP.load();
  const modules = new Map();
  const realmHandles = new Set();
  const pending = new Set();
  let bridge;
  let port;
  let now = 0;
  const errors = [];
  const emit = (type, fields = {}) =>
    onEvent({ t: eventClock ? eventClock() : now, type, ...fields });
  const track = (p) => {
    pending.add(p);
    p.then(
      () => pending.delete(p),
      (e) => {
        pending.delete(p);
        errors.push(e);
        emit('component-error', { message: String(e), stack: e.stack });
      },
    );
    return p;
  };
  const actions = {
    navigator: {
      setActiveVerseId: (verseId) => emit('verse', { verseId }),
      setLineNumber: () => {},
      setIsMiscSlide: (visible) => {
        if (bridge) bridge.isMiscSlideRef.current = visible;
        emit('seeking', { visible });
      },
      setMiscSlideText: () => {},
    },
    app: { setOverlayScreen: () => {} },
  };
  const state = { navigator: initialNavigator, userSettings: { baniLength: 'short' } };
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
      return {
        push: async (pcm) => {
          const before = performance.now();
          const out = await rec.push(pcm);
          if (out) emit('transcript', { ...out, inferenceMs: performance.now() - before });
          return out;
        },
      };
    },
    createFollower: async (lines, opts) => {
      const fol = new Follower(infer, sp, lines, opts);
      return {
        push: async (pcm) => {
          const out = await fol.push(pcm);
          if (out) emit('follower', out);
          return out;
        },
      };
    },
  };
  const engine = engineOverride ? { norm, partialRatio, ...engineOverride } : nativeEngine;
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
  const context = vm.createContext({
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
    setTimeout,
    clearTimeout,
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
    __trackDecision: (promise) => track(promise),
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
      if (id.endsWith('/utils/load-bani')) return { loadBani: async () => [] };
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
            const { readCorpus } = require('./canonical-corpus');
            const {
              TextIndex,
            } = require('../../www/main/addons/voice-follow/engine/retrieval/text-index');
            let index;
            const client = { state: 'starting', size: 0 };
            client.ready = readCorpus(userData, {
              retainRealm: (realm) => realmHandles.add(realm),
            }).then((rows) => {
              if (client.state === 'closed') throw new Error('Retrieval closed');
              index = new TextIndex(rows);
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
      return localRequire(id);
    }
    let code = componentSource || fs.readFileSync(file, 'utf8');
    if (file === COMPONENT) {
      if (eventClock) {
        // Tracking only affects final draining; live delivery never awaits it.
        code = code.replace(
          /handleTranscript\((r?out\.text)\)/g,
          '__trackDecision(handleTranscript($1))',
        );
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
            cacheSize: lineCacheRef.current.size, indexSize: flIndexRef.current?.size || 0,
            retrievalReady: !!flIndexRef.current,
            seeking: seekingRef.current, cursor: curCursorRef.current }) });
        ${marker}`,
      );
    }
    if (file.endsWith('.jsx') || code.includes('export const')) {
      code = babel.transformSync(code, {
        filename: file,
        configFile: false,
        babelrc: false,
        presets: [
          [require.resolve('@babel/preset-env'), { targets: { node: '18' } }],
          require.resolve('@babel/preset-react'),
        ],
      }).code;
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
      return bridge.snapshot();
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
    lock: async (candidate) => {
      await bridge.autopilotLock(candidate);
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
        await settle();
      } finally {
        // settle awaits tracked work before surfacing its error. Native resources
        // still need releasing when a completed decision failed.
        try {
          if (infer) await infer.sess.release();
        } finally {
          for (const realm of realmHandles) if (!realm.isClosed) realm.close();
          realmHandles.clear();
        }
      }
    },
  };
}

module.exports = { createDriver, COMPONENT, DRIVER_SHA256 };
