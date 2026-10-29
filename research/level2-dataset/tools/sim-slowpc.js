#!/usr/bin/env node
/* sim-slowpc.js — one simulated slow-PC run from the emissions cache (SIM-SLOWPC.md).
 *
 * The real component (any worktree) on a VIRTUAL clock: the microphone delivers 128 ms chunks at
 * real-time pace, each model pass costs --sim-pass-ms per 4 s window (scaled by window length),
 * and the app's own audio queue / 1 s backlog bound / merged pushes, tier self-test and live
 * stepping, and followers run unmodified. Same output as renton-stress.js (score with
 * renton-score.js / nw-score.js / sim-sweep.js), in seconds instead of the clip's length.
 *
 *   node sim-slowpc.js --clip rt11_rehras --from 0 --to 600 --root <worktree> --sim-speed 0.9 --out x.json
 *     --sim-pass-ms N   ms per 4 s model pass (default from --sim-speed: N = 1000 / (6 x speed),
 *                       the MVP 9.0 following schedule of 6 passes per audio second: 0.9x = 185)
 *     --sim-flat        every pass costs N whatever its window (default: N x window / 4 s, = --pad-scale)
 *     --sim-js-ms M     virtual cost after each engine decode (default 0: JS is free)
 *     --sim-serial      concurrent passes queue on one engine (default: each costs its own time,
 *                       as the VM's padded engine did)
 *     --fill            windows the cache lacks run the real model (exclusive bench lock, nice 19,
 *                       3 threads) into the sim overlay store; without it a miss exits 3
 *     --tier T          pin a tier (VF_TIER); default: unpinned = self-test + live stepping
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);
const CLIPS = process.env.VF_CLIPS || require('path').join(require('os').homedir(), 'personal/live-darbar-venues/clips');
const CLIP = arg('clip', 'rt11_rehras');
const ROOT = path.resolve(arg('root', path.resolve(__dirname, '../../..')));
const FROM = Number(arg('from', 0));
const TO = arg('to', null);
const SPEED = arg('sim-speed', null);
const PASS_MS = Number(arg('sim-pass-ms', SPEED ? (1000 / (6 * Number(SPEED))).toFixed(1) : 185));
const OUT = arg('out', '');
const FILL = flag('fill');

// --fill: re-run this command under the exclusive bench lock (the model runs for missing windows).
if (FILL && !process.env.VF_SIM_LOCKED) {
  const r = spawnSync('lockf', ['-k', '/tmp/vf-bench.lock', 'nice', '-n', '19', 'env', 'VF_SIM_LOCKED=1',
    `VF_ORT_THREADS=${process.env.VF_ORT_THREADS || 3}`, process.execPath, __filename, ...argv], { stdio: 'inherit' });
  process.exit(r.status == null ? 1 : r.status);
}

const MODEL = require('./speech-pack').speechModel().onnx;
const USERDATA = process.env.VF_BANIDB_USER_DATA || path.join(process.env.HOME, 'Library/Application Support/SikhiToTheMax');
Object.assign(process.env, {
  VF_EMIS_CACHE: process.env.VF_EMIS_CACHE || require('path').join(require('os').homedir(), 'personal/live-darbar-venues/cache'),
  VF_EMIS_MODE: FILL ? 'record' : 'replay',
  VF_DRIVER_ROOT: ROOT,
  VF_SIM_PASS_MS: String(PASS_MS),
  VF_SIM_SCALE: flag('sim-flat') ? '0' : '1',
  VF_SIM_JS_MS: String(Number(arg('sim-js-ms', 0))),
  VF_SIM_MODEL: flag('sim-serial') ? 'serial' : 'parallel',
  VF_EMIS_STATS: '0',
  REALM_DISABLE_ANALYTICS: '1',
});
if (arg('tier')) process.env.VF_TIER = arg('tier');
const SR = 16000;
const CHUNK = 2048; // 128 ms, like renton-stress / bench-runner

// Shadow config off for this worktree (what no-shadow-preload.js does, by path).
{
  const cfg = require.resolve(path.join(ROOT, 'www/main/addons/voice-follow/shadow/config.js'));
  const real = require(cfg);
  require.cache[cfg].exports = { ...real, SHADOW_BUILD: false };
}
// Session log: keep backlog / tier events here, write nothing to the app's folder.
const sessionLog = require(path.join(ROOT, 'www/main/addons/voice-follow/engine/session-log'));
const logged = [];
sessionLog.logEvent = (type, fields) => { if (type === 'audio_backlog' || type === 'perf_tier') logged.push({ type, wall: performance.now(), ...fields }); };
const { createDriver } = require('./bench-driver');

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
  const wall0 = process.hrtime.bigint();
  const all = readWav(path.join(CLIPS, `${CLIP}.wav`));
  const to = TO == null ? all.length / SR : Number(TO);
  const pcm = all.subarray(Math.round(FROM * SR), Math.round(to * SR));
  const events = [];
  const driver = await createDriver({ model: MODEL, userData: USERDATA, cacheId: CLIP,
    onEvent: (ev) => { if (['shabad', 'seeking', 'verse', 'component-error'].includes(ev.type)) events.push({ t: ev.t + FROM, type: ev.type, shabadId: ev.shabadId, verseId: ev.verseId, visible: ev.visible, message: ev.message }); } });
  let res;
  let missed = null;
  try {
    await driver.sim.start();
    res = await driver.sim.feed(pcm, { chunk: CHUNK });
  } catch (e) {
    if (e && e.name === 'CacheMiss') missed = e; else throw e;
  }
  const pace = driver.sim.stats.pace;
  const tier = pace ? pace.describe() : null;
  const cs = driver.cacheStats();
  try { await driver.stop(); } catch (e) { if (!(e && e.name === 'CacheMiss')) throw e; }
  const wallS = Number(process.hrtime.bigint() - wall0) / 1e9;
  if (missed) {
    console.error(`SIM CACHE MISS ${CLIP} at ${(driver.sim.clock.t / 1000).toFixed(1)} s (${cs.hits} hits before it; ${missed.key}): rerun with --fill (records the missing windows with the model under the bench lock)`);
    process.exit(3);
  }
  const { samples } = res;
  const lags = samples.map((s) => s.lag);
  const lagSorted = [...lags].sort((a, b) => a - b);
  const audioS = res.enqueued / SR;
  const summary = {
    root: ROOT, clip: CLIP, from: FROM, to, sim: { passMs: PASS_MS, scale: !flag('sim-flat'), jsMs: Number(arg('sim-js-ms', 0)), model: flag('sim-serial') ? 'serial' : 'parallel' },
    passes: cs.passes, passesPerAudioS: +(cs.passes / audioS).toFixed(2), emissionsCalls: cs.emissionsCalls, passCostPerAudioS: +(cs.passCostMs / 1000 / audioS).toFixed(3),
    cacheHits: cs.hits, recorded: cs.recorded, selfTestPasses: cs.selfTestPasses,
    tier, tierEvents: logged.filter((e) => e.type === 'perf_tier').map(({ wall, ...x }) => ({ t: +(wall / 1000).toFixed(1), ...x })),
    lagMax: lags.length ? Math.max(...lags) : null,
    lagP95: lagSorted.length ? lagSorted[Math.floor(lagSorted.length * 0.95)] : null,
    drainS: samples.length ? samples[samples.length - 1].drainS : null,
    backlogEvents: logged.filter((e) => e.type === 'audio_backlog').length,
    shown: events.filter((e) => e.type === 'shabad').map((e) => `${e.shabadId}@${e.t.toFixed(1)}`),
    errors: events.filter((e) => e.type === 'component-error').map((e) => e.message),
    wallS: +wallS.toFixed(1),
  };
  console.log(JSON.stringify(summary));
  if (OUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ part: CLIP, from: FROM, dur: to, summary, samples, backlogEvents: logged.filter((e) => e.type === 'audio_backlog'), events }));
  }
})().catch((e) => { console.error(e.stack); process.exit(1); });
