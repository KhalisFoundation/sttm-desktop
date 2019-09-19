import { createAliasedAction } from 'electron-redux';
import search from '../../main/search';

export const SEARCH_QUERY = 'SEARCH_QUERY';
export const SEARCH_RUN_QUERY = 'SEARCH_RUN_QUERY';

const performSearch = createAliasedAction(SEARCH_RUN_QUERY, q => ({
  type: SEARCH_RUN_QUERY,
  payload: {
    results: search(q),
  },
}));
export const searchAction = q => dispatch => {
  dispatch(performSearch());
  return {
    type: SEARCH_QUERY,
    payload: {
      q,
    },
  };
};
