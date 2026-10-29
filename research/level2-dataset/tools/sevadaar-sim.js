#!/usr/bin/env node
/* sevadaar-sim.js — does Autopilot respect the sevadaar's line moves? (cached replay, no speech model)
 *
 * GAB never moves a line by hand, so it cannot see this. Here clips with line truth are replayed through
 * the cached driver and, at seeded moments, a SEVADAAR LINE MOVE is injected while the app follows the
 * right Shabad / Bani:
 *   right move - the app's line is 1-2 pangtis off the true pangti: the sevadaar puts the TRUE pangti up
 *   wrong move - the app is on the true pangti: the sevadaar moves it 1-2 pangtis off (a slip)
 * The screen then shows the sevadaar's pangti until the app writes a line of its own. A build that
 * watches the screen line is told of the move exactly as its store effect would be (the component's
 * sevadaarLineRef, reached through the driver's `source` option: no driver change, so no cached replay
 * of anyone else is invalidated); an older build simply never hears of it.
 *
 * Per move (window: until the next move, at most 30 s):
 *   override   (right moves) the app moves the line within 10 s to a pangti that is neither the
 *              sevadaar's nor the true one at that moment ("takes me back to where it thinks")
 *   follow-on  (right moves) the app's first line move after it lands on the true pangti
 *   line right % of the window the screen shows the true pangti
 *   recovered  (wrong moves) the screen reaches the true pangti within 30 s, and how fast (harm check)
 * Times are audio seconds. Truth: lines.csv of each clip (human for the Fremont recordings; aligned for
 * clip05, pt54, ytasa1). Test-split clips are never used (Fremont kh01-kh10, Renton).
 *
 *   node sevadaar-sim.js compare <base root> <cand root> [--only kh11,...] [--every 40] [--seed 1]
 *   (each build replays in a child process under a replay slot lock, nice 19, one after the other)
 * Output: results/sevadaar-sim/<time>/{base,cand}/<clip>.json and report.md.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const TOOLS = __dirname;
const DS = path.join(TOOLS, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const BENCH = process.env.VF_BENCHMARK || path.join(os.homedir(), 'personal/vf-benchmark');
const EVERY = Number(arg('every', 40)); // seconds between candidate moments
const SEED = Number(arg('seed', 1));
const WINDOW_S = 30;
const OVERRIDE_S = 10;
const SR = 16000;
const CHUNK = 2048;

// ---------------------------------------------------------------- clips ----------
function clipList() {
  const { parseCsv } = require('./vf-manifest');
  const { SUITES } = require('./vf-suites');
  const man = parseCsv(fs.readFileSync(path.join(BENCH, 'manifest.csv'), 'utf8'));
  const jobs = new Map();
  for (const suite of ['jaspal', 'l2', 'paath', 'asa']) {
    try {
      for (const j of SUITES[suite].jobs()) jobs.set(j.id, j);
    } catch (e) {
      console.error(`suite ${suite}: ${e.message}`);
    }
  }
  const only = arg('only', '') ? new Set(arg('only').split(',')) : null;
  return man
    .filter((r) => Number(r.lines_n) > 0 && r.split !== 'test' && !/^4-/.test(r.content_folder))
    .filter((r) => !/renton|^rt\d/i.test(`${r.gurdwara} ${r.id}`))
    .map((r) => ({ id: r.id.split('_')[0], row: r, job: jobs.get(r.cache_id) }))
    .filter((c) => c.job && fs.existsSync(c.job.wav))
    .filter((c) => !only || only.has(c.id));
}

function truthOf(row) {
  const { parseCsv } = require('./vf-manifest');
  const f = path.join(BENCH, row.content_folder, row.id, 'lines.csv');
  return parseCsv(fs.readFileSync(f, 'utf8'))
    .map((l) => ({ verseId: Number(l.verseId), a: Number(l.start_s), b: Number(l.end_s) }))
    .filter((l) => Number.isFinite(l.verseId) && Number.isFinite(l.a) && Number.isFinite(l.b))
    .sort((x, y) => x.a - y.a);
}
const truthAt = (truth, t) => {
  let hit = null;
  for (const l of truth) if (l.a <= t && t < l.b) hit = l;
  return hit;
};

// Seeded, per clip and moment: the same schedule for every build.
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

function readWav(file) {
  const b = fs.readFileSync(file); let off = 12;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4), sz = b.readUInt32LE(off + 4);
    if (id === 'data') { const n = Math.floor(sz / 2), out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = b.readInt16LE(off + 8 + i * 2) / 32768; return out; }
    off += 8 + sz + (sz & 1);
  }
  throw new Error('no data chunk');
}

// ---------------------------------------------------------------- one build ----------
async function runBuild(outDir) {
  const { createDriver, COMPONENT } = require('./bench-driver');
  const MODEL = process.env.MODEL || '/Users/asingh02/AAI/models/karansea-shabad-ctc/model.int8.onnx';
  const USERDATA = process.env.VF_BANIDB_USER_DATA || path.join(os.homedir(), 'Library/Application Support/SikhiToTheMax');
  // The test seam: hand the sim the component's own handler and refs (absent ones read null).
  const marker = "  const listening = status === 'listening' || status === 'connecting';";
  const src = fs.readFileSync(COMPONENT, 'utf8');
  if (!src.includes(marker)) throw new Error('component marker changed; update sevadaar-sim');
  const source = src.replace(marker, `  __recordSwitch({ sevadaarApi: {
    move: typeof sevadaarLineRef !== 'undefined' ? (v, s) => sevadaarLineRef.current(v, s) : null,
    follower: () => followerRef.current,
  } });
${marker}`);
  fs.mkdirSync(outDir, { recursive: true });
  for (const clip of clipList()) {
    const truth = truthOf(clip.row);
    const pcm = readWav(clip.job.wav);
    const dur = pcm.length / SR;
    let api = null;
    const events = [];
    const driver = await createDriver({ model: MODEL, userData: USERDATA, cacheId: clip.job.id, source, onEvent: (ev) => {
      if (ev.sevadaarApi) { api = ev.sevadaarApi; return; }
      if (['verse', 'shabad', 'pane', 'seeking', 'component-error'].includes(ev.type))
        events.push({ t: ev.t, type: ev.type, verseId: ev.verseId, shabadId: ev.shabadId, visible: ev.visible, message: ev.message });
    } });
    // The screen line as the sevadaar sees it (app writes and injected moves).
    let screen = null;
    const screenNow = () => {
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const e = events[i];
        if (e.type === 'seeking') return e.visible ? null : screen;
        if (e.verseId != null) return e.verseId;
      }
      return null;
    };
    const moves = [];
    let nextAt = EVERY * (0.5 + rng(hash(clip.id) ^ SEED)());
    let slot = 0;
    let error = null;
    try {
      await driver.start();
      for (let p = 0; p < pcm.length; p += CHUNK) {
        const chunk = pcm.subarray(p, Math.min(p + CHUNK, pcm.length));
        const t = (p + chunk.length) / SR;
        await driver.push(chunk, t);
        if (t < nextAt) continue;
        const r = rng((hash(clip.id) ^ SEED) + 7919 * (slot + 1));
        slot += 1;
        nextAt = t + EVERY * (0.75 + 0.5 * r());
        const snap = driver.snapshot();
        const f = api && api.follower();
        const tr = truthAt(truth, t);
        screen = screenNow();
        const ids = (f && f.verseIds) || [];
        const iTrue = tr ? ids.indexOf(tr.verseId) : -1;
        const iApp = ids.indexOf(screen);
        if (process.env.SIM_DEBUG) console.error(JSON.stringify({ clip: clip.id, t: +t.toFixed(1), phase: snap.phase, cur: snap.current, follower: !!f, truth: tr && tr.verseId, screen, iTrue, iApp, n: ids.length }));
        if (snap.phase !== 'following' || !f || !tr || screen == null || t - tr.a < 1) continue;
        if (iTrue < 0 || iApp < 0) continue;
        const pickWrong = () => {
          const d = (r() < 0.5 ? 1 : 2) * (r() < 0.5 ? -1 : 1);
          const k = iTrue + d >= 0 && iTrue + d < ids.length ? iTrue + d : iTrue - d;
          return k >= 0 && k < ids.length && ids[k] !== tr.verseId ? ids[k] : null;
        };
        let kind = null;
        let to = null;
        if (screen !== tr.verseId && Math.abs(iTrue - iApp) <= 2) { kind = 'right'; to = tr.verseId; }
        else if (screen === tr.verseId) { kind = 'wrong'; to = pickWrong(); }
        if (!kind || to == null) continue;
        moves.push({ t, kind, from: screen, to, truth: tr.verseId, shabad: snap.current });
        events.push({ t, type: 'sevadaar', verseId: to });
        if (api.move) api.move(to, snap.current);
        await driver.drain();
      }
      await driver.stop();
    } catch (e) {
      error = /CacheMiss|cache miss/i.test(`${e.name} ${e.message}`) ? `CACHE MISS: ${e.message}` : String(e.stack || e);
      try { await driver.stop(); } catch (_) { /* already reported */ }
    }
    fs.writeFileSync(path.join(outDir, `${clip.id}.json`), JSON.stringify({ clip: clip.id, cacheId: clip.job.id, dur, lineSource: clip.row.lines_source, error, moves, events }, null, 1));
    console.log(`${clip.id}: ${moves.length} moves (${moves.filter((m) => m.kind === 'right').length} right)${error ? ` ERROR ${error.split('\n')[0]}` : ''}`);
  }
}

// ---------------------------------------------------------------- scoring ----------
function scoreClip(rec, truth) {
  const lineEv = rec.events.filter((e) => e.type !== 'component-error').sort((a, b) => a.t - b.t);
  const screenAt = (t) => {
    let v = null;
    for (const e of lineEv) {
      if (e.t > t) break;
      if (e.type === 'seeking') { if (e.visible) v = null; continue; }
      if (e.verseId != null) v = e.verseId;
    }
    return v;
  };
  const truthNear = (t, v) => [t - 1, t, t + 1].some((x) => { const tr = truthAt(truth, x); return tr && tr.verseId === v; });
  return rec.moves.map((m, k) => {
    const end = Math.min(m.t + WINDOW_S, k + 1 < rec.moves.length ? rec.moves[k + 1].t : Infinity, rec.dur);
    const appMoves = lineEv.filter((e) => e.t > m.t && e.t <= end && e.type !== 'sevadaar' && e.type !== 'seeking' && e.verseId != null && e.verseId !== m.to);
    const first = appMoves[0] || null;
    let right = 0;
    let n = 0;
    let recoveredS = null;
    for (let t = m.t; t < end; t += 0.1) {
      const tr = truthAt(truth, t);
      if (!tr) continue;
      n += 1;
      const ok = screenAt(t) === tr.verseId;
      if (ok) right += 1;
      if (ok && recoveredS == null) recoveredS = +(t - m.t).toFixed(1);
    }
    const out = { t: m.t, to: m.to, kind: m.kind, lineRight: n ? right / n : null, windowS: +(end - m.t).toFixed(1) };
    if (m.kind === 'right') {
      out.override = !!(first && first.t - m.t <= OVERRIDE_S && !truthNear(first.t, first.verseId));
      out.followOn = first ? truthNear(first.t, first.verseId) : null; // null: no move in the window
      out.firstMoveS = first ? +(first.t - m.t).toFixed(1) : null;
    } else {
      out.recoveredS = recoveredS;
    }
    return out;
  });
}

function summarize(dir) {
  const { parseCsv } = require('./vf-manifest');
  const man = new Map(parseCsv(fs.readFileSync(path.join(BENCH, 'manifest.csv'), 'utf8')).map((r) => [r.id.split('_')[0], r]));
  const per = {};
  const incomplete = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (rec.error) { incomplete.push(`${rec.clip}: ${rec.error.split('\n')[0].slice(0, 120)}`); continue; }
    per[rec.clip] = scoreClip(rec, truthOf(man.get(rec.clip)));
  }
  return { per, incomplete };
}

function agg(moves) {
  const R = moves.filter((m) => m.kind === 'right');
  const W = moves.filter((m) => m.kind === 'wrong');
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const pct = (x) => (x == null ? '-' : `${(100 * x).toFixed(1)}%`);
  const fo = R.filter((m) => m.followOn != null);
  const rec = W.filter((m) => m.recoveredS != null).map((m) => m.recoveredS).sort((a, b) => a - b);
  return {
    right: R.length,
    overrides: R.filter((m) => m.override).length,
    followOn: `${fo.filter((m) => m.followOn).length}/${fo.length}`,
    lineRightAfterRight: pct(mean(R.map((m) => m.lineRight).filter((x) => x != null))),
    wrong: W.length,
    recovered: `${rec.length}/${W.length}`,
    recoverP50: rec.length ? `${rec[Math.floor(rec.length / 2)]} s` : '-',
    lineRightAfterWrong: pct(mean(W.map((m) => m.lineRight).filter((x) => x != null))),
  };
}

function report(baseDir, candDir) {
  const b = summarize(baseDir);
  const c = summarize(candDir);
  const clips = Object.keys(b.per).filter((k) => c.per[k]).sort();
  const all = (s) => clips.flatMap((k) => s.per[k]);
  const lines = [
    `# Sevadaar line moves (sevadaar-sim.js, seed ${SEED})`,
    '',
    `Clips scored on both builds: ${clips.length} (${clips.join(', ')}).`,
    '',
    '| build | right moves | overrides (app moves away in 10 s, truth says sevadaar right) | follow-on correct | line right % (30 s after) | wrong moves | recovered to truth | recover p50 | line right % (30 s after) |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const [name, s] of [['base', b], ['cand', c]]) {
    const a = agg(all(s));
    lines.push(`| ${name} | ${a.right} | ${a.overrides} | ${a.followOn} | ${a.lineRightAfterRight} | ${a.wrong} | ${a.recovered} | ${a.recoverP50} | ${a.lineRightAfterWrong} |`);
  }
  // Paired: the same move (clip, moment, target pangti) made on both builds. After a build's first
  // move the two replays can drift apart, so only these compare like with like.
  const key = (k, m) => `${k}@${m.t.toFixed(2)}>${m.to}`;
  const inC = new Set(clips.flatMap((k) => c.per[k].map((m) => key(k, m))));
  const inB = new Set(clips.flatMap((k) => b.per[k].map((m) => key(k, m))));
  lines.push('', `Paired (the same move on both builds): ${[...inB].filter((x) => inC.has(x)).length} moves.`, '', lines[4], lines[5]);
  for (const [name, s, other] of [['base', b, inC], ['cand', c, inB]]) {
    const a = agg(clips.flatMap((k) => s.per[k].filter((m) => other.has(key(k, m)))));
    lines.push(`| ${name} | ${a.right} | ${a.overrides} | ${a.followOn} | ${a.lineRightAfterRight} | ${a.wrong} | ${a.recovered} | ${a.recoverP50} | ${a.lineRightAfterWrong} |`);
  }
  lines.push('', '| clip | build | right | overrides | follow-on | line right % | wrong | recovered | line right % |', '|---|---|---|---|---|---|---|---|---|');
  for (const k of clips) for (const [name, s] of [['base', b], ['cand', c]]) {
    const a = agg(s.per[k]);
    lines.push(`| ${k} | ${name} | ${a.right} | ${a.overrides} | ${a.followOn} | ${a.lineRightAfterRight} | ${a.wrong} | ${a.recovered} | ${a.lineRightAfterWrong} |`);
  }
  const inc = [...b.incomplete.map((x) => `base ${x}`), ...c.incomplete.map((x) => `cand ${x}`)];
  lines.push('', inc.length ? `**INCOMPLETE** (left out on both sides):\n${inc.map((x) => `- ${x}`).join('\n')}` : 'Every clip replayed on both builds (no cache miss).');
  return lines.join('\n');
}

// ---------------------------------------------------------------- main ----------
(async () => {
  const cmd = argv[0];
  if (cmd === 'run') return runBuild(path.resolve(argv[1]));
  if (cmd === 'report') { const r = report(argv[1], argv[2]); console.log(r); return null; }
  if (cmd !== 'compare') throw new Error('usage: sevadaar-sim.js compare <base root> <cand root> [--only ...] | run <outDir> | report <baseDir> <candDir>');
  const out = path.join(DS, 'results', 'sevadaar-sim', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'));
  const pass = argv.slice(3);
  for (const [name, root] of [['base', argv[1]], ['cand', argv[2]]]) {
    const dir = path.join(out, name);
    console.log(`== ${name}: ${root}`);
    const r = spawnSync('lockf', ['-k', '/tmp/vf-replay-slot-0.lock', 'nice', '-n', '19', process.execPath, '-r', './no-shadow-preload.js', __filename, 'run', dir, ...pass], {
      cwd: TOOLS, stdio: 'inherit', env: { ...process.env, VF_DRIVER_ROOT: path.resolve(root), VF_EMIS_CACHE: process.env.VF_EMIS_CACHE || path.join(os.homedir(), 'personal/live-darbar-venues/cache'), VF_EMIS_MODE: 'replay', VF_EMIS_STATS: '0' } });
    if (r.status) throw new Error(`${name} run exited ${r.status}`);
  }
  const rep = report(path.join(out, 'base'), path.join(out, 'cand'));
  fs.writeFileSync(path.join(out, 'report.md'), `${rep}\n`);
  console.log(`\n${rep}\n\n${out}/report.md`);
  return null;
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
