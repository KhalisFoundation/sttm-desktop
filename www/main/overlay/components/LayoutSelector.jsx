import React from 'react';
import PropTypes from 'prop-types';
import { i18n } from '../../common/i18n';

// Layouts come from the "layout" setting's options in configs/overlay.json.
// Each icon is a list of [x, y, width, height, cornerRadius?] boxes drawn in a
// 34x20 frame (16:9-ish), showing where the overlay sits on the screen.
const LayoutSelector = ({ options, value, onChange }) => (
  <div className="overlay-layouts" role="group" aria-label={i18n.t('BANI_OVERLAY.LAYOUT')}>
    {Object.keys(options).map((layout) => (
      <button
        key={layout}
        type="button"
        data-layout={layout}
        aria-pressed={layout === value}
        onClick={() => layout !== value && onChange(layout)}
      >
        <svg viewBox="0 0 34 20" aria-hidden="true">
          <rect className="frame" x="0.6" y="0.6" width="32.8" height="18.8" rx="2" />
          {options[layout].icon.map(([x, y, width, height, radius = 0]) => (
            <rect
              key={`${x}-${y}`}
              className="fill"
              x={x}
              y={y}
              width={width}
              height={height}
              rx={radius}
            />
          ))}
        </svg>
        {i18n.t(`BANI_OVERLAY.${options[layout].label}`)}
      </button>
    ))}
  </div>
);

LayoutSelector.propTypes = {
  options: PropTypes.object,
  value: PropTypes.string,
  onChange: PropTypes.func,
};

export default LayoutSelector;
