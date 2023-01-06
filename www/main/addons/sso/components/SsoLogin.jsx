import axios from 'axios';
import React, { useState } from 'react';

export const SsoLogin = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submitForm = (e) => {
    e.preventDefault();
    axios
      .post('http://localhost:3030/login', {
        username,
        password,
      })
      .then((response) => {
        console.log(response);
      })
      .catch((error) => {
        console.log(error);
      });
  };

  return (
    <div className="sso-login">
      <div className="sso-login-heading">Login to your account</div>
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
          Login
        </button>
      </form>
    </div>
  );
};
