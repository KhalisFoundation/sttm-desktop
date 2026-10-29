import { isFlowerVerse } from '.';

export const scrollToVerse = (
  verseId,
  activeShabad,
  virtuosoRef,
  isAsaDiVaar = false,
  behavior = 'smooth',
) => {
  const verseIndex = activeShabad.findIndex((obj) => obj.verseId === verseId);
  // Ignoring flower verse to avoid unwanted scroll during asa di vaar
  if (
    verseIndex >= 0 &&
    !isFlowerVerse(verseId, isAsaDiVaar) &&
    activeShabad[verseIndex].verse !== ','
  ) {
    virtuosoRef.current.scrollToIndex({
      index: verseIndex,
      behavior,
      align: 'center',
    });
  }
};
