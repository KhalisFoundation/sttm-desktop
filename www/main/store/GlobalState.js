import { createStore, action } from 'easy-peasy';
import { DEFAULT_OVERLAY } from '../constants';

const GlobalState = createStore({
  app: {
    overlayScreen: DEFAULT_OVERLAY,
    setOverlayScreen: action((state, payload) => {
      return {
        ...state,
        overlayScreen: payload,
      };
    }),
  },
});

export default GlobalState;
