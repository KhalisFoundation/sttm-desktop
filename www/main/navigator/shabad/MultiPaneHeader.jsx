import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';

import FavShabadIcon from './FavShabadIcon';
import ArrowIcon from './ArrowIcon';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const MultiPaneHeader = ({ data }) => {
  const paneId = data.multiPaneId;
  const navigatorState = useStoreState((state) => state.navigator);
  const navigatorActions = useStoreActions((state) => state.navigator);
  const paneAttributes = navigatorState[`pane${paneId}`];
  const setPaneAttributes = navigatorActions[`setPane${paneId}`];

  const { defaultPaneId } = useStoreState((state) => state.userSettings);
  const { setDefaultPaneId } = useStoreActions((actions) => actions.userSettings);

  const [disableLock, setDisableLock] = useState(false);

  const lockIcon = useRef(null);

  const defaultPaneAttributes = {
    locked: false,
    activeShabad: null,
    activeVerse: '',
    versesRead: [],
    homeVerse: false,
    content: '',
  };

  const nextAvailablePane = (givenPaneId) => {
    let nextPane = givenPaneId;
    do {
      if (nextPane === 3) {
        nextPane = 1;
      } else {
        nextPane++;
      }
      if (!navigatorState[`pane${nextPane}`].locked) {
        return nextPane;
      }
    } while (nextPane !== givenPaneId);
    return null;
  };

  const lockPane = () => {
    const updatedAttributes = { ...paneAttributes };
    if (paneAttributes.locked) {
      updatedAttributes.locked = false;
    } else if (!disableLock) {
      updatedAttributes.locked = true;
      if (defaultPaneId === paneId) {
        const newDefault = nextAvailablePane(paneId);
        if (defaultPaneId !== newDefault) {
          setDefaultPaneId(newDefault);
        }
      }
    }
    if (paneAttributes !== updatedAttributes) {
      setPaneAttributes(updatedAttributes);
    }
  };

  useEffect(() => {
    const remainingPanes = [1, 2, 3].filter((pane) => pane !== paneId);
    if (remainingPanes.every((pane) => navigatorState[`pane${pane}`].locked)) {
      lockIcon.current.classList.add('disabled');
      setDisableLock(true);
    } else {
      lockIcon.current.classList.remove('disabled');
      setDisableLock(false);
    }
  }, [navigatorState.pane1, navigatorState.pane2, navigatorState.pane3]);

  const selectPaneOption = (event) => {
    setPaneAttributes({ ...paneAttributes, content: event.target.value });
  };

  return (
    <div className={`shabad-pane-header pane-${paneId}`}>
      <div className="pane-info">
        <span className="pane-symbol">{paneId}</span>
        <button onClick={lockPane} ref={lockIcon}>
          {paneAttributes.locked ? (
            <i className="fa-solid fa-lock"></i>
          ) : (
            <i className="fa-solid fa-lock-open"></i>
          )}
        </button>
      </div>
      <span className="pane-title">{paneAttributes.content}</span>
      <div className="pane-tools">
        <FavShabadIcon paneId={paneId} />
        <ArrowIcon paneId={paneId} />
        <button onClick={() => setPaneAttributes(defaultPaneAttributes)}>Clear</button>
        <select
          onChange={selectPaneOption}
          value={paneAttributes.content}
          className="pane-options-dropdown"
        >
          <option>{i18n.t('MULTI_PANE.SHABAD')}</option>
          <option>{i18n.t('TOOLBAR.HISTORY')}</option>
          <option>{i18n.t('MULTI_PANE.FAVORITES')}</option>
          <option>{i18n.t('MULTI_PANE.MISC_SLIDES')}</option>
        </select>
      </div>
    </div>
  );
};

MultiPaneHeader.propTypes = {
  data: PropTypes.any,
};
export default MultiPaneHeader;
