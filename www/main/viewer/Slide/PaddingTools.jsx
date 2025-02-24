import PropTypes from 'prop-types';
import React from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';
import { convertToCamelCase } from '../../common/utils';

 const icons = [{
    name: 'minus',
    actionName: 'Padding',
  },
  {
    name: 'plus',
    actionName: 'Padding',
  }]  
const PADDING_VARIANTS = ['top', 'right', 'bottom', 'right'];

const PaddingTools = (props) => {
    const viewerSettingsStore = useStoreState((state) => state.viewerSettings);
    const { setPaddingToolsOpen } = useStoreActions(state => state.viewerSettings);
    console.log(viewerSettingsStore,'VIEWER SETTINGS STORE>')

    const createPaddingIcon = ({name, variant}) => {
      return (
        <i 
          className={name === 'minus' ? 'fa fa-minus-circle' : 'fa fa-plus-circle'}
          onClick={() => {
            const viewerSettingObj = createViewerSettingObject({name, variant}); 
            global.platform.ipc.send('update-global-setting', JSON.stringify(viewerSettingObj));
          }}
        />
      )
    }
    
    const createViewerSettingObject = ({name, variant}) => {
      const payload = {type: variant};
      let currentPadding = parseInt(viewerSettingsStore['containerPadding'][variant], 10);
    
      if (name === 'minus') {
        payload.value = currentPadding > 0 ? currentPadding - 1 : 0;
      } else if (name === 'plus') {
        payload.value = currentPadding < 48 ? currentPadding + 1 : 48;
      }
    
      return {
        actionName: 'setPadding',
        payload,
        settingType: 'viewerSettings',
      };    
    }

    const createPaddingChanger = (variant) => {
      const iconValue = viewerSettingsStore['containerPadding'][variant];

      return (
        <div className='paddingtool'>
          <h3 className="paddingtool-title">{`padding${convertToCamelCase(variant)}`}</h3>
          <div className="paddingtool-icons">
            {createPaddingIcon({name: icons[0].name, variant})}
            <p className='paddingtool-icon-value'>{iconValue}</p>
            {createPaddingIcon({name: icons[1].name, variant})}
          </div>
        </div>
      )
    }

    return (
        <div className={`slide-paddingtools`}>
            <div className="quicktool-header" onClick={() => setPaddingToolsOpen(!viewerSettingsStore.paddingToolsOpen)}>
                Padding Tools
                <i className={`fa fa-caret-${viewerSettingsStore.paddingToolsOpen ? 'up' : 'down'}`}></i>
            </div>
            {viewerSettingsStore.paddingToolsOpen && (
                <div className={`paddingtool-body paddingtool-${props.isMiscSlide ? 'announcement' : 'gurbani'}`}>
                {PADDING_VARIANTS.map(variant => createPaddingChanger(variant))}
                </div>
            )}
        </div>
    )   
}

PaddingTools.propTypes = {
    isMiscSlide: PropTypes.bool
}

export default PaddingTools;