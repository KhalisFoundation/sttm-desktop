const anvaad = require('anvaad-js');

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

export const filterOverlayVerseItems = (verses, verseId) => {
  if (verses) {
    const currentIndex = verses.findIndex((obj) => obj.ID === verseId);
    const currentVerse = verses[currentIndex];
    if (currentVerse) {
      const Line = { ...currentVerse.toJSON() };
      if (Line.Translations) {
        const lineTranslations = JSON.parse(Line.Translations);
        Line.English = lineTranslations.en.bdb || lineTranslations.en.ms || lineTranslations.en.ssk;
        Line.Punjabi =
          lineTranslations.pu.bdb ||
          lineTranslations.pu.ss ||
          lineTranslations.pu.ft ||
          lineTranslations.pu.ms;
        Line.Spanish = lineTranslations.es.sn;
        Line.Hindi = (lineTranslations.hi && lineTranslations.hi.ss) || '';
      }
      Line.Transliteration = {
        English: anvaad.translit(Line.Gurmukhi || ''),
        Shahmukhi: anvaad.translit(Line.Gurmukhi || '', 'shahmukhi'),
        Devanagari: anvaad.translit(Line.Gurmukhi || '', 'devnagri'),
      };
      Line.Unicode = anvaad.unicode(Line.Gurmukhi || '');
      return Line;
    }
  }
  return {};
};
