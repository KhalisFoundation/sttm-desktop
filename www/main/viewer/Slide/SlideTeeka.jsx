import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

const SlideTeeka = ({ getFontSize, teekaObj, position }) => {
  const { content1FontSize, content2FontSize, content3FontSize, teekaSource } = useStoreState(
    (state) => state.userSettings,
  );
  const [teekaString, setTeekaString] = useState(null);
  const fontSizes = [content1FontSize, content2FontSize, content3FontSize];

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

  const customStyle = getFontSize(fontSizes[position]);

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
  position: PropTypes.number,
};

export default SlideTeeka;
