import React from 'react';
import PropTypes from 'prop-types';

import { Overlay } from '../../common/sttm-ui';

import SettingsItem from './SettingsItem';

const { remote } = require('electron');

const { i18n } = remote.require('./app');

const settingsJson = require('../../../main/common/constants/user-settings.json');

const Settings = ({ onScreenClose }) => {
  const { categories, settings } = settingsJson;

  const settingItems = {};
  Object.keys(categories).forEach(category => {
    if (categories[category].type === 'title') {
      settingItems[category] = categories[category];
      settingItems[category].subcategories = categories[category].subcategories.map(
        sc => categories[sc],
      );
    }
  });

  const settingsNav = [];
  const items = [];

  Object.keys(settingItems).forEach((item, index) => {
    const { title, subcategories } = settingItems[item];
    settingsNav.push(
      <span
        key={`settings-item-heading-${index}`}
        onClick={() => {
          document.getElementById(title).scrollIntoView({ block: 'center' });
        }}
      >
        {i18n.t(`SETTINGS.${title}`)}
      </span>,
    );
    items.push(
      <SettingsItem
        key={`settings-item-${index}`}
        subcategories={subcategories}
        settingsKey={item}
        settingsObj={settings}
      />,
    );
  });

  /* const settingItems = Object.keys(settingsJson);
  const settingsNav = [];
  const items = [];

  settingItems.forEach((item, index) => {
    const itemHeading = settingsJson[item].title;
    settingsNav.push(
      <span
        key={`settings-item-heading-${index}`}
        onClick={() => {
          document.getElementById(itemHeading).scrollIntoView({ block: 'center' });
        }}
      >
        {i18n.t(`SETTINGS.${itemHeading}`)}
      </span>,
    );
    items.push(
      <SettingsItem
        key={`settings-item-${index}`}
        settingsObj={settingsJson[item]}
        settingsKey={item}
      />,
    );
  }); */

  return (
    <Overlay onScreenClose={onScreenClose}>
      <div className="settings-wrapper">
        <div className="settings-nav">{settingsNav}</div>
        {items}
      </div>
    </Overlay>
  );
};

Settings.propTypes = {
  onScreenClose: PropTypes.func,
};

export default Settings;
