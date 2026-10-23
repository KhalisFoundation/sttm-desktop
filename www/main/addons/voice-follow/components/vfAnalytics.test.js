// Unit tests for vfAnalytics.js — run with: node --test www/main/addons/voice-follow/components/
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createVfAnalytics,
  createRunStats,
  summaryLabel,
  dominantMode,
  errorKind,
  CATEGORY,
  HEARTBEAT_MS,
} = require('./vfAnalytics');
const { VF_FEATURE_VERSION } = require('../shadow/config');

const clock = (t0 = 1000000) => {
  let t = t0;
  const now = () => t;
  now.add = (ms) => {
    t += ms;
  };
  return now;
};
const recorder = (now) => {
  const sent = [];
  return { sent, a: createVfAnalytics({ send: (p) => sent.push(p), now }) };
};
const fields = (label) => Object.fromEntries(label.split(';').map((kv) => kv.split('=')));

describe('summaryLabel', () => {
  it('only clamped numbers and fixed words', () => {
    const l = summaryLabel({
      autoShabad: 'x',
      manualPangti: -4,
      taps: 1e9,
      tier: 'Japji Sahib',
      modeMs: { kirtan: 1000, other: 5 },
    });
    const f = fields(l);
    assert.equal(f.ap_shabad, '0');
    assert.equal(f.sev_pangti, '0');
    assert.equal(f.taps, '9999');
    assert.equal(f.tier, 'na');
    assert.equal(f.mode, 'kirtan');
    assert.ok(l.length < 250);
    assert.doesNotMatch(l, /Japji/);
  });
  it('dominant mode: >= 80% else mixed', () => {
    assert.equal(dominantMode({}), 'none');
    assert.equal(dominantMode({ paath: 9, kirtan: 1 }), 'paath');
    assert.equal(dominantMode({ paath: 6, kirtan: 4 }), 'mixed');
  });
});

describe('createRunStats', () => {
  it('counts Autopilot vs sevadaar changes, corrections, driving time', () => {
    const now = clock();
    const r = createRunStats({ how: 'cold', now });
    now.add(5000);
    assert.equal(r.lock('s1', 'lock', false), 5);
    r.auto('shabad'); // Autopilot opens a Shabad at 5 s
    now.add(60000);
    r.auto('pangti');
    now.add(4000);
    assert.deepEqual(r.manual('pangti'), { kind: 'pangti', afterS: 4 }); // wrong pangti fixed
    now.add(60000);
    assert.equal(r.manual('pangti'), null); // a plain click, no Autopilot choice to correct
    r.auto('shabad');
    r.lock('bani:2', 'switch', true);
    now.add(8000);
    assert.deepEqual(r.manual('shabad'), { kind: 'shabad', afterS: 8 }); // wrong Shabad fixed
    r.tap();
    now.add(60000);
    r.mode('kirtan', 100000);
    r.mode('paath', 10000);
    r.perf({ tier: 'lean', passMs: 213, backlogPeak: 0.64 });
    const f = fields(r.label(4));
    assert.equal(f.ap_shabad, '2');
    assert.equal(f.ap_pangti, '1');
    assert.equal(f.sev_shabad, '1');
    assert.equal(f.sev_pangti, '2');
    assert.equal(f.fix_shabad, '1');
    assert.equal(f.fix_pangti, '1');
    assert.equal(f.taps, '1');
    assert.equal(f.presses, '4');
    assert.equal(f.acc, '50');
    assert.equal(f.fix_med_s, '6');
    assert.equal(f.shabads, '2');
    assert.equal(f.switches, '1');
    assert.equal(f.mode, 'kirtan');
    assert.equal(f.tier, 'lean');
    assert.equal(f.pass, '210');
    assert.equal(f.backlog, '0.6');
    // Autopilot drove 0-69 s and 129-137 s (77 s); the sevadaar 69-129 s and 137-197 s.
    assert.equal(f.ap_min, '1.3');
    assert.equal(f.sev_min, '2');
    assert.equal(r.minutes(), 3.3);
  });
  it('heartbeat every 15 min', () => {
    const now = clock();
    const r = createRunStats({ now });
    now.add(HEARTBEAT_MS - 1);
    assert.equal(r.beatDue(), false);
    now.add(1);
    assert.equal(r.beatDue(), true);
    assert.equal(r.beatDue(), false);
  });
});

describe('createVfAnalytics', () => {
  it('sends category with the feature version', () => {
    const { sent, a } = recorder();
    a.track('vf_autopilot_start', { label: 'cold', value: 840 });
    assert.equal(CATEGORY, `vf-${VF_FEATURE_VERSION}`);
    assert.deepEqual(sent, [
      { category: CATEGORY, action: 'vf_autopilot_start', label: 'cold', value: 840 },
    ]);
  });
  it('once per key per run', () => {
    const { sent, a } = recorder();
    assert.equal(a.once('choice', 'vf_recording_choice', { label: 'declined' }), true);
    assert.equal(a.once('choice', 'vf_recording_choice', { label: 'dismissed' }), false);
    assert.equal(sent.length, 1);
  });
  it('corrections: at most 1 per 2 min and 5 per hour', () => {
    const now = clock();
    const { sent, a } = recorder(now);
    const fix = { kind: 'shabad', afterS: 8 };
    assert.equal(a.correction(fix), true);
    now.add(60000);
    assert.equal(a.correction(fix), false); // within 2 min
    for (let i = 0; i < 10; i += 1) {
      now.add(120000);
      a.correction(fix);
    }
    // in any rolling hour no more than 5
    assert.ok(sent.length <= 1 + 5 + 1);
    assert.equal(a.correction(null), false);
    assert.deepEqual(sent[0], {
      category: CATEGORY,
      action: 'vf_correction',
      label: 'shabad',
      value: 8,
    });
  });
  it('errors: once per kind, unknown kinds become other', () => {
    const { sent, a } = recorder();
    a.error('mic_blocked', 'visible');
    a.error('mic_blocked', 'hidden');
    a.error('model_load_failed');
    a.error('ENOENT /Users/someone/secret');
    a.error('something else');
    assert.deepEqual(
      sent.map((p) => p.label),
      ['mic_blocked;run=visible', 'model_load_failed', 'other'],
    );
    assert.equal(errorKind('retrieval_search_failed'), 'retrieval_search_failed');
  });
  it('honours the statistics opt-out', () => {
    const { sent, a } = recorder();
    a.setAllowed(false);
    assert.equal(a.track('vf_autopilot_start', { label: 'cold' }), false);
    a.setAllowed(undefined); // unset setting = default on
    a.track('vf_autopilot_start', { label: 'cold' });
    assert.equal(sent.length, 1);
  });
  it('a failing sender never throws', () => {
    const a = createVfAnalytics({
      send: () => {
        throw new Error('remote gone');
      },
    });
    assert.equal(a.track('vf_session_summary', { label: 'x' }), false);
    assert.equal(a.error('mic_failed'), false);
  });
});
