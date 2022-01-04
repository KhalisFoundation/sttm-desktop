import banidb from '../../banidb';

export const loadShabad = (shabadID, lineID) => {
  return banidb
    .loadShabad(shabadID, lineID)
    .then(rows => rows)
    .catch(() => {
      const dbStatus = !!localStorage.getItem('isDbDownloaded');
      if (dbStatus) {
        console.log('Database is downloading, please wait...');
      } else {
        console.log('Error while loading shabad, please contact dev team');
      }
    });
};
