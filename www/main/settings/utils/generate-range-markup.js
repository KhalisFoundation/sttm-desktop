import React from 'react';
import Checkbox from '../../common/sttm-ui/checkbox';

const generateRangeMarkup = (options, titleKey) => {
  const rangeItems = Object.keys(options).map((name, index) => {
    const controlname = options[name]['title'];
    const { max, min, step } = options[name];

    return (
      <div
        key={`control-item-range-${index}`}
        className={`control-item ${controlname}`}
        id={`${controlname}range`}
      >
        {options[name]['checkbox'] && <input type="checkbox"></input>}
        <span>{i18n.t(`${titleKey}${controlname}`)}</span>
        <input type="range" min={min} max={max} step={step}></input>
      </div>
    );
  });
  return rangeItems;
};

export default generateRangeMarkup;
