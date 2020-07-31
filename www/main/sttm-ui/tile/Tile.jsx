import React from 'react';
import PropTypes from 'prop-types';

export const Tile = ({ bgColor, bgImageUrl, title, margin }) => {
  return (
    <div
      className="ui-tile"
      style={{
        margin,
        backgroundColor: bgColor,
        backgroundImage: `url(${bgImageUrl})`,
      }}
    >
      {title}
    </div>
  );
};

Tile.propTypes = {
  bgColor: PropTypes.string,
  bgImageUrl: PropTypes.string,
  margin: PropTypes.string,
  title: PropTypes.string,
};
