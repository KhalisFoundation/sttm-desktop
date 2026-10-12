import Noty from 'noty';
import banidb from '../../banidb';
import { i18n } from '../../common/i18n';

export const loadShabadVerse = (shabadID, lineID, nextLine = false) =>
  banidb
    .loadShabad(shabadID, lineID)
    .then((rows) =>
      rows.filter((verse) => {
        if (nextLine) {
          return verse.ID === lineID + 1;
        }
        return verse.ID === lineID;
      }),
    )
    .catch((err) => {
      new Noty({
        type: 'error',
        text: `${i18n.t('BANI.LOAD_ERROR', { erroneousOperation: 'Shabad verse' })} : ${err}`,
        timeout: 5000,
        modal: true,
      }).show();
    });
