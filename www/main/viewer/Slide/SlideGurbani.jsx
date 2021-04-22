import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

const SlideGurbani = ({ gurmukhiString, larivaar, vishraamPlacement, vishraamSource }) => {
  const { displayVishraams, larivaarAssist, gurbaniFontSize } = useStoreState(
    state => state.userSettings,
  );

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

  const getVishraamStyle = word => {
    return (
      (displayVishraams &&
        !larivaarAssist &&
        word.vishraamType &&
        `vishraam vishraam-${word.vishraamType}`) ||
      null
    );
  };

  const bakePanktee = () => {
    // need to set <wbr /> according to larivaar on and off
    return breakIntoWords(gurmukhiString).map((word, i) => (
      <React.Fragment key={i}>
        <span className={getVishraamStyle(word)} style={{ fontSize: `${gurbaniFontSize * 3}px` }}>
          {word.text}
        </span>
        <wbr />
      </React.Fragment>
    ));
  };

  return <span className={larivaar ? 'larivaar' : 'padchhed'}>{bakePanktee()}</span>;
};

SlideGurbani.propTypes = {
  gurmukhiString: PropTypes.string,
  larivaar: PropTypes.bool,
  vishraamPlacement: PropTypes.object,
  vishraamSource: PropTypes.string,
};

export default SlideGurbani;
