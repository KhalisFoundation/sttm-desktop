import { useQrCode } from './use-qr-code';
import { useShabadUrl } from './use-shabad-url';

// A QR code (as a data URL) for the verse's review page on the website, where
// the sangat can give feedback on its translation. None when there's no verse.
export const useTranslationReviewQr = (shabadId, verseId) => {
  const url = useShabadUrl(shabadId, verseId);
  return useQrCode(shabadId && verseId ? url : null);
};
