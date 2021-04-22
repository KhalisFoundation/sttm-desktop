import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';
import anvaad from 'anvaad-js';

const SlideTransliteration = ({ transliterationObj }) => {
  const { transliterationLanguage } = useStoreState(state => state.userSettings);

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
    <span className={`slide-transliteration language-${transliterationLanguage}`}>
      {getTransliteration()}
    </span>
  );
};

SlideTransliteration.propTypes = {
  transliterationObj: PropTypes.string,
};

export default SlideTransliteration;
