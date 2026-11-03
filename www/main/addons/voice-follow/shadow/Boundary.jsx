import React from 'react';
import PropTypes from 'prop-types';

const { logFault } = require('./diag');

// A render fault anywhere in the collector's UI (the first-launch card, the sharing
// indicator) unmounts that piece and logs it; STTM itself never blanks for it.
export default class CollectorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    logFault(`render ${this.props.name || 'collector'}`, error);
  }

  render() {
    const { failed } = this.state;
    const { children } = this.props;
    return failed ? null : children;
  }
}

CollectorBoundary.propTypes = {
  name: PropTypes.string,
  children: PropTypes.node,
};
