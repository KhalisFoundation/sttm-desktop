import banidb from '../../banidb';

export const loadShabadVerse = (shabadID, lineID, nextLine = false) => {
  return banidb.loadShabad(shabadID, lineID).then(rows =>
    rows.filter(verse => {
      if (nextLine) {
        return verse.ID === lineID + 1;
      }
      return verse.ID === lineID;
    }),
  );
};
