import Noty from 'noty';
import { remote } from 'electron';
import banidb from '../../banidb';

const { i18n } = remote.require('./app');
export const loadBani = (baniId, baniLength) => {
  // mangalPosition was removed from arguments and filter
  // .filter(result => result.MangalPosition !== mangalPosition)
  // mangalPosition
  return banidb
    .loadBani(baniId, baniLength)
    .then(rows => {
      return rows
        .map(rowDb => {
          let row = rowDb;
          if (rowDb.Verse) {
            row = rowDb.Verse;
          }
          if (rowDb.Custom) {
            row = rowDb.Custom;
          }

          row.shabadID = rowDb.Bani.Token;
          row.baniId = rowDb.Bani.ID;
          row.baniName = rowDb.Bani.Gurmukhi;
          row.crossPlatformID = rowDb.ID;
          return row;
        })
        .filter(row => row);
    })
    .catch(err => {
      new Noty({
        type: 'error',
        text: `${i18n.t('BANI.LOAD_ERROR', { erroneousOperation: 'Bani' })} : ${err}`,
        timeout: 5000,
        modal: true,
      }).show();
    });
};
