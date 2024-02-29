import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';
import anvaad from 'anvaad-js';

const SlideTransliteration = ({ getFontSize, gurmukhiString, lang }) => {
  const { transliterationFontSize } = useStoreState((state) => state.userSettings);
  const [transliterationString, setTransliterationString] = useState(null);

  const getTransliteration = (gurmukhi) => {
    switch (lang) {
      case 'transliteration-english':
        setTransliterationString(anvaad.translit(gurmukhi));
        break;
      case 'transliteration-punjabi':
        setTransliterationString(anvaad.translit(gurmukhi || '', 'shahmukhi'));
        break;
      case 'transliteration-hindi':
        setTransliterationString(anvaad.translit(gurmukhi || '', 'devnagri'));
        break;
      default:
        setTransliterationString(null);
        break;
    }
  };

  useEffect(() => {
    getTransliteration(gurmukhiString);
  }, [gurmukhiString, lang]);

  const customStyle = getFontSize(transliterationFontSize);

  return (
    transliterationString && (
      <div className={`slide-transliteration`} style={customStyle}>
        {transliterationString}
      </div>
    )
  );
};

SlideTransliteration.propTypes = {
  getFontSize: PropTypes.func,
  gurmukhiString: PropTypes.string,
  lang: PropTypes.string,
};

export default SlideTransliteration;
