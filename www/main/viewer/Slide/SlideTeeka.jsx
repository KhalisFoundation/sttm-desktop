import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

const SlideTeeka = ({ getFontSize, teekaObj }) => {
  const { teekaFontSize } = useStoreState(state => state.userSettings);
  const [teekaString, setTeekaString] = useState(null);

  const getTeeka = inputTeeka => {
    if (inputTeeka && inputTeeka.pu) {
      if (inputTeeka.pu.bdb) {
        setTeekaString(inputTeeka.pu.bdb);
      } else if (inputTeeka.pu.ss) {
        setTeekaString(inputTeeka.pu.ss);
      } else {
        setTeekaString(null);
      }
    }
  };

  useEffect(() => {
    getTeeka(teekaObj);
  }, [teekaObj]);

  return (
    teekaString && (
      <div className="slide-teeka" style={getFontSize(teekaFontSize)}>
        {teekaString}
      </div>
    )
  );
};

SlideTeeka.propTypes = {
  getFontSize: PropTypes.func,
  teekaObj: PropTypes.object,
};

export default SlideTeeka;
