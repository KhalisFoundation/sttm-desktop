/* eslint-disable no-unused-vars */
/* eslint-disable no-eval */
import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';
import convertToCamelCase from '../../common/utils/convert-to-camel-case';

global.platform = require('../../desktop_scripts');

const QuickTools = ({ isMiscSlide }) => {
  const {
    setTranslationVisibility,
    setTeekaVisibility,
    setTransliterationVisibility,
    setGurbaniFontSize,
    setTranslationFontSize,
    setTeekaFontSize,
    setTransliterationFontSize,
    setAnnouncementsFontSize,
  } = useStoreActions((state) => state.userSettings);
  const {
    translationVisibility,
    teekaVisibility,
    transliterationVisibility,
    gurbaniFontSize,
    translationFontSize,
    teekaFontSize,
    transliterationFontSize,
    announcementsFontSize,
    quickTools,
  } = useStoreState((state) => state.userSettings);
  const { baniOrder } = useStoreState((state) => state.navigator);
  const { setBaniOrder } = useStoreActions((state) => state.navigator);

  const { quickToolsOpen } = useStoreState((state) => state.viewerSettings);
  const { setQuickToolsOpen } = useStoreActions((state) => state.viewerSettings);
  const [prevOrder, setPrevOrder] = useState([]);

  const baniOptions = [
    {
      label: 'teeka',
      options: [{ id: 'teeka-punjabi', text: 'Punjabi' }],
    },
    {
      label: 'translation',
      options: [
        { id: 'translation-english', text: 'English' },
        { id: 'translation-hindi', text: 'Hindi' },
        { id: 'translation-spanish', text: 'Spanish' },
      ],
    },
    {
      label: 'transliteration',
      options: [
        { id: 'transliteration-english', text: 'English' },
        { id: 'transliteration-hindi', text: 'Hindi' },
      ],
    },
  ];

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
    if (name === 'visibility' && ['translation', 'teeka', 'transliteration'].includes(toolName))
      return eval(convertToCamelCase(`${toolName}${action}`)) ? 'fa fa-eye' : 'fa fa-eye-slash';
    if (name === 'minus') return 'fa fa-minus-circle';
    if (name === 'plus') return 'fa fa-plus-circle';
    return '';
  };

  const hide = (name, toolName) =>
    name === 'visibility' && ['Gurbani', 'Announcements'].includes(toolName)
      ? 'quicktool-icons-hidden'
      : '';

  const bakeIcons = (toolName, icons) =>
    icons.map(({ name, actionName }) => (
      <div key={name} className={`quicktool-icons ${hide(name, toolName)}`}>
        <i
          className={getIconClassName(name, toolName, actionName)}
          onClick={() => {
            global.platform.ipc.send(
              'update-global-setting',
              JSON.stringify(createGlobalPlatformObj(name, toolName, actionName)),
            );
          }}
        />
      </div>
    ));

  useEffect(() => {
    if (isMiscSlide) {
      if (prevOrder !== baniOrder) {
        setPrevOrder(baniOrder);
      }
      setBaniOrder([{ label: 'announcements', id: 'announcements' }]);
    } else if (baniOrder !== prevOrder && prevOrder.length > 1) {
      setBaniOrder(prevOrder);
    }
  }, [isMiscSlide]);

  const handleQuickTools = (orderObj, index) => {
    if (orderObj.label === 'gurbani' || orderObj.label === 'announcements') {
      return <div style={{ 'text-transform': 'capitalize' }}>{orderObj.label}</div>;
    }

    const markup = baniOptions.map((optionObj, optionIndex) => (
      <optgroup
        key={`option-${optionIndex}`}
        label={optionObj.label}
        style={{ 'text-transform': 'capitalize' }}
      >
        {optionObj.options.map((optionName, nameIndex) => (
          <option key={`option-name-${nameIndex}`} value={optionName.id}>
            {optionName.text}
          </option>
        ))}
      </optgroup>
    ));
    return (
      <>
        <div style={{ 'text-transform': 'capitalize' }}>{orderObj.label}</div>
        <select
          value={orderObj.id}
          onChange={(event) => {
            const newOrder = [...baniOrder];
            const selectedText = event.target.options[event.target.selectedIndex].parentNode.label;
            newOrder[index] = { label: selectedText, id: event.target.value };
            setBaniOrder(newOrder);
          }}
        >
          {markup}
        </select>
      </>
    );
  };

  return (
    <div className={`slide-quicktools ${!quickTools ? 'hide-quicktools' : ''}`.trim()}>
      <div className="quicktool-header" onClick={() => setQuickToolsOpen(!quickToolsOpen)}>
        Quick Tools
        <i className={`fa fa-caret-${quickToolsOpen ? 'up' : 'down'}`}></i>
      </div>
      {quickToolsOpen && (
        <div className={`quicktool-body quicktool-${isMiscSlide ? 'announcement' : 'gurbani'}`}>
          {baniOrder.map((orderObj, index) => (
            <div key={`item-${index}`} className="quicktool-item">
              {handleQuickTools(orderObj, index)}
              <div className="quicktool-icons">
                {bakeIcons(orderObj.label, quickToolsModifiers)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

QuickTools.propTypes = {
  isMiscSlide: PropTypes.bool,
};

export default QuickTools;
