export const changeHomeVerse = (verseIndex, { homeVerse, setHomeVerse }) => {
  if (verseIndex !== homeVerse) {
    setHomeVerse(verseIndex);
  }
};
