import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

const SlideTeeka = ({ getFontSize, teekaObj }) => {
  const { teekaFontSize, teekaSource } = useStoreState((state) => state.userSettings);
  const [teekaString, setTeekaString] = useState(null);

  const getTeeka = (inputTeeka) => {
    if (inputTeeka && inputTeeka.pu) {
      if (inputTeeka.pu[teekaSource]) {
        setTeekaString(inputTeeka.pu[teekaSource]);
      } else {
        setTeekaString(null);
      }
    }
  };

  useEffect(() => {
    getTeeka(teekaObj);
  }, [teekaObj]);

  const customStyle = getFontSize(teekaFontSize);

  return (
    teekaString && (
      <div className="slide-teeka" style={customStyle}>
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
