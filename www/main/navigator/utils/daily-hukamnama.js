import getJSON from 'get-json';
import isOnline from 'is-online';

const electron = require('electron');

const analytics = electron.remote.getGlobal('analytics');

export const dailyHukamnama = (
  activeShabadId,
  setActiveShabadId,
  isCeremonyBani,
  setIsCeremonyBani,
  setIsHukamnamaLoading,
) => {
  isOnline().then(online => {
    if (online) {
      setIsHukamnamaLoading(true);
      getJSON('https://api.banidb.com/v2/hukamnamas/today', (error, response) => {
        if (!error) {
          setIsHukamnamaLoading(false);
          const hukamShabadID = parseInt(response.shabadIds[0], 10);

          if (activeShabadId !== hukamShabadID) {
            setActiveShabadId(hukamShabadID);
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
