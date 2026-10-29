// sim-clock.js — virtual clock for the simulated slow-PC replay (bench-driver VF_SIM_PASS_MS; SIM-SLOWPC.md).
//
// One discrete-event loop owns time. Events (microphone chunks, model-pass completions, the
// component's timers, the backlog sampler) sit in a heap ordered by (time, insertion order).
// The loop fires the earliest event, then lets every piece of REAL asynchronous work finish
// (database / retrieval / a recorded model pass: the caller's idle()), and only then moves the
// clock to the next event. JavaScript itself costs no virtual time; a model pass costs what the
// driver schedules for it. Everything is ordered by virtual time and insertion order, so a run is
// deterministic.
class SimClock {
  constructor({ idle, check } = {}) {
    this.t = 0; // ms
    this.heap = [];
    this.seq = 0;
    this.live = new Map(); // timer id -> heap entry (for clearTimeout)
    this.idle = idle || (() => new Promise(setImmediate));
    this.check = check || (() => {});
    this.fired = 0;
  }

  push(e) {
    const h = this.heap;
    h.push(e);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (SimClock.less(h[p], h[i])) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }

  pop() {
    const h = this.heap;
    if (!h.length) return null;
    const top = h[0];
    const last = h.pop();
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && SimClock.less(h[l], h[m])) m = l;
        if (r < h.length && SimClock.less(h[r], h[m])) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    return top;
  }

  static less(a, b) {
    return a.at < b.at || (a.at === b.at && a.seq < b.seq);
  }

  // fn runs at virtual time `at` (never earlier than now)
  at(at, fn) {
    const e = { at: Math.max(at, this.t), seq: this.seq++, fn, dead: false };
    this.push(e);
    return e;
  }

  sleep(ms) {
    return new Promise((r) => this.at(this.t + Math.max(0, ms), r));
  }

  until(at) {
    return new Promise((r) => this.at(at, r));
  }

  // Timers for the component (vm context) and the harness.
  setTimeout(fn, ms = 0, ...args) {
    const id = this.seq + 1;
    const e = this.at(this.t + Math.max(0, Number(ms) || 0), () => {
      this.live.delete(id);
      fn(...args);
    });
    e.id = id;
    this.live.set(id, e);
    return id;
  }

  setInterval(fn, ms = 0, ...args) {
    const id = this.seq + 1;
    const period = Math.max(1, Number(ms) || 0);
    const tick = () => {
      const e = this.at(this.t + period, () => {
        if (!this.live.has(id)) return;
        tick();
        fn(...args);
      });
      this.live.set(id, e);
    };
    tick();
    return id;
  }

  clearTimeout(id) {
    const e = this.live.get(id);
    if (e) e.dead = true;
    this.live.delete(id);
  }

  // Fire one event: false when there is none.
  async step() {
    await this.idle();
    this.check();
    let e = this.pop();
    while (e && e.dead) e = this.pop();
    if (!e) return false;
    this.t = e.at;
    this.fired += 1;
    e.fn();
    return true;
  }

  // Run until `promise` settles (its result is returned / its error thrown).
  async runUntil(promise) {
    let done = false;
    let err = null;
    let val;
    Promise.resolve(promise).then(
      (v) => {
        done = true;
        val = v;
      },
      (e) => {
        done = true;
        err = e;
      },
    );
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      await this.idle();
      this.check();
      if (done) break;
      // eslint-disable-next-line no-await-in-loop
      if (!(await this.step())) {
        await this.idle();
        if (done) break;
        throw new Error(`sim stalled at ${(this.t / 1000).toFixed(3)} s: the awaited work waits on nothing scheduled`);
      }
    }
    if (err) throw err;
    return val;
  }

  // Run until no event is left.
  async runAll() {
    // eslint-disable-next-line no-await-in-loop
    while (await this.step());
  }
}

module.exports = { SimClock };
