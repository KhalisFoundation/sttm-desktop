import React from 'react';
import PropTypes from 'prop-types';

import { joinClasses } from '../../utils';

const Tile = ({ children, className, theme = null, type = 'extras', onClick, content }) => {
  const tileClassname = joinClasses([
    `${type}-tile`,
    theme ? `${theme.key}-tile` : null,
    className || null,
  ]);

  const getThemeSwatchStyles = themeInstance => {
    return {
      backgroundColor: themeInstance['background-color'],
      backgroundImage: themeInstance['background-image']
        ? `url(assets/img/custom_backgrounds/${themeInstance['background-image']})`
        : 'none',
      color: themeInstance['gurbani-color'],
    };
  };

  return (
    <button
      onClick={onClick}
      className={`ui-tile ${tileClassname}`}
      style={theme ? getThemeSwatchStyles(theme) : null}
    >
      <span>{children || content}</span>
    </button>
  );
};

Tile.propTypes = {
  onClick: PropTypes.func,
  className: PropTypes.string,
  content: PropTypes.string,
  theme: PropTypes.object,
  children: PropTypes.node,
  type: PropTypes.oneOf(['extras']),
};

export default Tile;
