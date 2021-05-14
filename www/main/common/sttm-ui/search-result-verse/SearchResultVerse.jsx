import React from 'react';
import PropTypes from 'prop-types';
import { useStoreActions } from 'easy-peasy';

const SearchResultVerse = ({ verses, onClick }) => {
  const { setTestingState } = useStoreActions(state => state.navigator);

  return (
    <div className="verse-block">
      <div className="result-list">
        <ul>
          {verses.map(({ verseId, verse, ang, writer, source, shabadId }, index) => (
            <li key={verseId} value={index} onClick={() => setTestingState('test')}>
              <div className="search-list span-color">
                <a className="panktee">
                  <span className="span-color">{`Ang ${ang} `}</span>
                  <span className="gurmukhi">{verse}</span>
                  <div className="search-list-footer">{`${writer}, ${source}`}</div>
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

SearchResultVerse.propTypes = {
  verses: PropTypes.any,
  onClick: PropTypes.func,
};

export default SearchResultVerse;
