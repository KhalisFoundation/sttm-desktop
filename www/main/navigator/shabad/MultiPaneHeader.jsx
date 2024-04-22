import React, { useRef } from 'react';
import PropTypes from 'prop-types';
import { useStoreActions, useStoreState } from 'easy-peasy';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const MultiPaneHeader = ({ data }) => {
  const paneId = data.multiPaneId;
  const navigatorState = useStoreState((state) => state.navigator);
  const navigatorActions = useStoreActions((state) => state.navigator);
  const paneAttributes = navigatorState[`pane${paneId}`];
  const setPaneAttributes = navigatorActions[`setPane${paneId}`];

  const defaultPaneAttributes = {
    locked: false,
    activeShabad: null,
    activeVerse: '',
    versesRead: [],
    homeVerse: false,
    content: null,
  };

  const paneOptionRef = useRef(null);

  const lockPane = () => {
    const updatedAttributes = { ...paneAttributes };
    updatedAttributes.locked = !paneAttributes.locked;
    if (paneAttributes !== updatedAttributes) {
      setPaneAttributes(updatedAttributes);
    }
  };

  const selectPaneOption = (event) => {
    const clickedOption = event.target;
    const optionText = clickedOption.textContent;
    if (optionText === i18n.t('MULTI_PANE.CLEAR_PANE')) {
      if (paneAttributes !== defaultPaneAttributes) setPaneAttributes(defaultPaneAttributes);
    } else if (optionText === i18n.t('TOOLBAR.HISTORY')) {
      setPaneAttributes({ ...paneAttributes, content: 'history' });
    } else if (optionText === i18n.t('MULTI_PANE.MISC_SLIDES')) {
      setPaneAttributes({ ...paneAttributes, content: 'misc' });
    }
    paneOptionRef.current.classList.add('hidden');
  };

  return (
    <div className={`shabad-pane-header pane-${paneId}`}>
      <span className="pane-symbol">{paneId}</span>
      <div className="pane-tools">
        <button onClick={lockPane}>
          {paneAttributes.locked ? (
            <i className="fa-solid fa-lock"></i>
          ) : (
            <i className="fa-solid fa-lock-open"></i>
          )}
        </button>
        <button>
          <i className="fa-regular fa-star"></i>
        </button>
        <button
          onClick={(event) => {
            const clickedButton = event.currentTarget;
            const paneOptions = clickedButton.nextElementSibling;
            paneOptions.classList.toggle('hidden');
          }}
        >
          <i className="fa-solid fa-ellipsis-vertical"></i>
        </button>
        <div className="pane-options hidden" ref={paneOptionRef}>
          <ul>
            <li onClick={selectPaneOption}>{i18n.t('MULTI_PANE.CLEAR_PANE')}</li>
            <li onClick={selectPaneOption}>{i18n.t('TOOLBAR.HISTORY')}</li>
            <li onClick={selectPaneOption}>{i18n.t('MULTI_PANE.MISC_SLIDES')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

MultiPaneHeader.propTypes = {
  data: PropTypes.any,
};
export default MultiPaneHeader;
