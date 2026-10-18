// Unit tests for liveBoard.js switchProgress — run with: node --test www/main/addons/voice-follow/components/
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createBoard, switchProgress } = require('./liveBoard');

describe('switchProgress', () => {
  it('is 0 for a Shabad far from winning and 1 at the commit', () => {
    assert.equal(switchProgress({ score: 0.3, wins: 0, needed: 3, sCur: 0.9 }), 0);
    assert.equal(switchProgress({ score: 0.9, wins: 3, needed: 3, sCur: 0.2 }), 1);
  });
  it('climbs with each win and with how near a decode came to winning', () => {
    const a = switchProgress({ score: 0.55, wins: 0, needed: 3, sCur: 0.3 });
    const b = switchProgress({ score: 0.7, wins: 0, needed: 3, sCur: 0.3 });
    const c = switchProgress({ score: 0.7, wins: 1, needed: 3, sCur: 0.3 });
    const d = switchProgress({ score: 0.7, wins: 2, needed: 3, sCur: 0.3 });
    assert.ok(a > 0 && a < b && b < c && c < d && d < 1);
    assert.equal(b, 0.25);
  });
  it('the board gives each challenger its progress', () => {
    const board = createBoard();
    board.follow({
      now: 1000,
      cur: 1,
      sCur: 0.3,
      cands: [{ shabadId: 7, score: 0.7, wins: 1, needed: 3, line: 'x' }],
    });
    const it7 = board.snapshot().find((x) => x.shabadId === 7);
    assert.equal(it7.prog, 0.5);
    assert.equal(board.snapshot().find((x) => x.shabadId === 1).prog, undefined);
  });
});
