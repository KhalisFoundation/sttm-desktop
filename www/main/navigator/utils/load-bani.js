import banidb from '../../banidb';

export const loadBani = (baniId, baniLength, mangalPosition) => {
  return banidb.loadBani(baniId, baniLength).then(rows => {
    return rows
      .filter(result => result.MangalPosition !== mangalPosition)
      .map(row => row.Verse)
      .filter(row => row);
  });
};
