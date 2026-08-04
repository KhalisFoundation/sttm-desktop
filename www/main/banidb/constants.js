const SEARCH_TYPES = {
  FIRST_LETTERS: 0,
  FIRST_LETTERS_ANYWHERE: 1,
  GURMUKHI_WORD: 2,
  ENGLISH_WORD: 3,
  ANG: 4,
  MAIN_LETTERS: 6,
  FIRST_LETTERS_ENGLISH: 7,
};

const GURMUKHI_SEARCH_TEXTS = {
  [SEARCH_TYPES.FIRST_LETTERS]: 'FIRST_LETTER_START',
  [SEARCH_TYPES.FIRST_LETTERS_ANYWHERE]: 'FIRST_LETTER_ANYWHERE',
  [SEARCH_TYPES.GURMUKHI_WORD]: 'FULL_WORDS',
};

const ENGLISH_SEARCH_TEXTS = {
  [SEARCH_TYPES.FIRST_LETTERS_ENGLISH]: 'FIRST_LETTER_START',
  [SEARCH_TYPES.ENGLISH_WORD]: 'FULL_WORDS',
};

const SEARCH_TEXTS = {
  [SEARCH_TYPES.FIRST_LETTERS]: 'FIRST_LETTER_START',
  [SEARCH_TYPES.FIRST_LETTERS_ANYWHERE]: 'FIRST_LETTER_ANYWHERE',
  [SEARCH_TYPES.GURMUKHI_WORD]: 'FULL_WORDS_GURMUKHI',
  [SEARCH_TYPES.ENGLISH_WORD]: 'FULL_WORDS_ENGLISH',
  [SEARCH_TYPES.ANG]: 'ANG',
};

const SOURCE_TYPES = {
  ALL_SOURCES: 'all',
  GURU_GRANTH_SAHIB: 'G',
  DASAM_GRANTH: 'D',
  GURDAS_VAARAN: 'B',
  NAND_LAL_VAARAN: 'N',
  AMRIT_KEERTAN: 'A',
  GURDAS_JI_VAARAN: 'S',
  REHATNAMAS: 'R',
};

// Keys are zero-padded three-digit character codes so every row lines up with
// the Gurmukhi it maps, which is what makes the table readable. prettier wants
// to unquote the three keys that happen to be numeric, breaking that alignment
// and the padding convention for no gain.
// prettier-ignore
const BINDI_CHARS = {
  '103': '090', //  ਗ: 'ਗ਼'
  '106': '122', //  ਜ: 'ਜ਼'
  '115': '083', //  ਸ: 'ਸ਼'
  '075': '094', //  ਖ: 'ਖ਼'
  '080': '038', //  ਫ: 'ਫ਼'
  '097': '069', //  ੳ : ਓ
};

const SOURCE_TEXTS = {
  [SOURCE_TYPES.ALL_SOURCES]: 'ALL_SOURCES',
  [SOURCE_TYPES.GURU_GRANTH_SAHIB]: 'GURU_GRANTH_SAHIB',
  [SOURCE_TYPES.DASAM_GRANTH]: 'DASAM_GRANTH',
  [SOURCE_TYPES.GURDAS_VAARAN]: 'GURDAS_VAARAN',
  [SOURCE_TYPES.NAND_LAL_VAARAN]: 'NAND_LAL_VAARAN',
  [SOURCE_TYPES.AMRIT_KEERTAN]: 'AMRIT_KEERTAN',
  [SOURCE_TYPES.GURDAS_JI_VAARAN]: 'GURDAS_JI_VAARAN',
  [SOURCE_TYPES.REHATNAMAS]: 'REHATNAMAS',
};

const BASE_BANI_OPTIONS = [
  {
    label: 'teeka',
    options: [{ id: 'teeka-punjabi', text: 'Punjabi' }],
  },
  {
    label: 'translation',
    options: [
      { id: 'translation-english', text: 'English' },
      { id: 'translation-hindi', text: 'Hindi' },
      { id: 'translation-spanish', text: 'Spanish' },
    ],
  },
  {
    label: 'transliteration',
    options: [
      { id: 'transliteration-english', text: 'English' },
      { id: 'transliteration-hindi', text: 'Hindi' },
    ],
  },
];

module.exports = {
  SEARCH_TYPES,
  GURMUKHI_SEARCH_TEXTS,
  ENGLISH_SEARCH_TEXTS,
  SEARCH_TEXTS,
  SOURCE_TEXTS,
  SOURCE_TYPES,
  BINDI_CHARS,
  BASE_BANI_OPTIONS,
};
