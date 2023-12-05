import React from 'react';
import PropTypes from 'prop-types';

const BaniControllerItem = ({ title, description, control }) => (
  <div className="sync-item">
    <div className="sync-item-left">
      <div className="sync-item-head"> {title} </div>
      <div className="sync-item-description">{description}</div>
    </div>
    <div className="sync-item-right"> {control} </div>
  </div>
);

BaniControllerItem.propTypes = {
  title: PropTypes.string,
  description: PropTypes.object,
  control: PropTypes.object,
};

export default BaniControllerItem;
