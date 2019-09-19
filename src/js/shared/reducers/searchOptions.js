import { UPDATE_SEARCH_SOURCE } from '../actions/searchOptions';
import { searchOptions as searchOptionsDefaults } from '../defaults.json';

export default (state = searchOptionsDefaults, { type, payload }) => {
  switch (type) {
    case UPDATE_SEARCH_SOURCE:
      return {
        ...state,
        source: payload.source,
      };
    default:
      return state;
  }
};
