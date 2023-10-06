import React from 'react';
import PropTypes from 'prop-types';

const CustomBgTile = ({ customBg, onApply, onRemove }) => {
  const getCustomBgImageForTile = (tile) => ({
    backgroundImage: `url('${tile['background-image']}')`,
  });

  return (
    <>
      <button
        key={customBg.name}
        onClick={onApply}
        className={`theme-instance`}
        style={getCustomBgImageForTile(customBg)}
      />
      <button key={customBg.backgroundImage} className="delete-button" onClick={onRemove}>
        <i className="fa fa-trash-o" />
      </button>
    </>
  );
};

CustomBgTile.propTypes = {
  customBg: PropTypes.object,
  onApply: PropTypes.func,
  onRemove: PropTypes.func,
};

export default CustomBgTile;
