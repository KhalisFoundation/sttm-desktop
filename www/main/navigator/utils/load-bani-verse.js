import Noty from 'noty';
import banidb from '../../banidb';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');
export const loadBaniVerse = (baniId, verseId, baniLength, nextLine = false) =>
  // mangalPosition was removed from arguments and filter
  // mangalPosition = 'current',
  // .filter(result => result.MangalPosition !== mangalPosition)
  banidb
    .loadBani(baniId, baniLength)
    .then((allVerses) =>
      allVerses
        .map((rowDb) => {
          let row = rowDb;
          if (rowDb.Verse) {
            row = rowDb.Verse;
          }
          if (rowDb.Custom) {
            row = rowDb.Custom;
            row.shabadID = rowDb.Bani.Token;
          }
          row.crossPlatformID = rowDb.ID;
          return row;
        })
        .filter((verse) => {
          if (verse !== null) {
            const id = verse.ID;
            if (nextLine) {
              return id === verseId + 1;
            }
            return id === verseId;
          }
          return false;
        }),
    )
    .catch((err) => {
      new Noty({
        type: 'error',
        text: `${i18n.t('BANI.LOAD_ERROR', { erroneousOperation: 'Bani verse' })} : ${err}`,
        timeout: 5000,
        modal: true,
      }).show();
    });
