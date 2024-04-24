import React from 'react';
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
    content: i18n.t('MULTI_PANE.CLEAR_PANE'),
  };

  const lockPane = () => {
    const updatedAttributes = { ...paneAttributes };
    updatedAttributes.locked = !paneAttributes.locked;
    if (paneAttributes !== updatedAttributes) {
      setPaneAttributes(updatedAttributes);
    }
  };

  const selectPaneOption = (event) => {
    if (event.target.value === i18n.t('MULTI_PANE.CLEAR_PANE')) {
      if (paneAttributes !== defaultPaneAttributes) setPaneAttributes(defaultPaneAttributes);
    } else {
      setPaneAttributes({ ...paneAttributes, content: event.target.value });
    }
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
        <select
          onChange={selectPaneOption}
          value={paneAttributes.content}
          className="pane-options-dropdown"
        >
          <option>{i18n.t('MULTI_PANE.CLEAR_PANE')}</option>
          <option style={{ display: 'none' }}>{i18n.t('MULTI_PANE.SHABAD')}</option>
          <option>{i18n.t('TOOLBAR.HISTORY')}</option>
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
