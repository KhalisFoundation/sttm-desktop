import banidb from '../../banidb';

export const loadShabad = (shabadID, lineID) => {
  return banidb
    .loadShabad(shabadID, lineID)
    .then(rows => rows)
    .catch(() => {
      console.log('err while loading shabad, please contact dev team');
    });
};
