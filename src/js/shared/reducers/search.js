import { SEARCH_QUERY } from '../actions/search';

const initialSearchState = {
  q: '',
};

export default (state = initialSearchState, { type, payload }) => {
  switch (type) {
    case SEARCH_QUERY:
      return {
        q: payload.q,
      };
    default:
      return state;
  }
};
