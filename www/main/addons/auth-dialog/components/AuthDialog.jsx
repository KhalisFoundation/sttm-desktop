import { useStoreState } from 'easy-peasy';
import { ipcRenderer, shell } from 'electron';

import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import isOnline from 'is-online';

import { Overlay } from '../../../common/sttm-ui';
import { SP_API } from '../../../common/constants/api-urls';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

const AuthDialog = ({ onScreenClose, className }) => {
  const { userToken } = useStoreState((state) => state.app);
  const [userInfo, setUserInfo] = useState();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const onlineValue = isOnline();
    onlineValue.then((data) => {
      setConnected(data);
    });
  }, []);

  const fetchInfo = async () => {
    const response = await fetch(`${SP_API}/user`, {
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    });
    return response.json().then((data) => data);
  };

  useEffect(() => {
    fetchInfo().then((data) => {
      setUserInfo(data);
    });
  }, [userToken]);

  return (
    <Overlay onScreenClose={onScreenClose} className={className}>
      <div className="addon-wrapper sync-wrapper overlay-ui ui-sync-button auth-wrapper">
        {connected ? (
          <div className="sync overlay-ui ui-sync-button">
            <header className="sync-header">
              {userToken ? i18n.t('AUTH.LOGOUT_LABEL') : i18n.t('AUTH.LOGIN_LABEL')}
            </header>
            <div className="sync-content-wrapper">
              <div className="sync-content auth-content">
                <h1>
                  {userInfo
                    ? i18n.t('AUTH.LOGGED_IN_GREETING', { firstName: userInfo.firstname })
                    : i18n.t('AUTH.LOGIN_LABEL')}
                </h1>
                <p>
                  {userInfo
                    ? i18n.t('AUTH.LOGGED_IN_DESC', { email: userInfo.email })
                    : i18n.t('AUTH.LOGIN_DESC')}
                </p>
                {userToken ? (
                  <button
                    className="button auth-button logout-button"
                    onClick={async () => {
                      global.analytics.trackEvent({
                        category: 'User Authentication',
                        action: 'Logout',
                        label: 'Logout',
                        value: 'logged out',
                      });
                      ipcRenderer.emit('userToken', '');
                      ipcRenderer.send('deleteToken');
                      setUserInfo('');
                      onScreenClose();
                    }}
                  >
                    <i className="fa-solid fa-right-from-bracket"></i>
                    {i18n.t('AUTH.LOGOUT_LABEL')}
                  </button>
                ) : (
                  <button
                    className="button auth-button login-button"
                    onClick={() => {
                      global.analytics.trackEvent({
                        category: 'User Authentication',
                        action: 'Login',
                        label: 'Login',
                        value: 'logged in',
                      });
                      shell.openExternal(`${SP_API}/login/sso`);
                    }}
                  >
                    <i className="fa-solid fa-right-to-bracket"></i>
                    {i18n.t('AUTH.LOGIN_LABEL')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="sync overlay-ui ui-sync-button">
            <header className="sync-header">{i18n.t('AUTH.LOGIN_LABEL')}</header>
            <div className="sync-content-wrapper">
              <div className="sync-content auth-content">
                <p>{i18n.t('AUTH.INTERNET_ERR')}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Overlay>
  );
};

AuthDialog.propTypes = {
  onScreenClose: PropTypes.func,
  className: PropTypes.string,
};

export default AuthDialog;
