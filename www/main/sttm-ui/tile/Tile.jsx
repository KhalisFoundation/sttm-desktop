import React from 'react';
import PropTypes from 'prop-types';

import { joinClasses } from '../../utils';

const Tile = ({ children, className, theme = 'LIGHT', type }) => {
  const tileClassname = joinClasses([
    `${type}-tile`,
    className ? className : null,
    theme ? theme : null,
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
