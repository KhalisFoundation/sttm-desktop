import banidb from '../../banidb';

export const loadBani = (baniId, baniLength) => {
  return banidb
    .loadBani(baniId, baniLength)
    .then(rows => rows.map(row => row.Verse).filter(row => row));
};
