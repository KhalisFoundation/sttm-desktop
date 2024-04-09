export const filterRequiredVerseItems = (verses) => {
  let versesNew;
  let currentLine = 0;
  try {
    versesNew = verses.flat(1);
  } catch (error) {
    versesNew = verses;
  }
  const checkPauri = versesNew.filter((verse) => /]\d*]/.test(verse.Gurmukhi));
  const regex = checkPauri.length > 1 ? /]\d*]/ : /]/;
  return versesNew
    ? versesNew.map((verse, index) => {
        if (verse) {
          const verseObj = {
            ID: index,
            verseId: verse.ID,
            verse: verse.Gurmukhi,
            english: verse.English ? verse.English : '',
            lineNo: currentLine,
            crossPlatformId: verse.crossPlatformID ? verse.crossPlatformID : '',
          };
          if (regex.test(verse.Gurmukhi)) {
            currentLine++;
          }
          return verseObj;
        }
        return {};
      })
    : [];
};
