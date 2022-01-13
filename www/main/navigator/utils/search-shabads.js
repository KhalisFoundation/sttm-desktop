import banidb from '../../banidb';

export const searchShabads = (searchQuery, searchType, searchSource) => {
  return banidb
    .query(searchQuery, searchType, searchSource)
    .then(verses => verses)
    .catch(() => {
      const dbStatus = !!localStorage.getItem('isDbDownloaded');
      if (dbStatus) {
        console.log('Database is downloading, please wait...');
      } else {
        console.log('Error while searching shabad, please contact dev team');
      }
    });
};
