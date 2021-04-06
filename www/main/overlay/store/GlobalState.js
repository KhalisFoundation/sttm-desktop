import { createStore, action } from 'easy-peasy';

const GlobalState = createStore({
  baniOverlay: {
    theme: 'a-new-day',
    textColor: '',
    layout: 'split',
    bgColor: '#274f69',
    bgOpacity: 0.9,
    padding: 0.5,
    fontSize: 3,
    gurbaniFontSize: 5,
    gurbaniTextColor: '#ffffff',
    overlayLogo: true,
    overlayLarivaar: false,
    translationFont: 'Muli',
    gurbaniFont: 'Gurbani Akhar Thick',
    larivaarAssist: false,
    greenScreen: false,

    setTheme: action((state, theme) => {
      return {
        ...state,
        theme,
      };
    }),
    setTextColor: action((state, textColor) => {
      return {
        ...state,
        textColor,
      };
    }),
    setGurbaniTextColor: action((state, gurbaniTextColor) => {
      return {
        ...state,
        gurbaniTextColor,
      };
    }),
    setBgColor: action((state, bgColor) => {
      return {
        ...state,
        bgColor,
      };
    }),
  },
});

export default GlobalState;
