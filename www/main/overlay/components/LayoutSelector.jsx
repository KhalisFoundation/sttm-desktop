import React from 'react';
import PropTypes from 'prop-types';
import { i18n } from '../../common/i18n';

// Each icon is a 16:9 frame showing where the overlay sits on screen.
const layouts = {
  top: <rect x="0" y="0" width="34" height="6" />,
  bottom: <rect x="0" y="14" width="34" height="6" />,
  split: (
    <>
      <rect x="0" y="0" width="34" height="4" />
      <rect x="0" y="16" width="34" height="4" />
    </>
  ),
  vertical: <rect x="17" y="0" width="17" height="20" />,
  classic: <rect x="4" y="12" width="26" height="5" rx="1.5" />,
};

const LayoutSelector = ({ value, onChange }) => (
  <div className="overlay-layouts" role="group" aria-label={i18n.t('BANI_OVERLAY.LAYOUT')}>
    {Object.keys(layouts).map((layout) => (
      <button
        key={layout}
        type="button"
        data-layout={layout}
        aria-pressed={layout === value}
        onClick={() => layout !== value && onChange(layout)}
      >
        <svg viewBox="0 0 34 20" aria-hidden="true">
          <rect className="frame" x="0.6" y="0.6" width="32.8" height="18.8" rx="2" />
          <g className="fill">{layouts[layout]}</g>
        </svg>
        {i18n.t(`BANI_OVERLAY.LAYOUT_${layout.toUpperCase()}`)}
      </button>
    ))}
  </div>
);

LayoutSelector.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func,
};

export default LayoutSelector;
