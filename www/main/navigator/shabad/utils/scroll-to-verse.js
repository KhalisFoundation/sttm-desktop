import { FLOWER_VERSE_ID } from '.';

export const scrollToVerse = (verseId, activeShabad, virtuosoRef) => {
  const verseIndex = activeShabad.findIndex((obj) => obj.verseId === verseId);
  // Ignoring flower verse to avoid unwanted scroll during asa di vaar
  if (verseIndex >= 0 && verseId !== FLOWER_VERSE_ID && activeShabad[verseIndex].verse !== ',') {
    virtuosoRef.current.scrollToIndex({
      index: verseIndex,
      behavior: 'smooth',
      align: 'center',
    });
  }
};
