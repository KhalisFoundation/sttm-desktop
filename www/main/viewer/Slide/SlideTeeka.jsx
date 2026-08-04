import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

import useContentFontSizes from '../hooks/useContentFontSizes';

const SlideTeeka = ({ getFontSize, teekaObj, position }) => {
  const { teekaSource } = useStoreState((state) => state.userSettings);
  const [teekaString, setTeekaString] = useState(null);
  const fontSizes = useContentFontSizes();

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
  }, [teekaObj, teekaSource]);

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
