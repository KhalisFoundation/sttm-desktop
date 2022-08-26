import getJSON from 'get-json';
import isOnline from 'is-online';

const remote = require('@electron/remote');

const analytics = remote.getGlobal('analytics');

export const dailyHukamnama = (
  activeShabadId,
  setActiveShabadId,
  isSundarGutkaBani,
  setIsSundarGutkaBani,
  isCeremonyBani,
  setIsCeremonyBani,
) => {
  isOnline().then(online => {
    if (online) {
      getJSON('https://api.banidb.com/v2/hukamnamas/today', (error, response) => {
        if (!error) {
          const hukamShabadID = parseInt(response.shabadIds[0], 10);

          if (activeShabadId !== hukamShabadID) {
            setActiveShabadId(hukamShabadID);
          }
          if (isSundarGutkaBani) {
            setIsSundarGutkaBani(false);
          }
          if (isCeremonyBani) {
            setIsCeremonyBani(false);
          }
          analytics.trackEvent('display', 'hukamnama', hukamShabadID);
        }
      });
    }
  });
};
