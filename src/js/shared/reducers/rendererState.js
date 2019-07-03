import { UPDATE_SEARCH_FOCUS_STATUS } from '../actions/rendererState';
import { SEARCH_QUERY } from '../actions/search';

const initialState = {
  searchFocus: false,
  typingWithKB: false,
};

export default (state = initialState, { type, payload }) => {
  switch (type) {
    case UPDATE_SEARCH_FOCUS_STATUS:
      return {
        ...state,
        searchFocus: payload.status,
        // If the search has received or lost focus, we're no longer clicking the GurmukhiKB buttons
        typingWithKB: false,
      };
    case SEARCH_QUERY:
      if (payload.isKB) {
        return {
          ...state,
          typingWithKB: true,
        };
      }
      return state;
    default:
      return state;
  }
};
