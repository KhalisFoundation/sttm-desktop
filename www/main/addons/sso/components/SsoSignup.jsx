import React, { useState } from 'react';

export const SsoSignup = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submitForm = () => {
    // Signup code will go here
    console.log('Signup called');
  };

  return (
    <div className="sso-login">
      <div className="sso-login-heading">Create your account</div>
      <form onSubmit={submitForm}>
        <label>
          Username:
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          Password:
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="button login-btn" type="submit" onClick={submitForm}>
          Signup
        </button>
      </form>
    </div>
  );
};
