import React from 'react';
import PropTypes from 'prop-types';
import { remote } from 'electron';

const { i18n } = remote.require('./app');

const QrCode = props => {
  return (
    <div className="qr-container">
      <div className="qr-desc">{i18n.t('TOOLBAR.QR_CODE.DESC')}</div>
      <canvas ref={props.canvasRef} className="qr-bani-ctr" />
      <div className="qr-title">{i18n.t('TOOLBAR.BANI_CONTROLLER')}</div>
    </div>
  );
};

QrCode.propTypes = {
  canvasRef: PropTypes.object,
};

export default QrCode;
