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

module.exports = {
  SCROLL_PAUSE_MS,
  SCROLL_ACTIVE_MS,
  listScrollAction,
  screenTakenByCeremony,
};
