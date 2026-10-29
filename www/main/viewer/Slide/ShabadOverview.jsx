import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { useShabadOverview } from '../hooks/use-shabad-overview';
import { useQrCode } from '../hooks/use-qr-code';
import { i18n } from '../../common/i18n';

const SHABAD_URL = 'https://sttm.co/s';

// A slide introducing the shabad, shown from the overview row above its lines
// in the shabad pane instead of them: the home line, the raag (in Gurmukhi) and writer
// on one line, what the raag is about, and a QR code to read the full shabad
// on SikhiToTheMax. Its text takes the verse slide's classes, so each theme
// colours it the same way: the home line as Gurbani, the rest as translation.
export const ShabadOverview = ({ shabadId, verseId }) => {
  const overview = useShabadOverview(shabadId, verseId);
  const qr = useQrCode(`${SHABAD_URL}/${shabadId}`);

  // The slide fills in as the details and QR code arrive.
  useEffect(() => {
    global.platform.ipc.send('cast-to-receiver');
  }, [overview, qr]);

  if (!overview) {
    return null;
  }

  return (
    <div className="shabad-overview">
      {overview.homeVerse && (
        <h1 className="shabad-overview__heading slide-gurbani">{overview.homeVerse}</h1>
      )}
      {(overview.raag || overview.writer) && (
        <p className="shabad-overview__byline slide-translation">
          {overview.raag && <span className="shabad-overview__raag">{overview.raag.gurmukhi}</span>}
          {overview.writer && <span className="shabad-overview__writer">{overview.writer}</span>}
        </p>
      )}
      {overview.description && (
        <p className="shabad-overview__description slide-translation">{overview.description}</p>
      )}
      {qr && (
        <div className="shabad-overview__qr">
          <span className="shabad-overview__qr-label slide-translation">
            {i18n.t('SHABAD_OVERVIEW.QR_LABEL')}
          </span>
          <img className="shabad-overview__qr-code" src={qr} alt="" />
        </div>
      )}
    </div>
  );
};

ShabadOverview.propTypes = {
  shabadId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  verseId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};
