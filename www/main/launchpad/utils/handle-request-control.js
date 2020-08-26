import { remote } from 'electron';

const analytics = remote.getGlobal('analytics');

const handleRequestControl = isPinCorrect => {
  document.body.classList.toggle(`controller-on`, isPinCorrect);
  window.socket.emit('data', {
    host: 'sttm-desktop',
    type: 'response-control',
    success: isPinCorrect,
  });
  // if Pin is correct and there is a shabad already in desktop, emit that shabad details.
  if (isPinCorrect) {
    const currentShabad = global.core.search.getCurrentShabadId();
    const currentVerse = document.querySelector(`#shabad .panktee.current`);
    const homeVerse = document.querySelector(`#shabad .panktee.main`);
    let homeId;
    let highlight;

    if (currentShabad.id && currentVerse) {
      if (currentShabad.type === 'shabad') {
        highlight = currentVerse.dataset.lineId;
        homeId = homeVerse.dataset.lineId;
      } else {
        highlight = currentVerse.dataset.cpId;
        homeId = homeVerse.dataset.cpId;
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
  analytics.trackEvent(
    'controller',
    'connection',
    isPinCorrect ? 'Connection Succesful' : 'Connection Failed',
  );
};

export default handleRequestControl;
