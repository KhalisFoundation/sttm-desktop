import Noty from 'noty';
import copy from 'copy-to-clipboard';

const anvaad = require('anvaad-js');
const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

export const copyToClipboard = (activeVerseRef) => {
  if (activeVerseRef && activeVerseRef.current) {
    const nonUniCodePanktee = activeVerseRef.current.childNodes[1].innerText;
    const uniCodePanktee = anvaad.unicode(nonUniCodePanktee);
    copy(uniCodePanktee);
    new Noty({
      type: 'info',
      text: `${i18n.t('SHORTCUT.COPY_TO_CLIPBOARD')}`,
      timeout: 2000,
    }).show();
  }
};
