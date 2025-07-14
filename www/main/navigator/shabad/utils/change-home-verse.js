export const changeHomeVerse = (verseIndex, { paneAttributes, setPaneAttributes }) => {
  if (paneAttributes.homeVerse !== verseIndex) {
    setPaneAttributes({ ...paneAttributes, homeVerse: verseIndex });
  }
};
