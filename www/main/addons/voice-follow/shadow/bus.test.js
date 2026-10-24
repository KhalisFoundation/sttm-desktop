// The shadow bus tells the app's own screen changes from the sevadaar's (visible mode).
// Run with: node --test www/main/addons/voice-follow/shadow/bus.test.js
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const bus = require('./bus');

const label = (shabadId, verseId, slide = null) => ({
  shabadId,
  verseId,
  bani: null,
  ceremony: null,
  slide,
});
const humanRows = (dir) =>
  fs
    .readFileSync(path.join(dir, 'human.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));

describe('shadow bus: overrides in visible mode', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-bus-'));
    bus.begin(dir, Date.now());
    bus.setVisible(true);
  });
  afterEach(() => {
    bus.end();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('the store taking the app’s slide down on the app’s own line change is not an override', () => {
    bus.system({ shabadId: 1, verseId: 10 });
    bus.human(label(1, 10));
    bus.system({ slide: true }); // the app's seeking slide
    bus.human(label(1, 10, 'waheguru'));
    bus.system({ verseId: 11 }); // the app moves the line while its slide is up
    bus.human(label(1, 11, 'waheguru'));
    bus.human(label(1, 11)); // the Shabad pane clears the slide as it shows the line
    const rows = humanRows(dir);
    assert.deepEqual(
      rows.map((r) => r.override),
      [false, false, false, false],
    );
  });

  it('the in-between screens of the app opening a Shabad are not overrides', () => {
    bus.system({ shabadId: 1, verseId: 10 });
    bus.human(label(1, 10));
    bus.system({ shabadId: 2, verseId: 20 });
    bus.human(label(1, 10)); // pane / tab / slide actions first: old screen
    bus.human(label(2, 10)); // new Shabad, old line
    bus.human(label(2, 20)); // done
    const rows = humanRows(dir);
    assert.deepEqual(
      rows.map((r) => [r.override, r.transit]),
      [
        [false, undefined],
        [undefined, true],
        [undefined, true],
        [false, undefined],
      ],
    );
  });

  it('a line the app never showed is the sevadaar’s, even right after an app change', () => {
    bus.system({ shabadId: 2, verseId: 20 });
    bus.human(label(2, 20));
    bus.human(label(2, 22)); // the sevadaar moves two pangtis on
    bus.human(label(5, 50)); // and opens another Shabad
    assert.deepEqual(
      humanRows(dir).map((r) => r.override),
      [false, true, true],
    );
  });
});

describe('shadow bus: prod summary, Gurbani changes and verses.csv', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-bus-prod-'));
    bus.begin(dir, Date.now());
  });
  afterEach(() => {
    bus.end();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('the opening screen is not a change; Shabad and pangti changes are Gurbani changes', () => {
    bus.human(label(1, 10)); // the screen the session opened on
    assert.equal(bus.gurbaniChanges(), 0);
    bus.human(label(1, 11)); // next pangti
    bus.human(label(2, 20)); // another Shabad
    bus.human(label(2, 20, true)); // a slide: a change, but no Gurbani
    assert.equal(bus.gurbaniChanges(), 2);
  });

  it('a slide or a cleared screen alone is no Gurbani change', () => {
    bus.human(label(null, null));
    bus.human(label(null, null, 'Waheguru'));
    bus.human(label(null, null));
    assert.equal(bus.gurbaniChanges(), 0);
  });

  it('verses.csv has one row per pangti shown, on the session clock', () => {
    bus.human(label(1, 10));
    bus.human(label(1, 10)); // same pangti again: no new row
    bus.human(label(1, 11));
    bus.human(label(null, null, 'Waheguru'));
    const rows = fs.readFileSync(path.join(dir, 'verses.csv'), 'utf8').trim().split('\n');
    assert.equal(rows[0], 'verseId,timestamp_seconds');
    assert.deepEqual(
      rows.slice(1).map((r) => r.split(',')[0]),
      ['10', '11', ''],
    );
    rows.slice(1).forEach((r) => assert.match(r.split(',')[1], /^\d+\.\d{3}$/));
  });

  it('score.json is a small summary, and there is no system timeline', () => {
    bus.human(label(1, 10));
    bus.human(label(1, 11));
    bus.end();
    const score = JSON.parse(fs.readFileSync(path.join(dir, 'score.json'), 'utf8'));
    assert.equal(score.prod, true);
    assert.equal(score.gurbaniChanges, 1);
    assert.equal(score.screenChanges, 1);
    assert.equal(typeof score.minutesRecorded, 'number');
    assert.equal(fs.existsSync(path.join(dir, 'system.jsonl')), false);
  });
});
