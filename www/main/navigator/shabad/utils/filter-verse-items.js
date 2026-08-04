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

/**
 * Builds the single line sent to the overlay and broadcast pipeline (OBS, the
 * Sikh Sangat app), with translations and transliterations resolved.
 *
 * Called from two places that render Gurbani independently: `ShabadText` for the
 * slide view, and `useAkhandpattScroll` for the Akhand Paatth deck. Both must
 * produce an identical line for the same verse, so this stays a single function
 * rather than one per view.
 *
 * @param {Array} verses The verses of the current Shabad
 * @param {number} verseId The verse to build
 * @returns {Object} The overlay line, or `{}` if the verse is not in `verses`
 */
export const filterOverlayVerseItems = (verses, verseId) => {
  if (verses) {
    const currentIndex = verses.findIndex((obj) => obj.ID === verseId);
    const currentVerse = verses[currentIndex];
    if (currentVerse) {
      // Akhand Paatth materialises its verses to plain objects (see
      // useAkhandpattScroll) which have no Realm `toJSON`; the navigator's live
      // Realm verses do. Handle both so the overlay line is built identically.
      const Line = {
        ...(typeof currentVerse.toJSON === 'function' ? currentVerse.toJSON() : currentVerse),
      };
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
