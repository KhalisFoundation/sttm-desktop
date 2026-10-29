// Aarti (Bani 22) profile of the position follower: a new pangti is shown on its first letter, and
// a move to another piece of the Aarti confirms in 3 windows; recited Banis keep the defaults.
const test = require('node:test');
const assert = require('node:assert');
const { FollowerV2, DEFAULTS, simplify } = require('./follower2');

// Test text only (letters for the alignment), not Gurbani.
const LINES = [
  { verseId: 1, text: 'ਕਖਗਘ ਚਛਜਝ ਟਠਡਢ' },
  { verseId: 2, text: 'ਤਥਦਧ ਪਫਬਭ ਯਰਲਵ' },
  { verseId: 3, text: 'ਸਹਕਖ ਗਘਚਛ ਜਝਟਠ' },
  { verseId: 4, text: 'ਡਢਤਥ ਦਧਪਫ ਬਭਮਯ' },
  { verseId: 5, text: 'ਰਲਵਸ ਹਕਗਚ ਜਟਡਤ' },
  { verseId: 6, text: 'ਦਪਬਮ ਯਲਸਹ ਕਘਛਝ' },
  { verseId: 7, text: 'ਠਢਥਧ ਫਭਰਵ ਹਖਘਜ' },
  { verseId: 8, text: 'ਮਨਣਙ ਞੜਲ਼ਸ਼ ਖ਼ਗ਼ਜ਼ਫ਼' },
  { verseId: 9, text: 'ਙਞਣਨ ਮਙਞਣ ਨਮਙਞ' },
  { verseId: 10, text: 'ਅਆਇਈ ਉਊਏਐ ਓਔਅਆ' },
  { verseId: 11, text: 'ਇਈਉਊ ਏਐਓਔ ਅਇਉਏ' },
  { verseId: 12, text: 'ਨਣਮਙ ਞਨਣਮ ਙਞਨਣ' },
];
const letters = (s) => [...simplify(s)];
const make = (baniId) => new FollowerV2({}, LINES, { baniId, startLine: 0, startAt: true });

test('Aarti uses its own profile; other Banis keep the defaults', () => {
  const a = make(22);
  assert.strictEqual(a.c.enterLetters, 1);
  assert.strictEqual(a.c.enterGain, 2);
  assert.strictEqual(a.c.jumpDwell, 3);
  assert.strictEqual(make('22').c.enterLetters, 1); // the id may come as a string
  assert.strictEqual(a.scaled(3).jumpDwell, 1); // a slower tier keeps about the same time
  [2, 4, 21, 23, 90].forEach((id) => {
    const f = make(id);
    assert.strictEqual(f.c.enterLetters, DEFAULTS.enterLetters);
    assert.strictEqual(f.c.enterGain, DEFAULTS.enterGain);
    assert.strictEqual(f.c.jumpDwell, DEFAULTS.jumpDwell);
  });
});

test('Aarti shows the next pangti on its first letter; a recited Bani waits for two', () => {
  const heard = [...letters('ਚਛਜਝ ਟਠਡਢ'), 'ਤ'];
  const a = make(22);
  assert.strictEqual(a.decide(heard).verseId, 2);
  const r = make(2);
  assert.strictEqual(r.decide(heard).verseId, 1);
  assert.strictEqual(r.decide([...heard, 'ਥ']).verseId, 2);
});

test('Aarti stays on the pangti when the next one is not heard', () => {
  const a = make(22);
  assert.strictEqual(a.decide(letters('ਚਛਜਝ ਟਠਡਢ')).verseId, 1);
  assert.strictEqual(a.decide([...letters('ਚਛਜਝ ਟਠਡਢ'), 'ਮ']).verseId, 1);
});

test('Aarti confirms a move to a far piece in 3 windows; a recited Bani in 4', () => {
  const far = letters('ਅਆਇਈ ਉਊਏਐ'); // line 10: outside the local search around line 0
  const windows = (f) => {
    for (let n = 1; n <= 6; n += 1) {
      const out = f.decide(far);
      if (out && out.verseId === 10) return n;
    }
    return null;
  };
  assert.strictEqual(windows(make(22)), 3);
  assert.strictEqual(windows(make(2)), 4);
});
