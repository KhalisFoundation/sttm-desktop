/* eslint-disable no-unused-vars */
/* eslint-disable no-eval */
import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';
import convertToCamelCase from '../../common/utils/convert-to-camel-case';

global.platform = require('../../desktop_scripts');

const QuickTools = ({ isAnnouncementSlide, isWaheguruSlide, isMoolMantraSlide }) => {
  const {
    setTranslationVisibility,
    setTeekaVisibility,
    setTransliterationVisibility,
    setGurbaniFontSize,
    setTranslationFontSize,
    setTeekaFontSize,
    setTransliterationFontSize,
    setAnnouncementsFontSize,
  } = useStoreActions(state => state.userSettings);
  const {
    translationVisibility,
    teekaVisibility,
    transliterationVisibility,
    gurbaniFontSize,
    translationFontSize,
    teekaFontSize,
    transliterationFontSize,
    announcementsFontSize,
  } = useStoreState(state => state.userSettings);
  const { quickToolsOpen } = useStoreState(state => state.viewerSettings);
  const { setQuickToolsOpen } = useStoreActions(state => state.viewerSettings);
  const [quickToolsActions, setQuickToolsActions] = useState([
    'Gurbani',
    'Translation',
    'Teeka',
    'Transliteration',
  ]);

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
    if (name === 'visibility' && ['Translation', 'Teeka', 'Transliteration'].includes(toolName))
      return eval(convertToCamelCase(`${toolName}${action}`)) ? 'fa fa-eye' : 'fa fa-eye-slash';
    if (name === 'minus') return 'fa fa-minus-circle';
    if (name === 'plus') return 'fa fa-plus-circle';
    return '';
  };

  const hide = (name, toolName) => {
    return name === 'visibility' && ['Gurbani', 'Announcements'].includes(toolName)
      ? 'quicktool-icons-hidden'
      : '';
  };

  const bakeIcons = (toolName, icons) => {
    return icons.map(({ name, actionName }) => (
      <div key={name} className={`quicktool-icons ${hide(name, toolName)}`}>
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

  useEffect(() => {
    if (isAnnouncementSlide || isWaheguruSlide || isMoolMantraSlide) {
      setQuickToolsActions(['Announcements']);
    } else {
      setQuickToolsActions(['Gurbani', 'Translation', 'Teeka', 'Transliteration']);
    }
  }, [isAnnouncementSlide, isWaheguruSlide, isMoolMantraSlide]);

  return (
    <div className="slide-quicktools">
      <div className="quicktool-header" onClick={() => setQuickToolsOpen(!quickToolsOpen)}>
        Quick Tools
        <i className={`fa fa-caret-${quickToolsOpen ? 'up' : 'down'}`}></i>
      </div>
      {quickToolsOpen && (
        <div
          className={`quicktool-body quicktool-${
            isAnnouncementSlide || isWaheguruSlide || isMoolMantraSlide ? 'announcement' : 'gurbani'
          }`}
        >
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

QuickTools.propTypes = {
  isAnnouncementSlide: PropTypes.bool,
  isWaheguruSlide: PropTypes.bool,
  isMoolMantraSlide: PropTypes.bool,
};

export default QuickTools;
