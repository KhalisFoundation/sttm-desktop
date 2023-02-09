import React from 'react';
import { useDataLayerValue } from '../state-manager/DataLayer';
import classNames from '../../../common/utils/classnames';

const remote = require('@electron/remote');
const { i18n } = remote.require('./app');

export const MiscHeader = () => {
  const [{ miscPanel }, dispatch] = useDataLayerValue();
  const SetOpenTab = (event) => {
    dispatch({
      type: 'SET_PANEL',
      miscPanel: event.target.textContent,
    });
  };
  const isHistory = miscPanel === 'History';
  const isInsert = miscPanel === 'Insert';
  const isOther = miscPanel === 'Others';
  const isFav = miscPanel === 'Favorite';
  return (
    <div className="misc-header">
      <a
        className={classNames('misc-button', isHistory && 'misc-active')}
        onClick={(event) => SetOpenTab(event)}
      >
        <i className="fa fa-clock-o">
          <span className="Icon-label" key="History">
            {i18n.t('TOOLBAR.HISTORY')}
          </span>
        </i>
      </a>

      <a
        className={classNames('misc-button', isInsert && 'misc-active')}
        onClick={(event) => SetOpenTab(event)}
      >
        <i className="fa fa-desktop">
          <span className="Icon-label" key="Insert">
            {i18n.t('TOOLBAR.INSERT')}
          </span>
        </i>
      </a>
      <a
        className={classNames('misc-button', isFav && 'misc-active')}
        onClick={(event) => SetOpenTab(event)}
      >
        <i className="fa fa-heart">
          <span className="Icon-label" key="Favorite">
            {i18n.t('TOOLBAR.FAVORITE')}
          </span>
        </i>
      </a>
      <a
        className={classNames('misc-button', isOther && 'misc-active')}
        onClick={(event) => SetOpenTab(event)}
      >
        <i className="fa fa-ellipsis-h">
          <span className="Icon-label" key="Others">
            {i18n.t('TOOLBAR.OTHERS')}
          </span>
        </i>
      </a>
    </div>
  );
};
