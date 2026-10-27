import { useEffect, useState } from 'react';
import qrCode from 'qrcode';

const REVIEW_URL = 'https://sikhitothemax.org/review-shabad';

// A QR code (as a data URL) for the shabad's review page on the website, where
// the sangat can give feedback on its translation. None when there's no shabad,
// and none while the code for a newly opened shabad is being made, rather than
// the last shabad's.
export const useTranslationReviewQr = (shabadId) => {
  const [qr, setQr] = useState({ shabadId: null, dataUrl: null });

  useEffect(() => {
    let isCurrent = true;
    if (shabadId) {
      qrCode
        .toDataURL(`${REVIEW_URL}/${shabadId}`, { margin: 1, width: 256 })
        .then((dataUrl) => {
          if (isCurrent) setQr({ shabadId, dataUrl });
        })
        .catch((err) => {
          /* eslint-disable-next-line no-console */
          console.error('Failed to make the translation review QR code:', err.message);
        });
    }
    return () => {
      isCurrent = false;
    };
  }, [shabadId]);

  return shabadId && qr.shabadId === shabadId ? qr.dataUrl : null;
};
