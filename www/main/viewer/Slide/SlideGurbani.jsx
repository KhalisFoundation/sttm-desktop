import React from 'react';
import PropTypes from 'prop-types';

const SlideGurbani = ({
  gurmukhiString,
  larivaar,
  vishraamPlacement,
  vishraamSource,
  gurbaniColor,
}) => {
  const filterAppliedVishraam = () => {
    const activeVishraams = {};
    Object.keys(vishraamPlacement).forEach(appliedVishraam => {
      if (vishraamSource === appliedVishraam) {
        const rawActiveVishraams = vishraamPlacement[appliedVishraam];
        rawActiveVishraams.forEach(rav => {
          activeVishraams[rav.p] = rav.t;
        });
      }
    });
    return activeVishraams;
  };

  const breakIntoWords = fullLine => {
    let wordsObj = [];
    const splittedWords = fullLine.split(' ');
    const activeVishraams = filterAppliedVishraam();
    wordsObj = splittedWords.map((text, index) => {
      const wordObj = { text };
      wordObj.vishraamType = activeVishraams[index] ? activeVishraams[index] : null;
      return wordObj;
    });
    return wordsObj;
  };

  const bakePanktee = () => {
    // need to set <wbr /> according to larivaar on and off
    return breakIntoWords(gurmukhiString).map((word, i) => (
      <React.Fragment key={i}>
        <span className={word.vishraamType && `vishraam-${word.vishraamType}`}>{word.text}</span>
        <wbr />
      </React.Fragment>
    ));
  };

  return (
    <span className={larivaar ? 'larivaar' : 'padchhed'} style={{ color: gurbaniColor }}>
      {bakePanktee()}
    </span>
  );
};

SlideGurbani.propTypes = {
  gurmukhiString: PropTypes.string,
  larivaar: PropTypes.bool,
  vishraamPlacement: PropTypes.object,
  vishraamSource: PropTypes.string,
  gurbaniColor: PropTypes.string,
};

export default SlideGurbani;
