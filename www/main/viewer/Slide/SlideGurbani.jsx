import React from 'react';
import PropTypes from 'prop-types';
import bakePanktee from '../hooks/bakePanktee';

const SlideGurbani = ({
  getFontSize,
  gurmukhiString,
  isWaheguruSlide,
  larivaar,
  vishraamPlacement,
  vishraamSource,
}) => {
  const useBakePanktee = bakePanktee();

  return (
    <span className={larivaar ? 'larivaar' : 'padchhed'}>
      {useBakePanktee(
        getFontSize,
        gurmukhiString,
        isWaheguruSlide,
        vishraamPlacement,
        vishraamSource,
      )}
    </span>
  );
};

SlideGurbani.propTypes = {
  getFontSize: PropTypes.func,
  gurmukhiString: PropTypes.string,
  isWaheguruSlide: PropTypes.bool,
  larivaar: PropTypes.bool,
  vishraamPlacement: PropTypes.object,
  vishraamSource: PropTypes.string,
};

SlideGurbani.defaultProps = {
  getFontSize: () => {},
  gurmukhiString: '',
  isWaheguruSlide: false,
  larivaar: false,
  vishraamPlacement: {},
  vishraamSource: '',
};

export default SlideGurbani;
