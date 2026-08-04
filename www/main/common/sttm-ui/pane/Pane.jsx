import React from 'react';
import PropTypes from 'prop-types';
import PaneContent from './PaneContent';
import PaneFooter from './PaneFooter';
import PaneHeader from './PaneHeader';

// Shared so the default keeps one identity across renders, as `defaultProps`
// did; a fresh `{}` per render would defeat memoisation in anything downstream.
const NO_DATA = {};

const Pane = ({ content = null, header = null, footer = null, className = '', data = NO_DATA }) => (
  <div className={`pane ${className}`.trim()}>
    {header ? <PaneHeader Header={header} data={data} /> : ''}
    {content ? <PaneContent Content={content} data={data} /> : ''}
    {footer ? <PaneFooter Footer={footer} data={data} /> : ''}
  </div>
);

Pane.propTypes = {
  content: PropTypes.any,
  header: PropTypes.any,
  footer: PropTypes.any,
  className: PropTypes.string,
  data: PropTypes.any,
};

export default Pane;
