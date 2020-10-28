import React from 'react';
import Checkbox from '../../common/sttm-ui/checkbox';

const { remote } = require('electron');

const { i18n } = remote.require('./app');

const generateRangeMarkup = (options, titleKey) => {
  const rangeItems = Object.keys(options).map((name, index) => {
    const controlname = options[name].title;
    const { max, min, step, checkbox } = options[name];

    return (
      <div
        key={`control-item-range-${index}`}
        className={`control-item ${name}-range`}
        id={`${name}-range-id`}
      >
        {checkbox ? (
          <>
            <Checkbox
              id={checkbox}
              name={checkbox}
              value={checkbox}
              label={i18n.t(`${titleKey}${controlname}`)}
              handler={() => {
                console.log('clicked the checkbox');
              }}
            />
            <input type="range" min={min} max={max} step={step}></input>
          </>
        ) : (
          <>
            <span>{i18n.t(`${titleKey}${controlname}`)}</span>
            <input type="range" min={min} max={max} step={step}></input>
          </>
        )}
      </div>
    );
  });
  return rangeItems;
};

export default generateRangeMarkup;
