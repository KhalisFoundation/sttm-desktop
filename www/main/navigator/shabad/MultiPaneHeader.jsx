import React from 'react';
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

  const getTitle = (content) => {
    if (content === i18n.t('MULTI_PANE.CLEAR_PANE')) return '';
    return content;
  };

  return (
    <div className={`shabad-pane-header pane-${paneId}`}>
      <div className="pane-info">
        <span className="pane-symbol">{paneId}</span>
        <button onClick={lockPane}>
          {paneAttributes.locked ? (
            <i className="fa-solid fa-lock"></i>
          ) : (
            <i className="fa-solid fa-lock-open"></i>
          )}
        </button>
      </div>
      <span className="pane-title">{getTitle(paneAttributes.content)}</span>
      <div className="pane-tools">
        <FavShabadIcon paneId={paneId} />
        <ArrowIcon paneId={paneId} />
        <select
          onChange={selectPaneOption}
          value={paneAttributes.content}
          className="pane-options-dropdown"
        >
          <option>{i18n.t('MULTI_PANE.CLEAR_PANE')}</option>
          <option style={{ display: 'none' }}>{i18n.t('MULTI_PANE.SHABAD')}</option>
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
