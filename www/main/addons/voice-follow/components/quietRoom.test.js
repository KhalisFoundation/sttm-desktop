// node --test: is the room silent (quietRoom.js).
const test = require('node:test');
const assert = require('node:assert');
const { QUIET_MS, QUIET_SOHILA_MS, createQuietRoom, noteChunk, silentFor } = require('./quietRoom');

const CHUNK_S = 2048 / 48000; // the app's audio chunk
const STEP = CHUNK_S * 1000;
// Feed chunks from t0 for `secs` seconds at level rms(t); returns the time after the last one.
function feed(q, t0, secs, rms, g = 0.1) {
  let t = t0;
  for (; t < t0 + secs * 1000; t += STEP) noteChunk(q, t, rms(t), CHUNK_S, g);
  return t;
}
const room = () => 0.001; // the room's background noise
const singing = () => 0.1;

test('kirtan going on: never silent', () => {
  const q = createQuietRoom();
  const t = feed(q, 0, 600, singing);
  assert.strictEqual(silentFor(q, t, QUIET_MS), false);
});

test('silent 45 s after the room was heard: silent; 40 s: not yet', () => {
  const q = createQuietRoom();
  let t = feed(q, 0, 120, room); // the room's own noise is learnt
  t = feed(q, t, 300, singing);
  t = feed(q, t, 40, room);
  assert.strictEqual(silentFor(q, t, QUIET_MS), false);
  t = feed(q, t, 6, room);
  assert.strictEqual(silentFor(q, t, QUIET_MS), true);
});

test('Sohila Sahib: 30 s is enough', () => {
  const q = createQuietRoom();
  let t = feed(q, 0, 120, room);
  t = feed(q, t, 120, singing);
  t = feed(q, t, 31, room);
  assert.strictEqual(silentFor(q, t, QUIET_SOHILA_MS), true);
  assert.strictEqual(silentFor(q, t, QUIET_MS), false);
});

test('a cough (1 s) does not break the silence; 5 s of talk does', () => {
  const q = createQuietRoom();
  let t = feed(q, 0, 120, room);
  t = feed(q, t, 20, room);
  t = feed(q, t, 1, singing);
  t = feed(q, t, 30, room);
  assert.strictEqual(silentFor(q, t, QUIET_MS), true);
  t = feed(q, t, 5, singing);
  t = feed(q, t, 20, room);
  assert.strictEqual(silentFor(q, t, QUIET_MS), false);
});

test('soft simran well above the room noise is not silence', () => {
  const q = createQuietRoom();
  let t = feed(q, 0, 120, room);
  t = feed(q, t, 120, () => 0.006); // 6x the room, under a quarter of the Gurbani
  assert.strictEqual(silentFor(q, t, QUIET_MS), false);
});

test('no background noise learnt yet (the first minute): never silent', () => {
  const q = createQuietRoom();
  const t = feed(q, 0, 50, room);
  assert.strictEqual(silentFor(q, t, QUIET_MS), false);
});

test('after a Shabad lock the silence is counted afresh, the room noise is kept', () => {
  const q = createQuietRoom();
  let t = feed(q, 0, 300, room);
  const locked = { ...createQuietRoom(), floor: q.floor, floorNow: q.floorNow };
  t = feed(locked, t, 20, room);
  assert.strictEqual(silentFor(locked, t, QUIET_MS), false); // only 20 s since the lock
  t = feed(locked, t, 30, room);
  assert.strictEqual(silentFor(locked, t, QUIET_MS), true);
});

test('a gap in the audio (mic or app stalled) is not silence', () => {
  const q = createQuietRoom();
  let t = feed(q, 0, 120, room);
  t = feed(q, t + 60000, 1, room); // a minute with no audio at all, then the room again
  assert.strictEqual(silentFor(q, t, QUIET_MS), false);
  t = feed(q, t, 45, room);
  assert.strictEqual(silentFor(q, t, QUIET_MS), true);
});
