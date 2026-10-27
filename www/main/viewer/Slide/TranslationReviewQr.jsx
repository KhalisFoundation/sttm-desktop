import React from 'react';
import PropTypes from 'prop-types';
import { i18n } from '../../common/i18n';

const { settings } = require('../../../configs/user-settings.json');

const sourceOptions = settings['translation-english-source'].options;

// The right end of the shabad info bar: asks how the English translation is,
// with a QR code linking to the shabad's review page, where the sangat can give
// feedback on it. The code is on white so it scans on any theme.
export const TranslationReviewQr = ({ src, source, color }) => (
  <div className="translation-review-qr">
    <div className="translation-review-qr__text" style={{ color }}>
      <span className="translation-review-qr__title">{i18n.t('TRANSLATION_REVIEW.TITLE')}</span>
      <span className="translation-review-qr__subtitle">
        {i18n.t('TRANSLATION_REVIEW.SUBTITLE', {
          source: i18n.t(`SETTINGS.${sourceOptions[source]}`),
        })}
      </span>
    </div>
    <img className="translation-review-qr__code" src={src} alt="" />
  </div>
);

TranslationReviewQr.propTypes = {
  src: PropTypes.string.isRequired,
  source: PropTypes.string.isRequired,
  color: PropTypes.string,
};
