import {
  rememberReadingPosition,
  recallReadingPosition,
  forgetReadingPosition,
} from '../../../www/main/viewer/akhandpatt/reading-position';

/**
 * Resuming a reading across a deck remount.
 *
 * The distinction is between a remount (same selection, resume in place) and an
 * explicit new selection (open where the reader asked).
 */

const SELECTION = 1200;

beforeEach(() => {
  forgetReadingPosition();
});

describe('reading position', () => {
  it('resumes a reading that is remounting', () => {
    rememberReadingPosition(SELECTION, 1387, 55123);
    expect(recallReadingPosition(SELECTION)).toEqual({ shabadId: 1387, verseId: 55123 });
  });

  it('does not resume into a different selection', () => {
    // A different selection must open where requested, not at the previous
    // reading's saved position.
    rememberReadingPosition(SELECTION, 1387, 55123);
    expect(recallReadingPosition(4200)).toBeNull();
  });

  it('keeps only the latest position within a reading', () => {
    rememberReadingPosition(SELECTION, 1387, 55123);
    rememberReadingPosition(SELECTION, 1388, 55140);
    expect(recallReadingPosition(SELECTION)).toEqual({ shabadId: 1388, verseId: 55140 });
  });

  it('forgets on request, so a re-opened selection starts fresh', () => {
    rememberReadingPosition(SELECTION, 1387, 55123);
    forgetReadingPosition();
    expect(recallReadingPosition(SELECTION)).toBeNull();
  });

  it('has nothing to recall before a reading starts', () => {
    expect(recallReadingPosition(SELECTION)).toBeNull();
  });
});

/*
 * Where the hook must drop the remembered place is covered behaviourally in
 * `selection-intent.test.js`, which drives the real hook. Asserting it here by
 * scanning the hook's source could only show that the call is written, not that
 * it runs.
 */
