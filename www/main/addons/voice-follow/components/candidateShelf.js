// What the "Possible new Shabads" list shows, and for how long. Display only: it reads the
// live board (liveBoard.js) and never feeds a lock or a switch.
//
// The live board answers "how sure is the app about each Shabad right now"; a challenger
// leaves it ~3 s after its last score, and the list used to follow it exactly, so a
// candidate could come and go within a second, too fast for a sevadaar to read it and tap.
// This shelf keeps what the sevadaar sees steady:
//  - a card stays at least HOLD_MS after it last had support (a fresh score), fading for
//    its last FADE_MS instead of popping out, and keeps its last % decaying slowly;
//  - the cards keep their places: one moves above another only after it has been clearly
//    ahead (OVERTAKE points) for OVERTAKE_MS; a new card joins at the bottom;
//  - up to MAX cards; when full, a newcomer takes a fading card's place, or the weakest
//    card's after beating it clearly for OVERTAKE_MS, never a card listed < MIN_SHOW_MS ago;
//  - everything clears when the Shabad on screen changes, or after SILENCE_MS without a
//    confidently heard word.
// Time is whatever `now` the caller passes (ms), so the shelf is deterministic in replay.

const DEFAULTS = {
  max: 5,
  holdMs: 8000, // on screen at least this long after its last fresh score
  fadeMs: 3000, // the last part of the hold is shown fading
  silenceMs: 15000, // no confident word for this long: the list empties
  overtake: 0.05, // a card must lead the one above by this much ...
  overtakeMs: 2000, // ... for this long to move above it
  minShowMs: 4000, // a listed card is never replaced by a newcomer before this long
  halfLifeMs: 8000, // a card without new scores keeps its last %, halving over this long
};

function createShelf(params = {}) {
  const P = { ...DEFAULTS, ...params };
  let tracks = new Map(); // shabadId -> { item, lastAt, lastPct, pct }
  let order = []; // shabadIds on the shelf, top first
  let since = new Map(); // shabadId -> when it started to lead the card above it
  let shownAt = new Map(); // shabadId -> when it was listed
  let waitSince = new Map(); // shabadId (waiting) -> when it started to beat a listed card
  let currentId = null;

  function reset() {
    tracks = new Map();
    order = [];
    since = new Map();
    shownAt = new Map();
    waitSince = new Map();
  }

  const ageOf = (t, now) => now - t.lastAt;
  const isFading = (t, now) => ageOf(t, now) > P.holdMs - P.fadeMs;

  // items: the Shabads eligible to be listed right now (already filtered by the caller),
  //   [{ shabadId, pct, at?, ...display fields }]; `at` = when the board last scored it.
  // hide: ids that must not be listed (the Shabad on screen, the one in the change card).
  // heardAt: when a word was last heard confidently (ms), 0/null = not yet.
  function update({ now, items = [], current = null, heardAt = 0, hide = [] }) {
    if (current !== currentId) {
      currentId = current;
      reset();
    }
    if (!heardAt || now - heardAt > P.silenceMs) {
      reset();
      return [];
    }
    const hidden = new Set(hide);
    items.forEach((it) => {
      if (it.shabadId == null || hidden.has(it.shabadId)) return;
      const at = Math.min(it.at != null ? it.at : now, now);
      const t = tracks.get(it.shabadId);
      if (!t) {
        tracks.set(it.shabadId, { item: it, lastAt: at, lastPct: it.pct });
        return;
      }
      t.item = { ...t.item, ...it };
      if (at > t.lastAt) {
        t.lastAt = at;
        t.lastPct = it.pct;
      }
    });
    const present = new Map(items.map((it) => [it.shabadId, it]));
    [...tracks.keys()].forEach((id) => {
      const t = tracks.get(id);
      if (hidden.has(id) || ageOf(t, now) > P.holdMs) {
        tracks.delete(id);
        since.delete(id);
        shownAt.delete(id);
        waitSince.delete(id);
      }
    });
    // Shown %: the board's own while it is still scoring the card; afterwards its last
    // score, decaying slowly (never a sudden drop to nothing).
    tracks.forEach((t, id) => {
      const live = present.has(id) ? present.get(id).pct : 0;
      const kept = t.lastPct * 0.5 ** (Math.max(0, now - t.lastAt) / P.halfLifeMs);
      // eslint-disable-next-line no-param-reassign
      t.pct = Math.max(live, kept);
    });

    order = order.filter((id) => tracks.has(id));
    const fresh = [...tracks.keys()]
      .filter((id) => !order.includes(id))
      .sort((a, b) => tracks.get(b).pct - tracks.get(a).pct);
    const list = (id) => {
      order.push(id);
      shownAt.set(id, now);
      waitSince.delete(id);
    };
    fresh.forEach((id) => {
      if (order.length < P.max) {
        list(id);
        return;
      }
      // Full: a newcomer takes the place of a fading card, or of the weakest card it has
      // clearly beaten for a while; never of a card listed less than minShowMs ago. It
      // joins at the bottom either way.
      const open = order.filter((x) => now - shownAt.get(x) >= P.minShowMs);
      if (!open.length) {
        waitSince.delete(id);
        return;
      }
      const rank = (x) => (isFading(tracks.get(x), now) ? -1 : 0);
      const weakest = open.reduce((w, x) =>
        rank(x) < rank(w) || (rank(x) === rank(w) && tracks.get(x).pct < tracks.get(w).pct) ? x : w,
      );
      const w = tracks.get(weakest);
      let take = isFading(w, now);
      if (!take && tracks.get(id).pct > w.pct + P.overtake) {
        if (!waitSince.has(id)) waitSince.set(id, now);
        take = now - waitSince.get(id) >= P.overtakeMs;
      } else if (!take) waitSince.delete(id);
      if (take) {
        order = order.filter((x) => x !== weakest);
        since.delete(weakest);
        shownAt.delete(weakest);
        list(id);
      }
    });

    // Steady order: a card moves up one place only after leading the card above it clearly
    // for a while.
    for (let i = 1; i < order.length; i += 1) {
      const up = order[i - 1];
      const id = order[i];
      if (tracks.get(id).pct > tracks.get(up).pct + P.overtake) {
        if (!since.has(id)) since.set(id, now);
        if (now - since.get(id) >= P.overtakeMs) {
          order[i - 1] = id;
          order[i] = up;
          since.delete(id);
        }
      } else since.delete(id);
    }

    return order.map((id) => {
      const t = tracks.get(id);
      return {
        ...t.item,
        shabadId: id,
        pct: t.pct,
        role: 'candidate',
        fading: isFading(t, now),
      };
    });
  }

  // Every Shabad the shelf is holding, listed or waiting for a place (for the session log).
  const waiting = () =>
    [...tracks.entries()]
      .filter(([id]) => !order.includes(id))
      .map(([id, t]) => ({ shabadId: id, pct: t.pct }));

  return { update, reset, waiting, params: P };
}

module.exports = { createShelf, DEFAULTS };
