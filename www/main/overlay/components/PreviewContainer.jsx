import React from 'react';
import PropTypes from 'prop-types';

export const PreviewContainer = ({ url }) => {
  return (
    <section className="preview-container">
      <webview className="preview" src={url}></webview>
    </section>
  );
};

PreviewContainer.propTypes = {
  url: PropTypes.string,
};
