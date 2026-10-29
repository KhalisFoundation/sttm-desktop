import { useEffect, useState } from 'react';
import { loadShabad } from '../../navigator/utils';
import { getShabadDetails } from './use-shabad-info';

// The shabad's raag (0 is "No Raag") and what it's about, copied out of Realm.
// Older databases don't have the raags' descriptions.
const getRaag = (verses) => {
  const raag = verses.map((v) => v.Raag).find((r) => r?.RaagID > 0 && r.RaagEnglish);
  return raag
    ? {
        english: raag.RaagEnglish,
        gurmukhi: raag.RaagGurmukhi,
        description: raag.Overview?.trim(),
      }
    : null;
};

// What the shabad overview slide shows: the home line, the raag and writer, and
// the raag's description. None while a newly asked for shabad loads.
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
          description: raag?.description || null,
        });
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
