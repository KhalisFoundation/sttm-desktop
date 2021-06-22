import banidb from '../../banidb';

export const loadBaniVerse = (baniId, verseId, nextLine = false) => {
  return banidb.loadBani(baniId, 'existsMedium').then(allVerses =>
    allVerses
      .map(wholeVerseObj => wholeVerseObj.Verse)
      .filter(verse => {
        if (verse !== null) {
          if (nextLine) {
            return verse.ID === verseId + 1;
          }
          return verse.ID === verseId;
        }
        return false;
      }),
  );
};
