import React from 'react';
import PropTypes from 'prop-types';
import bakePanktee from '../hooks/bakePanktee';

const SlideGurbani = ({
  getFontSize,
  gurmukhiString,
  larivaar,
  vishraamPlacement,
  vishraamSource,
}) => {
  const useBakePanktee = bakePanktee();

  return (
    gurmukhiString && (
      <span className={larivaar ? 'larivaar' : 'padchhed'}>
        {useBakePanktee(getFontSize, gurmukhiString, vishraamPlacement, vishraamSource)}
      </span>
    )
  );
};

SlideGurbani.propTypes = {
  getFontSize: PropTypes.func,
  gurmukhiString: PropTypes.string,
  larivaar: PropTypes.bool,
  vishraamPlacement: PropTypes.object,
  vishraamSource: PropTypes.string,
};

SlideGurbani.defaultProps = {
  getFontSize: () => {},
  gurmukhiString: '',
  larivaar: false,
  vishraamPlacement: {},
  vishraamSource: '',
};

export default SlideGurbani;
