import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

const SlideTranslation = ({ translationObj }) => {
  const { translationLanguage, translationFontSize } = useStoreState(state => state.userSettings);

  const getTranslation = translations => {
    let translationLine;
    switch (translationLanguage) {
      case 'English':
        translationLine = translations.en.bdb;
        break;
      case 'Spanish':
        translationLine = translations.es.sn;
        break;
      case 'Hindi':
        translationLine = (translations.hi && translations.hi.ss) || '';
        break;
      default:
        translationLine = '';
        break;
    }
    return translationLine;
  };

  return (
    <div
      className={`slide-translation language-${translationLanguage}`}
      style={{ fontSize: `${translationFontSize * 3}px` }}
    >
      {getTranslation(translationObj)}
    </div>
  );
};

SlideTranslation.propTypes = {
  translationObj: PropTypes.object,
};

export default SlideTranslation;
