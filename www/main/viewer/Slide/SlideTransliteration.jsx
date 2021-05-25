import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';
import anvaad from 'anvaad-js';

const SlideTransliteration = ({ gurmukhiString }) => {
  const { transliterationLanguage, transliterationFontSize } = useStoreState(
    state => state.userSettings,
  );

  const getTransliteration = () => {
    let transliteration;
    switch (transliterationLanguage) {
      case 'English':
        transliteration = anvaad.translit(gurmukhiString);
        break;
      case 'Shahmukhi':
        transliteration = anvaad.translit(gurmukhiString || '', 'shahmukhi');
        break;
      case 'Devanagari':
        transliteration = anvaad.translit(gurmukhiString || '', 'devnagri');
        break;
      default:
        transliteration = '';
        break;
    }
    return transliteration;
  };

  return (
    <div
      className={`slide-transliteration language-${transliterationLanguage}`}
      style={{ fontSize: `${transliterationFontSize * 3}px` }}
    >
      {getTransliteration()}
    </div>
  );
};

SlideTransliteration.propTypes = {
  gurmukhiString: PropTypes.string,
};

export default SlideTransliteration;
