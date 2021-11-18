import banidb from '../../banidb';

export const loadCeremony = ceremonyId => {
  return banidb.loadCeremony(ceremonyId).then(result =>
    result
      .map(rowDb => {
        let row = rowDb;

        if (rowDb.Verse) {
          row = rowDb.Verse;
        }

        if (rowDb.Custom && rowDb.Custom.ID) {
          row = rowDb.Custom;
          row.shabadID = `ceremony-${rowDb.Ceremony.Token}`;
        }

        if (rowDb.VerseRange && rowDb.VerseRange.length) {
          row = [...rowDb.VerseRange];
        }

        if (rowDb.VerseIDRangeStart && rowDb.VerseIDRangeEnd) {
          row = banidb.loadVerses(rowDb.VerseIDRangeStart, rowDb.VerseIDRangeEnd);
        }
        row.sessionKey = `ceremony-${ceremonyId}`;
        return row;
      })
      .filter(verse => {
        if (verse) {
          return true;
        }
        return false;
      }),
  );
};
