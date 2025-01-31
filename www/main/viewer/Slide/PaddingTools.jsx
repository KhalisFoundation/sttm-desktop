import PropTypes from 'prop-types';
import React from 'react';
import { useStoreState } from 'easy-peasy';
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
    console.log(viewerSettingsStore,'VIEWER SETTINGS STORE>')
    
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
      const title = `Padding ${convertToCamelCase(variant)} - ${viewerSettingsStore['containerPadding'][variant]}`;
      const iconsMarkup = icons.map(icon => {
        <div key={name} className="quicktool-icons">
          <i 
            className={icon.name === 'minus' ? 'fa fa-minus-circle' : 'fa fa-plus-circle'}
            onClick={() => {
              const viewerSettingObj = createViewerSettingObject({name, actionName, variant}); 
              global.platform.ipc.send('update-global-setting', JSON.stringify(viewerSettingObj));
            }}
          />
        </div>
      })

      return (
        <div className='quicktool'>
          <p>{title}</p>
          {iconsMarkup}
        </div>
      )
    }

    const [paddingToolsOpen, setPaddingToolsOpen] = useState(false);

    return (
        <div className={`slide-quicktools ${!userSettings.quickTools ? 'hide-quicktools' : ''}`.trim()}>
            <div className="quicktool-header" onClick={() => setPaddingToolsOpen(!paddingToolsOpen)}>
                Padding Tools
                <i className={`fa fa-caret-${quickToolsOpen ? 'up' : 'down'}`}></i>
            </div>
            {paddingToolsOpen && (
                <div className={`quicktool-body quicktool-${isMiscSlide ? 'announcement' : 'gurbani'}`}>
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