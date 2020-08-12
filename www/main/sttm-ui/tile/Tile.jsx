import React from 'react';
import PropTypes from 'prop-types';

import { joinClasses } from '../../utils';

const Tile = ({ children, className, theme = 'LIGHT', type = 'extras', onTileClick }) => {
  const tileClassname = joinClasses([
    `${type}-tile`,
    theme ? `${theme}-tile` : null,
    className ? className : null,
  ]);

  return (
    <div role="button" onClick={onTileClick} className={`ui-tile ${tileClassname}`}>
      <span>{children || content}</span>
    </div>
  );
};

Tile.propTypes = {
  onTileClick: PropTypes.func,
  content: PropTypes.string,
  theme: PropTypes.string, //TODO: typing for the themes.
  type: PropTypes.oneOf(['extras']),
};

export default Tile;
