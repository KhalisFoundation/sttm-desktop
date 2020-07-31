import Noty from 'noty';
import qrCode from 'qrcode';
export const generateQrCode = (canvas, syncCode = 'sample') => {
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
};
