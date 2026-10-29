import { useEffect, useState } from 'react';
import { loadShabad } from '../../navigator/utils';
import { getShabadDetails } from './use-shabad-info';
import { fetchRaag } from '../utils/raags';

// The shabad's raag (0 is "No Raag"), copied out of Realm.
const getRaag = (verses) => {
  const raag = verses.map((v) => v.Raag).find((r) => r?.RaagID > 0 && r.RaagEnglish);
  return raag ? { id: raag.RaagID, english: raag.RaagEnglish, gurmukhi: raag.RaagGurmukhi } : null;
};

// What the shabad overview slide shows: the home line, the raag and writer, and
// the raag's description from BaniDB once it's fetched (none offline, or for
// raags without one). None while a newly asked for shabad loads.
export const useShabadOverview = (shabadId, verseId) => {
  const [overview, setOverview] = useState({ shabadId: null });

  useEffect(() => {
    let isCurrent = true;
    if (shabadId) {
      loadShabad(shabadId).then((verses) => {
        if (!isCurrent) return;
        const homeVerse = verses.find((verse) => verse.ID === verseId) || verses[0];
        const { writer } = getShabadDetails(verses);
        const raag = getRaag(verses);
        setOverview({
          shabadId,
          verseId,
          homeVerse: homeVerse?.Gurmukhi,
          writer,
          raag,
          description: null,
        });

        if (raag) {
          fetchRaag(raag.id)
            .then((raagInfo) => {
              const description = raagInfo?.Overview?.trim();
              if (isCurrent && description) {
                setOverview((current) => ({ ...current, description }));
              }
            })
            .catch((err) => {
              /* eslint-disable-next-line no-console */
              console.error('Failed to fetch the raag description:', err.message);
            });
        }
      });
    }
    return () => {
      isCurrent = false;
    };
  }, [shabadId, verseId]);

  return shabadId && overview.shabadId === shabadId && overview.verseId === verseId
    ? overview
    : null;
};
