import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';
import { loadShabad } from '../../navigator/utils';
import ViewerIcon from '../icons/ViewerIcon';

const remote = require('@electron/remote');

const { i18n } = remote.require('./app');

// A bar under the slide with the logo and the shabad's source, Ang, writer and
// raag. The details show for a few seconds when a shabad opens (staying through
// line changes), or always, depending on the "Show on Display" setting; the bar
// itself stays so the slide doesn't move when they hide.

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

  // Until this shabad's details have loaded, show none rather than the last one's.
  const info = shabad.id === shabadId ? shabad.details : null;
  const details = info
    ? [
        shabadInfoSource && info.source,
        shabadInfoAng && info.ang && `${i18n.t('SETTINGS.SHABAD_INFO_ANG_LABEL')} ${info.ang}`,
        shabadInfoWriter && info.writer,
        shabadInfoRaag && info.raag,
      ].filter(Boolean)
    : [];

  return (
    <div className={`shabad-info ${isVisible ? 'shabad-info--visible' : ''}`}>
      <ViewerIcon className="shabad-info__logo" />
      <div
        className="shabad-info__text"
        style={{ color, fontSize: `${shabadInfoFontSize || 2}vh` }}
      >
        {details.map((detail) => (
          <span key={detail} className="shabad-info__detail">
            {detail}
          </span>
        ))}
      </div>
    </div>
  );
};

ShabadInfo.propTypes = {
  verse: PropTypes.object,
  color: PropTypes.string,
};
