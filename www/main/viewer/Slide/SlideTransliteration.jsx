import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';
import anvaad from 'anvaad-js';

const SlideTransliteration = ({ transliterationObj }) => {
  const { transliterationLanguage, transliterationFontSize } = useStoreState(
    state => state.userSettings,
  );

  const getTransliteration = () => {
    let transliteration;
    switch (transliterationLanguage) {
      case 'English':
        transliteration = anvaad.translit(transliterationObj);
        break;
      case 'Shahmukhi':
        transliteration = anvaad.translit(transliterationObj || '', 'shahmukhi');
        break;
      case 'Devanagari':
        transliteration = anvaad.translit(transliterationObj || '', 'devnagri');
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
  transliterationObj: PropTypes.string,
};

export default SlideTransliteration;
