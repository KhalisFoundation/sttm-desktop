import React from 'react';
import PropTypes from 'prop-types';
import Pane from '../../../common/sttm-ui/pane/Pane';
import SearchContent from './SearchContent';
import SearchFooter from './SearchFooter';
import SearchHeader from './SearchHeader';

const SearchPane = ({ className }) => (
  <div className={`search-pane ${className}`}>
    <Pane header={SearchHeader} content={SearchContent} footer={SearchFooter} />
  </div>
);

SearchPane.propTypes = {
  className: PropTypes.string,
};

export default SearchPane;
