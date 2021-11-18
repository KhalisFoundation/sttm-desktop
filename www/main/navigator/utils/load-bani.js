import banidb from '../../banidb';

export const loadBani = (baniId, baniLength, mangalPosition) => {
  return banidb.loadBani(baniId, baniLength).then(rows => {
    return rows
      .filter(result => result.MangalPosition !== mangalPosition)
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
  });
};
