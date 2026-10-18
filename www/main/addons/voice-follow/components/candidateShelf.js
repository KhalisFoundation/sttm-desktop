// What the "Possible new Shabads" list shows, and for how long. Display only: it reads the
// live board (liveBoard.js) and never feeds a lock or a switch.
//
// The live board answers "how sure is the app about each Shabad right now"; a challenger
// leaves it ~3 s after its last score, and the list used to follow it exactly, so a
// candidate could come and go within a second, too fast for a sevadaar to read it and tap.
// This shelf keeps what the sevadaar sees steady:
//  - a card stays at least HOLD_MS after it last had support (a fresh score), fading for
//    its last FADE_MS instead of popping out, and keeps its last % decaying slowly;
//  - the cards are ordered by confidence, highest first, with a small hysteresis: a card
//    moves above another only when it leads by more than SWAP points, so two cards about
//    level never trade places back and forth;
//  - up to MAX cards; when full, a newcomer takes a fading card's place, or the weakest
//    card's after beating it clearly for OVERTAKE_MS, never a card listed < MIN_SHOW_MS ago;
//  - the Shabad the judge is checking as a change ("Changing to") moves out of the list
//    into its own card and stays there CHANGE_HOLD_MS after the judge lets go of it, so a
//    one-decode wobble in its wins does not bounce it between the two places; it keeps
//    its track meanwhile and comes back to the list as the same card;
//  - a change of the Shabad on screen removes only that Shabad: the other cards stay and
//    fade on their own timers (the list used to empty at every handover);
//  - everything clears after SILENCE_MS without a confidently heard word.
// Each card also carries `prog`: how close it is to being chosen (liveBoard.js), held and
// decaying like its %, so its bar grows as the Shabad builds toward a switch.
//
// Evidence cards (items with `ev`, Shabad-level evidence from shabadEvidence.js): a card stays
// exactly as long as its Shabad's evidence does (the evidence itself fades over tens of
// seconds), never on a fixed timer and never shown fading; the cards are ordered by evidence,
// with evSwap of hysteresis.
// Time is whatever `now` the caller passes (ms), so the shelf is deterministic in replay.

const DEFAULTS = {
  max: 6,
  holdMs: 8000, // on screen at least this long after its last fresh score
  fadeMs: 3000, // the last part of the hold is shown fading
  silenceMs: 15000, // no confident word for this long: the list empties
  swap: 0.01, // ordered by %: a card moves above another only when ahead by more than this
  overtake: 0.05, // full list: a newcomer must beat the weakest card by this much ...
  overtakeMs: 2000, // ... for this long to take its place
  minShowMs: 4000, // a listed card is never replaced by a newcomer before this long
  halfLifeMs: 8000, // a card without new scores keeps its last %, halving over this long
  changeHoldMs: 2500, // the change card stays this long after the judge stops checking it
  evSwap: 0.25, // evidence cards: one passes another only when ahead by more than this
  evOvertake: 0.1, // full list: a newcomer with this much more evidence than the weakest card takes its place
  changeKeepFill: 0.6, // "Changing to" stays while the Shabad's evidence is this far to the line
};

function createShelf(params = {}) {
  const P = { ...DEFAULTS, ...params };
  let tracks = new Map(); // shabadId -> { item, lastAt, lastPct, pct, lastProg, prog }
  let order = []; // shabadIds on the shelf, top first
  let shownAt = new Map(); // shabadId -> when it was listed
  let waitSince = new Map(); // shabadId (waiting) -> when it started to beat a listed card
  let currentId = null;
  let change = null; // { id, item, lastAt } the Shabad in the "Changing to" card

  function reset() {
    tracks = new Map();
    order = [];
    shownAt = new Map();
    waitSince = new Map();
    change = null;
  }
  const drop = (id) => {
    tracks.delete(id);
    shownAt.delete(id);
    waitSince.delete(id);
    order = order.filter((x) => x !== id);
  };

  const ageOf = (t, now) => now - t.lastAt;
  const isFading = (t, now) => ageOf(t, now) > P.holdMs - P.fadeMs;
  const decayed = (v, t, now) => v * 0.5 ** (Math.max(0, now - t.lastAt) / P.halfLifeMs);

  const absorb = (it, now) => {
    const at = Math.min(it.at != null ? it.at : now, now);
    const t = tracks.get(it.shabadId);
    if (!t) {
      tracks.set(it.shabadId, {
        item: it,
        ev: it.ev || null,
        lastAt: it.ev ? now : at,
        lastPct: it.pct || 0,
        lastProg: it.prog != null ? it.prog : 0,
      });
      return;
    }
    t.item = { ...t.item, ...it };
    if (it.ev) {
      t.lastAt = now; // evidence cards live as long as the evidence
      t.ev = it.ev;
    }
    if (at > t.lastAt || (at === t.lastAt && it.pct > t.lastPct)) {
      t.lastAt = at;
      if (it.pct != null) t.lastPct = it.pct;
      if (it.prog != null) t.lastProg = it.prog;
    }
  };

  // items: the Shabads eligible to be listed right now (already filtered by the caller),
  //   [{ shabadId, pct, prog?, at?, ...display fields }]; `at` = when the board last scored it.
  // current: the Shabad on screen. lead: the Shabad the judge is checking as a change right
  //   now (or null), { shabadId, ...display fields }.
  // hide: other ids that must not be listed right now (kept, not forgotten).
  // heardAt: when a word was last heard confidently (ms), 0/null = not yet.
  function update({ now, items = [], current = null, heardAt = 0, hide = [], lead = null }) {
    if (current !== currentId) {
      currentId = current;
      if (current != null) drop(current);
      if (change && change.id === current) change = null;
    }
    if (!heardAt || now - heardAt > P.silenceMs) {
      reset();
      return [];
    }
    const hidden = new Set(hide);
    if (current != null) hidden.add(current);
    items.forEach((it) => {
      if (it.shabadId == null || it.shabadId === current) return;
      absorb(it, now);
    });
    // The change card: the judge's lead now, else the last one for a short hold.
    if (lead && lead.shabadId != null && lead.shabadId !== current) {
      const prev = change && change.id === lead.shabadId ? change.item : {};
      change = { id: lead.shabadId, item: { ...prev, ...lead }, lastAt: now };
      const t = tracks.get(lead.shabadId);
      if (t) {
        t.lastAt = Math.max(t.lastAt, now);
        t.item = { ...t.item, ...lead };
      }
    } else if (change && now - change.lastAt > P.changeHoldMs) {
      // An evidence card stays in "Changing to" while its Shabad's evidence stays well built
      // up, so a wobble in the judge's count does not send it back and forth to the list.
      const t = tracks.get(change.id);
      const ev = (items.find((it) => it.shabadId === change.id) || {}).ev || (t && t.ev);
      if (!(ev && ev.fill >= P.changeKeepFill)) change = null;
    }
    const changeId = change ? change.id : null;

    const present = new Map(items.map((it) => [it.shabadId, it]));
    [...tracks.keys()].forEach((id) => {
      const t = tracks.get(id);
      if (id === changeId) return;
      // An evidence card goes when its evidence has faded out (it is no longer offered).
      if (t.ev ? !present.has(id) : ageOf(t, now) > P.holdMs) drop(id);
    });
    // Shown %: the board's own while it is still scoring the card; afterwards its last
    // score, decaying slowly (never a sudden drop to nothing). Same for the progress.
    tracks.forEach((t, id) => {
      const live = present.get(id);
      // eslint-disable-next-line no-param-reassign
      t.pct = Math.max(live ? live.pct || 0 : 0, decayed(t.lastPct, t, now));
      // eslint-disable-next-line no-param-reassign
      t.prog = Math.max(live && live.prog != null ? live.prog : 0, decayed(t.lastProg, t, now));
    });

    // Listed: tracked, not on screen, not in the change card, not hidden.
    const listable = (id) => tracks.has(id) && id !== changeId && !hidden.has(id);
    // Rank: evidence total for evidence cards, else the %.
    const val = (id) => {
      const t = tracks.get(id);
      return t.ev ? t.ev.total : t.pct;
    };
    const evMode = (a, b) => !!(tracks.get(a).ev && tracks.get(b).ev);
    order = order.filter(listable);
    const fresh = [...tracks.keys()]
      .filter((id) => listable(id) && !order.includes(id))
      .sort((a, b) => val(b) - val(a));
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
      // clearly beaten for a while; never of a card listed less than minShowMs ago.
      const open = order.filter((x) => now - shownAt.get(x) >= P.minShowMs);
      if (!open.length) {
        waitSince.delete(id);
        return;
      }
      const fadingNow = (x) => !tracks.get(x).ev && isFading(tracks.get(x), now);
      const rank = (x) => (fadingNow(x) ? -1 : 0);
      const weakest = open.reduce((w, x) =>
        rank(x) < rank(w) || (rank(x) === rank(w) && val(x) < val(w)) ? x : w,
      );
      let take = fadingNow(weakest);
      const ev = evMode(id, weakest);
      const margin = ev ? P.evOvertake : P.overtake;
      if (!take && val(id) > val(weakest) + margin) {
        if (!waitSince.has(id)) waitSince.set(id, now);
        // Evidence cards: a Shabad with more evidence takes the place at once (the sooner the
        // next Shabad is seen, the better); the % cards wait to be clearly ahead for a while.
        take = ev || now - waitSince.get(id) >= P.overtakeMs;
      } else if (!take) waitSince.delete(id);
      if (take) {
        order = order.filter((x) => x !== weakest);
        shownAt.delete(weakest);
        list(id);
      }
    });

    // Ordered by confidence, highest first. A card passes the one above it only when it is
    // ahead by more than `swap`, so two cards within a point keep their places.
    for (let pass = 0; pass < order.length; pass += 1) {
      let moved = false;
      for (let i = 1; i < order.length; i += 1) {
        const margin = evMode(order[i], order[i - 1]) ? P.evSwap : P.swap;
        if (val(order[i]) > val(order[i - 1]) + margin) {
          [order[i - 1], order[i]] = [order[i], order[i - 1]];
          moved = true;
        }
      }
      if (!moved) break;
    }

    return order.map((id) => {
      const t = tracks.get(id);
      return {
        ...t.item,
        shabadId: id,
        pct: t.pct,
        prog: t.prog,
        ...(t.ev ? { ev: t.ev } : {}),
        role: 'candidate',
        fading: t.ev ? false : isFading(t, now),
      };
    });
  }

  // The Shabad in the "Changing to" card (held), or null. `live` = the judge is checking it
  // right now (false during the short hold after it let go).
  function changeCard(now) {
    if (!change) return null;
    const t = tracks.get(change.id);
    return {
      ...(t ? t.item : {}),
      ...change.item,
      shabadId: change.id,
      pct: t ? t.pct : change.item.pct || 0,
      live: now == null || now - change.lastAt <= 0,
    };
  }

  // Every Shabad the shelf is holding, listed or waiting for a place (for the session log).
  const waiting = () =>
    [...tracks.entries()]
      .filter(([id]) => !order.includes(id) && !(change && change.id === id))
      .map(([id, t]) => ({ shabadId: id, pct: t.pct }));

  return { update, reset, waiting, changeCard, params: P };
}

module.exports = { createShelf, DEFAULTS };
