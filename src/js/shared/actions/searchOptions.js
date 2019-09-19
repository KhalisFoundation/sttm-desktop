export const UPDATE_SEARCH_SOURCE = 'UPDATE_SEARCH_SOURCE';
export const updateSearchSource = source => ({
  type: UPDATE_SEARCH_SOURCE,
  payload: {
    source,
  },
});
