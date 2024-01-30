import React from 'react';
import PropTypes from 'prop-types';

const FilterDropdown = ({ title, onChange, currentValue, optionsArray }) => (
  <div className="select-bani-dd-group">
    <span className="filter-label">{title}</span>
    <select
      id={`dropdown-${title}`}
      className="select-bani"
      onChange={onChange}
      value={currentValue}
    >
      {optionsArray.length &&
        optionsArray.map((option) => (
          <option key={option.value} value={option.value}>
            {option.text}
          </option>
        ))}
    </select>
  </div>
);

FilterDropdown.propTypes = {
  title: PropTypes.string,
  onChange: PropTypes.func,
  optionsArray: PropTypes.array,
  currentValue: PropTypes.string,
};

export default FilterDropdown;
