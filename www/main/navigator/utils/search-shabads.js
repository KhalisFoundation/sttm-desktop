import Noty from 'noty';
import banidb from '../../banidb';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

export const searchShabads = (searchQuery, searchType, searchSource, howManyRows) =>
  banidb
    .query(searchQuery, searchType, searchSource, howManyRows)
    .then((verses) => verses)
    .catch((err) => {
      const dbStatus = !!localStorage.getItem('isDbDownloaded');
      if (dbStatus) {
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
