import banidb from '../../banidb';

export const loadVerse = (shabadID, lineID) => {
  return banidb
    .loadShabad(shabadID, lineID)
    .then(rows => rows.filter(verse => verse.ID === lineID));
};
