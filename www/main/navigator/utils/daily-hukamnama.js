import getJSON from 'get-json';
import isOnline from 'is-online';

const electron = require('electron');

const analytics = electron.remote.getGlobal('analytics');

export const dailyHukamnama = (activeShabadId, setActiveShabadId) => {
  isOnline().then(online => {
    if (online) {
      getJSON('https://api.banidb.com/v2/hukamnamas/today', (error, response) => {
        if (!error) {
          const hukamShabadID = parseInt(response.shabadIds[0], 10);

          analytics.trackEvent('display', 'hukamnama', hukamShabadID);
          if (activeShabadId !== hukamShabadID) {
            setActiveShabadId(hukamShabadID);
          }
        }
      });
    }
  });
};
