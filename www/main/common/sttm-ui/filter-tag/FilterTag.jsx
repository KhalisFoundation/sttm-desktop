import React from 'react';
import PropTypes from 'prop-types';

const FilterTag = ({ close, title, filterType }) => (
  <div className="filter-tag" title={filterType}>
    <span className="filter-tag--remove" onClick={close}>
      <i className="fa fa-times" />
    </span>
    <span className="filter-tag--title">{title}</span>
  </div>
);

FilterTag.propTypes = {
  close: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  filterType: PropTypes.string.isRequired,
};

export default FilterTag;
