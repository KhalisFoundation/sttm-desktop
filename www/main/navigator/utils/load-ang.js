import Noty from 'noty';
import banidb from '../../banidb';
import { i18n } from '../../common/i18n';

export const loadAng = (angNo) =>
  banidb
    .loadAng(angNo)
    .then((verses) => verses)
    .catch((err) => {
      new Noty({
        type: 'error',
        text: `${i18n.t('BANI.LOAD_ERROR', { erroneousOperation: 'Ang' })} : ${err}`,
        timeout: 5000,
        modal: true,
      }).show();
    });
