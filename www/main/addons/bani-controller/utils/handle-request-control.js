const remote = require('@electron/remote');

const analytics = remote.getGlobal('analytics');

// Maps a navigator verseHistory entry to the wire-format history entry used
// by the controller history sync protocol.
const toWireHistoryEntry = (entry) => ({
  shabadId: entry.shabadId,
  verseId: entry.verseId,
  label: entry.label,
  kind: entry.type === 'bani' || entry.type === 'ceremony' ? entry.type : 'shabad',
});

const handleRequestControl = (
  isPinCorrect,
  fontSizes,
  activeShabad,
  activeShabadId,
  activeVerseId,
  homeVerse,
  ceremonyId,
  sundarGutkaBaniId,
  baniLength,
  // mangalPosition,
  verseHistory = [],
  adminPin = 0,
  miscState = {},
) => {
  document.body.classList.toggle(`controller-on`, Boolean(isPinCorrect));
  window.socket.emit('data', {
    host: 'sttm-desktop',
    type: 'response-control',
    success: Boolean(isPinCorrect),
    settings: {
      fontSizes,
    },
    // Echo the current misc-slide / announcement state at connect so the
    // web controller can hydrate its `activeAnnouncement` chip if the
    // operator is mid-announcement when a client joins.
    miscState: {
      isMiscSlide: Boolean(miscState.isMiscSlide),
      isAnnouncement: Boolean(miscState.isAnnouncement),
      miscSlideText: miscState.miscSlideText ?? '',
      isMiscSlideGurmukhi: Boolean(miscState.isMiscSlideGurmukhi),
    },
  });

  // After a successful join, snapshot the operator's current history to the
  // controller so the web-side History tab matches what desktop shows.
  if (isPinCorrect && Array.isArray(verseHistory) && verseHistory.length > 0) {
    window.socket.emit('data', {
      host: 'sttm-desktop',
      type: 'history',
      pin: parseInt(adminPin, 10) || 0,
      action: 'sync',
      entries: verseHistory.map(toWireHistoryEntry),
    });
  }
  // if Pin is correct and there is a shabad already in desktop, emit that shabad details.
  if (isPinCorrect) {
    const currentShabad = {
      id: activeShabadId,
      type: 'shabad',
      baniLength: '',
      // mangalPosition: '',
    };

    if (ceremonyId) {
      currentShabad.id = ceremonyId;
      currentShabad.type = 'ceremony';
    }
    if (sundarGutkaBaniId) {
      currentShabad.id = sundarGutkaBaniId;
      currentShabad.type = 'bani';
      currentShabad.baniLength = baniLength;
      // currentShabad.mangalPosition = mangalPosition;
    }
    let homeId;
    let highlight;

    if (currentShabad.id) {
      if (currentShabad.type === 'shabad') {
        highlight = activeVerseId;
        homeId = homeVerse;
      } else if (currentShabad.type === 'ceremony') {
        // Previously `highlight` was the ceremonyId itself, which is
        // useless to web (it tries to match a verseId against the verse
        // list and finds nothing). Send the currently-active verseId so
        // the web pane highlights the correct row on connect.
        highlight = activeVerseId;
      } else if (currentShabad.type === 'bani') {
        highlight = activeVerseId;
      }

      window.socket.emit('data', {
        type: currentShabad.type,
        host: 'sttm-desktop',
        id: currentShabad.id,
        shabadid: currentShabad.id, // @deprecated
        highlight: parseInt(highlight, 10),
        verseId: parseInt(activeVerseId, 10),
        homeId: parseInt(homeId, 10),
        baniLength: currentShabad.baniLength,
        // mangalPosition: currentShabad.mangalPosition,
      });
    }
  }
  analytics.trackEvent({
    category: 'controller',
    action: 'connection',
    label: 'controller_connection_attempt',
    value: isPinCorrect ? 'Connection Succesfull' : 'Connection Failed',
  });
};

export default handleRequestControl;
