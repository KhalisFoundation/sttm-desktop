import Noty from 'noty';
import { remote } from 'electron';
import banidb from '../../banidb';

const { i18n } = remote.require('./app');
export const loadShabadVerse = (shabadID, lineID, nextLine = false) => {
  return banidb
    .loadShabad(shabadID, lineID)
    .then(rows =>
      rows.filter(verse => {
        if (nextLine) {
          return verse.ID === lineID + 1;
        }
        return verse.ID === lineID;
      }),
    )
    .catch(err => {
      new Noty({
        type: 'error',
        text: `${i18n.t('BANI.LOAD_SHABAD_VERSE_ERROR')} : ${err}`,
        timeout: 5000,
        modal: true,
      }).show();
    });
};
