import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

const SlideTeeka = ({ teekaObj }) => {
  const { teekaFontSize } = useStoreState(state => state.userSettings);

  return (
    (teekaObj.bdb || teekaObj.ss) && (
      <div className="slide-teeka" style={{ fontSize: `${teekaFontSize * 3}px` }}>
        {teekaObj.bdb || teekaObj.ss}
      </div>
    )
  );
};

SlideTeeka.propTypes = {
  teekaObj: PropTypes.object,
};

export default SlideTeeka;
