const test = require('node:test');
const assert = require('node:assert');
const {
  FAST_ON_WPS,
  FAST_OFF_WPS,
  createPace,
  fastEnough,
  akhandOverlayOn,
  setAkhandOverlay,
  onAkhandOverlay,
} = require('./akhandOverlay');

// Pangtis of `words` words, one every `secs` seconds, from verse id 100.
const read = (pace, n, words, secs, from = 100, t0 = 0) => {
  for (let i = 0; i < n; i += 1) pace.line(from + i, words, t0 + i * secs * 1000);
};

test('no pace until enough pangtis are read in order', () => {
  const pace = createPace();
  read(pace, 4, 8, 4); // 3 steps
  assert.strictEqual(pace.wps(), null);
  pace.line(104, 8, 16000);
  assert.strictEqual(pace.wps(), 2);
});

test('a fast reading brings the block up, a slow one keeps the normal overlay', () => {
  const fast = createPace();
  read(fast, 13, 8, 4); // 2 words/s
  assert.ok(fastEnough(fast.wps(), false));
  const slow = createPace();
  read(slow, 13, 8, 7); // ~1.14 words/s
  assert.ok(!fastEnough(slow.wps(), false));
});

test('two thresholds: between them the overlay stays as it is', () => {
  const mid = (FAST_ON_WPS + FAST_OFF_WPS) / 2;
  assert.ok(!fastEnough(mid, false));
  assert.ok(fastEnough(mid, true));
  assert.ok(!fastEnough(FAST_OFF_WPS - 0.01, true));
  assert.ok(!fastEnough(null, true));
});

test('steps back, jumps and long pauses are not counted', () => {
  const pace = createPace();
  read(pace, 4, 8, 4); // 3 steps
  pace.line(90, 8, 20000); // a jump back: no step
  pace.line(91, 8, 80000); // 60 s later: a pause, no step
  read(pace, 4, 8, 4, 92, 84000); // 3 more steps at 2 words/s
  assert.strictEqual(pace.wps(), 2);
});

test('the pace follows the latest pangtis', () => {
  const pace = createPace();
  read(pace, 13, 8, 4); // 2 words/s
  read(pace, 13, 8, 8, 113, 52000); // then 1 word/s
  assert.strictEqual(pace.wps(), 1);
  pace.reset();
  assert.strictEqual(pace.wps(), null);
});

test('listeners hear each change once', () => {
  const heard = [];
  const off = onAkhandOverlay((v) => heard.push(v));
  setAkhandOverlay(true);
  setAkhandOverlay(true);
  setAkhandOverlay(false);
  off();
  setAkhandOverlay(true);
  assert.deepStrictEqual(heard, [true, false]);
  assert.strictEqual(akhandOverlayOn(), true);
  setAkhandOverlay(false);
});
