export const initialState = {
  misc_panel: 'History',
};
export const actionTypes = {
  SET_PANEL: 'SET_PANEL',
};
const reducer = (state, action) => {
  switch (action.type) {
    case actionTypes.SET_PANEL:
      return {
        ...state,
        misc_panel: action.misc_panel,
      };
    default:
      return state;
  }
};

export default reducer;
