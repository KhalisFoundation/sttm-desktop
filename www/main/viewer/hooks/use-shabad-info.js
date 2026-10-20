import { useEffect, useState } from 'react';
import { useStoreState } from 'easy-peasy';
import { loadShabad } from '../../navigator/utils';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

// The shabad's details, not the current line's: a heading line has no writer,
// and the Ang is where the shabad starts (lines can run onto the next Ang).
const getShabadDetails = (verses) => {
  const first = (pick) => verses.map(pick).find(Boolean);
  return {
    source: first((v) => v.Source?.SourceEnglish),
    ang: first((v) => v.PageNo),
    writer: first((v) => v.Writer?.WriterEnglish),
    raag: first((v) => v.Raag?.RaagEnglish),
  };
};

// The shabad info to show on the display right now: none when it's off, while
// the shabad's details load, or once the "Show for n seconds" time is up.
// Showing stays through line changes and restarts when another shabad opens.
export const useShabadInfo = (verse) => {
  const { shabadInfo, shabadInfoSource, shabadInfoAng, shabadInfoWriter, shabadInfoRaag } =
    useStoreState((state) => state.userSettings);
  const [isVisible, setIsVisible] = useState(false);
  const [shabad, setShabad] = useState({ id: null, details: null });

  const isOn = !!shabadInfo && shabadInfo !== 'off';
  const shabadId = isOn ? verse?.Shabads?.[0]?.ShabadID : undefined;

  useEffect(() => {
    let isCurrent = true;
    if (shabadId) {
      loadShabad(shabadId).then((verses) => {
        if (isCurrent) setShabad({ id: shabadId, details: getShabadDetails(verses) });
      });
    }
    return () => {
      isCurrent = false;
    };
  }, [shabadId]);

  useEffect(() => {
    if (!shabadId) {
      setIsVisible(false);
      return undefined;
    }
    setIsVisible(true);
    if (shabadInfo === 'always') {
      return undefined;
    }
    const timeout = setTimeout(() => setIsVisible(false), parseInt(shabadInfo, 10) * 1000);
    return () => clearTimeout(timeout);
  }, [shabadId, shabadInfo]);

  // Until this shabad's details have loaded, show none rather than the last one's.
  const info = isVisible && shabad.id === shabadId ? shabad.details : null;
  if (!info) {
    return [];
  }
  return [
    shabadInfoSource && info.source,
    shabadInfoAng && info.ang && `${i18n.t('SETTINGS.SHABAD_INFO_ANG_LABEL')} ${info.ang}`,
    shabadInfoWriter && info.writer,
    shabadInfoRaag && info.raag,
  ].filter(Boolean);
};
