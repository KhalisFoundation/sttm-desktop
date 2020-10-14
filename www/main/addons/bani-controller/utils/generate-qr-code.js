import Noty from 'noty';
import qrCode from 'qrcode';
import { remote } from 'electron';

const { i18n } = remote.require('./app');

const generateQrCode = (canvas, syncCode) => {
  if (syncCode && canvas) {
    qrCode.toCanvas(canvas, `https:/sttm.co/control/${syncCode}`, error => {
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
