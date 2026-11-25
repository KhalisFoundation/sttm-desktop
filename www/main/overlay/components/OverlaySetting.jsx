import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';
import LayoutSelector from './LayoutSelector';
import { ThemeSelector } from './ThemeSelector';
import { convertToCamelCase } from '../../common/utils';
import { Switch } from '../../common/sttm-ui';
import { i18n } from '../../common/i18n';

// Avoid values like 0.30000000000000004 when stepping by 0.1.
const roundToStep = (value) => Math.round(value * 1000) / 1000;

// Show as many decimals as the step has (0.25 → 2, 0.1 → 1).
const formatValue = (value, { format, step }) => {
  if (format === 'percent') return `${Math.round(value * 100)}%`;
  const decimals = (String(step).split('.')[1] || '').length;
  return value.toFixed(decimals);
};

const OverlaySetting = ({ settingKey, settingObj, stateVar, stateFunction }) => {
  const { title, type } = settingObj;
  const baniOverlayState = useStoreState((state) => state.baniOverlay);
  const baniOverlayActions = useStoreActions((state) => state.baniOverlay);
  const value = baniOverlayState[stateVar];

  // A setting can depend on another one being on, or only apply to some layouts.
  // It stays visible but disabled, with a hint saying why.
  const missingRequirement = settingObj.requires && !baniOverlayState[settingObj.requires];
  const wrongLayout = settingObj.layouts && !settingObj.layouts.includes(baniOverlayState.layout);
  const disabled = Boolean(missingRequirement || wrongLayout);
  const hint = wrongLayout ? settingObj.layoutsHint : settingObj.hint;

  const setValue = (newValue) => baniOverlayActions[stateFunction](newValue);

  // Changing a size by hand turns automatic sizing (Fit text) off.
  const setNumber = (newValue) => {
    const { max, min } = settingObj;
    const clamped = roundToStep(Math.min(max, Math.max(min, newValue)));
    if (clamped !== value) {
      setValue(clamped);
    }
    (settingObj.disableOnChange || []).forEach((disableSetting) => {
      const disabledSetting = convertToCamelCase(disableSetting);
      if (baniOverlayState[disabledSetting] !== false) {
        baniOverlayActions[`set${convertToCamelCase(disableSetting, true)}`](false);
      }
    });
  };

  const toggleFormat = (format) => setValue({ ...value, [format]: !value[format] });

  const label = title ? i18n.t(`BANI_OVERLAY.${title}`) : null;
  let control;

  switch (type) {
    case 'dropdown':
      control = (
        <select aria-label={label} onChange={(event) => setValue(event.target.value)} value={value}>
          {Object.keys(settingObj.options).map((op) => (
            <option key={op} value={op}>
              {settingObj.options[op]}
            </option>
          ))}
        </select>
      );
      break;
    case 'color-input':
      control = (
        <label className="overlay-color">
          <input
            type="color"
            aria-label={label}
            onChange={(event) => setValue(event.target.value)}
            value={value}
          />
          <code>{value.toUpperCase()}</code>
        </label>
      );
      break;
    case 'size-icon':
      control = (
        <div className="overlay-stepper">
          <button
            type="button"
            aria-label={i18n.t('BANI_OVERLAY.DECREASE')}
            disabled={value <= settingObj.min}
            onClick={() => setNumber(value - settingObj.step)}
          >
            <i className="fa fa-minus" />
          </button>
          <output>{formatValue(value, settingObj)}</output>
          <button
            type="button"
            aria-label={i18n.t('BANI_OVERLAY.INCREASE')}
            disabled={value >= settingObj.max}
            onClick={() => setNumber(value + settingObj.step)}
          >
            <i className="fa fa-plus" />
          </button>
        </div>
      );
      break;
    case 'slider':
      control = (
        <div className="overlay-slider">
          <input
            type="range"
            aria-label={label}
            min={settingObj.min}
            max={settingObj.max}
            step={settingObj.step}
            value={value}
            onChange={(event) => setNumber(Number(event.target.value))}
          />
          <output>{formatValue(value, settingObj)}</output>
        </div>
      );
      break;
    case 'text-format-icon':
      control = (
        <div className="overlay-toggles">
          {['bold', 'italic'].map((format) => (
            <button
              key={format}
              type="button"
              title={i18n.t(`BANI_OVERLAY.${format.toUpperCase()}`)}
              aria-pressed={Boolean(value[format])}
              onClick={() => toggleFormat(format)}
            >
              <i className={`fa fa-${format}`} />
            </button>
          ))}
        </div>
      );
      break;
    case 'switch':
      control = (
        <Switch
          controlId={`overlay-${settingKey}-switch`}
          className="overlay-switch"
          value={Boolean(value) && !disabled}
          disabled={disabled}
          onToggle={() => setValue(!value)}
        />
      );
      break;
    case 'custom':
      if (settingObj.key === 'LayoutSelector') {
        control = <LayoutSelector value={value} onChange={setValue} />;
      } else if (settingObj.key === 'ThemeSelector') {
        control = <ThemeSelector />;
      }
      break;
    default:
      return null;
  }

  return (
    <div
      id={settingKey}
      className={`overlay-control overlay-control-${type}${disabled ? ' is-disabled' : ''}`}
    >
      {label && type !== 'custom' && (
        <span className="overlay-control-label">
          {label}
          {hint && <span className="overlay-control-hint">{i18n.t(`BANI_OVERLAY.${hint}`)}</span>}
        </span>
      )}
      {control}
    </div>
  );
};

OverlaySetting.propTypes = {
  settingKey: PropTypes.string,
  settingObj: PropTypes.object,
  stateVar: PropTypes.string,
  stateFunction: PropTypes.string,
};

export default OverlaySetting;
