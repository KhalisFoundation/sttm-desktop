import Noty from 'noty';
import { remote } from 'electron';
import banidb from '../../banidb';

const { i18n } = remote.require('./app');
export const loadBaniVerse = (baniId, verseId, nextLine = false, baniLength, mangalPosition) => {
  return banidb
    .loadBani(baniId, baniLength)
    .then(allVerses =>
      allVerses
        .filter(result => result.MangalPosition !== mangalPosition)
        .map(rowDb => {
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
        .filter(verse => {
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
    .catch(err => {
      new Noty({
        type: 'error',
        text: `${i18n.t('BANI.LOAD_BANI_VERSE_ERROR')} : ${err}`,
        timeout: 5000,
        modal: true,
      }).show();
    });
};
