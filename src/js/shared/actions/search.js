export const SEARCH_QUERY = 'SEARCH_QUERY';
export const searchAction = q => ({
  type: SEARCH_QUERY,
  payload: {
    q,
  },
});
