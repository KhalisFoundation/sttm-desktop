import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';

const { remote } = require('electron');

const { i18n } = remote.require('./app');

const OverlaySetting = ({ settingObj, stateVar, stateFunction }) => {
  const { title, type } = settingObj;
  const baniOverlayState = useStoreState(state => state.baniOverlay);
  const baniOverlayActions = useStoreActions(state => state.baniOverlay);
  console.log(baniOverlayState);

  const handleInputChange = event => {
    const value = event.target ? event.target.value : event;
    baniOverlayActions[stateFunction](value);
  };

  const handleSizeIcon = event => {
    const value = event.target ? event.target.value : event;
    console.log(value);
    // if (value === 'plus') {
    //   console.log(stateFunction);
    // } else if (value === 'minus') {
    //   console.log(stateFunction);
    // }
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
          <div className="size-icon icon-left" onClick={handleSizeIcon('plus')}>
            <i className="fa fa-plus"></i>
          </div>
          <div className="size-icon icon-right" onClick={handleSizeIcon('minus')}>
            <i className="fa fa-minus"></i>
          </div>
        </span>,
      );
      break;
    case 'icon-toggle':
      settingDOM.push(
        <div className="size-icon-container">
          <span
            className="icon-toggle"
            style={{
              backgroundImage: `url('assets/img/icons/${settingObj.icon}')`,
            }}
          ></span>
        </div>,
      );
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
