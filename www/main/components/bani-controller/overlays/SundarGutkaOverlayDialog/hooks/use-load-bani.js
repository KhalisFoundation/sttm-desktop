import { useState, useEffect } from 'react';
import Noty from 'noty';

import { loadBanis } from '../../../../../banidb';
import cache from '../bani-cache';

const useLoadBani = () => {
  const [isLoadingBani, setLoadingBani] = useState(false);
  const [baniData, setBaniData] = useState(cache.baniData);

  useEffect(() => {
    setLoadingBani(true);

    // load sundar gutka bani if there is no data in cache.
    if (!baniData.length) {
      (async () => {
        try {
          const rows = await loadBanis();
          // console.log(rows, 'rows..');
          setBaniData(rows);
        } catch (error) {
          setLoadingBani(false);
          new Noty({
            type: 'error',
            text: `Was error loading bani : ${error}`,
            timeout: 5000,
            modal: true,
          }).show();
        }
      })();
    }

    setLoadingBani(false);
  });

  return {
    isLoadingBani,
    baniData,
  };
};

export default useLoadBani;
