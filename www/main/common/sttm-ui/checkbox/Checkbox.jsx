import React from 'react';
import PropTypes from 'prop-types';

const Checkbox = ({ id, name, value, label, handler, checked }) => (
  <span className="custom-checkbox">
    <input
      id={id}
      name={name}
      type="checkbox"
      value={value}
      onChange={handler}
      checked={checked}
    ></input>
    <label htmlFor={id}>{label || ''}</label>
  </span>
);

Checkbox.propTypes = {
  id: PropTypes.string,
  name: PropTypes.string,
  value: PropTypes.string,
  label: PropTypes.string,
  handler: PropTypes.func,
  checked: PropTypes.bool,
};

export default Checkbox;
