/* eslint-disable no-unused-vars */
/* eslint-disable no-eval */
import React from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';
import convertToCamelCase from '../../common/utils/convert-to-camel-case';

global.platform = require('../../desktop_scripts');

const QuickTools = () => {
  const {
    setTranslationVisibility,
    setTeekaVisibility,
    setTransliterationVisibility,
    setGurbaniFontSize,
    setTranslationFontSize,
    setTeekaFontSize,
    setTransliterationFontSize,
  } = useStoreActions(state => state.userSettings);
  const {
    translationVisibility,
    teekaVisibility,
    transliterationVisibility,
    gurbaniFontSize,
    translationFontSize,
    teekaFontSize,
    transliterationFontSize,
  } = useStoreState(state => state.userSettings);
  const { quickToolsOpen } = useStoreState(state => state.viewerSettings);
  const { setQuickToolsOpen } = useStoreActions(state => state.viewerSettings);

  const quickToolsActions = ['Gurbani', 'Translation', 'Teeka', 'Transliteration'];

  const quickToolsModifiers = [
    {
      name: 'visibility',
      actionName: 'Visibility',
    },
    {
      name: 'minus',
      actionName: 'FontSize',
    },
    {
      name: 'plus',
      actionName: 'FontSize',
    },
  ];

  const createGlobalPlatformObj = (name, toolName, action) => {
    let payload = eval(convertToCamelCase(`${toolName}${action}`));
    const actionName = `set${toolName}${action}`;
    if (name === 'visibility') payload = eval(`${actionName}(${!payload})`);
    if (name === 'minus') payload = eval(`${actionName}(${payload} - 1)`);
    if (name === 'plus') payload = eval(`${actionName}(${payload} + 1)`);
    return {
      actionName,
      payload: payload.payload,
      settingType: 'userSettings',
    };
  };

  const getIconClassName = (name, toolName, action) => {
    if (name === 'visibility' && toolName !== 'Gurbani')
      return eval(convertToCamelCase(`${toolName}${action}`)) ? 'fa fa-eye' : 'fa fa-eye-slash';
    if (name === 'minus') return 'fa fa-minus-circle';
    if (name === 'plus') return 'fa fa-plus-circle';
    return '';
  };

  const isGurbaniVisibiltyClass = (name, toolName) => {
    if (name === 'visibility' && toolName === 'Gurbani') return 'quicktool-icons-hidden';
    return '';
  };

  const bakeIcons = (toolName, icons) => {
    return icons.map(({ name, actionName }) => (
      <div key={name} className={`quicktool-icons ${isGurbaniVisibiltyClass(name, toolName)}`}>
        <i
          className={getIconClassName(name, toolName, actionName)}
          onClick={() => {
            global.platform.ipc.send(
              'update-global-setting',
              createGlobalPlatformObj(name, toolName, actionName),
            );
          }}
        />
      </div>
    ));
  };

  return (
    <div className="slide-quicktools">
      <div className="quicktool-header" onClick={() => setQuickToolsOpen(!quickToolsOpen)}>
        Quick Tools
        <i className={`fa fa-caret-${quickToolsOpen ? 'up' : 'down'}`}></i>
      </div>
      {quickToolsOpen && (
        <div className="quicktool-body">
          {quickToolsActions.map(name => (
            <div key={name} className="quicktool-item">
              <div>{name}</div>
              <div className="quicktool-icons">{bakeIcons(name, quickToolsModifiers)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default QuickTools;
