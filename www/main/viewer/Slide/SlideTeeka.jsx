import React from 'react';
import PropTypes from 'prop-types';

const SlideTeeka = ({ teekaObj }) => {
  return <span className="slide-teeka">{teekaObj.bdb || teekaObj.ss}</span>;
};

SlideTeeka.propTypes = {
  teekaObj: PropTypes.object,
};

export default SlideTeeka;
