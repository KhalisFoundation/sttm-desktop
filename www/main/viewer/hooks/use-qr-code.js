import { useEffect, useState } from 'react';
import qrCode from 'qrcode';

// A QR code (as a data URL) for the given URL. None when there's no URL, and
// none while the code for a new URL is being made, rather than the last one's.
export const useQrCode = (url) => {
  const [qr, setQr] = useState({ url: null, dataUrl: null });

  useEffect(() => {
    let isCurrent = true;
    if (url) {
      qrCode
        .toDataURL(url, { margin: 1, width: 256 })
        .then((dataUrl) => {
          if (isCurrent) setQr({ url, dataUrl });
        })
        .catch((err) => {
          /* eslint-disable-next-line no-console */
          console.error(`Failed to make the QR code for ${url}:`, err.message);
        });
    }
    return () => {
      isCurrent = false;
    };
  }, [url]);

  return url && qr.url === url ? qr.dataUrl : null;
};
