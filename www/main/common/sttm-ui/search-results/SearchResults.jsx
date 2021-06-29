import React from 'react';
import { remote } from 'electron';
import PropTypes from 'prop-types';

const { i18n } = remote.require('./app');

const SearchResults = ({
  ang,
  onClick,
  searchType,
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

  const isHighlightRequired = (word, wordIndex, searchCharacters) => {
    const wordsToHightlight = searchCharacters.length;
    switch (searchType) {
      // searchType value 0 represents First letter (start) option
      case 0:
        if (wordsToHightlight > wordIndex) {
          return true;
        }
        break;

      // searchType value 2 represents Full Word(s) option
      case 2:
        if (word.includes(searchCharacters)) {
          return true;
        }
        break;

      default:
        return false;
    }
    return false;
  };

  const highlightKeywords = (gurbaniVerse, searchCharacters) => {
    if (gurbaniVerse) {
      const brokenWords = gurbaniVerse.split(' ');
      return brokenWords.map((word, index) => (
        <span
          key={index}
          className={`bani-words ${
            isHighlightRequired(word, index, searchCharacters) ? 'highlight' : ''
          }`}
        >
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
  searchType: PropTypes.number,
  shabadId: PropTypes.number,
  sourceId: PropTypes.string,
  verse: PropTypes.string,
  verseId: PropTypes.number,
  writer: PropTypes.string,
};

export default SearchResults;
