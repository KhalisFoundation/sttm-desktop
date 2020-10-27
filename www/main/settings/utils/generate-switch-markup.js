import React from 'react';
import Switch from '../../common/sttm-ui/switch';

const generateSwitchMarkup = (options, titleKey) => {
  const switchItems = Object.keys(options).map((name, index) => {
    const controlname = typeof options[name] === 'object' ? options[name]['label'] : options[name];

    return (
      <Switch
        key={`control-item-switch-${index}`}
        title={i18n.t(`${titleKey}${controlname}`)}
        controlId={`${controlname}switch`}
        className={`control-item ${controlname}`}
        onToggle={() => {
          console.log('switched the switch');
        }}
      />
    );
  });
  return switchItems;
};

export default generateSwitchMarkup;
