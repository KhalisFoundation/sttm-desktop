import React from 'react';
import PropTypes from 'prop-types';
import Pane from '../../common/sttm-ui/pane/Pane';
import ShabadContent from './ShabadContent';
import ShabadHeader from './ShabadHeader';

const ShabadPane = ({ className }) => (
  <div className={`shabad-pane ${className}`}>
    <Pane header={ShabadHeader} content={ShabadContent} />
  </div>
);

ShabadPane.propTypes = {
  className: PropTypes.string,
};
export default ShabadPane;
