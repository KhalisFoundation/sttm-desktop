import { useStoreState } from 'easy-peasy';

const SHABAD_URL = 'https://sttm.co/s';

// The shabad's page on the website (at the verse, if given), asking it to open
// with the English translation and teeka sources set here. Eg: ?eng=pss&teeka=bdb
export const useShabadUrl = (shabadId, verseId) => {
  const { translationEnglishSource, teekaSource } = useStoreState((state) => state.userSettings);
  const path = verseId ? `${shabadId}/${verseId}` : shabadId;
  const params = new URLSearchParams({ eng: translationEnglishSource, teeka: teekaSource });
  return `${SHABAD_URL}/${path}?${params}`;
};
