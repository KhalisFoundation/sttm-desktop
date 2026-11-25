import React from 'react';
import PropTypes from 'prop-types';

import OverlayCategories from './OverlayCategories';
import { i18n } from '../../common/i18n';

// Sidebar categories are collapsible sections; toolbar categories are plain groups.
const OverlaySettingsContainer = ({ settingsObj, variant }) =>
  Object.keys(settingsObj)
    .filter((cat) => settingsObj[cat].type === 'title')
    .map((cat) => {
      const category = settingsObj[cat];
      if (variant === 'sidebar') {
        return (
          <details key={cat} id={cat} className="overlay-section" open>
            <summary>{i18n.t(`BANI_OVERLAY.${category.title}`)}</summary>
            <div className="overlay-section-body">
              <OverlayCategories category={category} />
            </div>
          </details>
        );
      }
      return (
        <div key={cat} id={cat} className="overlay-toolbar-group">
          <OverlayCategories category={category} />
        </div>
      );
    });

OverlaySettingsContainer.propTypes = {
  settingsObj: PropTypes.object,
  variant: PropTypes.oneOf(['sidebar', 'toolbar']),
};

export default OverlaySettingsContainer;
