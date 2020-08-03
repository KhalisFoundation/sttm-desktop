import React from 'react';
import PropTypes from 'prop-types';

import getStylesBasedOnTheme from './utils/get-styles-based-on-theme';

const Tile = ({
  wrapperClassName = '',
  contentClassName = '',
  bgColor,
  bgImageUrl,
  theme,
  content,
  children,
}) => {
  const tileStyles = getStylesBasedOnTheme(theme);

  return (
    <div
      className={`ui-tile ${wrapperClassName}`}
      style={{
        backgroundColor: bgColor || tileStyles.bgColor,
        backgroundImage: `url(${bgImageUrl})` || tileStyles.bgImageUrl,
      }}
    >
      <span className={contentClassName} style={{ color: tileStyles.textColor }}>
        {children || content}
      </span>
    </div>
  );
};

Tile.propTypes = {
  bgColor: PropTypes.string,
  bgImageUrl: PropTypes.string,
  contentClassName: PropTypes.string,
  content: PropTypes.string,
  wrapperClassName: PropTypes.string,
  theme: PropTypes.string,
};

export default Tile;
