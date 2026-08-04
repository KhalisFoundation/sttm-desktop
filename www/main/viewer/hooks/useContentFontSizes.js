import { useStoreState } from 'easy-peasy';

import { shallowEqual } from '../../common/utils';
import { CONTENT_SLOTS, fontSizeSetting } from '../font-sizes';

/**
 * The three content line sizes for whichever view is on screen, in slot order.
 *
 * `SlideTranslation`, `SlideTeeka` and `SlideTransliteration` are each rendered
 * into whichever slot the reader has assigned them, and so each needs all three
 * sizes to index by position. Reading them here rather than in all three keeps
 * the per-view choice (see `font-sizes.js`) in one place, and keeps the three
 * components from drifting apart.
 *
 * Compared shallowly because Akhand Paatth mounts these components once per
 * verse, so a selector returning a fresh array on every store mutation would
 * re-render every verse on screen, including on high-frequency scroll ticks.
 *
 * @returns {number[]} The sizes for content slots 1, 2 and 3
 */
const useContentFontSizes = () =>
  useStoreState(
    (state) =>
      CONTENT_SLOTS.map(
        (slot) =>
          state.userSettings[fontSizeSetting(slot, state.userSettings.akhandpatt).stateName],
      ),
    shallowEqual,
  );

export default useContentFontSizes;
