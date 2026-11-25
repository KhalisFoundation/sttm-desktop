import Noty from 'noty';
import banidb from '../../banidb';
import { i18n } from '../../common/i18n';

export const searchShabads = (searchQuery, searchType, searchSource, howManyRows) =>
  banidb
    .query(searchQuery, searchType, searchSource, howManyRows)
    .then((verses) => verses)
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
          text: `${i18n.t('SEARCH.ERROR')} : ${err}`,
          timeout: 5000,
          modal: true,
        }).show();
      }
    });
