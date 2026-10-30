import { useQrCode } from './use-qr-code';

const REVIEW_URL = 'https://sttm.co/s';

// A QR code (as a data URL) for the verse's review page on the website, where
// the sangat can give feedback on its translation. None when there's no verse.
export const useTranslationReviewQr = (shabadId, verseId) =>
  useQrCode(shabadId && verseId ? `${REVIEW_URL}/${shabadId}/${verseId}` : null);
