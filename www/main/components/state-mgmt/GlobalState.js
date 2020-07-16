import { createStore, action } from 'easy-peasy';

const GlobalState = createStore({
  toolbar: {
    currentOverlayScreen: 'none',
    toggleOverlayScreen: action((state, payload) => {
      return {
        ...state,
        currentOverlayScreen: payload,
      };
    }),
  },
});

export default GlobalState;
