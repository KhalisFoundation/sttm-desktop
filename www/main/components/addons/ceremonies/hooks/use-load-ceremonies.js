import { useState, useEffect } from 'react';
import Noty from 'noty';

import { loadCeremonies } from '../../../../banidb';
import convertDbProxyToArray from '../../utils/convert-db-proxy-to-array';
import cache from '../ceremonies-cache';

const useLoadCeremonies = () => {
  const [isLoadingCeremonies, setLoadingCeremonies] = useState(false);
  const [ceremonies, setCeremonies] = useState(cache.ceremonies);

  useEffect(() => {
    const fetchCeremoniesFromDb = async () => {
      setLoadingCeremonies(true);

      try {
        const dbProxyObj = await loadCeremonies();
        // resolving proxy
        const ceremoniesArr = convertDbProxyToArray(dbProxyObj);
        cache.ceremonies = ceremoniesArr;
        setCeremonies(ceremoniesArr);
      } catch (error) {
        new Noty({
          type: 'error',
          text: `Was error loading ceremonies : ${error}`,
          timeout: 5000,
          modal: true,
        }).show();
      } finally {
        setLoadingCeremonies(false);
      }
    };

    // load ceremonies if there is no ceremonies in cache.
    if (!ceremonies.length) {
      fetchCeremoniesFromDb();
    }
  }, []);

  return {
    isLoadingCeremonies,
    ceremonies,
  };
};

export default useLoadCeremonies;
