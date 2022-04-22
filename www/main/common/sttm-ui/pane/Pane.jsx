import React from 'react';
import PropTypes from 'prop-types';
import PaneContent from './PaneContent';
import PaneFooter from './PaneFooter';
import PaneHeader from './PaneHeader';

function Pane({ content, header, footer, className }) {
  return (
    <div className={`pane ${className}`.trim()}>
      {header ? <PaneHeader Header={header} /> : ''}
      {content ? <PaneContent Content={content} /> : ''}
      {footer ? <PaneFooter Footer={footer} /> : ''}
    </div>
  );
}

Pane.propTypes = {
  content: PropTypes.any,
  header: PropTypes.any,
  footer: PropTypes.any,
  className: PropTypes.string,
};

Pane.defaultProps = {
  content: null,
  header: null,
  footer: null,
  className: '',
};

export default Pane;
