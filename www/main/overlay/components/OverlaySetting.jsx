import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';
import LayoutSelector from './LayoutSelector';
import { getDefaultSettings } from '../../common/store/user-settings/get-saved-overlay-settings';
import { convertToCamelCase } from '../../common/utils';

const { remote } = require('electron');

const { i18n } = remote.require('./app');

const OverlaySetting = ({ settingObj, stateVar, stateFunction }) => {
  const { title, type } = settingObj;
  const baniOverlayState = useStoreState(state => state.baniOverlay);
  const baniOverlayActions = useStoreActions(state => state.baniOverlay);

  const handleInputChange = event => {
    const value = event.target ? event.target.value : event;
    baniOverlayActions[stateFunction](value);
  };

  const handleSizeIcon = event => {
    const { max, min, step } = settingObj;
    const value = event.currentTarget ? event.currentTarget.dataset.value : event;
    const currentValue = baniOverlayState[stateVar];
    let updatedValue;

    if (value === 'plus' && currentValue < max) {
      updatedValue = currentValue + step;
      baniOverlayActions[stateFunction](updatedValue);
    } else if (value === 'minus' && currentValue > min) {
      updatedValue = baniOverlayState[stateVar] - step;
      baniOverlayActions[stateFunction](updatedValue);
    }
  };

  const handleToggleChange = () => {
    if (stateVar === 'reset') {
      const defaultSettings = getDefaultSettings();
      Object.keys(baniOverlayState).forEach(state => {
        if (baniOverlayState[state] !== defaultSettings[state]) {
          baniOverlayActions[`set${convertToCamelCase(state, true)}`](defaultSettings[state]);
        }
      });
    } else {
      const existingValue = baniOverlayState[stateVar];
      baniOverlayActions[stateFunction](!existingValue);
    }
  };

  const handleLayoutChange = event => {
    const currentLayout = baniOverlayState[stateVar];
    const newLayout = event.currentTarget.dataset.layout;
    if (newLayout !== currentLayout) {
      baniOverlayActions[stateFunction](newLayout);
    }
  };

  const settingDOM = [];

  if (title) {
    settingDOM.push(<span>{i18n.t(`BANI_OVERLAY.${title}`)}</span>);
  }

  switch (type) {
    case 'dropdown':
      settingDOM.push(
        <select onChange={handleInputChange} value={baniOverlayState[stateVar]}>
          {Object.keys(settingObj.options).map((op, opIndex) => (
            <option key={`control-dropdown-options-${opIndex}`} value={op}>
              {settingObj.options[op]}
            </option>
          ))}
        </select>,
      );
      break;
    case 'color-input':
      settingDOM.push(
        <input
          type="color"
          className={`control-color-input-${title}`}
          onChange={handleInputChange}
          value={baniOverlayState[stateVar]}
        />,
      );
      break;
    case 'size-icon':
      settingDOM.push(
        <span className={`size-icon-container`}>
          <div className="size-icon icon-left" data-value="plus" onClick={handleSizeIcon}>
            <i className="fa fa-plus"></i>
          </div>
          <div className="size-icon icon-right" data-value="minus" onClick={handleSizeIcon}>
            <i className="fa fa-minus"></i>
          </div>
        </span>,
      );
      break;
    case 'icon-toggle':
      settingDOM.push(
        <div className="size-icon-container" onClick={handleToggleChange}>
          <span
            className="icon-toggle"
            style={{
              backgroundImage: `url('assets/img/icons/${settingObj.icon}')`,
            }}
          ></span>
        </div>,
      );
      break;
    case 'custom':
      if (settingObj.key === 'LayoutSelector') {
        settingDOM.push(<LayoutSelector changeLayout={handleLayoutChange} />);
      }
      break;
    default:
      return null;
  }
  return settingDOM;
};

OverlaySetting.propTypes = {
  settingObj: PropTypes.object,
  stateVar: PropTypes.string,
  stateFunction: PropTypes.string,
};

export default OverlaySetting;
