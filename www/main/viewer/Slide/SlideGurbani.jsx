import React from 'react';
import PropTypes from 'prop-types';

const SlideGurbani = ({ gurmukhiString, larivaar, vishraamPlacement }) => {
  console.log('vishraamSouce', vishraamPlacement);

  const breakIntoWords = fullLine => {
    return fullLine.split(' ');
  };

  return (
    <span className={larivaar ? 'larivaar' : 'padchhed'}>
      {breakIntoWords(gurmukhiString).map(word => (
        <span key={word}>{word}</span>
      ))}
    </span>
  );
};

SlideGurbani.propTypes = {
  gurmukhiString: PropTypes.string,
  larivaar: PropTypes.bool,
  vishraamPlacement: PropTypes.string,
};

export default SlideGurbani;
