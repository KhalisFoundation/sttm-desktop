import banidb from '../../banidb';

export const loadCeremony = ceremonyId => {
  return banidb.loadCeremony(ceremonyId).then(result =>
    result
      .map(verse => verse.Verse)
      .filter(verse => {
        if (verse) {
          return true;
        }
        return false;
      }),
  );
};
