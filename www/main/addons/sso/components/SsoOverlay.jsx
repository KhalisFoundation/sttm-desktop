import React, { useState } from 'react';
import { Overlay } from '../../../common/sttm-ui';
import { SsoLogin } from './SsoLogin';
import { SsoSignup } from './SsoSignup';

export const SsoOverlay = () => {
  const [activeTab, setActiveTab] = useState('login');

  const navItems = [
    {
      name: 'Login',
      onClick: () => setActiveTab('login'),
    },
    {
      name: 'Signup',
      onClick: () => setActiveTab('signup'),
    },
  ];

  return (
    <Overlay className="overlay-sso">
      <div className="sso-wrapper">
        <header className="sso-header">Connect your account</header>
        <div className="sso-container">
          <nav className="sso-nav">
            {navItems.map(({ name, onClick }) => (
              <div
                key={name}
                className={`sso-nav-item ${activeTab === name.toLowerCase() ? 'active' : ''}`}
                onClick={onClick}
              >
                {name}
              </div>
            ))}
          </nav>
          {activeTab === 'login' ? <SsoLogin /> : <SsoSignup />}
        </div>
      </div>
    </Overlay>
  );
};
