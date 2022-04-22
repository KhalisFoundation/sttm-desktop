import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

const SlideTranslation = ({ getFontSize, translationObj, translationHTML }) => {
  const { translationLanguage, translationFontSize } = useStoreState(state => state.userSettings);
  const [translationString, setTranslationString] = useState(null);

  const getTranslation = translations => {
    switch (translationLanguage) {
      case 'English':
        setTranslationString(translations.en.bdb);
        break;
      case 'Spanish':
        setTranslationString(translations.es.sn);
        break;
      case 'Hindi':
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
  }, [translationObj]);

  let translationMarkup;

  if (translationHTML) {
    translationMarkup = (
      <div
        className={`slide-translation language-${translationLanguage}`}
        style={getFontSize(translationFontSize)}
        dangerouslySetInnerHTML={{ __html: translationHTML }}
      />
    );
  } else if (translationString) {
    translationMarkup = (
      <div
        className={`slide-translation language-${translationLanguage}`}
        style={getFontSize(translationFontSize)}
      >
        {translationString}
      </div>
    );
  } else {
    translationMarkup = (
      <div
        className={`slide-translation language-${translationLanguage}`}
        style={getFontSize(translationFontSize)}
      ></div>
    );
  }

  return translationMarkup;
};

SlideTranslation.propTypes = {
  getFontSize: PropTypes.func,
  translationObj: PropTypes.object,
};

export default SlideTranslation;
