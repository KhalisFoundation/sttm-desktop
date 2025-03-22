import PropTypes from 'prop-types';
import React from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { convertToCamelCase } from '../../common/utils';

const icons = [
  {
    name: 'minus',
    actionName: 'Padding',
  },
  {
    name: 'plus',
    actionName: 'Padding',
  },
];
const PADDING_VARIANTS = ['top', 'right', 'bottom', 'left'];
const PADDING_MAX = 48;
const PADDING_MIN = 0;

const PaddingTools = (props) => {
  const viewerSettingsStore = useStoreState((state) => state.viewerSettings);
  const { setPaddingToolsOpen } = useStoreActions((state) => state.viewerSettings);

  const createViewerSettingObject = ({ name, variant }) => {
    const payload = { type: variant };
    const currentPadding = parseInt(viewerSettingsStore.containerPadding[variant], 10);

    if (name === 'minus') {
      payload.value = currentPadding > PADDING_MIN ? currentPadding - 1 : PADDING_MIN;
    } else if (name === 'plus') {
      payload.value = currentPadding < PADDING_MAX ? currentPadding + 1 : PADDING_MAX;
    }

    return {
      actionName: 'setPadding',
      payload,
      settingType: 'viewerSettings',
    };
  };

  const createPaddingIcon = ({ name, variant }) => {
    const currentPadding = parseInt(viewerSettingsStore.containerPadding[variant], 10);
    const isMinusIcon = name === 'minus';
    const isIconDisabled = isMinusIcon
      ? currentPadding === PADDING_MIN
      : currentPadding === PADDING_MAX;
    return (
      <i
        disabled={isIconDisabled}
        className={isMinusIcon ? 'fa fa-minus-circle' : 'fa fa-plus-circle'}
        onClick={() => {
          if (!isIconDisabled) {
            const viewerSettingObj = createViewerSettingObject({ name, variant });
            global.platform.ipc.send('update-global-setting', JSON.stringify(viewerSettingObj));
          }
        }}
      />
    );
  };

  const createPaddingChanger = (variant) => {
    const iconValue = viewerSettingsStore.containerPadding[variant];

    return (
      <div className="paddingtool">
        <h4 className="paddingtool-title">{`Padding-${convertToCamelCase(variant)}`}</h4>
        <div className="paddingtool-icons">
          {createPaddingIcon({ name: icons[0].name, variant })}
          <p className="paddingtool-icon-value">{iconValue}</p>
          {createPaddingIcon({ name: icons[1].name, variant })}
        </div>
      </div>
    );
  };

  return (
    <div className={`slide-paddingtools`}>
      <div
        className="quicktool-header"
        onClick={() => setPaddingToolsOpen(!viewerSettingsStore.paddingToolsOpen)}
      >
        Padding Tools
        <i className={`fa fa-caret-${viewerSettingsStore.paddingToolsOpen ? 'up' : 'down'}`}></i>
      </div>
      {viewerSettingsStore.paddingToolsOpen && (
        <div
          className={`paddingtool-body paddingtool-${
            props.isMiscSlide ? 'announcement' : 'gurbani'
          }`}
        >
          {PADDING_VARIANTS.map((variant) => createPaddingChanger(variant))}
        </div>
      )}
    </div>
  );
};

PaddingTools.propTypes = {
  isMiscSlide: PropTypes.bool,
};

export default PaddingTools;
