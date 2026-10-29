// Benchmark only (board-visibility.js): record what the Voice-Follow panel's candidate list
// is fed and shows, per clip, without touching the app's decisions.
//   - every live-board snapshot (liveBoard.js, the list's input), at audio time
//   - every candidate-shelf output (candidateShelf.js, when the build has one: the list as shown)
//   - transcripts (confidence, for the hearing gate), liveCands (the change card), screen events
// Written to $VF_BOARD_OUT/<cacheId>.board.json when the driver stops.
// Loaded with `node -r ./board-capture-preload.js <runner> ...` next to no-shadow-preload.js.
const fs = require('fs');
const path = require('path');

const OUT = process.env.VF_BOARD_OUT;
const root = process.env.VF_DRIVER_ROOT
  ? path.resolve(process.env.VF_DRIVER_ROOT)
  : path.resolve(__dirname, '../../..');
const COMP = path.join(root, 'www/main/addons/voice-follow/components');

let T = 0; // audio seconds of the chunk being decided
let cap = null; // capture of the clip being replayed
let SHELF = false; // this build lists candidates through candidateShelf.js
const r4 = (x) => (typeof x === 'number' ? Math.round(x * 1e4) / 1e4 : x);

// liveBoard: wrap createBoard so each snapshot (what publishBoard hands the panel) is kept.
{
  const p = require.resolve(path.join(COMP, 'liveBoard.js'));
  const lb = require(p);
  const orig = lb.createBoard;
  require.cache[p].exports = {
    ...lb,
    createBoard: (...a) => {
      const b = orig(...a);
      const snap = b.snapshot;
      b.snapshot = () => {
        const s = snap();
        if (cap)
          cap.board.push([
            T,
            s.map((x) => ({ id: x.shabadId, pct: r4(x.pct), role: x.role, line: !!(x.line || x.verse) })),
          ]);
        return s;
      };
      const reset = b.reset;
      b.reset = () => {
        if (cap) cap.board.push([T, []]);
        return reset();
      };
      return b;
    },
  };
}

// candidateShelf (this fix and later): the list exactly as the build lists it.
{
  let p = null;
  try {
    p = require.resolve(path.join(COMP, 'candidateShelf.js'));
  } catch (_) {
    p = null;
  }
  if (p) {
    SHELF = true;
    const cs = require(p);
    const orig = cs.createShelf;
    require.cache[p].exports = {
      ...cs,
      createShelf: (...a) => {
        const s = orig(...a);
        const update = s.update;
        s.update = (args) => {
          const out = update(args);
          if (cap) cap.shelf.push([T, out.map((x) => ({ id: x.shabadId, pct: r4(x.pct), fading: !!x.fading }))]);
          return out;
        };
        const reset = s.reset;
        s.reset = () => {
          if (cap) cap.shelf.push([T, []]);
          return reset();
        };
        return s;
      },
    };
  }
}

// bench-driver: tag each clip, track the audio clock, keep transcripts / liveCands / screen.
{
  const p = require.resolve(path.join(__dirname, 'bench-driver'));
  const bd = require(p);
  const orig = bd.createDriver;
  bd.createDriver = async (opts = {}) => {
    const id = opts.cacheId || process.env.VF_EMIS_ID || `clip${Date.now()}`;
    const mine = { id, board: [], shelf: [], heard: [], lead: [], screen: [], hasShelf: false };
    cap = mine;
    T = 0;
    const onEvent = opts.onEvent || (() => {});
    const onState = opts.onState || (() => {});
    const d = await orig({
      ...opts,
      onEvent: (ev) => {
        if (ev.type === 'transcript')
          mine.heard.push([ev.t, r4(ev.confidence), (ev.text || '').split(/\s+/).some((w) => w.length >= 3) ? 1 : 0]);
        else if (ev.type === 'shabad' || ev.type === 'seeking')
          mine.screen.push([ev.t, ev.type, ev.shabadId ?? null, ev.visible ?? null]);
        return onEvent(ev);
      },
      onState: (v) => {
        if (v && typeof v === 'object' && !Array.isArray(v) && 'sCur' in v && Array.isArray(v.items))
          mine.lead.push([T, v.items.map((x) => [x.shabadId, x.wins])]);
        return onState(v);
      },
    });
    const push = d.push.bind(d);
    d.push = (chunk, audioT) => {
      if (audioT != null) T = audioT;
      cap = mine;
      return push(chunk, audioT);
    };
    const stop = d.stop.bind(d);
    d.stop = async (...a) => {
      const r = await stop(...a);
      mine.hasShelf = SHELF;
      if (OUT) {
        fs.mkdirSync(OUT, { recursive: true });
        fs.writeFileSync(path.join(OUT, `${id}.board.json`), JSON.stringify({ ...mine, end: T }));
      }
      return r;
    };
    return d;
  };
}
