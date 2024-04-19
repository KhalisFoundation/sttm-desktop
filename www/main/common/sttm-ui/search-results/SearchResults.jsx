import React from 'react';
import PropTypes from 'prop-types';
import anvaad from 'anvaad-js';
import { useStoreState } from 'easy-peasy';

const remote = require('@electron/remote');

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
  currentLanguage,
}) => {
  const { currentWorkspace, defaultPaneId } = useStoreState((state) => state.userSettings);
  const { pane1, pane2, pane3 } = useStoreState((state) => state.navigator);

  const getClassForAng = (baniSource) => {
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

  const getBorderColorClass = (baniSource) => {
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

  const shabadPaneButtons = () => {
    if (currentWorkspace === i18n.t('WORKSPACES.MULTI_PANE')) {
      return (
        <div className="button-container">
          <button
            className="button-pane-1"
            disabled={pane1.locked}
            onClick={() => {
              if (!pane1.locked) onClick(shabadId, verseId, verse, 1);
            }}
          >
            {pane1.locked ? <i className="fa-solid fa-lock"></i> : '1'}
          </button>
          <button
            className="button-pane-2"
            disabled={pane2.locked}
            onClick={() => {
              if (!pane2.locked) onClick(shabadId, verseId, verse, 2);
            }}
          >
            {pane2.locked ? <i className="fa-solid fa-lock"></i> : '2'}
          </button>
          <button
            className="button-pane-3"
            disabled={pane3.locked}
            onClick={() => {
              if (!pane3.locked) onClick(shabadId, verseId, verse, 3);
            }}
          >
            {pane3.locked ? <i className="fa-solid fa-lock"></i> : '3'}
          </button>
        </div>
      );
    }
    return null;
  };

  const isHighlightRequired = (gurbaniVerse, word, wordIndex, searchCharacters) => {
    const wordsToHightlight = searchCharacters.length;
    const mainLetters = anvaad.mainLetters(gurbaniVerse);
    const firstLetters = mainLetters
      .split(' ')
      .map((d) => d[0])
      .join('');
    const queryStart = firstLetters.indexOf(searchCharacters);
    const queryEnd = queryStart + searchCharacters.length;
    switch (searchType) {
      // searchType value 0 represents First letter (start) option
      case 0:
        if (wordsToHightlight > wordIndex) {
          return true;
        }
        break;

      // searchType value 1 represents First Letter (anywhere) option
      case 1:
        if (wordIndex >= queryStart && wordIndex < queryEnd) {
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
            isHighlightRequired(gurbaniVerse, word, index, searchCharacters) ? 'highlight' : ''
          }`}
        >
          {word}
        </span>
      ));
    }
    return gurbaniVerse;
  };

  return (
    <li className="search-li">
      <div
        onClick={() => onClick(shabadId, verseId, verse, defaultPaneId)}
        className={`search-list ${getBorderColorClass(sourceId)}`}
      >
        <a className="panktee">
          {!!ang && (
            <span className={`${getClassForAng(sourceId)}`}>{`${i18n.t(
              `SEARCH.ANG`,
            )} ${ang} `}</span>
          )}
          <span className="gurmukhi">{highlightKeywords(verse, searchQuery)}</span>
          {currentLanguage === 'en' && <div className="eng-verse">{anvaad.translit(verse)}</div>}
          <div className="search-list-footer">
            {`${writer}${writer && raag ? ', ' : ' '}${raag !== null ? raag : ''}`}
          </div>
        </a>
      </div>
      {shabadPaneButtons()}
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
  currentLanguage: PropTypes.string,
};

export default SearchResults;
