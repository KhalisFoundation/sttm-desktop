// Unit tests for switchPolicy.js — run with: node --test www/main/addons/voice-follow/components/
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  nextSwitchWins,
  nextEmptyStreak,
  maxLineScore,
  screenByFirstLetters,
  bestLineMatch,
  orderFreeLineScore,
} = require('./switchPolicy');
// Shipped tuning, read from VoiceFollow.jsx so tests track the app's config.
const { CFG, CONFIRM, HOLD } = require('./switchPolicy.config');

describe('nextSwitchWins', () => {
  it('needs 3 consecutive borderline wins to reach confirm', () => {
    let wins = 0;
    // Borderline: passes the gate but not the strong zone.
    for (let i = 0; i < 2; i += 1) {
      const r = nextSwitchWins(wins, 0.7, 0.5, CFG);
      assert.equal(r.decisive, false);
      wins = r.wins;
    }
    assert.equal(wins, 2);
    assert.ok(wins < CONFIRM, 'must not commit yet');
    wins = nextSwitchWins(wins, 0.7, 0.5, CFG).wins;
    assert.equal(wins, 3);
    assert.ok(wins >= CONFIRM, 'commits on the third borderline win');
  });

  it('commits a decisive win in 2 decodes', () => {
    let wins = 0;
    const r = nextSwitchWins(wins, 0.94, 0.31, CFG);
    assert.equal(r.decisive, true);
    wins = r.wins;
    assert.equal(wins, 2);
    wins = nextSwitchWins(wins, 0.94, 0.31, CFG).wins;
    assert.ok(wins >= CONFIRM, 'decisive switch commits faster');
  });

  it('the known confusion zone (0.60 / 0.20 margin) never advances', () => {
    // 0.60 sits below the absolute floor, so it is not even a win —
    // neither a slow win nor a fast one.
    const r = nextSwitchWins(0, 0.6, 0.4, CFG);
    assert.equal(r.decisive, false);
    assert.equal(r.wins, 0);
  });

  it('a non-winning decode steps back but never below zero', () => {
    assert.equal(nextSwitchWins(2, 0.4, 0.5, CFG).wins, 1);
    assert.equal(nextSwitchWins(0, 0.4, 0.5, CFG).wins, 0);
  });

  it('a candidate below the absolute floor never advances, even with margin', () => {
    const r = nextSwitchWins(0, 0.5, 0.1, CFG);
    assert.equal(r.wins, 0);
    assert.equal(r.decisive, false);
  });

  it('boundary: just below the strong zone is a slow win only', () => {
    const r = nextSwitchWins(0, 0.79, 0.5, CFG);
    assert.equal(r.decisive, false);
    assert.equal(r.wins, 1);
  });

  it('boundary: on the strong thresholds counts double', () => {
    const r = nextSwitchWins(0, 0.8, 0.5, CFG);
    assert.equal(r.decisive, true);
    assert.equal(r.wins, 2);
  });

  it('high absolute score with a thin margin is a slow win only', () => {
    const r = nextSwitchWins(0, 0.95, 0.79, CFG);
    assert.equal(r.decisive, false);
    assert.equal(r.wins, 1);
  });

  it('mixed strong + borderline commits (2 + 1 = 3)', () => {
    let { wins } = nextSwitchWins(0, 0.9, 0.4, CFG);
    assert.equal(wins, 2);
    ({ wins } = nextSwitchWins(wins, 0.7, 0.5, CFG));
    assert.ok(wins >= CONFIRM);
  });

  it('a miss after a strong win steps back to 1', () => {
    const { wins } = nextSwitchWins(2, 0.4, 0.5, CFG);
    assert.equal(wins, 1);
  });

  it('heard-length hold: a thin fragment neither wins nor steps back', () => {
    const cfg = { ...CFG, hypMin: 8 };
    // Would be a decisive win on the scores — but only 5 chars heard.
    const held = nextSwitchWins(2, 0.94, 0.31, { ...cfg, hypLen: 5 });
    assert.deepEqual(held, { wins: 2, decisive: false, held: true });
    // Same decode with enough audio proceeds normally.
    const go = nextSwitchWins(2, 0.94, 0.31, { ...cfg, hypLen: 12 });
    assert.equal(go.decisive, true);
    assert.ok(go.wins > 2);
  });

  it('heard-length hold: a would-be loss also holds instead of stepping back', () => {
    const cfg = { ...CFG, hypMin: 8, hypLen: 3 };
    assert.equal(nextSwitchWins(2, 0.4, 0.5, cfg).wins, 2);
  });

  it('no hypMin configured behaves exactly as before', () => {
    assert.deepEqual(nextSwitchWins(2, 0.94, 0.31, CFG), { wins: 4, decisive: true, held: false });
  });

  it('held decodes report held so callers can freeze the display too', () => {
    const r = nextSwitchWins(1, 0.9, 0.2, { ...CFG, hypMin: 8, hypLen: 2 });
    assert.equal(r.held, true);
    assert.equal(r.wins, 1);
  });
});

describe('nextEmptyStreak', () => {
  it('holds the shortlist across a few empty decodes, then clears', () => {
    const localHold = 4;
    let streak = 0;
    for (let i = 0; i < localHold; i += 1) {
      const r = nextEmptyStreak(streak, false, localHold);
      streak = r.streak;
      assert.equal(r.clear, false, `decode ${i + 1} must hold, not wipe`);
    }
    const done = nextEmptyStreak(streak, false, localHold);
    assert.equal(done.clear, true, 'sustained silence finally clears');
  });

  it('any decode with votes resets the streak', () => {
    const r = nextEmptyStreak(3, true, 4);
    assert.deepEqual(r, { streak: 0, clear: false });
  });

  it('a realistic 25s singing pause never clears at the shipped hold', () => {
    // 25s at hop 0.5 = 50 empty decodes; shipped HOLD must exceed that.
    assert.ok(HOLD > 50, `shipped hold ${HOLD} must cover a 25s pause`);
    let streak = 0;
    let cleared = false;
    for (let i = 0; i < 50; i += 1) {
      const r = nextEmptyStreak(streak, false, HOLD);
      streak = r.streak;
      cleared = cleared || r.clear;
    }
    assert.equal(cleared, false);
  });
});

describe('maxLineScore', () => {
  const HYP = 'aaaabbbbccccddddeeeeffffgggghhhh';
  it('a fully-heard long line scores ~1.0', () => {
    assert.ok(maxLineScore(HYP, [HYP], 15) > 0.99);
  });

  it('a short line contained in the hyp is discounted by the length penalty', () => {
    const short = 'bbbb';
    const raw = maxLineScore(HYP, [short], 0);
    const penalised = maxLineScore(HYP, [short], 15);
    assert.equal(raw, 1);
    assert.ok(penalised < raw, 'penalty must bite');
    assert.equal(penalised, (raw * short.length) / 15);
  });

  it('minLineChars = 0 disables the penalty (legacy path)', () => {
    assert.equal(maxLineScore(HYP, ['bbbb'], 0), 1);
  });

  it('empty hyp or line set scores 0', () => {
    assert.equal(maxLineScore('', ['bbbb'], 15), 0);
    assert.equal(maxLineScore(HYP, [], 15), 0);
  });
});

describe('screenByFirstLetters', () => {
  const FL = new Map([
    [11, 'hhgs'],
    [22, 'wwww'],
    [33, 'hg'],
    [44, ''],
  ]);
  it('keeps plausible shabads best-first, drops the rest', () => {
    const got = screenByFirstLetters('hg', FL, 999, 2, 10);
    assert.deepEqual(
      got.map((e) => e.id),
      [11, 33],
    );
    assert.ok(got[0].overlap >= got[1].overlap);
  });

  it('excludes the shabad already on screen', () => {
    assert.deepEqual(
      screenByFirstLetters('hhgs', FL, 11, 2, 10).map((e) => e.id),
      [33],
    );
  });

  it('caps the survivor list', () => {
    const got = screenByFirstLetters('hg', FL, 999, 1, 1);
    assert.equal(got.length, 1);
  });

  it('empty heard text screens nothing', () => {
    assert.deepEqual(screenByFirstLetters('', FL, 999, 2, 10), []);
  });

  it('the length bound skips pairs that cannot overlap enough', () => {
    // 'z' alone can never reach overlap 2 against anything.
    assert.deepEqual(screenByFirstLetters('z', FL, 999, 2, 10), []);
  });

  it('numeric and string ids compare equal against the exclusion', () => {
    const objForm = { 11: 'hhgs', 33: 'hg' };
    assert.deepEqual(
      screenByFirstLetters('hhgs', objForm, 11, 2, 10).map((e) => e.id),
      ['33'],
    );
  });
});

describe('bestLineMatch', () => {
  it('returns the winning line index with the maxLineScore value', () => {
    const lines = ['zzzz', 'aaaabbbbccccdddd'];
    const m = bestLineMatch('aaaabbbbcccc', lines, 0);
    assert.equal(m.index, 1);
    assert.equal(m.s, maxLineScore('aaaabbbbcccc', lines, 0));
  });

  it('shares the short-line penalty with maxLineScore', () => {
    const m = bestLineMatch('aaaabbbbccccdddd', ['bbbb'], 15);
    assert.equal(m.index, 0);
    assert.equal(m.s, maxLineScore('aaaabbbbccccdddd', ['bbbb'], 15));
  });

  it('empty input scores 0 with index -1', () => {
    assert.deepEqual(bestLineMatch('', ['bbbb'], 0), { s: 0, index: -1 });
  });
});

describe('orderFreeLineScore', () => {
  // Level 2 benchmark clip 20: the rahao "mere laal jio tera ant na jaana" was
  // re-sung as "tera ant na jaana mere laal"; order-sensitive scoring gave the
  // current shabad ~0.62 while a shabad holding the sung order scored ~0.9.
  const line = ['ਮੇਰੇ', 'ਲਾਲ', 'ਜੀਉ', 'ਤੇਰਾ', 'ਅੰਤੁ', 'ਨ', 'ਜਾਣਾ'];
  it('scores the same bag of words highly regardless of word order', () => {
    const rotated = ['ਤੇਰਾ', 'ਅੰਤੁ', 'ਨ', 'ਜਾਣਾ', 'ਮੇਰੇ', 'ਲਾਲ'];
    assert.ok(orderFreeLineScore(rotated, [line], 15) >= 0.8);
  });
  it('stays low for unrelated words', () => {
    const other = ['ਹਰਿ', 'ਜਨ', 'ਬੋਲਤ', 'ਸ੍ਰੀਰਾਮ', 'ਨਾਮਾ'];
    assert.ok(orderFreeLineScore(other, [line], 15) < 0.5);
  });
  it('applies the short-line containment penalty and guards empty input', () => {
    assert.ok(orderFreeLineScore(['ਹਰਿ', 'ਹਰਿ'], [['ਹਰਿ']], 15) < 0.3);
    assert.equal(orderFreeLineScore([], [line], 15), 0);
    assert.equal(orderFreeLineScore(['ਹਰਿ'], [line], 15), 0);
    assert.equal(orderFreeLineScore(['ਹਰਿ', 'ਜਨ'], [], 15), 0);
  });
});
