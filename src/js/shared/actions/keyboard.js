import { SEARCH_QUERY } from './search';

export const TOGGLE_GURMUKHI_KB = 'TOGGLE_GURMUKHI_KB';
export const toggleGurmukhiKBAction = {
  type: TOGGLE_GURMUKHI_KB,
};

export const CHANGE_GURMUKHI_KB_PAGE = 'CHANGE_GURMUKHI_KB_PAGE';
export const changeGurmukhiKBPage = page => ({
  type: CHANGE_GURMUKHI_KB_PAGE,
  payload: {
    page,
  },
});

export const backspace = curVal => ({
  type: SEARCH_QUERY,
  payload: {
    q: curVal.substring(0, curVal.length - 1),
    isKB: true,
  },
});

export const typeChar = (char, curVal) => ({
  type: SEARCH_QUERY,
  payload: {
    q: `${curVal}${char}`,
    isKB: true,
  },
});
