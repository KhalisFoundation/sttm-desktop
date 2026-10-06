import React from 'react';
import PropTypes from 'prop-types';

import { IS_EXPERIMENTAL_BUILD } from '../../constants';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

// Marks experimental builds (from the experimental-release branch) so they aren't mistaken for stable
const ExperimentalBadge = ({ className }) => {
  if (!IS_EXPERIMENTAL_BUILD) {
    return null;
  }

  return (
    <div
      className={`experimental-badge ${className}`.trim()}
      title={i18n.t('EXPERIMENTAL.DESCRIPTION', { version: remote.app.getVersion() })}
    >
      <i className="fa fa-flask" /> {i18n.t('EXPERIMENTAL.LABEL')}
    </div>
  );
};

ExperimentalBadge.propTypes = {
  className: PropTypes.string,
};

ExperimentalBadge.defaultProps = {
  className: '',
};

export default ExperimentalBadge;
