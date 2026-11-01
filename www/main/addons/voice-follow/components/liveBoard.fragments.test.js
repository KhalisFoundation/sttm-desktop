// The panel reflects fragment-confirm weight: a board Shabad's evidence bar rises with each pangti
// heard in short pieces (liveBoard.fragments -> shabadEvidence). Run: node --test www/main/addons/voice-follow/components/
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createBoard } = require('./liveBoard');

describe('live board: fragment confirm feeds the evidence bars', () => {
  it('two pangtis heard in pieces give the Shabad two clear chips and a rising fill', () => {
    const board = createBoard();
    const now = 1000;
    board.follow({ now, cur: 1455, sCur: 0.4, cands: [] });
    board.fragments({
      now: now + 500,
      cur: 1455,
      sCur: 0.4,
      cands: [{ shabadId: 2879, verseId: 32496, line: 'ਜੇ ਭੁਲੀ ਜੇ ਚੁਕੀ ਸਾਈਂ', score: 0.9 }],
    });
    const one = board.evidenceOf(2879, now + 500);
    assert.equal(one.distinct, 1);
    assert.equal(one.pangtis[0].clear, true);
    board.fragments({
      now: now + 1000,
      cur: 1455,
      sCur: 0.4,
      cands: [{ shabadId: 2879, verseId: 32497, line: 'ਜਿਨੑਾ ਨੇਹੁ ਦੂਜਾਣੇ ਲਗਾ', score: 0.83 }],
    });
    const two = board.evidenceOf(2879, now + 1000);
    assert.equal(two.distinct, 2);
    assert.ok(two.fill > one.fill);
    assert.ok(board.evidenceSnapshot(now + 1000).some((e) => e.shabadId === 2879));
  });

  it('ignores hits for the Shabad on screen and outside the following phase', () => {
    const board = createBoard();
    board.fragments({
      now: 1,
      cur: 5,
      sCur: 0.4,
      cands: [{ shabadId: 9, verseId: 1, line: 'x', score: 0.9 }],
    });
    assert.equal(board.evidenceOf(9, 1), null);
    board.follow({ now: 2, cur: 5, sCur: 0.4, cands: [] });
    board.fragments({
      now: 3,
      cur: 5,
      sCur: 0.4,
      cands: [{ shabadId: 5, verseId: 1, line: 'x', score: 0.9 }],
    });
    assert.equal(board.evidenceOf(5, 3), null);
  });
});
