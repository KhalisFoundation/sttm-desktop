import Noty from 'noty';
import { remote } from 'electron';
import banidb from '../../banidb';

const { i18n } = remote.require('./app');

export const loadCeremony = ceremonyId => {
  return banidb
    .loadCeremony(ceremonyId)
    .then(result =>
      result
        .map(rowDb => {
          let row = rowDb;

          if (rowDb.Verse) {
            row = rowDb.Verse;
          }

          if (rowDb.Custom && rowDb.Custom.ID) {
            row = rowDb.Custom;
          }

          row.shabadID = `ceremony-${rowDb.Ceremony.Token}`;
          row.ceremonyName = rowDb.Ceremony.Gurmukhi;
          row.ceremonyId = rowDb.Ceremony.ID;

          if (rowDb.VerseRange && rowDb.VerseRange.length) {
            row = [...rowDb.VerseRange];
          }

          if (rowDb.VerseIDRangeStart && rowDb.VerseIDRangeEnd) {
            row = banidb.loadVerses(rowDb.VerseIDRangeStart, rowDb.VerseIDRangeEnd);
          }
          row.sessionKey = `ceremony-${ceremonyId}`;
          return row;
        })
        .filter(verse => {
          if (verse) {
            return true;
          }
          return false;
        }),
    )
    .catch(err => {
      new Noty({
        type: 'error',
        text: `${i18n.t('BANI.LOAD_ERROR', { erroneousOperation: 'Ceremony' })} : ${err}`,
        timeout: 5000,
        modal: true,
      }).show();
    });
};
