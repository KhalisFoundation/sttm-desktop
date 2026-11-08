// The self-score: a Shabad that Voice Autopilot shows after a Bani is scored as that Shabad.
// Run with: node --test www/main/addons/voice-follow/shadow/score.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { perSecond, contentKey, scoreTimelines } = require('./score');

describe('score: system timeline after a Bani', () => {
  it('a new Shabad clears the previous Bani (and a Bani clears the Shabad)', () => {
    const system = [
      { t: 0, bani: 4, verseId: 100 }, // Rehras
      { t: 10, shabadId: 77, verseId: 500 }, // then a kirtan Shabad
      { t: 20, bani: 9, verseId: 900 }, // then Sohila
    ];
    const keys = perSecond(system, 30, true).map(contentKey);
    assert.equal(keys[5], 'bani:4');
    assert.equal(keys[15], 'shabad:77');
    assert.equal(keys[25], 'bani:9');
  });

  it('the Shabad seconds score as agreement with the sevadaar’s Shabad', () => {
    const human = [
      { t: 0, bani: 4, verseId: 100, shabadId: null, ceremony: null, slide: null },
      { t: 60, shabadId: 77, verseId: 500, bani: null, ceremony: null, slide: null },
    ];
    const system = [
      { t: 1, bani: 4, verseId: 100 },
      { t: 61, shabadId: 77, verseId: 500 },
    ];
    const activity = [];
    for (let t = 0; t < 120; t += 1) activity.push({ t, level: 0.05, letters: 20, text: 'x' });
    const { score } = scoreTimelines({ human, system, activity, events: [] });
    // Every scored kirtan second agrees: the Bani ones and the Shabad ones alike, and the
    // Shabad ones as a Shabad. Before the fix the system label stayed bani:4 for the whole
    // Shabad and only the Bani-same-verse rescue hid it (baniSameVerse 59).
    assert.ok(score.agree >= 110, `agree ${score.agree}`);
    assert.equal(score.wrong, 0);
    assert.equal(score.baniSameVerse, 0);
  });
});
