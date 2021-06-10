import banidb from '../../banidb';

export const loadShabadVerse = (shabadID, lineID) => {
  return banidb
    .loadShabad(shabadID, lineID)
    .then(rows => rows.filter(verse => verse.ID === lineID));
};
