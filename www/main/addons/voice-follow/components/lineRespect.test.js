// Unit tests for lineRespect.js — run with: node --test www/main/addons/voice-follow/components/
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createLineRespect,
  lineOfVerse,
  SEVADAAR_HOLD_MS,
  APP_WRITE_GRACE_MS,
  HOLD_MOVE_MS,
  HOLD_MOVE_OUTPUTS,
  OVERRIDE_LOG_S,
} = require('./lineRespect');
const { Follower } = require('../engine/follower');
const { FollowerV2 } = require('../engine/follower2');

const ctx = (now, extra = {}) => ({
  now,
  following: true,
  sameShabad: true,
  known: true,
  ...extra,
});
const F = {}; // a follower identity

describe('tag: app writes vs sevadaar moves', () => {
  it('a line the app just wrote is the app’s own', () => {
    const lr = createLineRespect();
    lr.appWrote(101, 1000);
    assert.equal(lr.classify(101, ctx(1050)), 'app');
  });
  it('an earlier app write still counts while a later one is pending (batched renders)', () => {
    const lr = createLineRespect();
    lr.appWrote(101, 1000);
    lr.appWrote(102, 1100);
    assert.equal(lr.classify(101, ctx(1200)), 'app');
  });
  it('the line the app has just left, put back by the sevadaar, is the sevadaar’s', () => {
    const lr = createLineRespect();
    lr.appWrote(101, 1000);
    lr.appWrote(102, 2000);
    assert.equal(lr.classify(101, ctx(3000)), 'sevadaar');
  });
  it('any other line in the followed Shabad is the sevadaar’s', () => {
    const lr = createLineRespect();
    lr.appWrote(101, 1000);
    assert.equal(lr.classify(103, ctx(1200)), 'sevadaar');
  });
  it('an old app write no longer covers the same line', () => {
    const lr = createLineRespect();
    lr.appWrote(101, 1000);
    assert.equal(lr.classify(101, ctx(1000 + APP_WRITE_GRACE_MS + 1)), 'sevadaar');
  });
  it('not following, another Shabad, an unknown line or no line: nothing to do', () => {
    const lr = createLineRespect();
    assert.equal(lr.classify(103, ctx(0, { following: false })), 'ignore');
    assert.equal(lr.classify(103, ctx(0, { sameShabad: false })), 'ignore');
    assert.equal(lr.classify(103, ctx(0, { known: false })), 'ignore');
    assert.equal(lr.classify(null, ctx(0)), 'ignore');
  });
});

describe('hold after a sevadaar move', () => {
  it('without a move every line is written (behaviour unchanged)', () => {
    const lr = createLineRespect();
    assert.deepEqual(lr.gate({ lineIndex: 7, confidence: 0.5 }, 0, F), {
      write: true,
      reason: null,
    });
  });
  it('the sevadaar’s own line and the next pangti pass; the next one ends the hold', () => {
    const lr = createLineRespect();
    lr.adopt(105, 5, 0, F);
    assert.equal(lr.gate({ lineIndex: 5, confidence: 0.9 }, 500, F).write, true);
    assert.deepEqual(lr.gate({ lineIndex: 6, confidence: 0.5 }, 1000, F), {
      write: true,
      reason: 'next',
    });
    assert.equal(lr.holding(), false);
  });
  it('the old guess is held even when it is the next pangti (the sevadaar stepped back)', () => {
    const lr = createLineRespect();
    lr.adopt(105, 5, 0, F, 6);
    assert.deepEqual(lr.gate({ lineIndex: 6, confidence: 0.9 }, 500, F), {
      write: false,
      reason: 'hold',
    });
  });
  it('going back to the old guess is held', () => {
    const lr = createLineRespect();
    lr.adopt(105, 5, 0, F);
    assert.deepEqual(lr.gate({ lineIndex: 3, confidence: 0.9 }, 500, F), {
      write: false,
      reason: 'hold',
    });
  });
  it('a strong, repeated match on another pangti gets through', () => {
    const lr = createLineRespect();
    lr.adopt(105, 5, 0, F);
    let g;
    for (let k = 0; k < HOLD_MOVE_OUTPUTS; k += 1) {
      g = lr.gate(
        { lineIndex: 3, confidence: 0.9 },
        100 + (k * HOLD_MOVE_MS) / (HOLD_MOVE_OUTPUTS - 1),
        F,
      );
    }
    assert.deepEqual(g, { write: true, reason: 'strong' });
    assert.equal(lr.holding(), false);
  });
  it('enough outputs but too short a time is still held', () => {
    const lr = createLineRespect();
    lr.adopt(105, 5, 0, F);
    let g;
    for (let k = 0; k < HOLD_MOVE_OUTPUTS + 3; k += 1)
      g = lr.gate({ lineIndex: 3, confidence: 0.9 }, 100 + k * 10, F);
    assert.equal(g.write, false);
  });
  it('weak matches never build up, and the follower agreeing resets the run', () => {
    const lr = createLineRespect();
    lr.adopt(105, 5, 0, F);
    for (let k = 0; k < 20; k += 1)
      assert.equal(lr.gate({ lineIndex: 3, confidence: 0.45 }, k * 300, F).write, false);
    for (let k = 0; k < 5; k += 1) lr.gate({ lineIndex: 3, confidence: 0.9 }, 6000 + k * 300, F);
    lr.gate({ lineIndex: 5, confidence: 0.9 }, 7600, F);
    assert.equal(lr.gate({ lineIndex: 3, confidence: 0.9 }, 7900, F).write, false);
  });
  it('steady forward progress past the next pangti counts as one run (fast paath)', () => {
    const lr = createLineRespect();
    lr.adopt(105, 5, 0, F);
    const lines = [7, 7, 8, 8, 9, 9];
    let g;
    lines.forEach((l, k) => {
      g = lr.gate({ lineIndex: l, confidence: 0.8 }, 200 + k * 600, F);
    });
    assert.deepEqual(g, { write: true, reason: 'strong' });
  });
  it('the hold ends after SEVADAAR_HOLD_MS', () => {
    const lr = createLineRespect();
    lr.adopt(105, 5, 0, F);
    assert.deepEqual(lr.gate({ lineIndex: 2, confidence: 0.5 }, SEVADAAR_HOLD_MS, F), {
      write: true,
      reason: 'expired',
    });
  });
  it('a new follower (another Shabad) carries no hold', () => {
    const lr = createLineRespect();
    lr.adopt(105, 5, 0, F);
    assert.deepEqual(lr.gate({ lineIndex: 2, confidence: 0.5 }, 100, {}), {
      write: true,
      reason: null,
    });
  });
});

describe('override log', () => {
  it('the first app move after a sevadaar move is logged as next or override', () => {
    const lr = createLineRespect();
    lr.adopt(105, 5, 0, F);
    assert.deepEqual(lr.afterWrite(106, 6, 4000, F), {
      kind: 'next',
      from: 105,
      to: 106,
      afterS: 4,
    });
    assert.equal(lr.afterWrite(107, 7, 5000, F), null);
    lr.adopt(110, 10, 20000, F);
    assert.deepEqual(lr.afterWrite(103, 3, 23000, F), {
      kind: 'override',
      from: 110,
      to: 103,
      afterS: 3,
    });
  });
  it('a move later than OVERRIDE_LOG_S is not logged', () => {
    const lr = createLineRespect();
    lr.adopt(105, 5, 0, F);
    assert.equal(lr.afterWrite(103, 3, OVERRIDE_LOG_S * 1000 + 1, F), null);
  });
});

describe('lineOfVerse', () => {
  it('finds the row, nearest the cursor when repeated', () => {
    assert.equal(lineOfVerse([1, 2, 3, 2], 2, 3), 3);
    assert.equal(lineOfVerse([1, 2, 3, 2], 2, 0), 1);
    assert.equal(lineOfVerse([1, 2, 3], 9, 0), -1);
  });
});

describe('follower seek (adopt)', () => {
  const lines = [['ਕ'], ['ਖ'], ['ਗ'], ['ਘ'], ['ਙ']].map((words, i) => ({
    verseId: 100 + i,
    words,
    text: words[0],
  }));
  it('the line follower moves to the line and forgets the old line’s score', () => {
    const sp = { encode: () => [1] };
    const f = new Follower({}, sp, lines, { inputSr: 16000 });
    f.cur = 1;
    f.score[1] = 0;
    f.score[3] = -2;
    const wrapped = Object.create(f); // as the replay harness wraps it
    assert.equal(wrapped.seek(3), true);
    assert.equal(f.cur, 3);
    assert.equal(f.score[3], 0);
    assert.ok(f.score[1] < 0);
    assert.equal(f.challenger, null);
    assert.equal(f.seek(99), false);
  });
  it('the paath follower moves to the line', () => {
    const f = new FollowerV2({}, lines, { inputSr: 16000 });
    f.cur = 0;
    f.cand = { line: 4, n: 1 };
    const wrapped = Object.create(f);
    assert.equal(wrapped.seek(2), true);
    assert.equal(f.cur, 2);
    assert.equal(f.lastCur, 2);
    assert.equal(f.cand, null);
    assert.equal(f.seek(-1), false);
  });
});
