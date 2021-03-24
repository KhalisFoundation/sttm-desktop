import React from 'react';
import Pane from '../../../common/sttm-ui/pane/Pane';
import SearchContent from './SearchContent';
import SearchFooter from './SearchFooter';
import SearchHeader from './SearchHeader';

function SearchPane() {
  return (
    <div className="search-pane">
      <Pane header={SearchHeader} content={SearchContent} footer={SearchFooter} />
    </div>
  );
}

export default SearchPane;
