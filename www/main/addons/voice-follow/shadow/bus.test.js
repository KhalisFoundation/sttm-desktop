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
