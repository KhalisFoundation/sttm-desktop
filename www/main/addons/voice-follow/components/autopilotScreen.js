// Small pure rules for how Autopilot shares the controller screen with the sevadaar.
// CommonJS so node --test can load them (see autopilotScreen.test.js).

// The sevadaar scrolled the Shabad list by hand: leave their view alone this long.
const SCROLL_PAUSE_MS = 8000;
// A scroll this recent means they are still scrolling: never move the list under them.
const SCROLL_ACTIVE_MS = 1500;

// Autopilot moved the line. Should the controller's Shabad list scroll to it?
//   'follow'  scroll as usual
//   'keep'    leave the sevadaar's scroll position (the highlight still moves)
//   'resume'  the pause is over (time up, or they are back near the line): scroll, and
//             forget the pause
// Only Autopilot's moves are held: with Autopilot off every line change scrolls as before.
// range is the list's visible { startIndex, endIndex }; activeIndex the new line's row.
const listScrollAction = ({ autopilotLive, lastUserScrollAt, now, activeIndex, range }) => {
  if (!autopilotLive || !lastUserScrollAt) return 'follow';
  const since = now - lastUserScrollAt;
  if (since < SCROLL_ACTIVE_MS) return 'keep';
  if (since >= SCROLL_PAUSE_MS) return 'resume';
  if (
    range &&
    activeIndex != null &&
    activeIndex >= range.startIndex &&
    activeIndex <= range.endIndex
  ) {
    return 'resume';
  }
  return 'keep';
};

// Did the screen leave the content Autopilot is following for a ceremony? A ceremony tile
// (Ceremonies screen, e.g. Anand Karaj with the Floral theme) opens the ceremony in the
// pane. Autopilot cannot follow a ceremony, and its line moves for the Shabad it is
// following then land nowhere. Flag it so the next pangti Autopilot hears puts its Shabad
// (or Bani) back on screen at that pangti.
const screenTakenByCeremony = ({ following, visible, isCeremonyBani }) =>
  !!(following && visible && isCeremonyBani);

// STTM's Auto Play (Akhand Paath view: the next pangti every N seconds) and Voice Autopilot
// must never drive the screen together: the timer moves on at a fixed pace whether the reader
// has finished the pangti or not (Renton, Oct 26: about 3 in 10 moves came early). While
// Autopilot is on, Auto Play is paused. The sevadaar's saved setting is never changed, so it
// is back exactly as it was when Autopilot stops.
const autoplayMayAdvance = ({ autoplayToggle, autopilotLive }) =>
  !!autoplayToggle && !autopilotLive;

// A screen move made by the Auto Play timer is never the sevadaar's own move (lineRespect.js).
// The timer notes each move it makes; a line change this soon after is the timer's.
const AUTOPLAY_TICK_GRACE_MS = 1500;
let lastAutoplayTickAt = 0;
const noteAutoplayTick = (now = Date.now()) => {
  lastAutoplayTickAt = now;
};
const autoplayTickedRecently = (now = Date.now()) =>
  lastAutoplayTickAt > 0 &&
  now - lastAutoplayTickAt >= 0 &&
  now - lastAutoplayTickAt <= AUTOPLAY_TICK_GRACE_MS;

module.exports = {
  SCROLL_PAUSE_MS,
  SCROLL_ACTIVE_MS,
  AUTOPLAY_TICK_GRACE_MS,
  listScrollAction,
  screenTakenByCeremony,
  autoplayMayAdvance,
  noteAutoplayTick,
  autoplayTickedRecently,
};
