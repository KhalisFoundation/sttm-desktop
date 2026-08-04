import React from 'react';
import { useStoreState } from 'easy-peasy';

import { shallowEqual } from '../../common/utils';
import { fontSizeSetting } from '../font-sizes';

const bakePanktee = () => {
  // Scoped and compared shallowly for the same reason as in `Slide`: Akhand
  // Paatth mounts one of these per verse, so an unscoped `userSettings`
  // selector re-renders every mounted verse whenever any setting changes.
  const { displayVishraams, larivaarAssist, larivaar, gurbaniFontSize } = useStoreState(
    (state) => ({
      displayVishraams: state.userSettings.displayVishraams,
      larivaarAssist: state.userSettings.larivaarAssist,
      larivaar: state.userSettings.larivaar,
      gurbaniFontSize:
        state.userSettings[fontSizeSetting('gurbani', state.userSettings.akhandpatt).stateName],
    }),
    shallowEqual,
  );

  return (getFontSize, vishraamPlacement, vishraamSource, gurmukhiString = '') => {
    const filterAppliedVishraam = () => {
      const activeVishraams = {};
      if (vishraamPlacement) {
        Object.keys(vishraamPlacement).forEach((appliedVishraam) => {
          if (vishraamSource === appliedVishraam) {
            const rawActiveVishraams = vishraamPlacement[appliedVishraam];
            if (rawActiveVishraams && rawActiveVishraams.length > 0) {
              rawActiveVishraams.forEach((rav) => {
                activeVishraams[rav.p] = rav.t;
              });
            }
          }
        });
      }
      return activeVishraams;
    };

    const breakIntoWords = (fullLine) => {
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

    const getVishraamStyle = (word) => {
      if (larivaar && larivaarAssist) {
        return null;
      }
      return (
        (displayVishraams && word.vishraamType && `vishraam vishraam-${word.vishraamType}`) || null
      );
    };

    const bakePankteeMarkup = () => {
      let customStyles;
      if (larivaar) {
        customStyles = getFontSize(gurbaniFontSize);
      } else {
        // adding custom styles here to reach chromecast
        customStyles = {
          ...getFontSize(gurbaniFontSize),
          display: 'inline-block',
          margin: '0 0.15em',
          whiteSpace: 'nowrap',
        };
      }
      return breakIntoWords(gurmukhiString).map((word, i) => (
        <React.Fragment key={i}>
          <span className={getVishraamStyle(word)} style={customStyles}>
            {word.text}
          </span>
          <wbr />
        </React.Fragment>
      ));
    };

    return bakePankteeMarkup();
  };
};

export default bakePanktee;
