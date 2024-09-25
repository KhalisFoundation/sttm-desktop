import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';
const { v4: uuidv4 } = require('uuid');

import { Switch, Checkbox } from '../../common/sttm-ui';
import { convertToCamelCase } from '../../common/utils';
import { settings } from '../../../configs/user-settings.json';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

const Setting = ({ settingObj, stateVar, stateFunction }) => {
  const { title, type, min, max, step, options } = settingObj;
  const userSettings = useStoreState((state) => state.userSettings);
  const userSettingsActions = useStoreActions((state) => state.userSettings);

  const { disabledContent } = useStoreState((state) => state.navigator);

  const handleInputChange = (event) => {
    const value = event.target ? event.target.value : event;
    const { disableSetting } = settingObj;
    userSettingsActions[stateFunction](value);
    if (value && disableSetting) {
      if (userSettings[convertToCamelCase(disableSetting)] !== false) {
        userSettingsActions[`set${convertToCamelCase(disableSetting, true)}`](false);
      }
    }
    analytics.trackEvent({
      category: 'setting',
      action: userSettingsActions[stateFunction],
      label: value,
    });
  };

  const handleCheckboxChange = (event) => {
    const value = event.target.checked;
    userSettingsActions[stateFunction](value);
    analytics.trackEvent({
      category: 'setting',
      action: userSettingsActions[stateFunction],
      label: value,
    });
  };

  let settingDOM;

  const dropdownLabel = (option) => {
    if (option.includes('teeka')) {
      return i18n.t(`QUICK_TOOLS.TEEKA`);
    }
    if (option.includes('translation')) {
      return i18n.t(`QUICK_TOOLS.TRANSLATION`);
    }
    if (option.includes('transliteration')) {
      return i18n.t(`QUICK_TOOLS.TRANSLITERATION`);
    }
    return '';
  };

  const handleResetFontSizes = () => {
    const { resetSettings } = settingObj;
    if (resetSettings) {
      resetSettings.forEach((settingKey) => {
        const value = settings[settingKey].initialValue;
        if (userSettings[convertToCamelCase(settingKey)] !== value) {
          userSettingsActions[`set${convertToCamelCase(settingKey, true)}`](value);
        }
      });
    }

    const firebase_app_id = `1:693307351279:web:1837dbcd07b3ce7da63b1a`;
    const api_secret = `GIupBo9tQwW5z02u8zFXDg`;
    let app_instance_id = uuidv4();

    fetch(`https://www.google-analytics.com/mp/collect?firebase_app_id=${firebase_app_id}&api_secret=${api_secret}`, {
      method: "POST",
      body: JSON.stringify({
        app_instance_id: app_instance_id,
        events: [{
          name: 'tutorial_begin',
          params: {
            "campaign": "Analytics_test",
            "source": "sttm",

          },
        }]
      })
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        console.log('Event sent successfully');
      })
      .catch(error => {
        console.error('Error sending event:', error, error.response || error.message);
      });
      
    console.log('Button click event logged to Firebase');


  };

  switch (type) {
    case 'range':
      settingDOM = (
        <>
          <p className="range-value">{userSettings[stateVar]}</p>
          <input
            type="range"
            data-value={userSettings[stateVar]}
            value={userSettings[stateVar]}
            min={min}
            max={max}
            step={step}
            onChange={handleInputChange}
          ></input>
        </>
      );
      break;
    case 'dropdown':
      settingDOM = (
        <select value={userSettings[stateVar]} onChange={handleInputChange}>
          {Object.keys(options).map((op, opIndex) => (
            <option key={`control-dropdown-options-${opIndex}`} value={op}>
              {i18n.t(`SETTINGS.${options[op]}`)}
            </option>
          ))}
        </select>
      );
      break;
    case 'switch':
      settingDOM = (
        <Switch
          controlId={`${title}-switch`}
          className={`control-item-switch-${title}`}
          value={userSettings[stateVar]}
          onToggle={handleInputChange}
          disabled={userSettings[convertToCamelCase(settingObj.disableWhen)]}
        />
      );
      break;
    case 'checkbox':
      settingDOM = (
        <Checkbox
          id={`${title}-checkbox`}
          name={`control-item-checkbox-${title}`}
          handler={handleCheckboxChange}
          checked={userSettings[stateVar]}
        />
      );
      break;
    case 'multilevel-dropdown':
      settingDOM = (
        <>
          <select
            value={userSettings[stateVar]}
            onChange={handleInputChange}
            style={{ marginRight: '8px' }}
          >
            {options.map((optionObj, optionIndex) => (
              <optgroup key={`option-${optionIndex}`} label={dropdownLabel(optionObj.label)}>
                {optionObj.options.map((optionName, nameIndex) => (
                  <option
                    key={`option-name-${nameIndex}`}
                    value={optionName.id}
                    disabled={disabledContent.includes(optionName.id)}
                  >
                    {optionName.text}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span>{dropdownLabel(userSettings[stateVar])}</span>
        </>
      );
      break;
    case 'reset-button':
      settingDOM = (
        <button onClick={handleResetFontSizes} className="icon-reset">
          <img src="assets/img/icons/reset-transparent.svg" alt="Reset Font Sizes to Default" />
          <span>{i18n.t(`SETTINGS.RESET_TO_DEFAULT`)}</span>
        </button>
      );
      break;
    default:
      return null;
  }

  return settingDOM;
};

Setting.propTypes = {
  settingObj: PropTypes.object,
  stateVar: PropTypes.string,
  stateFunction: PropTypes.string,
};

export default Setting;
