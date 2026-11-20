import Noty from 'noty';
import banidb from '../../banidb';
import { i18n } from '../../common/i18n';

export const loadShabad = (shabadID) =>
  banidb
    .loadShabad(shabadID)
    .then((rows) => rows)
    .catch((err) => {
      // localStorage keeps strings, so check for 'false' rather than truthiness
      const isDbDownloading = localStorage.getItem('isDbDownloaded') === 'false';
      if (isDbDownloading) {
        new Noty({
          type: 'error',
          text: `${i18n.t('BANI.DATABASE_DOWNLOADING')}`,
          timeout: 5000,
          modal: true,
        }).show();
      } else {
        new Noty({
          type: 'error',
          text: `${i18n.t('BANI.LOAD_ERROR', { erroneousOperation: 'Shabad' })} : ${err}`,
          timeout: 5000,
          modal: true,
        }).show();
      }
    });
