import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

const SlideTranslation = ({ getFontSize, translationObj, translationHTML, lang, position }) => {
  const { content1FontSize, content2FontSize, content3FontSize } = useStoreState(
    (state) => state.userSettings,
  );
  const [translationString, setTranslationString] = useState(null);
  const fontSizes = [content1FontSize, content2FontSize, content3FontSize];

  const getTranslation = (translations) => {
    switch (lang) {
      case 'translation-english':
        setTranslationString(translations.en.bdb);
        break;
      case 'translation-spanish':
        setTranslationString(translations.es.sn);
        break;
      case 'translation-hindi':
        setTranslationString((translations.hi && translations.hi.ss) || null);
        break;
      default:
        setTranslationString(null);
        break;
    }
  };

  useEffect(() => {
    if (translationObj) {
      getTranslation(translationObj);
    }
  }, [translationObj, lang]);

  let translationMarkup;

  const customStyle = getFontSize(fontSizes[position]);

  if (translationHTML) {
    translationMarkup = (
      <div
        className={`slide-translation custom-english`}
        style={customStyle}
        dangerouslySetInnerHTML={{ __html: translationHTML }}
      />
    );
  } else if (translationString) {
    translationMarkup = (
      <div className={`slide-translation`} style={customStyle}>
        {translationString}
      </div>
    );
  } else {
    translationMarkup = <div className={`slide-translation`} style={customStyle}></div>;
  }

  return translationMarkup;
};

SlideTranslation.propTypes = {
  getFontSize: PropTypes.func,
  translationObj: PropTypes.object,
  lang: PropTypes.string,
};

export default SlideTranslation;
