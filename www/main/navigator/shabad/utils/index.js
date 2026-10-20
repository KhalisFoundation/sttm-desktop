export {
  changeVerse,
  sendToBaniController,
  udpateHistory,
  intelligentNextVerse,
} from './change-verse';
export { filterRequiredVerseItems, filterOverlayVerseItems } from './filter-verse-items';
export { changeHomeVerse } from './change-home-verse';
export { scrollToVerse } from './scroll-to-verse';
export { saveToHistory } from './save-to-history';
export { copyToClipboard } from './copy-to-clipboard';

// Asa di Vaar has decorative flower lines between its parts. They are Custom
// rows with ID 61, which is also the ID of a real verse (in Japji Sahib), so
// only skip it inside Asa di Vaar.
export const FLOWER_VERSE_ID = 61;
export const ASA_DI_VAAR_BANI_ID = 90;

export const isFlowerVerse = (verseId, isAsaDiVaar) => isAsaDiVaar && verseId === FLOWER_VERSE_ID;
