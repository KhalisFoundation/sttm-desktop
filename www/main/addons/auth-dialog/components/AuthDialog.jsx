import { useStoreState } from 'easy-peasy';
import { ipcRenderer, shell } from 'electron';

import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import keytar from 'keytar';

import { Overlay } from '../../../common/sttm-ui';
import { SP_API } from '../../../common/constants/api-urls';

const AuthDialog = ({ onScreenClose, className }) => {
  const { userToken } = useStoreState((state) => state.app);
  const [userInfo, setUserInfo] = useState();

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
        <div className="sync overlay-ui ui-sync-button">
          <header className="sync-header">{userToken ? 'Logout' : 'Login'}</header>
          <div className="sync-content-wrapper">
            <div className="sync-content auth-content">
              <h1>{userInfo ? `Welcome ${userInfo.firstname}` : 'Login'}</h1>
              <p>{userInfo && `Logged in as ${userInfo.email}`}</p>
              {userToken ? (
                <button
                  className="button auth-button logout-button"
                  onClick={async () => {
                    await keytar.deletePassword('sttm-desktop', 'userToken');
                    ipcRenderer.emit('userToken', '');
                    setUserInfo('');
                    onScreenClose();
                  }}
                >
                  <i className="fa-solid fa-right-from-bracket"></i>
                  Logout
                </button>
              ) : (
                <button
                  className="button auth-button login-button"
                  onClick={() => {
                    shell.openExternal(`${SP_API}/login/sso`);
                  }}
                >
                  <i className="fa-solid fa-right-to-bracket"></i>
                  Login
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Overlay>
  );
};

AuthDialog.propTypes = {
  onScreenClose: PropTypes.func,
  className: PropTypes.string,
};

export default AuthDialog;
