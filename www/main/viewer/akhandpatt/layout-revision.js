/**
 * The user settings that change how *tall* a rendered verse is.
 *
 * Akhand Paatth remembers the reader's place as "this verse, this far into it",
 * not as a pixel offset, so it survives the deck growing and shrinking underneath
 * it (see `useAkhandpattScroll`). An explicit revision token drives that repair,
 * because `scrollHeight` also moves on every just-in-time load and prune, and
 * those carry their own scroll compensation the repair must not fight.
 *
 * So the deck has to say when a *layout* change happened, which means naming the
 * settings that cause one. They are gathered here because they are scattered
 * across the Slide subtree — `bakePanktee` and `useContentFontSizes` read the
 * font sizes, `Slide` reads the visibility flags — and a list assembled by eye
 * from those files would quietly rot.
 *
 * The test in `test/viewer/akhandpatt/layout-revision.test.js` partitions every
 * setting the Slide subtree reads into this list and an explicit height-neutral
 * one, so a new setting that nobody has classified fails the build.
 */
export const LAYOUT_AFFECTING_SETTINGS = [
  // Type size: scales the Gurbani and each of the three content lines. The two
  // views keep separate sizes for every one of them (see `font-sizes.js`), and
  // only one view is ever in play, so listing both sets is harmless and keeps
  // the list accurate about what the Slide subtree can read.
  'gurbaniFontSize',
  'akhandpattGurbaniFontSize',
  'content1FontSize',
  'akhandpattContent1FontSize',
  'content2FontSize',
  'akhandpattContent2FontSize',
  'content3FontSize',
  'akhandpattContent3FontSize',
  // Whether each content line renders at all.
  'content1Visibility',
  'content2Visibility',
  'content3Visibility',
  // Which content each line shows: different sources have different lengths and
  // so wrap to a different number of rows.
  'content1',
  'content2',
  'content3',
  'translationEnglishSource',
  'teekaSource',
  // Joining words removes the wrap opportunities between them, which changes how
  // many rows a long verse occupies.
  'larivaar',
  // Adds a whole extra Gurbani line to every verse.
  'displayNextLine',
];

/**
 * The viewer settings that change how tall a rendered verse is, or where the
 * verses sit.
 *
 * Separate from `LAYOUT_AFFECTING_SETTINGS` only because they live in a
 * different store slice; they earn their place here for the same reason.
 * Both Akhand Paatth spacing axes qualify: the verse axis pads each verse, the
 * line axis separates the lines inside one, and either changing moves every
 * verse below the reader's anchor. `containerPadding` pads the scrolled content
 * itself: top and bottom translate every verse, and left and right narrow the
 * column, which rewraps them.
 */
export const LAYOUT_AFFECTING_VIEWER_SETTINGS = ['verseSpacing', 'lineSpacing', 'containerPadding'];

/**
 * Encode one setting for the token.
 *
 * Most are numbers. `containerPadding` is an object of four edges, and joining
 * it directly would yield `[object Object]` for every value it can hold, so its
 * edges are spelled out in a fixed order.
 */
const encodeSetting = (value) =>
  value && typeof value === 'object'
    ? Object.keys(value)
        .sort()
        .map((edge) => `${edge}:${value[edge]}`)
        .join(',')
    : value;

/**
 * Build an opaque token that changes whenever the deck's layout does.
 *
 * Consumers compare it for equality only; the encoding is not part of the
 * contract.
 *
 * @param {object} userSettings The `userSettings` store slice
 * @param {object} viewerSettings The `viewerSettings` store slice
 * @returns {string} A token that differs iff a layout-affecting setting differs
 */
export const buildLayoutRevision = (userSettings, viewerSettings) =>
  [
    ...LAYOUT_AFFECTING_VIEWER_SETTINGS.map((key) => encodeSetting(viewerSettings[key])),
    ...LAYOUT_AFFECTING_SETTINGS.map((key) => userSettings[key]),
  ].join('|');
