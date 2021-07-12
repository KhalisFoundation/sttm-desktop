import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

const SlideTeeka = ({ getFontSize, teekaObj }) => {
  const { teekaFontSize } = useStoreState(state => state.userSettings);

  return (
    (teekaObj.bdb || teekaObj.ss) && (
      <div className="slide-teeka" style={getFontSize(teekaFontSize)}>
        {teekaObj.bdb || teekaObj.ss}
      </div>
    )
  );
};

SlideTeeka.propTypes = {
  getFontSize: PropTypes.func,
  teekaObj: PropTypes.object,
};

export default SlideTeeka;
