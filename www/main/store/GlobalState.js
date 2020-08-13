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
  baniController: {
    adminPin: '...',
    code: '...',
    isAdminPinVisible: true,
    isConnected: false,
    setAdminPin: action((state, adminPin) => {
      return {
        ...state,
        adminPin,
      };
    }),
    setCode: action((state, code) => {
      return {
        ...state,
        code,
      };
    }),
    setAdminPinVisible: action((state, adminPinVisibility) => {
      return {
        ...state,
        isAdminPinVisible: adminPinVisibility,
      };
    }),
    setConnection: action((state, connection) => {
      return {
        ...state,
        isConnected: connection,
      };
    }),
  },
});

export default GlobalState;
