import { useStoreActions } from 'easy-peasy';
import isOnline from 'is-online';
import { remote } from 'electron';

import { shareSync } from '.';

const { tryConnection } = shareSync;

const { setListeners } = useStoreActions(actions => actions.app);
const { setConnection } = useStoreActions(actions => actions.baniController);

const { i18n } = remote.require('./app');

const newConnection = async () => {
  const connectionCreds = {
    newCode: null,
    newAdminPin: null,
    error: null,
  };
  const onlineValue = await isOnline();
  if (onlineValue) {
    const newCode = await tryConnection();

    if (newCode) {
      const newAdminPin = Math.floor(1000 + Math.random() * 8999);

      connectionCreds.newCode = newCode;
      connectionCreds.adminPin = newAdminPin;

      setConnection(true);
      setListeners(true);
    } else {
      connectionCreds.error = i18n.t('TOOLBAR.SYNC_CONTROLLER.CODE_ERR');
    }
  } else {
    connectionCreds.error = i18n.t('TOOLBAR.SYNC_CONTROLLER.INTERNET_ERR');
  }

  return connectionCreds;
};

export default newConnection;
