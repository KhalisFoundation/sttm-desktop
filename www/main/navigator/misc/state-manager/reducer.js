export const initialState = {
  miscPanel: 'History',
};
export const actionTypes = {
  SET_PANEL: 'SET_PANEL',
};
const reducer = (state, action) => {
  switch (action.type) {
    case actionTypes.SET_PANEL:
      return {
        ...state,
        miscPanel: action.miscPanel,
      };
    default:
      return state;
  }
};

export default reducer;
