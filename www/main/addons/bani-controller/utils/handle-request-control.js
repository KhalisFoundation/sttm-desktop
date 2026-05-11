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
) => {
  document.body.classList.toggle(`controller-on`, isPinCorrect);
  window.socket.emit('data', {
    host: 'sttm-desktop',
    type: 'response-control',
    success: isPinCorrect,
    settings: {
      fontSizes,
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
        highlight = ceremonyId;
      } else if (currentShabad.type === 'bani') {
        highlight = sundarGutkaBaniId;
      }

      window.socket.emit('data', {
        type: currentShabad.type,
        host: 'sttm-desktop',
        id: currentShabad.id,
        shabadid: currentShabad.id, // @deprecated
        highlight: parseInt(highlight, 10),
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
