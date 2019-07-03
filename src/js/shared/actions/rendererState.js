export const UPDATE_SEARCH_FOCUS_STATUS = 'UPDATE_SEARCH_FOCUS_STATUS';
export const updateSearchFocusStatusAction = status => ({
  type: UPDATE_SEARCH_FOCUS_STATUS,
  payload: {
    status,
  },
});
