import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

const SlideTranslation = ({ translationObj }) => {
  const { translationLanguage } = useStoreState(state => state.userSettings);

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
    <span className={`slide-translation language-${translationLanguage}`}>
      {getTranslation(translationObj)}
    </span>
  );
};

SlideTranslation.propTypes = {
  translationObj: PropTypes.object,
};

export default SlideTranslation;
