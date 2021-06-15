import React from 'react';
import { useDataLayerValue } from '../state-manager/DataLayer';

export const MiscHeader = () => {
  const [{ miscPanel }, dispatch] = useDataLayerValue();
  const SetOpenTab = event => {
    dispatch({
      type: 'SET_PANEL',
      miscPanel: event.target.textContent,
    });
  };
  const isHistory = miscPanel === 'History';
  const isInsert = miscPanel === 'Insert';
  const isOther = miscPanel === 'Others';
  return (
    <div className="misc-header">
      <a
        className={`misc-button ${isHistory ? 'misc-active' : ''}`}
        onClick={event => SetOpenTab(event)}
      >
        <i className="fa fa-clock-o">
          <span className="Icon-label" key="History">
            History
          </span>
        </i>
      </a>

      <a
        className={`misc-button ${isInsert ? 'misc-active' : ''}`}
        onClick={event => SetOpenTab(event)}
      >
        <i className="fa fa-desktop">
          <span className="Icon-label" key="Insert">
            Insert
          </span>
        </i>
      </a>
      <a
        className={`misc-button ${isOther ? 'misc-active' : ''}`}
        onClick={event => SetOpenTab(event)}
      >
        <i className="fa fa-ellipsis-h">
          <span className="Icon-label" key="Others">
            Others
          </span>
        </i>
      </a>
    </div>
  );
};
