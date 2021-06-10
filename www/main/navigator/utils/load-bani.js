import banidb from '../../banidb';

export const loadBani = baniId => {
  return banidb
    .loadBani(baniId, 'existsMedium')
    .then(rows => rows.map(row => row.Verse).filter(row => row));
};
