import React from 'react';
import PropTypes from 'prop-types';

const FilterTag = ({ close, title }) => {
  return (
    <div className="filter-tag">
      <span className="filter-tag--remove" onClick={close}>
        <i className="fa fa-times" />
      </span>
      <span className="filter-tag--title">{title}</span>
    </div>
  );
};

FilterTag.propTypes = {
  close: PropTypes.func,
  title: PropTypes.string,
};

export default FilterTag;
