import { useState, useEffect } from 'react';
import Noty from 'noty';

import { loadBanis } from '../../../../banidb';
import cache from '../bani-cache';

const useLoadBani = () => {
  const [isLoadingBanis, setLoadingBanis] = useState(false);
  const [banis, setBanis] = useState(cache.banis);

  useEffect(() => {
    setLoadingBanis(true);
    console.log(banis, 'IN THE LOAD BANI');
    // load sundar gutka bani if there is no banis in cache.
    if (!banis.length) {
      (async () => {
        try {
          // rows are proxy here
          const rows = await loadBanis();

          // resolving proxy
          const banisObject = Object.assign({}, rows);
          const banisArr = Object.keys(banisObject).map(baniPosition => {
            const { ID, Gurmukhi, Token } = banisObject[baniPosition];
            return {
              id: ID,
              name: Gurmukhi,
              token: Token,
            };
          });
          cache.banis = banisArr;
          setBanis(banisArr);
        } catch (error) {
          new Noty({
            type: 'error',
            text: `Was error loading bani : ${error}`,
            timeout: 5000,
            modal: true,
          }).show();
        } finally {
          setLoadingBanis(false);
        }
      })();
    }

    setLoadingBanis(false);
  }, []);

  return {
    isLoadingBanis,
    banis,
  };
};

export default useLoadBani;
