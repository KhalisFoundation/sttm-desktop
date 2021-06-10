import banidb from '../../banidb';

export const loadBaniVerse = (baniId, verseId) => {
  return banidb.loadBani(baniId, 'existsMedium').then(allVerses =>
    allVerses
      .map(wholeVerseObj => wholeVerseObj.Verse)
      .filter(verse => {
        if (verse !== null) {
          return verse.ID === verseId;
        }
        return false;
      }),
  );
};
