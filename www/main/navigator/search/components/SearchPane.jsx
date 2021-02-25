import React from 'react';
import Pane from '../../utils/Pane';
import SearchContent from './SearchContent';
import SearchHeader from './SearchHeader';

function SearchPane() {
  return (
    <div className="search-pane">
      <Pane Header={SearchHeader} Content={SearchContent} />
    </div>
  );
}

export default SearchPane;
