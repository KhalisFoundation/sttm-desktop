import React, { useState } from 'react';

import PropTypes from 'prop-types';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const SettingsNav = ({ settingsNavObj }) => {
  const [activeTab, setActiveTab] = useState('slide-layout');

  const isActiveClass = (activeCategory) => {
    switch (activeCategory) {
      case 'slide-layout':
        return activeTab === 'slide-layout' ? 'settings-nav-active' : '';
      case 'app-settings':
        return activeTab === 'app-settings' ? 'settings-nav-active' : '';
      case 'bani-and-languages':
        return activeTab === 'bani-and-languages' ? 'settings-nav-active' : '';
      default:
        return activeTab === 'slide-layout' ? 'settings-nav-active' : '';
    }
  };

  const settingNavItems = [];
  Object.keys(settingsNavObj).forEach((category, index) => {
    const { title } = settingsNavObj[category];
    settingNavItems.push(
      <span
        className={isActiveClass(category)}
        key={`settings-item-heading-${index}`}
        onClick={() => {
          document.getElementById(category).scrollIntoView({ block: 'center', behavior: 'smooth' });
          setActiveTab(category);
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
