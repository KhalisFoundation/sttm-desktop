import React from 'react';
import { remote } from 'electron';
import PropTypes from 'prop-types';

const { i18n } = remote.require('./app');

const SearchResults = ({
  ang,
  onClick,
  raag,
  shabadId,
  sourceId,
  searchQuery,
  verse,
  verseId,
  writer,
}) => {
  const getClassForAng = baniSource => {
    if (baniSource === 'G') {
      return 'sggs-color';
    }
    if (baniSource === 'D') {
      return 'sdg-color';
    }
    if (baniSource === 'A') {
      return 'ak-color';
    }
    return 'other-color';
  };

  const getBorderColorClass = baniSource => {
    if (baniSource === 'G') {
      return 'sggs-border';
    }
    if (baniSource === 'D') {
      return 'sdg-border';
    }
    if (baniSource === 'A') {
      return 'ak-border';
    }
    return 'other-border';
  };

  const highlightKeywords = (gurbaniVerse, searchCharacters) => {
    const wordsToHightlight = searchCharacters.length;
    if (gurbaniVerse) {
      const brokenWords = gurbaniVerse.split(' ');
      return brokenWords.map((word, index) => (
        <span key={index} className={`bani-words ${wordsToHightlight > index ? 'highlight' : ''}`}>
          {word}
        </span>
      ));
    }
    return gurbaniVerse;
  };

  return (
    <li onClick={() => onClick(shabadId, verseId, verse)} className="search-li">
      <div className={`search-list ${getBorderColorClass(sourceId)}`}>
        <a className="panktee">
          {ang !== null && (
            <span className={`${getClassForAng(sourceId)}`}>{`${i18n.t(
              `SEARCH.ANG`,
            )} ${ang} `}</span>
          )}
          <span className="gurmukhi">{highlightKeywords(verse, searchQuery)}</span>
          <div className="search-list-footer">
            {`${writer}${writer && raag ? ', ' : ' '}${raag !== null ? raag : ''}`}
          </div>
        </a>
      </div>
    </li>
  );
};

SearchResults.propTypes = {
  ang: PropTypes.number,
  onClick: PropTypes.func,
  raag: PropTypes.string,
  searchQuery: PropTypes.string,
  shabadId: PropTypes.number,
  sourceId: PropTypes.string,
  verse: PropTypes.string,
  verseId: PropTypes.number,
  writer: PropTypes.string,
};

export default SearchResults;
