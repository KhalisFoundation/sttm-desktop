import { useState, useEffect } from 'react';
import Noty from 'noty';

import { loadCeremonies } from '../../../../banidb';
import cache from '../ceremonies-cache';

const useLoadCeremonies = () => {
  const [isLoadingCeremonies, setLoadingCeremonies] = useState(false);
  const [ceremonies, setCeremonies] = useState(cache.ceremonies);

  useEffect(() => {
    const fetchCeremoniesFromDb = async () => {
      try {
        // rows are proxy here
        const rows = await loadCeremonies();

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
        setCeremonies(banisArr);
      } catch (error) {
        new Noty({
          type: 'error',
          text: `Was error loading ceremonies : ${error}`,
          timeout: 5000,
          modal: true,
        }).show();
      }
    };

    // load ceremonies if there is no ceremonies in cache.
    (async () => {
      setLoadingCeremonies(true);
      if (!ceremonies.length) {
        await fetchCeremoniesFromDb();
      }
      setLoadingCeremonies(false);
    })();
  }, []);

  return {
    isLoadingCeremonies,
    ceremonies,
  };
};

export default useLoadCeremonies;
