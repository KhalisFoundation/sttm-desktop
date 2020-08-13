import React from 'react';
import PropTypes from 'prop-types';

import { joinClasses } from '../../utils';

const Tile = ({ children, className, theme = 'LIGHT', type = 'extras', onClick, content }) => {
  const tileClassname = joinClasses([
    `${type}-tile`,
    theme ? `${theme}-tile` : null,
    className || null,
  ]);

  return (
    <div role="button" onClick={onClick} className={`ui-tile ${tileClassname}`}>
      <span>{children || content}</span>
    </div>
  );
};

Tile.propTypes = {
  onClick: PropTypes.func,
  className: PropTypes.string,
  content: PropTypes.string,
  theme: PropTypes.string, // TODO: typing for the themes.
  type: PropTypes.oneOf(['extras']),
};

export default Tile;
