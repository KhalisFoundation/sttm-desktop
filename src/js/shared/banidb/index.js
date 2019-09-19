import os from 'os';
// Constants
import * as CONSTS from './constants';

export default async () => {
  try {
    let search;
    const platform = os.platform();
    /* if (platform === 'win32') {
      const version = /\d+\.\d/.exec(os.release())[0];
      if (version !== '6.3' && version !== '10.0') {
        search = await import('./sqlite-search');
      }
    }
    if (!search) {
      (search = await import('./realm-search'));
    } */

    const {
      query,
      loadShabad,
      loadBanis,
      loadBani,
      loadCeremony,
      loadCeremonies,
      loadVerses,
      getAng,
      loadAng,
      getShabad,
      randomShabad,
    } = search;

    // Re-export CONSTS for use in other areas
    return {
      CONSTS,
      query,
      loadShabad,
      loadBanis,
      loadBani,
      loadCeremony,
      loadCeremonies,
      loadVerses,
      getAng,
      loadAng,
      getShabad,
      randomShabad,
    };
  } catch (e) {
    console.log(e);
  }
};
