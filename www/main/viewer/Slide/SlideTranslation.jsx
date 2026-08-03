import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

const SlideTranslation = ({ getFontSize, translationObj, translationHTML, lang, position }) => {
  const { content1FontSize, content2FontSize, content3FontSize, translationEnglishSource } =
    useStoreState((state) => state.userSettings);
  const [translationString, setTranslationString] = useState(null);
  const fontSizes = [content1FontSize, content2FontSize, content3FontSize];

  const getTranslation = (translations) => {
    switch (lang) {
      case 'translation-english':
        setTranslationString(translations.en[translationEnglishSource]);
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
  }, [translationObj, lang, translationEnglishSource]);

  let translationMarkup;

  const customStyle = getFontSize(fontSizes[position]);

  const scriptClass = {
    'translation-hindi': 'hindi',
  }[lang];

  const langAttr = {
    'translation-english': 'en',
    'translation-spanish': 'es',
    'translation-hindi': 'hi',
  }[lang];

  const className = ['slide-translation', scriptClass].filter(Boolean).join(' ');

  if (translationHTML) {
    translationMarkup = (
      <div
        className={`${className} custom-english`}
        style={customStyle}
        lang={langAttr}
        dangerouslySetInnerHTML={{ __html: translationHTML }}
      />
    );
  } else if (translationString) {
    translationMarkup = (
      <div className={className} style={customStyle} lang={langAttr}>
        {translationString}
      </div>
    );
  } else {
    translationMarkup = <div className={className} style={customStyle} lang={langAttr}></div>;
  }

  return translationMarkup;
};

SlideTranslation.propTypes = {
  getFontSize: PropTypes.func,
  translationObj: PropTypes.object,
  lang: PropTypes.string,
};

export default SlideTranslation;
