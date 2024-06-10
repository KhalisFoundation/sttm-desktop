import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';

import { convertToCamelCase } from '../../common/utils';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

global.platform = require('../../desktop_scripts');

const QuickTools = ({ isMiscSlide }) => {
  const userSettings = useStoreState((state) => state.userSettings);

  const { quickToolsOpen } = useStoreState((state) => state.viewerSettings);
  const { setQuickToolsOpen } = useStoreActions((state) => state.viewerSettings);

  const [prevOrder, setPrevOrder] = useState([]);

  const [baniOrder, setBaniOrder] = useState([
    'gurbani',
    userSettings.content1,
    userSettings.content2,
    userSettings.content3,
  ]);

  const { disabledContent } = useStoreState((state) => state.navigator);

  const dropdownLabel = (option) => {
    if (option.includes('gurbani')) {
      return i18n.t(`QUICK_TOOLS.BANI`);
    }
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

  const createGlobalPlatformObj = (name, toolname, index, action) => {
    let payload;
    let actionName;
    let stateName;

    if (index > 0) {
      stateName = `content${index}${action}`;
      actionName = `setContent${index}${action}`;
    } else {
      stateName = `${toolname}${action}`;
      actionName = `set${convertToCamelCase(`${toolname}-${action}`, true)}`;
    }

    if (name === 'visibility') {
      payload = !userSettings[stateName];
    } else if (name === 'minus') {
      payload = parseInt(userSettings[stateName], 10) - 1;
    } else if (name === 'plus') {
      payload = parseInt(userSettings[stateName], 10) + 1;
    }
    return {
      actionName,
      payload,
      settingType: 'userSettings',
    };
  };

  const getIconClassName = (name, index, action) => {
    if (index > 0 && name === 'visibility')
      return userSettings[`content${index}${action}`] ? 'fa fa-eye' : 'fa fa-eye-slash';
    if (name === 'minus') return 'fa fa-minus-circle';
    if (name === 'plus') return 'fa fa-plus-circle';
    return '';
  };

  const hide = (name, toolName) =>
    name === 'visibility' && ['gurbani', 'announcements'].includes(toolName)
      ? 'quicktool-icons-hidden'
      : '';

  const bakeIcons = (toolName, index, icons) =>
    icons.map(({ name, actionName }) => (
      <div key={name} className={`quicktool-icons ${hide(name, toolName)}`}>
        <i
          className={getIconClassName(name, index, actionName)}
          onClick={() => {
            global.platform.ipc.send(
              'update-global-setting',
              JSON.stringify(createGlobalPlatformObj(name, toolName, index, actionName)),
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
      setBaniOrder(['announcements']);
    } else if (baniOrder !== prevOrder && prevOrder.length > 1) {
      setBaniOrder(prevOrder);
    }
  }, [isMiscSlide]);

  useEffect(() => {
    setBaniOrder(['gurbani', userSettings.content1, userSettings.content2, userSettings.content3]);
  }, [userSettings.content1, userSettings.content2, userSettings.content3]);

  const handleQuickTools = (order, index) => {
    if (order === 'gurbani' || order === 'announcements') {
      return <div>{dropdownLabel(order)}</div>;
    }

    const markup = baniOptions.map((optionObj, optionIndex) => (
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
    ));
    return (
      <>
        <div>{dropdownLabel(order)}</div>
        <select
          value={order}
          onChange={(event) => {
            const newOrder = [...baniOrder];
            newOrder[index] = event.target.value;
            setBaniOrder(newOrder);
            global.platform.ipc.send(
              'update-global-setting',
              JSON.stringify({
                actionName: `setContent${index}`,
                payload: event.target.value,
                settingType: 'userSettings',
              }),
            );
          }}
        >
          {markup}
        </select>
      </>
    );
  };

  return (
    <div className={`slide-quicktools ${!userSettings.quickTools ? 'hide-quicktools' : ''}`.trim()}>
      <div className="quicktool-header" onClick={() => setQuickToolsOpen(!quickToolsOpen)}>
        Quick Tools
        <i className={`fa fa-caret-${quickToolsOpen ? 'up' : 'down'}`}></i>
      </div>
      {quickToolsOpen && (
        <div className={`quicktool-body quicktool-${isMiscSlide ? 'announcement' : 'gurbani'}`}>
          {baniOrder.map((order, index) => (
            <div key={`item-${index}`} className="quicktool-item">
              {handleQuickTools(order, index)}
              <div className="quicktool-icons">{bakeIcons(order, index, quickToolsModifiers)}</div>
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
