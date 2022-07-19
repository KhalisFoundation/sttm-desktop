import Noty from 'noty';
import qrCode from 'qrcode';

const remote = require('@electron/remote');
const { i18n } = remote.require('./app');

const generateQrCode = (canvas, syncCode) => {
  if (syncCode && canvas) {
    let url;
    if (process.env.NODE_ENV === 'development') {
      url = `http://dev.sikhitothemax.org/control/${syncCode}`;
    } else {
      url = `https://sttm.co/control/${syncCode}`;
    }
    qrCode.toCanvas(canvas, url, error => {
      if (error) {
        new Noty({
          type: 'error',
          text: `${i18n.t('TOOLBAR.QR_CODE.ERROR')} : ${error}`,
          timeout: 5000,
          modal: true,
        }).show();
      }
    });
  }
};

export default generateQrCode;
