import React from 'react';
import PropTypes from 'prop-types';

import { joinClasses } from '../../utils';

const Tile = ({ children, className, theme = 'LIGHT', type = 'extras' }) => {
  const tileClassname = joinClasses([
    `${type}-tile`,
    theme ? `${theme}-tile` : null,
    className ? className : null,
  ]);

  return (
    <div className={`ui-tile ${tileClassname}`}>
      <span>{children || content}</span>
    </div>
  );
};

Tile.propTypes = {
  content: PropTypes.string,
  theme: PropTypes.string, //TODO: typing for the themes.
  type: PropTypes.arrayOf(['extras']),
};

export default Tile;
