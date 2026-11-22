import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

const punctuation = {
  Backquote: '`',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Equal: '=',
  Minus: '-',
  Period: '.',
  Quote: "'",
  Semicolon: ';',
  Slash: '/',
};

// Character a key code stands for, if it depends on the keyboard layout
const layoutCharacter = (code) =>
  code.startsWith('Key') ? code.slice(3).toLowerCase() : punctuation[code];

// Letters and symbols follow the layout. Digits and other keys stay physical,
// as do layouts that type no Latin characters (e.g. Gurmukhi).
const matchesKey = (event, code) => {
  const character = layoutCharacter(code);
  const typesLatin = /^[\x20-\x7e]$/.test(event.key);
  if (!character || !typesLatin) {
    return event.code === code;
  }
  return event.key.toLowerCase() === character;
};

export const useKeys = (key, shortcutType, cb) => {
  const callbackRef = useRef(cb);

  useEffect(() => {
    callbackRef.current = cb;
  });

  useEffect(() => {
    const handle = (event) => {
      if (!event.target.classList.contains('disable-kb-shortcuts')) {
        const defaultException = ['Space', 'ArrowUp', 'ArrowDown'];
        if (defaultException.includes(event.code)) {
          event.preventDefault();
        }

        if (shortcutType === 'single') {
          if (matchesKey(event, key)) {
            callbackRef.current(event);
          }
        }
        if (shortcutType === 'combination') {
          if (matchesKey(event, key) && (event.ctrlKey || event.metaKey)) {
            callbackRef.current(event);
          }
        }
      }
    };

    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [key]);
};

useKeys.propTypes = {
  key: PropTypes.string,
  cb: PropTypes.function,
};
