import React from 'react';
import PropTypes from 'prop-types';

const ShabadVerse = ({
  activeVerse,
  changeHomeVerse,
  isHomeVerse,
  lineNumber,
  versesRead,
  updateTraversedVerse,
  verse,
  verseId,
}) => {
  const loadActiveClass = (activeVerseObj, activeVerseId, index) => {
    return Object.keys(activeVerseObj).map(activeVerseKey => {
      if (
        parseInt(activeVerseKey, 10) === index &&
        activeVerseObj[activeVerseKey] === activeVerseId
      ) {
        return 1;
      }
      return 0;
    })[0]
      ? 'shabadPane-active'
      : '';
  };

  return (
    <li
      value={lineNumber}
      className={`shabadPane-list ${loadActiveClass(activeVerse, verseId, lineNumber)}`}
    >
      <span className="shabadPane-controls">
        {versesRead.map(
          (isRead, index) =>
            isRead === verseId && (
              <span key={verseId + index}>
                <i className="fa fa-fw fa-check" />
              </span>
            ),
        )}
        <span onClick={() => changeHomeVerse(lineNumber)}>
          <i
            className={`fa ${isHomeVerse !== lineNumber ? `fa-home hoverIcon` : `fa-fw fa-home`}`}
          />
        </span>
      </span>
      <div
        className="span-color"
        onClick={() => {
          updateTraversedVerse(verseId, lineNumber);
        }}
      >
        <a className="panktee">
          <span className="gurmukhi">{verse}</span>
        </a>
      </div>
    </li>
  );
};

ShabadVerse.propTypes = {
  activeVerse: PropTypes.object,
  changeHomeVerse: PropTypes.func,
  isHomeVerse: PropTypes.number,
  lineNumber: PropTypes.number,
  versesRead: PropTypes.array,
  updateTraversedVerse: PropTypes.func,
  verse: PropTypes.string,
  verseId: PropTypes.number,
};

export default ShabadVerse;
