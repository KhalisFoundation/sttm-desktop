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
  englishVerse,
  verseId,
}) => {
  const loadActiveClass = (verseObj, currentVerseId, verseIndex) => {
    return Object.keys(verseObj).map(verseKey => {
      if (Number(verseKey) === verseIndex && verseObj[verseKey] === currentVerseId) {
        return 1;
      }
      return 0;
    })[0]
      ? 'shabad-pane-active'
      : '';
  };

  return (
    <li
      id={`line-${lineNumber}`}
      value={lineNumber}
      className={`shabad-pane-list shabad-li ${loadActiveClass(activeVerse, verseId, lineNumber)}`}
    >
      <span className="shabad-pane-controls">
        {versesRead.map(
          (isRead, index) => isRead === verseId && <i key={index} className="fa fa-fw fa-check" />,
        )}
        <i
          onClick={() => changeHomeVerse(lineNumber)}
          className={`fa ${isHomeVerse !== lineNumber ? `fa-home hoverIcon` : `fa-fw fa-home`}`}
        />
      </span>
      {verse ? (
        <span
          className="gurmukhi verse-content"
          onClick={() => {
            updateTraversedVerse(verseId, lineNumber);
          }}
        >
          {verse}
        </span>
      ) : (
        <span
          className="verse-content"
          onClick={() => {
            updateTraversedVerse(verseId, lineNumber);
          }}
        >
          {englishVerse && englishVerse.split('<h1>')[1].split('</h1>')[0]}
        </span>
      )}
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
  englishVerse: PropTypes.string,
  verseId: PropTypes.number,
};

export default ShabadVerse;
