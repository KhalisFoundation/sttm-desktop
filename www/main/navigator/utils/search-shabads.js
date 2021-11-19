import banidb from '../../banidb';

export const searchShabads = (searchQuery, searchType, searchSource) => {
  return banidb.query(searchQuery, searchType, searchSource).then(verses => verses);
};
