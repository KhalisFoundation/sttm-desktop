import React, { useState } from 'react';

function InputBox({ placeholder }) {
  const [text, setText] = useState('');
  const handleChange = event => {
    setText(event.target.value);
  };
  return (
    <div className="input-box">
      <input type="search" placeholder={placeholder} value={text} onChange={handleChange} />
    </div>
  );
}

export default InputBox;
