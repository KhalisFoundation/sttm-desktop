import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

export const useKeys = (key, shortcutType, cb) => {
  const callbackRef = useRef(cb);

  useEffect(() => {
    callbackRef.current = cb;
  });

  useEffect(() => {
    function handle(event) {
      if (shortcutType === 'single') {
        if (event.code === key) {
          callbackRef.current(event);
        }
      }
      if (shortcutType === 'combination') {
        if (event.code === key && event.ctrlKey) {
          callbackRef.current(event);
        }
      }
    }

    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [key]);
};

useKeys.propTypes = {
  key: PropTypes.string,
  cb: PropTypes.function,
};
