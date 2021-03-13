import { func } from 'prop-types';
import React, { useState } from 'react';

function ShabadControls({ isHome, isRead }) {
  return (
    <>
      {isRead ? (
        <span>
          <i className="fa fa-fw fa-check" />
        </span>
      ) : (
        ''
      )}
      {isHome ? (
        <span>
          <i className="fa fa-fw fa-home" />
        </span>
      ) : (
        ''
      )}
    </>
  );
}
function HistoryControls() {
  return <i className="fa fa-times" />;
}

function SearchResults({ onClick, ShabadPane, onMouseOver, verse, HistoryPane }) {
  const [isActive, setActive] = useState(true);
  const [isHome, setHome] = useState(true);
  const [isRead, setRead] = useState(true);

  return (
    <div className="verse-block">
      {verse ? (
        <div className="result-list">
          <ul className="gurmukhi">
            <li
              className={`gurmukhi  ${ShabadPane && 'shabadPane-list'}`}
              onClick={onClick}
              onMouseOver={onMouseOver}
            >
              <span className="shabadPane-controls">
                {ShabadPane && <ShabadControls isHome={isHome} isRead={isRead} />}
              </span>
              <a className="panktee">{verse}</a>
              <span className="historyPane-controls">{HistoryPane && <HistoryControls />}</span>
            </li>{' '}
            <li
              className={`gurmukhi  ${ShabadPane && 'shabadPane-list'}`}
              onClick={onClick}
              onMouseOver={onMouseOver}
            >
              <span className="shabadPane-controls">
                {ShabadPane && <ShabadControls isHome={isHome} isRead={isRead} />}
              </span>
              <a className="panktee">{verse}</a>
              <span className="historyPane-controls">{HistoryPane && <HistoryControls />}</span>
            </li>{' '}
            <li
              className={`gurmukhi  ${ShabadPane && 'shabadPane-list'}`}
              onClick={onClick}
              onMouseOver={onMouseOver}
            >
              <span className="shabadPane-controls">
                {ShabadPane && <ShabadControls isHome={isHome} isRead={isRead} />}
              </span>
              <a className="panktee">{verse}</a>
              <span className="historyPane-controls">{HistoryPane && <HistoryControls />}</span>
            </li>{' '}
            <li
              className={`gurmukhi  ${ShabadPane && 'shabadPane-list'}`}
              onClick={onClick}
              onMouseOver={onMouseOver}
            >
              <span className="shabadPane-controls">
                {ShabadPane && <ShabadControls isHome={isHome} isRead={isRead} />}
              </span>
              <a className="panktee">{verse}</a>
              <span className="historyPane-controls">{HistoryPane && <HistoryControls />}</span>
            </li>{' '}
            <li
              className={`gurmukhi  ${ShabadPane && 'shabadPane-list'}`}
              onClick={onClick}
              onMouseOver={onMouseOver}
            >
              <span className="shabadPane-controls">
                {ShabadPane && <ShabadControls isHome={isHome} isRead={isRead} />}
              </span>
              <a className="panktee">{verse}</a>
              <span className="historyPane-controls">{HistoryPane && <HistoryControls />}</span>
            </li>{' '}
            <li
              className={`gurmukhi  ${ShabadPane && 'shabadPane-list'}`}
              onClick={onClick}
              onMouseOver={onMouseOver}
            >
              <span className="shabadPane-controls">
                {ShabadPane && <ShabadControls isHome={isHome} isRead={isRead} />}
              </span>
              <a className="panktee">{verse}</a>
              <span className="historyPane-controls">{HistoryPane && <HistoryControls />}</span>
            </li>{' '}
            <li
              className={`gurmukhi  ${ShabadPane && 'shabadPane-list'}`}
              onClick={onClick}
              onMouseOver={onMouseOver}
            >
              <span className="shabadPane-controls">
                {ShabadPane && <ShabadControls isHome={isHome} isRead={isRead} />}
              </span>
              <a className="panktee">{verse}</a>
              <span className="historyPane-controls">{HistoryPane && <HistoryControls />}</span>
            </li>{' '}
            <li
              className={`gurmukhi  ${ShabadPane && 'shabadPane-list'}`}
              onClick={onClick}
              onMouseOver={onMouseOver}
            >
              <span className="shabadPane-controls">
                {ShabadPane && <ShabadControls isHome={isHome} isRead={isRead} />}
              </span>
              <a className="panktee">{verse}</a>
              <span className="historyPane-controls">{HistoryPane && <HistoryControls />}</span>
            </li>{' '}
            <li
              className={`gurmukhi  ${ShabadPane && 'shabadPane-list'}`}
              onClick={onClick}
              onMouseOver={onMouseOver}
            >
              <span className="shabadPane-controls">
                {ShabadPane && <ShabadControls isHome={isHome} isRead={isRead} />}
              </span>
              <a className="panktee">{verse}</a>
              <span className="historyPane-controls">{HistoryPane && <HistoryControls />}</span>
            </li>{' '}
            <li
              className={`gurmukhi  ${ShabadPane && 'shabadPane-list'}`}
              onClick={onClick}
              onMouseOver={onMouseOver}
            >
              <span className="shabadPane-controls">
                {ShabadPane && <ShabadControls isHome={isHome} isRead={isRead} />}
              </span>
              <a className="panktee">{verse}</a>
              <span className="historyPane-controls">{HistoryPane && <HistoryControls />}</span>
            </li>{' '}
            <li
              className={`gurmukhi  ${ShabadPane && 'shabadPane-list'}`}
              onClick={onClick}
              onMouseOver={onMouseOver}
            >
              <span className="shabadPane-controls">
                {ShabadPane && <ShabadControls isHome={isHome} isRead={isRead} />}
              </span>
              <a className="panktee">{verse}</a>
              <span className="historyPane-controls">{HistoryPane && <HistoryControls />}</span>
            </li>{' '}
            <li
              className={`gurmukhi  ${ShabadPane && 'shabadPane-list'}`}
              onClick={onClick}
              onMouseOver={onMouseOver}
            >
              <span className="shabadPane-controls">
                {ShabadPane && <ShabadControls isHome={isHome} isRead={isRead} />}
              </span>
              <a className="panktee">{verse}</a>
              <span className="historyPane-controls">{HistoryPane && <HistoryControls />}</span>
            </li>
          </ul>{' '}
        </div>
      ) : (
        ''
      )}
    </div>
  );
}

export default SearchResults;
