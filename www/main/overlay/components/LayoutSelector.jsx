import React from 'react';
import PropTypes from 'prop-types';

const LayoutSelector = ({ changeLayout }) => {
  const layouts = ['top', 'bottom', 'split', 'vertical', 'classic'];
  const layoutMarkup = layouts.map(layout => (
    <div
      key={`layout-${layout}`}
      className={`layout-btn ${layout}`}
      data-layout={layout}
      onClick={changeLayout}
    >
      <div className="layout-bar layout-bar-1"></div>
      <div className="layout-bar layout-bar-2"></div>
      <div className="layout-bar layout-bar-3"></div>
      <div className="layout-bar layout-bar-4"></div>
      <div className="layout-vertical-bar"></div>
      <div className="layout-classic-bar"></div>
    </div>
  ));
  return layoutMarkup;
};

LayoutSelector.propTypes = {
  changeLayout: PropTypes.func,
};

export default LayoutSelector;
