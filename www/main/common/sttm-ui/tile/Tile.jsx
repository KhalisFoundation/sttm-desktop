import React from 'react';
import PropTypes from 'prop-types';

import { classNames, joinClasses } from '../../utils';

const Tile = ({
  children,
  className,
  theme = null,
  type = 'extras',
  onClick,
  content,
  isEngTransliterated = false,
}) => {
  const tileClassname = joinClasses([
    `${type}-tile`,
    theme ? `${theme.key}-tile` : null,
    className || null,
  ]);

  const getThemeSwatchStyles = (themeInstance) => ({
    backgroundColor: themeInstance['background-color'],
    backgroundImage: themeInstance['background-image']
      ? `url(assets/img/custom_backgrounds/${themeInstance['background-image']})`
      : 'none',
    color: themeInstance['gurbani-color'],
  });

  return (
    <button
      onClick={onClick}
      className={`ui-tile ${tileClassname}`}
      style={theme ? getThemeSwatchStyles(theme) : null}
    >
      <span className={classNames(isEngTransliterated && 'eng-tile')}>{children || content}</span>
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
  isEngTransliterated: PropTypes.bool,
};

export default Tile;
