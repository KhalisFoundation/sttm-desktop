import React from 'react';

const generateDropdownMarkup = (options, titleKey) => {
  const dropdownItems = Object.keys(options).map((name, index) => {
    const controlname = options[name]['title'];
    const dropdownOptions = options[name]['options'];

    return (
      <div
        key={`control-item-dropdown-${index}`}
        className={`control-item ${controlname}`}
        id={`${controlname}switch`}
      >
        <span>{i18n.t(`${titleKey}${controlname}`)}</span>
        <select
          onChange={() => {
            console.log('changed the dropdown');
          }}
        >
          {Object.keys(dropdownOptions).map(op => (
            <option>{i18n.t(`${titleKey}${dropdownOptions[op]}`)}</option>
          ))}
        </select>
      </div>
    );
  });
  return dropdownItems;
};

export default generateDropdownMarkup;
