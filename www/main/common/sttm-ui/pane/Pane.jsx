import React from 'react';
import PropTypes from 'prop-types';
import PaneContent from './PaneContent';
import PaneFooter from './PaneFooter';
import PaneHeader from './PaneHeader';

const Pane = ({ content, header, footer, className, data }) => (
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

Pane.defaultProps = {
  content: null,
  header: null,
  footer: null,
  className: '',
  data: {},
};

export default Pane;
