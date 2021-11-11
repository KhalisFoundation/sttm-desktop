// import { remote } from 'electron';

// const analytics = remote.getGlobal('analytics');

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
  mangalPosition,
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
  // if Pin is correct and there is a shabad already in desktop, emit that shabad details.
  if (isPinCorrect) {
    const currentShabad = {
      id: activeShabadId,
      type: 'shabad',
      baniLength: '',
      mangalPosition: '',
    };

    if (ceremonyId) {
      currentShabad.id = ceremonyId;
      currentShabad.type = 'ceremony';
    }
    if (sundarGutkaBaniId) {
      currentShabad.id = sundarGutkaBaniId;
      currentShabad.type = 'bani';
      currentShabad.baniLength = baniLength;
      currentShabad.mangalPosition = mangalPosition;
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
        mangalPosition: currentShabad.mangalPosition,
      });
    }
  }
  // analytics.trackEvent(
  //   'controller',
  //   'connection',
  //   isPinCorrect ? 'Connection Succesful' : 'Connection Failed',
  // );
};

export default handleRequestControl;
