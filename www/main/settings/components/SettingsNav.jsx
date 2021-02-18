import React from 'react';

import PropTypes from 'prop-types';

const { remote } = require('electron');

const { i18n } = remote.require('./app');

const SettingsNav = ({ settingsNavObj }) => {
  const settingNavItems = [];
  Object.keys(settingsNavObj).forEach((category, index) => {
    const { title } = settingsNavObj[category];
    settingNavItems.push(
      <span
        key={`settings-item-heading-${index}`}
        onClick={() => {
          document.getElementById(category).scrollIntoView({ block: 'center' });
        }}
      >
        {i18n.t(`SETTINGS.${title}`)}
      </span>,
    );
  });
  return <div className="settings-nav"> {settingNavItems} </div>;
};

SettingsNav.propTypes = {
  settingsNavObj: PropTypes.object,
};

export default SettingsNav;
