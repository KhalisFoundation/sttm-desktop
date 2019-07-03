import { TOGGLE_GURMUKHI_KB, CHANGE_GURMUKHI_KB_PAGE } from '../actions/keyboard';
import { gurmukhiKB as gurmukhiKBDefaults } from '../defaults.json';

export default (state = gurmukhiKBDefaults, { type, payload }) => {
  switch (type) {
    case TOGGLE_GURMUKHI_KB:
      return {
        ...state,
        open: !state.open,
      };
    case CHANGE_GURMUKHI_KB_PAGE:
      return {
        ...state,
        page: payload.page,
      };
    default:
      return state;
  }
};
