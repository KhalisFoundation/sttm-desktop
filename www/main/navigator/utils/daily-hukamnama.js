import getJSON from 'get-json';
import isOnline from 'is-online';

export const dailyHukamnama = (setIsHukamnamaLoading) =>
  new Promise((resolve, reject) => {
    isOnline().then((online) => {
      if (online) {
        setIsHukamnamaLoading(true);
        getJSON('https://api.banidb.com/v2/hukamnamas/today', (error, response) => {
          if (!error) {
            const hukamShabadID = parseInt(response.shabadIds[0], 10);
            resolve(hukamShabadID);
          } else {
            reject();
          }
        });
      }
    });
  });
