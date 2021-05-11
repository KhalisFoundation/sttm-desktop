import React from 'react';
import PropTypes from 'prop-types';
import PaneContent from './PaneContent';
import PaneFooter from './PaneFooter';
import PaneHeader from './PaneHeader';

function Pane({ content, header, footer }) {
  return (
    <div className="pane">
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
};

export default Pane;
