import React from 'react';
import PropTypes from 'prop-types';

const FilterDropdown = ({ title, onChange, currentValue, optionsArray }) => (
  <div className="select-bani-dd-group">
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
    <span>{title}</span>
  </div>
);

FilterDropdown.propTypes = {
  title: PropTypes.string,
  onChange: PropTypes.func,
  optionsArray: PropTypes.array,
  currentValue: PropTypes.string,
};

export default FilterDropdown;
