import React from 'react';
import PropTypes from 'prop-types';

const SearchResults = ({ ang, onClick, shabadId, source, verse, verseId, writer }) => {
  return (
    <li onClick={() => onClick(shabadId, verseId)}>
      <div className="search-list span-color">
        <a className="panktee">
          <span className="span-color">{`Ang ${ang} `}</span>
          <span className="gurmukhi">{verse}</span>
          <div className="search-list-footer">{`${writer}, ${source}`}</div>
        </a>
      </div>
    </li>
  );
};

SearchResults.propTypes = {
  ang: PropTypes.number,
  onClick: PropTypes.func,
  shabadId: PropTypes.number,
  source: PropTypes.string,
  verse: PropTypes.string,
  verseId: PropTypes.number,
  writer: PropTypes.string,
};

export default SearchResults;
