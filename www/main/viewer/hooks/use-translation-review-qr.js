import { useStoreState } from 'easy-peasy';
import { useQrCode } from './use-qr-code';
import { useShabadUrl } from './use-shabad-url';

const SYNC_URL = 'https://sttm.co/sync';

// A QR code (as a data URL) for the sangat to follow along and give feedback on
// the translation. With a sync code (sync only starts online), it opens the live sync session
// (eg: sttm.co/sync/ABC-DEF?eng=pss&teeka=bdb); otherwise the verse's review
// page on the website. None when there's no verse.
export const useTranslationReviewQr = (shabadId, verseId) => {
  const shabadUrl = useShabadUrl(shabadId, verseId);
  const { translationEnglishSource, teekaSource } = useStoreState((state) => state.userSettings);
  const { code } = useStoreState((state) => state.baniController || {});
  // The sources mark the reader as joining from this QR, so the website shows
  // (and keeps following) the translations shown here. A typed code has none.
  const syncParams = new URLSearchParams({ eng: translationEnglishSource, teeka: teekaSource });
  const url = code ? `${SYNC_URL}/${code}?${syncParams}` : shabadUrl;
  return useQrCode(shabadId && verseId ? url : null);
};
