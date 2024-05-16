export const scrollToVerse = (verseId, activeShabad, virtuosoRef) => {
  const verseIndex = activeShabad.findIndex((obj) => obj.verseId === verseId);
  virtuosoRef.current.scrollToIndex({
    index: verseIndex,
    behavior: 'smooth',
    align: 'center',
  });
};
