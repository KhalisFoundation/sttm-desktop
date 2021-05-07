import banidb from '../../../banidb';

export const searchShabads = (searchQuery, searchType, searchSource, setSearchedShabads) => {
  banidb
    .query(searchQuery, searchType, searchSource)
    .then(rows => (searchQuery ? setSearchedShabads(rows) : setSearchedShabads([])));
};
