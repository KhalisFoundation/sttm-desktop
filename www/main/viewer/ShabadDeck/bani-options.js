import { BASE_BANI_OPTIONS } from '../../banidb/constants';

/**
 * Work out which of the translation, teeka and transliteration toggles are
 * worth offering for a given verse.
 *
 * A verse carries its translations as a JSON blob keyed by language and then
 * by source. Not every verse has every one, so offering a toggle that would
 * reveal nothing is just a dead control. Groups left with no options are
 * dropped so the menu has no empty headings.
 *
 * Kept as a plain function of its inputs so the deck can decide cheaply, and
 * often, whether anything has actually changed.
 *
 * @param {object} [verse] The verse whose translations decide the menu
 * @param {string} teekaSource Selected Punjabi teeka source
 * @param {string} translationEnglishSource Selected English translation source
 * @returns {object[]} Option groups, each with at least one option
 */
export const filterBaniOptions = (verse, teekaSource, translationEnglishSource) => {
  if (!verse) {
    return BASE_BANI_OPTIONS;
  }

  let translations;
  try {
    translations = JSON.parse(verse.Translations);
  } catch (error) {
    return BASE_BANI_OPTIONS;
  }

  const available = {
    'teeka-punjabi': translations?.pu?.[teekaSource]?.length,
    'translation-english': translations?.en?.[translationEnglishSource]?.length,
    'translation-hindi': translations?.hi?.ss?.length,
    'translation-spanish': translations?.es?.sn?.length,
    'transliteration-english': true,
    'transliteration-hindi': true,
  };

  return BASE_BANI_OPTIONS.map((group) => ({
    ...group,
    options: group.options.filter((option) => available[option.id]),
  })).filter((group) => group.options.length);
};

export default filterBaniOptions;
