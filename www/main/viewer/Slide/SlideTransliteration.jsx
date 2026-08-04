import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import anvaad from 'anvaad-js';

import useContentFontSizes from '../hooks/useContentFontSizes';

const SlideTransliteration = ({ getFontSize, gurmukhiString, lang, position }) => {
  const fontSizes = useContentFontSizes();
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

  const customStyle = getFontSize(fontSizes[position]);

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
  position: PropTypes.number,
};

export default SlideTransliteration;
