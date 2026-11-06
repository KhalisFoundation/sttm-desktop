// node --test: Waheguru Simran heard (simran.js).
const test = require('node:test');
const assert = require('node:assert');
const {
  isWaheguru,
  countSimran,
  fatehIn,
  waheguruLine,
  createSimran,
  noteHeard,
  simranStep,
  simranNow,
  simranHeard,
  simranGone,
} = require('./simran');

// What the speech model may output for ਵਾਹਿਗੁਰੂ, built from the word itself (a letter or a vowel
// sign lost, or heard as two words), so that no other spelling of it is written out here.
const W = 'ਵਾਹਿਗੁਰੂ';
const lost = (word, ...marks) => marks.reduce((w, m) => w.replace(m, ''), word);
const twoWords = [W.slice(0, 4), W.slice(4)];

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

test('Waheguru as the speech model hears it, and nothing else', () => {
  [
    W,
    lost(W, 'ਿ'),
    W.replace('ਿ', 'ੇ'),
    lost(W, 'ੂ'),
    lost(W, 'ਾ', 'ੂ'),
    lost(W, 'ਗ', 'ੂ'),
  ].forEach((w) => assert.ok(isWaheguru(w), w));
  ['ਗੁਰੂ', 'ਵਾਹੁ', 'ਸਤਿਗੁਰੂ', 'ਗੁਰਪੁਰਿ', 'ਵਾਹਿਗੁਰੂਵਾਹਿਗੁਰੂ'].forEach((w) =>
    assert.ok(!isWaheguru(w), w),
  );
  assert.deepStrictEqual(countSimran([...twoWords, W, 'ਜੀਉ']), { hits: 2, total: 3 });
});

test('Simran for about 10 s: start; stopped for 10 s: end', () => {
  const s = createSimran();
  let r = hear(s, 0, 30, 'ਵਾਹਿਗੁਰੂ ਵਾਹਿਗੁਰੂ ਵਾਹਿਗੁਰੂ');
  assert.strictEqual(r.steps.length, 1);
  assert.strictEqual(r.steps[0][0], 'start');
  assert.ok(r.steps[0][1] >= 5000 && r.steps[0][1] <= 10000, String(r.steps[0][1]));
  assert.strictEqual(simranNow(s, r.t - 500), true);
  r = hear(s, r.t, 40, SINGING);
  assert.deepStrictEqual(
    r.steps.map((x) => x[0]),
    ['end'],
  );
  assert.strictEqual(simranNow(s, r.t - 500), false);
});

test('Simran heard imperfectly, with other words in between, still counts', () => {
  const s = createSimran();
  const said = [
    `ਸਤਿ ਨਾਮ ${W}`,
    `${twoWords[0]} ਕਰ ${lost(W, 'ਾ', 'ਗ', 'ੂ')}`,
    `${lost(W, 'ਗ', 'ੂ')} ਸਤਿ ਨਾਮ ${lost(W, 'ੂ')}`,
  ];
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

test('two words join into one Waheguru only when the first is its first half', () => {
  assert.deepStrictEqual(countSimran(twoWords), { hits: 1, total: 1 });
  assert.deepStrictEqual(countSimran([lost(twoWords[0], 'ਾ'), twoWords[1]]), { hits: 1, total: 1 });
  // another word before ਗੁਰੂ is never a Waheguru, however close the two together are
  assert.deepStrictEqual(countSimran(['ਸਾਮਿ', 'ਗੁਰੂ']), { hits: 0, total: 2 });
});

test('the Fateh is recognised as heard, with ਖ਼ and ਫ਼ in either spelling', () => {
  const heard = lost(W, 'ੂ');
  assert.ok(fatehIn(`${heard} ਜੀ ਕਾ ਖਾਲਸਾ ${heard} ਜੀ ਕੀ ਫਤਿਹ`));
  // every word heard imperfectly: a letter or a vowel sign lost, ਜ heard as ਚ
  assert.ok(
    fatehIn(
      [lost(W, 'ਾ', 'ੂ'), 'ਜੀ'.replace('ਜ', 'ਚ'), lost('ਕਾ', 'ਾ'), lost('ਖਾਲਸਾ', 'ਲ')].join(' '),
    ),
  );
  assert.ok(fatehIn('ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ \u0A59ਾਲਸਾ'));
  assert.ok(fatehIn('ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ \u0A5Eਤਿਹ'));
  assert.ok(!fatehIn('ਵਾਹਿਗੁਰੂ ਵਾਹਿਗੁਰੂ ਜੀਉ'));
  assert.ok(!fatehIn(SINGING));
});

test('Simran gone (slide comes down): only on seconds clearly heard without Waheguru', () => {
  const s = createSimran();
  let r = hear(s, 0, 30, 'ਵਾਹਿਗੁਰੂ ਵਾਹਿਗੁਰੂ');
  assert.strictEqual(simranGone(s, r.t), false);
  r = hear(s, r.t, 2, SINGING);
  assert.strictEqual(simranGone(s, r.t), false);
  r = hear(s, r.t, 3, SINGING);
  assert.strictEqual(simranGone(s, r.t), true);
  // a slow PC: only two transcripts in the last 6 s is too little to end it
  const slow = createSimran();
  for (let t = 0; t < 30000; t += 3000) noteHeard(slow, t, 'ਵਾਹਿਗੁਰੂ ਵਾਹਿਗੁਰੂ');
  noteHeard(slow, 33000, SINGING);
  assert.strictEqual(simranGone(slow, 33000), false);
});

test('Simran after kirtan: start within about 10 s (a short sung Simran shows the slide)', () => {
  const s = createSimran();
  let r = hear(s, 0, 60, SINGING);
  const t0 = r.t;
  r = hear(s, r.t, 22, 'ਵਾਹਿਗੁਰੂ ਵਾਹਿਗੁਰੂ');
  assert.strictEqual(r.steps.length, 1);
  const after = r.steps[0][1] - t0;
  assert.ok(after >= 8000 && after <= 11000, String(after));
  // a slow PC (a transcript every 2 s) still starts it
  const slow = createSimran();
  let steps = [];
  for (let t = 0; t < 30000; t += 2000) {
    noteHeard(slow, t, 'ਵਾਹਿਗੁਰੂ ਵਾਹਿਗੁਰੂ');
    const st = simranStep(slow, t);
    if (st) steps = steps.concat(st);
  }
  assert.deepStrictEqual(steps, ['start']);
});

test('a few Waheguru words before a pause: never the slide over the Shabad (rn03, 148 s)', () => {
  const s = createSimran();
  let r = hear(s, 0, 30, SINGING);
  r = hear(s, r.t, 6, `${W} ${SINGING}`); // a short burst inside the kirtan
  // then a pause: only a transcript now and then, none with a Waheguru
  let { t } = r;
  const up = [500, 2500, 1000, 500, 1100, 4500, 500, 500].some((gap) => {
    t += gap;
    noteHeard(s, t, 'ਨਾ');
    simranStep(s, t);
    return s.on && simranHeard(s, t);
  });
  assert.strictEqual(up, false);
  // real Simran: heard, on a slow PC too (two transcripts in the last 6 s)
  const slow = createSimran();
  let heard = false;
  for (let t2 = 0; t2 < 30000; t2 += 2000) {
    noteHeard(slow, t2, `${W} ${W}`);
    if (simranStep(slow, t2) === 'start') heard = simranHeard(slow, t2);
  }
  assert.strictEqual(heard, true);
});

test('a pangti that is mostly Waheguru (the Bhatt Swaiye refrain) says nothing during Simran', () => {
  assert.strictEqual(waheguruLine(`${W} ${W} ${W} ${twoWords[0]} ਜੀਉ`), true);
  assert.strictEqual(waheguruLine(`${W} ${W}`), true);
  assert.strictEqual(waheguruLine(SINGING), false);
  assert.strictEqual(waheguruLine(`${W} ${SINGING}`), false);
  assert.strictEqual(waheguruLine(''), false);
});
