// node --test: Waheguru Simran heard (simran.js).
const test = require('node:test');
const assert = require('node:assert');
const {
  isWaheguru,
  countSimran,
  fatehIn,
  createSimran,
  noteHeard,
  simranStep,
  simranNow,
} = require('./simran');

// Stand-ins for other things heard (plain Punjabi, not Gurbani).
const SINGING = 'ਅੱਜ ਸੰਗਤ ਬਹੁਤ ਆਈ ਹੈ ਜੀ';
const SINGING_2 = 'ਲੰਗਰ ਤਿਆਰ ਹੈ ਸਾਰੇ ਛਕ ਕੇ ਜਾਣਾ';

// The recognizer gives a transcript of its last few seconds every half second.
function hear(s, t0, secs, text) {
  const steps = [];
  let t = t0;
  for (; t < t0 + secs * 1000; t += 500) {
    noteHeard(s, t, typeof text === 'function' ? text(t) : text);
    const st = simranStep(s, t);
    if (st) steps.push([st, t]);
  }
  return { t, steps };
}

test('Waheguru as the speech model spells it, and nothing else', () => {
  ['ਵਾਹਿਗੁਰੂ', 'ਵਾਹਗੁਰੂ', 'ਵਾਹੇਗੁਰੂ', 'ਵਾਹਿਗੁਰ', 'ਵਹਿਗੁਰ', 'ਵਾਹਿੁਰ'].forEach((w) =>
    assert.ok(isWaheguru(w), w),
  );
  ['ਗੁਰੂ', 'ਵਾਹੁ', 'ਸਤਿਗੁਰੂ', 'ਗੁਰਪੁਰਿ', 'ਵਾਹਿਗੁਰੂਵਾਹਿਗੁਰੂ'].forEach((w) =>
    assert.ok(!isWaheguru(w), w),
  );
  assert.deepStrictEqual(countSimran('ਵਾਹਿ ਗੁਰੂ ਵਾਹਿਗੁਰੂ ਜੀਉ'.split(' ')), { hits: 2, total: 3 });
});

test('Simran for 8 s: start; stopped for 10 s: end', () => {
  const s = createSimran();
  let r = hear(s, 0, 30, 'ਵਾਹਿਗੁਰੂ ਵਾਹਿਗੁਰੂ ਵਾਹਿਗੁਰੂ');
  assert.strictEqual(r.steps.length, 1);
  assert.strictEqual(r.steps[0][0], 'start');
  assert.ok(r.steps[0][1] >= 8000 && r.steps[0][1] <= 15000, String(r.steps[0][1]));
  assert.strictEqual(simranNow(s, r.t - 500), true);
  r = hear(s, r.t, 40, SINGING);
  assert.deepStrictEqual(
    r.steps.map((x) => x[0]),
    ['end'],
  );
  assert.strictEqual(simranNow(s, r.t - 500), false);
});

test('Simran with mis-heard words and other words in between (ਸਤਿ ਨਾਮ ਵਾਹਿਗੁਰੂ) still counts', () => {
  const s = createSimran();
  const said = ['ਸਤਿ ਨਾਮ ਵਾਹਿਗੁਰੂ', 'ਵਾਹਿ ਕਰ ਵਹਿੁਰ', 'ਵਾਹਿੁਰ ਸਤ ਨਾਮ ਵਾਹਿਗੁਰ'];
  const r = hear(s, 0, 30, (t) => said[Math.floor(t / 500) % 3]);
  assert.deepStrictEqual(
    r.steps.map((x) => x[0]),
    ['start'],
  );
});

test('the Fateh, a pangti with ਵਾਹਿਗੁਰੂ, or kirtan: never Simran', () => {
  const s = createSimran();
  let r = hear(s, 0, 60, SINGING);
  r = hear(s, r.t, 5, 'ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖਾਲਸਾ ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫਤਹਿ');
  r = hear(s, r.t, 30, SINGING_2);
  assert.strictEqual(r.steps.length, 0);
  assert.strictEqual(simranNow(s, r.t - 500), false);
});

test('a short Dhan Guru line inside the Simran does not end it', () => {
  const s = createSimran();
  let r = hear(s, 0, 20, 'ਵਾਹਿਗੁਰੂ ਵਾਹਿਗੁਰੂ');
  r = hear(s, r.t, 6, 'ਧਨ ਗੁਰੂ ਗੋਬਿੰਦ ਸਾਹਿਬ');
  r = hear(s, r.t, 10, 'ਵਾਹਿਗੁਰੂ ਵਾਹਿਗੁਰੂ');
  assert.ok(!r.steps.some((x) => x[0] === 'end'));
});

test('nothing heard yet: not Simran', () => {
  const s = createSimran();
  assert.strictEqual(simranNow(s, 1000), false);
  assert.strictEqual(simranStep(s, 1000), null);
});

test('"heard right now" (the lock gate) clears within seconds of the Simran stopping', () => {
  const s = createSimran();
  let r = hear(s, 0, 30, 'ਵਾਹਿਗੁਰੂ ਵਾਹਿਗੁਰੂ');
  assert.strictEqual(simranNow(s, r.t - 500), true);
  r = hear(s, r.t, 5, SINGING);
  assert.strictEqual(simranNow(s, r.t - 500), false);
});

test('two words join into one Waheguru only when the first sounds like ਵਾਹਿ', () => {
  assert.deepStrictEqual(countSimran(['ਵਾਹਿ', 'ਗੁਰੂ']), { hits: 1, total: 1 });
  assert.deepStrictEqual(countSimran(['ਵਹਿ', 'ਗੁਰੂ']), { hits: 1, total: 1 });
  // another word before ਗੁਰੂ is never a Waheguru, however close the two together are
  assert.deepStrictEqual(countSimran(['ਸਾਮਿ', 'ਗੁਰੂ']), { hits: 0, total: 2 });
});

test('the Fateh is recognised as heard, with ਖ਼ and ਫ਼ in either spelling', () => {
  assert.ok(fatehIn('ਵਾਹਿਗੁਰ ਜੀ ਕਾ ਖਾਲਸਾ ਵਾਹਿਗੁਰ ਜੀ ਕੀ ਫਤਿਹ'));
  assert.ok(fatehIn('ਵਹਿਗੁਰ ਚੀ ਕ ਖਾਸਾ'));
  assert.ok(fatehIn('ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ \u0A59ਾਲਸਾ'));
  assert.ok(fatehIn('ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ \u0A5Eਤਿਹ'));
  assert.ok(!fatehIn('ਵਾਹਿਗੁਰੂ ਵਾਹਿਗੁਰੂ ਜੀਉ'));
  assert.ok(!fatehIn(SINGING));
});
