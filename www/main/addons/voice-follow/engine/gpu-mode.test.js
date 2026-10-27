/* global BigInt */
// node --test www/main/addons/voice-follow/engine/gpu-mode.test.js
// GPU mode: the gate (no NaN, >= 99.5% same top token, >= 1.3x faster), the self-check with fake
// sessions, the "when is it wanted" rules, and the fall back to the CPU while listening.
const { describe, it } = require('node:test');
const assert = require('node:assert');
const gm = require('./gpu-mode');
const { Infer } = require('./infer');

const C = 4;
// A fake model output: frames whose top token is ids[t].
const out = (ids, { nan = false } = {}) => {
  const data = new Float32Array(ids.length * C).fill(-5);
  ids.forEach((id, t) => {
    data[t * C + id] = -0.1;
  });
  if (nan) data[1] = NaN;
  return { data, frames: ids.length, C };
};
// A fake runner: returns `make(buf)` after `ms` of the fake clock.
const fakeClock = () => {
  let t = 0;
  return {
    now: () => t,
    tick: (ms) => {
      t += ms;
    },
  };
};
const runner = (clock, ms, make, extra = {}) => ({
  released: 0,
  run: async (buf) => {
    clock.tick(ms);
    return make(buf);
  },
  async release() {
    this.released += 1;
  },
  ...extra,
});
const windows = [new Float32Array(10), new Float32Array(20)];
const tokens = (buf) => Array.from({ length: (buf.length / 10) * 50 }, (_, i) => i % C);

describe('gpu-mode gate', () => {
  it('passes only with no NaN, >= 99.5% agreement and >= 1.3x speed', () => {
    assert.deepEqual(gm.verdict({ nan: false, agree: 1, speedup: 2 }), { ok: true, reason: 'ok' });
    assert.equal(gm.verdict({ nan: false, agree: 0.995, speedup: 1.3 }).ok, true);
    assert.equal(gm.verdict({ nan: true, agree: 1, speedup: 2 }).reason, 'nan');
    assert.equal(gm.verdict({ nan: false, agree: 0.994, speedup: 2 }).reason, 'mismatch');
    assert.equal(gm.verdict({ nan: false, agree: 1, speedup: 1.29 }).reason, 'not_faster');
    assert.equal(gm.verdict({ nan: false, agree: NaN, speedup: NaN }).ok, false);
  });

  it('agreement counts frames; a window with a different frame count is all different', () => {
    const a = [Int32Array.from([1, 2, 3, 4])];
    assert.equal(gm.agreement(a, [Int32Array.from([1, 2, 3, 4])]), 1);
    assert.equal(gm.agreement(a, [Int32Array.from([1, 2, 3, 0])]), 0.75);
    assert.equal(gm.agreement(a, [Int32Array.from([1, 2, 3])]), 0);
    assert.equal(gm.agreement([], []), 0);
  });

  it('finds NaN and top tokens', () => {
    assert.equal(gm.hasNaN(out([0, 1])), false);
    assert.equal(gm.hasNaN(out([0, 1], { nan: true })), true);
    assert.deepEqual(Array.from(gm.topTokens(out([3, 0, 2]))), [3, 0, 2]);
  });

  it('reference windows are deterministic, finite, 4 s and 10 s', () => {
    const a = gm.referenceWindows();
    const b = gm.referenceWindows();
    assert.equal(a.length, 10);
    assert.deepEqual(
      a.map((w) => w.length / 16000),
      [4, 4, 4, 4, 4, 10, 10, 10, 10, 10],
    );
    assert.ok(a.every((w, k) => w.every((v, i) => Number.isFinite(v) && v === b[k][i])));
  });

  it('is only for Windows and Apple-silicon Macs', () => {
    assert.equal(gm.supported('win32', 'x64'), true);
    assert.equal(gm.supported('darwin', 'arm64'), true);
    assert.equal(gm.supported('darwin', 'x64'), false);
    assert.equal(gm.supported('linux', 'x64'), false);
  });
});

describe('gpu-mode self-check', () => {
  const run = async ({ gpuMs = 40, int8Ms = 80, gpuMake, openFails } = {}) => {
    const clock = fakeClock();
    const cpu = runner(clock, 100, (b) => out(tokens(b)));
    const gpu = runner(clock, gpuMs, gpuMake || ((b) => out(tokens(b))));
    const int8 = runner(clock, int8Ms, () => out([0]));
    const opened = [];
    const open = async (kind) => {
      opened.push(kind);
      if (openFails === kind) throw new Error('no adapter');
      return kind === 'gpu-fp32' ? gpu : cpu;
    };
    const res = await gm.selfCheck({ open, int8, windows, now: clock.now });
    return { ...res, cpu, gpuRunner: gpu, opened };
  };

  it('passes a fast, matching GPU and hands back its session; the CPU fp32 session is released', async () => {
    const r = await run();
    assert.equal(r.result.ok, true);
    assert.equal(r.result.speedup, 2);
    assert.equal(r.result.agree, 1);
    assert.equal(r.gpu, r.gpuRunner);
    assert.equal(r.cpu.released, 1);
    assert.equal(r.gpuRunner.released, 0);
    assert.deepEqual(r.opened, ['cpu-fp32', 'gpu-fp32']); // one fp32 session at a time
  });

  it('refuses a GPU that is not 1.3x faster than int8 on the CPU, and releases it', async () => {
    const r = await run({ gpuMs: 70, int8Ms: 80 });
    assert.equal(r.result.ok, false);
    assert.equal(r.result.reason, 'not_faster');
    assert.equal(r.gpu, null);
    assert.equal(r.gpuRunner.released, 1);
  });

  it('refuses NaN output', async () => {
    const r = await run({ gpuMake: (b) => out(tokens(b), { nan: true }) });
    assert.equal(r.result.reason, 'nan');
    assert.equal(r.gpu, null);
  });

  it('refuses a GPU whose top tokens differ on more than 0.5% of frames', async () => {
    const r = await run({
      gpuMake: (b) => out(tokens(b).map((id, i) => (i % 50 === 0 ? (id + 1) % C : id))),
    });
    assert.equal(r.result.reason, 'mismatch');
    assert.ok(r.result.agree < 0.995);
  });

  it('a GPU that cannot open is a failed check, never a throw', async () => {
    const r = await run({ openFails: 'gpu-fp32' });
    assert.equal(r.result.ok, false);
    assert.equal(r.result.reason, 'error');
    assert.match(r.result.error, /no adapter/);
    assert.equal(r.gpu, null);
  });
});

describe('gpu-mode: when it is wanted', () => {
  const key = gm.checkKey('1.29.0', 'win32', 'x64');
  const passed = { ok: true, key };

  it('default (no state) never uses the GPU', () => {
    assert.equal(gm.shouldUse({}, key, true), false);
    assert.equal(gm.shouldUse(null, key, true), false);
  });
  it('uses it only when wanted, passed for this key, and the fp32 model is complete', () => {
    assert.equal(gm.shouldUse({ wanted: 'user', check: passed }, key, true), true);
    assert.equal(gm.shouldUse({ wanted: 'auto', check: passed }, key, true), true);
    assert.equal(gm.shouldUse({ wanted: null, check: passed }, key, true), false);
    assert.equal(gm.shouldUse({ wanted: 'user', check: { ok: false, key } }, key, true), false);
    assert.equal(gm.shouldUse({ wanted: 'user', check: passed }, key, false), false);
    const newOrt = gm.checkKey('1.30.0', 'win32', 'x64');
    assert.equal(gm.shouldUse({ wanted: 'user', check: passed }, newOrt, true), false);
  });
  it('"Check this computer" starts it only for a PC below the minimum, once, never after the user turned it off', () => {
    const below = { verdict: 'below' };
    assert.equal(gm.autoWanted(below, {}, key, true), true);
    assert.equal(gm.autoWanted({ verdict: 'ok' }, {}, key, true), false);
    assert.equal(gm.autoWanted({ verdict: 'great' }, {}, key, true), false);
    assert.equal(gm.autoWanted({ error: 'x' }, {}, key, true), false);
    assert.equal(gm.autoWanted(below, {}, key, false), false); // no WebGPU on this platform
    assert.equal(gm.autoWanted(below, { userOff: true }, key, true), false);
    assert.equal(gm.autoWanted(below, { check: { ok: false, key } }, key, true), false);
    assert.equal(gm.autoWanted(below, { check: { ok: false, key: 'old' } }, key, true), true);
  });
});

describe('gpu-mode: crashes and repeated failures', () => {
  const key = gm.checkKey('1.29.0', 'win32', 'x64');
  const passed = { wanted: 'user', check: { ok: true, key } };

  it('a GPU step left pending (crash, hang, driver reset) becomes a failed check at the next launch', () => {
    assert.equal(gm.afterCrash(passed, key), null);
    const st = gm.afterCrash({ ...passed, pending: 'attach' }, key, 'T');
    assert.deepEqual(st.check, { ok: false, reason: 'crashed', step: 'attach', key, at: 'T' });
    assert.equal(st.pending, undefined);
    assert.equal(gm.shouldUse(st, key, true), false);
    assert.equal(gm.shouldUse({ ...passed, pending: 'check' }, key, true), false);
  });
  it(`stops after ${gm.MAX_FALLBACKS} runtime fallbacks`, () => {
    let st = passed;
    for (let i = 0; i < gm.MAX_FALLBACKS - 1; i += 1) st = gm.afterFallback(st);
    assert.equal(gm.shouldUse(st, key, true), true);
    st = gm.afterFallback(st);
    assert.equal(gm.shouldUse(st, key, true), false);
  });
  it('an automatic try (even a failed download) is not repeated for the same key', () => {
    assert.equal(gm.autoWanted({ verdict: 'below' }, { autoTried: key }, key, true), false);
  });
});

describe('Infer GPU fallback', () => {
  it('CPU session options are exactly the ones used before GPU mode', () => {
    const o = Infer.sessionOptions();
    assert.deepEqual(Object.keys(o), ['intraOpNumThreads', 'interOpNumThreads', 'extra']);
    assert.equal(o.interOpNumThreads, 1);
    assert.deepEqual(o.extra, { session: { 'session.intra_op.allow_spinning': '0' } });
    const g = Infer.sessionOptions(['webgpu']);
    assert.deepEqual(g.executionProviders, ['webgpu']);
    assert.ok(!JSON.stringify(g).toLowerCase().includes('coreml'));
  });

  const ortOut = (frames = 3) => ({
    log_probs: { dims: [1, frames, C], data: new Float32Array(frames * C) },
    out_len: { data: [BigInt(frames)] },
  });
  const sess = (fn) => ({
    calls: 0,
    released: 0,
    async run() {
      this.calls += 1;
      return fn();
    },
    async release() {
      this.released += 1;
    },
  });
  const buf = new Float32Array(1600);

  it('CPU-only Infer runs the CPU session exactly as before (no GPU state)', async () => {
    const cpu = sess(() => ortOut());
    const infer = new Infer(cpu, []);
    const o = await infer.run(buf);
    assert.equal(o.frames, 3);
    assert.equal(cpu.calls, 1);
    assert.equal(infer.gpu, undefined);
    assert.equal(infer.cpuSession(), cpu);
  });

  it('GPU mode runs on the GPU; a GPU error falls back to the CPU for good and is reported once', async () => {
    const cpu = sess(() => ortOut());
    let fail = false;
    const gpu = sess(() => {
      if (fail) throw new Error('device lost');
      return ortOut(5);
    });
    const events = [];
    const infer = new Infer(cpu, []);
    infer.useGpu(gpu, (e) => events.push(String(e.message)));
    assert.equal((await infer.run(buf)).frames, 5);
    assert.equal(infer.cpuSession(), cpu);
    fail = true;
    assert.equal((await infer.run(buf)).frames, 3); // same window, decoded on the CPU
    assert.equal(infer.gpu, false);
    fail = false;
    assert.equal((await infer.run(buf)).frames, 3); // stays on the CPU for the rest of the run
    assert.deepEqual(events, ['device lost']);
    assert.equal(gpu.calls, 2);
    assert.equal(infer.gpuError, 'device lost');
  });

  it('NaN from the GPU counts as an error', async () => {
    const cpu = sess(() => ortOut());
    const bad = ortOut(5);
    bad.log_probs.data[2] = NaN;
    const gpu = sess(() => bad);
    const events = [];
    const infer = new Infer(cpu, []);
    infer.useGpu(gpu, (e) => events.push(e.message));
    const o = await infer.run(buf);
    assert.equal(o.frames, 3);
    assert.equal(infer.gpu, false);
    assert.equal(events.length, 1);
  });

  it('a failed GPU session is released later, never while a pass is running on it', async () => {
    const saved = Infer.RELEASE_MS;
    Infer.RELEASE_MS = { failed: 5, poll: 5 };
    const wait = (ms) =>
      new Promise((r) => {
        setTimeout(r, ms);
      });
    try {
      const cpu = sess(() => ortOut());
      let finish;
      const gpu = sess(
        () =>
          new Promise((r) => {
            finish = r;
          }),
      );
      const infer = new Infer(cpu, []);
      infer.useGpu(gpu);
      const p1 = infer.run(buf); // in flight on the GPU
      await wait(1);
      infer.useCpu(new Error('lost'));
      await wait(30);
      assert.equal(gpu.released, 0); // still busy
      finish(ortOut(5));
      await p1;
      await wait(30);
      assert.equal(gpu.released, 1);
    } finally {
      Infer.RELEASE_MS = saved;
    }
  });

  it('turning GPU mode off goes back to the CPU and frees the GPU session', async () => {
    const cpu = sess(() => ortOut());
    const gpu = sess(() => ortOut(5));
    const infer = new Infer(cpu, []);
    infer.useGpu(gpu);
    infer.useCpu();
    await new Promise((r) => {
      setTimeout(r, 5);
    });
    assert.equal(gpu.released, 1);
    assert.equal((await infer.run(buf)).frames, 3);
  });
});
