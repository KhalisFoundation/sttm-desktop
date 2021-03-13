import React, { useState } from 'react';

function InputBox({ placeholder, className }) {
  const [text, setText] = useState('');
  const handleChange = event => {
    setText(event.target.value);
  };
  return (
    <>
      <input
        className={`input-box ${className}`}
        type="search"
        placeholder={placeholder}
        value={text}
        onChange={handleChange}
      />
    </>
  );
}

export default InputBox;
