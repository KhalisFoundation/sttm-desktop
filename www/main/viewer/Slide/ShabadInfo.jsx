import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';
import { loadShabad } from '../../navigator/utils';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

// A shabad's source, Ang, writer and raag in a corner or edge of the slide. Shown
// for a few seconds when a shabad opens (staying through line changes), or
// always, depending on the "Shabad Info on Display" setting.

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
export const ShabadInfo = ({ verse, color }) => {
  const {
    shabadInfo,
    shabadInfoPosition,
    shabadInfoFontSize,
    shabadInfoSource,
    shabadInfoAng,
    shabadInfoWriter,
    shabadInfoRaag,
  } = useStoreState((state) => state.userSettings);
  const [isVisible, setIsVisible] = useState(false);
  const [shabad, setShabad] = useState({ id: null, details: null });

  const shabadId = verse?.Shabads?.[0]?.ShabadID;

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
    if (!shabadId || !shabadInfo || shabadInfo === 'off') {
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

  // Until this shabad's details have loaded, show nothing rather than the last one's.
  const info = shabad.id === shabadId ? shabad.details : null;
  if (!info) {
    return null;
  }

  const details = [
    shabadInfoSource && info.source,
    shabadInfoAng && info.ang && `${i18n.t('SETTINGS.SHABAD_INFO_ANG_LABEL')} ${info.ang}`,
    shabadInfoWriter && info.writer,
    shabadInfoRaag && info.raag,
  ].filter(Boolean);

  if (!details.length) {
    return null;
  }

  return (
    <div
      className={`shabad-info shabad-info--${shabadInfoPosition || 'bottom-center'} ${
        isVisible ? 'shabad-info--visible' : ''
      }`}
      style={{ color, fontSize: `${shabadInfoFontSize || 2}vh` }}
    >
      {details.join('  ·  ')}
    </div>
  );
};

ShabadInfo.propTypes = {
  verse: PropTypes.object,
  color: PropTypes.string,
};
