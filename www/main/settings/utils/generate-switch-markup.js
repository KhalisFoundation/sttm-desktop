import React from 'react';
import Switch from '../../common/sttm-ui/switch';

const { remote } = require('electron');

const { i18n } = remote.require('./app');

const generateSwitchMarkup = (options, titleKey) => {
  const switchItems = Object.keys(options).map((name, index) => {
    const controlname = typeof options[name] === 'object' ? options[name].label : options[name];

    return (
      <Switch
        key={`control-item-switch-${index}`}
        title={i18n.t(`${titleKey}${controlname}`)}
        controlId={`${name}-switch`}
        className={`control-item ${name}`}
        onToggle={() => {
          console.log('switched the switch');
        }}
      />
    );
  });
  return switchItems;
};

export default generateSwitchMarkup;
