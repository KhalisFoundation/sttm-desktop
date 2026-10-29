#!/usr/bin/env node
/* vf-backlog-queue-test.js — the audio queue in startAudio, with a fake slow engine (no model).
 * Feeds 240 chunks of 2048 samples at a 16 kHz wall pace (128 ms each) into the real component
 * while every recognizer push takes --push-ms (default 300 ms, i.e. 2.3x slower than real time)
 * and checks: (1) the engine receives every sample exactly once, in order (contiguous audio);
 * (2) the audio waiting for the engine never exceeds the bound by more than one push;
 * (3) with the bound, pushes larger than one chunk appear (coalesced) and the backlog stays small.
 * Run against another worktree with --root to see the unbounded behaviour.
 */
const path = require('path');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(arg('root', path.resolve(__dirname, '../../..')));
const PUSH_MS = Number(arg('push-ms', 300));
const CHUNKS = Number(arg('chunks', 240));
const SR = 16000, CHUNK = 2048;
{
  const cfg = require.resolve(path.join(ROOT, 'www/main/addons/voice-follow/shadow/config.js'));
  const real = require(cfg);
  require.cache[cfg].exports = { ...real, SHADOW_BUILD: false };
}
const { createDriver } = require(path.join(ROOT, 'research/level2-dataset/tools/bench-driver'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const pushes = [];
  let enqueued = 0, consumed = 0, maxLag = 0;
  const engineOverride = {
    ready: async () => ({}),
    isReady: () => true,
    createRecognizer: async () => ({ push: async (pcm) => { pushes.push(pcm.slice(0)); maxLag = Math.max(maxLag, (enqueued - consumed) / SR); await sleep(PUSH_MS); consumed += pcm.length; return null; } }),
    createFollower: async () => ({ push: async () => null }),
  };
  const driver = await createDriver({ model: null, userData: path.join(process.env.HOME, 'Library/Application Support/SikhiToTheMax'), engineOverride });
  await driver.start();
  const input = new Float32Array(CHUNKS * CHUNK);
  for (let i = 0; i < input.length; i += 1) input[i] = (i % 9973) / 9973; // unique-ish ramp
  const wall0 = performance.now();
  const lagAt = [];
  for (let c = 0; c < CHUNKS; c += 1) {
    const ahead = ((c + 1) * CHUNK / SR) * 1000 - (performance.now() - wall0);
    if (ahead > 1) await sleep(ahead);
    driver.enqueue(input.subarray(c * CHUNK, (c + 1) * CHUNK), (c + 1) * CHUNK / SR);
    enqueued += CHUNK;
    if (c % 20 === 19) lagAt.push(+((enqueued - consumed) / SR).toFixed(2));
  }
  await driver.drain();
  await driver.stop();
  const total = pushes.reduce((a, p) => a + p.length, 0);
  let at = 0, contiguous = total === input.length;
  for (const p of pushes) { for (let i = 0; i < p.length && contiguous; i += 1) if (p[i] !== input[at + i]) contiguous = false; at += p.length; }
  const sizes = pushes.map((p) => p.length);
  const merged = sizes.filter((s) => s > CHUNK).length;
  console.log(JSON.stringify({ root: ROOT, pushMs: PUSH_MS, chunks: CHUNKS, pushes: pushes.length, merged, largestPushS: +(Math.max(...sizes) / SR).toFixed(2), contiguous, maxWaitingS: +maxLag.toFixed(2), waitingEvery20Chunks: lagAt }));
  if (!contiguous) process.exit(1);
})().catch((e) => { console.error(e.stack); process.exit(1); });
