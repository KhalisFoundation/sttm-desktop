import { useState, useEffect } from 'react';
import Noty from 'noty';

import { loadBanis } from '../../../../banidb';
import convertDbProxyToArray from '../../utils/convert-db-proxy-to-array';
import cache from '../bani-cache';

const useLoadBani = () => {
  const [isLoadingBanis, setLoadingBanis] = useState(false);
  const [banis, setBanis] = useState(cache.banis);

  useEffect(() => {
    const fetchBanisFromDb = async () => {
      setLoadingBanis(true);
      try {
        const dbProxyObj = await loadBanis();
        // resolving proxy
        const banisArr = convertDbProxyToArray(dbProxyObj);
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
    };

    // load sundar gutka bani if there is no banis in cache.
    if (!banis.length) {
      fetchBanisFromDb();
    }
  }, []);

  return {
    isLoadingBanis,
    banis,
  };
};

export default useLoadBani;
