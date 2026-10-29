#!/usr/bin/env node
/* stop-keeps-screen-test.js — Stop must never move what is on screen.
 * Runs the real VoiceFollow component (bench driver) on a Rehras paath clip, lets it lock
 * Rehras and follow several lines, presses Stop, and asserts Stop emitted NO screen change:
 * no Bani/shabad open, no verse change, no Bani-length change (the old bug: Stop restored
 * the user's short length, the long Rehras reloaded and the pane jumped to line 1).
 * Then presses Start again and Stop again (the user's own length must survive the cycle),
 * and checks the deferred-restore rule (pendingLengthAction).
 *
 * Usage: VF_TEST_BANI_LENGTH=short|medium|long node -r ./no-shadow-preload.js stop-keeps-screen-test.js [clip.wav]
 */
const fs = require('fs');
const path = require('path');
const { createDriver, COMPONENT } = require(path.join(__dirname, 'bench-driver'));

const CLIP = process.argv[2] || require('path').join(require('os').homedir(), 'personal/live-darbar-venues/clips/bn01_dy1bAclA25k_0-520.wav');
const MODEL = require('./speech-pack').speechModel().onnx;
const USERDATA = process.env.VF_BANIDB_USER_DATA || path.join(process.env.HOME, 'Library/Application Support/SikhiToTheMax');
const USER_LENGTH = process.env.VF_TEST_BANI_LENGTH || 'short';
const SR = 16000;
const CHUNK = 2048;
const LINES_AFTER_LOCK = 6;

function readWav(file) {
  const b = fs.readFileSync(file);
  let off = 12;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const sz = b.readUInt32LE(off + 4);
    if (id === 'data') {
      const n = Math.floor(sz / 2);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i += 1) out[i] = b.readInt16LE(off + 8 + i * 2) / 32768;
      return out;
    }
    off += 8 + sz + (sz & 1);
  }
  throw new Error('no data chunk');
}

// Test-only handle on the component's length state (in memory, nothing shipped changes).
const marker = "  const listening = status === 'listening' || status === 'connecting';";
const src = fs.readFileSync(process.env.VF_TEST_SOURCE || COMPONENT, 'utf8');
if (!src.includes(marker)) throw new Error('marker changed');
const source = src.replace(
  marker,
  `  require('process').__vfStop = { lengthOverrideRef,
    pendingLengthRef: typeof pendingLengthRef !== 'undefined' ? pendingLengthRef : { current: null },
    pendingLengthAction: typeof pendingLengthAction !== 'undefined' ? pendingLengthAction : null };\n${marker}`,
);

const SCREEN = new Set(['shabad', 'pane', 'verse', 'length', 'seeking']);
let fails = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) fails += 1;
};

async function followUntil(driver, pcm, from, events, done) {
  let p = from;
  for (; p < pcm.length && !done(); p += CHUNK) {
    const chunk = pcm.subarray(p, Math.min(p + CHUNK, pcm.length));
    await driver.push(chunk, (p + chunk.length) / SR);
  }
  return p;
}

(async () => {
  const pcm = readWav(CLIP);
  const events = [];
  const driver = await createDriver({
    model: MODEL,
    userData: USERDATA,
    source,
    onEvent: (ev) => {
      if (SCREEN.has(ev.type) || ev.type === 'component-error') events.push(ev);
    },
  });
  const h = require('process').__vfStop;
  const screen = () => {
    const s = { bani: null, verse: null, length: USER_LENGTH, slide: false };
    for (const e of events) {
      if (e.type === 'shabad') s.bani = e.shabadId;
      if (e.type === 'verse') s.verse = e.verseId;
      if (e.type === 'length') s.length = e.length;
      if (e.type === 'seeking') s.slide = e.visible;
    }
    return s;
  };
  const versesSinceRehras = () => {
    const i = events.map((e) => e.shabadId).lastIndexOf('bani:21');
    return i < 0 ? 0 : new Set(events.slice(i).filter((e) => e.type === 'verse').map((e) => e.verseId)).size;
  };

  console.log(`clip ${path.basename(CLIP)}  user length ${USER_LENGTH}`);
  // Round 1: lock Rehras, follow several lines, Stop.
  await driver.start();
  let p = await followUntil(driver, pcm, 0, events, () => versesSinceRehras() >= LINES_AFTER_LOCK);
  const before = screen();
  console.log(`  at ${(p / SR).toFixed(0)} s: on screen ${JSON.stringify(before)}`);
  check(before.bani === 'bani:21', 'Rehras (bani 21) locked');
  check(versesSinceRehras() >= LINES_AFTER_LOCK, `followed >= ${LINES_AFTER_LOCK} Rehras lines`);
  // Rehras is raised to REHRAS_LENGTH (long on the stop branch, extra-long since 61488e2c), never lowered.
  const REHRAS_LEN = process.env.VF_TEST_REHRAS_LENGTH || 'extralong';
  const ORDER = ['short', 'medium', 'long', 'extralong'];
  const wantLength = ORDER.indexOf(USER_LENGTH) < ORDER.indexOf(REHRAS_LEN) ? REHRAS_LEN : USER_LENGTH;
  check(before.length === wantLength, `Rehras shown at ${wantLength} (user ${USER_LENGTH})`);
  const n0 = events.length;
  await driver.stopSession();
  const stopEvents = events.slice(n0).filter((e) => !(e.type === 'seeking' && before.slide && !e.visible));
  check(stopEvents.length === 0, `Stop emitted no screen change (${JSON.stringify(stopEvents)})`);
  check(JSON.stringify(screen()) === JSON.stringify({ ...before, slide: false }), 'same Bani, line and length after Stop');
  const pend = h.pendingLengthRef.current;
  if (wantLength !== USER_LENGTH) {
    check(pend && pend.prev === USER_LENGTH && pend.to === wantLength && pend.baniId === 21,
      `user length parked for later: ${JSON.stringify(pend)}`);
  } else {
    check(!pend, 'nothing to restore when the user already uses the long length');
  }

  // Round 2: Start again on the same Rehras, then Stop: the user's own length must survive.
  await driver.start();
  const n1 = events.length;
  p = await followUntil(driver, pcm, p, events, () => events.slice(n1).filter((e) => e.type === 'verse').length >= 3);
  const before2 = screen();
  check(events.slice(n1).some((e) => e.shabadId === 'bani:21'), 'restart re-opened Rehras');
  if (wantLength !== USER_LENGTH && h.pendingLengthAction) {
    const o = h.lengthOverrideRef.current;
    check(!h.pendingLengthRef.current && o && o.prev === USER_LENGTH,
      `restart took over the parked length (override ${JSON.stringify(o)})`);
  }
  const n2 = events.length;
  await driver.stopSession();
  const stop2 = events.slice(n2).filter((e) => !(e.type === 'seeking' && before2.slide && !e.visible));
  check(stop2.length === 0, `second Stop emitted no screen change (${JSON.stringify(stop2)})`);
  const pend2 = h.pendingLengthRef.current;
  if (wantLength !== USER_LENGTH) {
    check(pend2 && pend2.prev === USER_LENGTH, `user's own length still remembered after restart: ${JSON.stringify(pend2)}`);
  }

  // Deferred restore rule.
  const A = h.pendingLengthAction || (() => 'n/a');
  const pd = { prev: 'short', to: 'long', baniId: 21 };
  const rehras = { baniLength: 'long', isSundarGutkaBani: true, isCeremonyBani: false, sundarGutkaBaniId: 21 };
  check(A(pd, rehras) === 'keep', 'Rehras still up: keep the long length');
  check(A(pd, { ...rehras, isSundarGutkaBani: false }) === 'restore', 'shabad opened: restore user length');
  check(A(pd, { ...rehras, sundarGutkaBaniId: 2 }) === 'restore', 'another Bani opened: restore user length');
  check(A(pd, { ...rehras, isCeremonyBani: true }) === 'restore', 'ceremony opened: restore user length');
  check(A(pd, { ...rehras, baniLength: 'medium' }) === 'drop', 'length changed by hand: theirs stands');
  check(A(null, rehras) === 'keep', 'nothing pending: nothing happens');

  check(!events.some((e) => e.type === 'component-error'), 'no component errors');
  await driver.stop();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
