import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ipcRenderer } from 'electron';

import { filterOverlayVerseItems } from '../../navigator/shabad/utils/filter-verse-items';
import {
  createWindow,
  appendShabad,
  prependShabad,
  dropFirstSegment,
  dropLastSegment,
  lastShabadId,
  firstShabadId,
  shabadIdOfVerse,
} from './shabad-window';
import {
  speedToVersesPerSecond,
  CENTER_SAMPLE_INTERVAL,
  JIT_SAMPLE_INTERVAL,
  WHEEL_RESUME_DELAY_MS,
  WHEEL_GLIDE_EASING,
  WHEEL_GLIDE_MIN_STEP_PX,
  WHEEL_GLIDE_MAX_STEP_PX,
  normalizeWheelDeltaY,
  SEEK_SETTLE_MS,
  SEEK_SETTLE_TOLERANCE_PX,
  SUB_PIXEL_EPSILON_PX,
  ANCHOR_SETTLE_STABLE_FRAMES,
  ANCHOR_SETTLE_MIN_MS,
  ANCHOR_SETTLE_MAX_MS,
  LOAD_AHEAD_SCREENS,
  MIN_MOUNTED_SEGMENTS,
  PRUNE_SAFETY_SCREENS,
  SYNC_SNAP_RATIO,
  MAX_FRAME_DELTA_SECONDS,
  REMOTE_SYNC_STALE_MS,
  VIEWPORT_REPAIR_MAX_MS,
  SEED_RETRY_DELAY_MS,
  SEED_SLOW_RETRY_DELAY_MS,
  SEED_FAST_ATTEMPTS,
} from './scroll-config';
import { readScrollAnchor, resolveAnchorScrollTop } from './scroll-anchor';
import {
  currentScrollTop,
  remoteCorrection,
  wholePixels,
  subPixelTransform,
} from './scroll-motion';
import { traceScroll } from './scroll-debug';
import { readShabad, readNextShabad, readPrevShabad } from './shabad-feed';
import {
  rememberReadingPosition,
  recallReadingPosition,
  forgetReadingPosition,
} from './reading-position';
import { mountedVerses, enclosingVerse, verseIdOf } from './verse-elements';

/**
 * Average rendered height, in this container's pixels, of the verses currently
 * mounted in the deck. This is the bridge between the content-relative speed
 * setting (verses/second) and the pixels/second the scroll loop must apply, so
 * every window advances through the same Gurbani at the same rate whatever its
 * size or typography (see `scroll-config`).
 *
 * Measured across the mounted span rather than from `scrollHeight` so the deck's
 * own centring padding is excluded, and averaged over the whole window so the
 * velocity glides as verse lengths vary instead of stepping verse to verse.
 *
 * @param {HTMLElement} container The scrollable deck element
 * @returns {number|null} Average verse height in px, or null if not measurable
 */
const measureAverageVerseHeight = (container) => {
  const verses = mountedVerses(container);
  if (!verses.length) {
    return null;
  }
  const first = verses[0];
  const last = verses[verses.length - 1];
  const span = last.offsetTop + last.offsetHeight - first.offsetTop;
  return span > 0 ? span / verses.length : null;
};

/**
 * Drives the continuous ("teleprompter") vertical auto-scroll used by Akhand
 * Paatth view.
 *
 * Responsibilities:
 *  - animate the deck container's `scrollTop` at a constant, frame-rate
 *    independent velocity while playing;
 *  - for a SGGS Shabad, own a sliding window of verses: loading the next
 *    Shabad just before the reader reaches the bottom and pruning exhausted
 *    Shabads off the top (with scroll compensation) so the DOM stays bounded
 *    and the scroll never has to stop until the end of the Granth;
 *  - keep the OBS / bottom-bar overlay in step with the line currently centred
 *    on screen, sent on `akhandpatt-overlay-line`, throttled, and without
 *    touching verse history.
 *
 * Finite Akhand Paatth content (Sundar Gutka banis, ceremonies) reuses the same
 * smooth scroll and overlay sync but skips just-in-time loading; the caller
 * keeps ownership of `activeVerse` for those and sets `infinite` false.
 *
 * MAP. Roughly a third of this file is four frame loops and the state they share
 * between frames, which is why it is one module rather than several (the README
 * argues that at length). In reading order:
 *
 *   refs             Props mirrored into refs, so a loop reads the current speed
 *                    or play state without being torn down and rebuilt.
 *   requestSeek      Ask for a verse to be centred; the layout effect below does it.
 *   the scroll writer `writeScrollPosition` is the only assignment to `scrollTop`
 *                    in the file; everything else goes through `setScrollTop` or
 *                    `moveScrollTopBy`, which keep the sub-pixel accumulator with it.
 *   pinHeldAnchor    + a layout effect that re-pins the reader's line, before
 *                    paint, whenever a setting reflows the deck.
 *   the overlay      Which verse is on the centre line, and telling the app.
 *   two settle loops One waits for a seek to land, one for a reflow to stop moving.
 *   the window       Load the next/previous Shabad, prune the far one away.
 *   seed effect      Build the window for a new Shabad.
 *   selection effect Honour a manual selection, remounting the line if it was pruned.
 *   layout effect    Apply pending anchor compensation once the DOM has the verses.
 *   autoscroll loop  Mounted only while playing.
 *   anchor loop      Mounted whenever the deck is up: holds the centre line across
 *                    reflows, and broadcasts it to the other window.
 *   wheel handler    A momentary manual override of the autoscroll.
 *
 * The effects below list only the values that should *cause* them to run, not
 * every value they read. The helpers above are plain consts, rebuilt each
 * render, so naming them as dependencies would re-run each effect on every
 * render: the frame loop would cancel and restart its `requestAnimationFrame`,
 * and a seek would re-fire continuously instead of once per `seekNonce`. Live
 * values are read through refs for that reason. `react-hooks/exhaustive-deps`
 * is not enabled in this repo and would flag these; they are deliberate.
 *
 * @param {object} params
 * @param {React.RefObject<HTMLElement>} params.containerRef The scrollable deck element
 * @param {React.RefObject<HTMLElement>} params.contentRef The verses' wrapper inside the deck
 * @param {React.MutableRefObject<Object<number, HTMLElement>>} params.verseRefs Verse-id -> DOM node map
 * @param {boolean} params.akhandpatt Whether Akhand Paatth view is active
 * @param {boolean} params.viewSuspended Whether the view is off only momentarily, the reading still in progress
 * @param {boolean} params.infinite Whether the current content is an infinitely-scrollable SGGS Shabad
 * @param {boolean} params.isPlaying Whether auto-scroll is running
 * @param {number} params.scrollSpeed The `akhandpatt-scroll-speed` setting (1-100)
 * @param {number|null} params.seedShabadId The Shabad to seed the window from
 * @param {number} params.activeVerseId The verse to align to when (re)seeding
 * @param {number} params.verseSelectionNonce Changes on every verse selection
 * @param {boolean} params.liveFeed Whether the overlay feed is live
 * @param {object[]} params.activeVerse The verses currently rendered by the deck
 * @param {(verses: object[]) => void} params.setActiveVerse Setter the hook uses to grow/prune the window
 * @param {() => void} params.onReadingEnded Called once when a continuous reading runs out of Gurbani
 * @param {string} params.layoutRevision Changes whenever a caller-owned setting reflows the deck
 */
export const useAkhandpattScroll = ({
  containerRef,
  contentRef,
  verseRefs,
  akhandpatt,
  viewSuspended,
  infinite,
  isPlaying,
  scrollSpeed,
  seedShabadId,
  activeVerseId,
  verseSelectionNonce,
  liveFeed,
  activeVerse,
  setActiveVerse,
  onReadingEnded = () => {},
  layoutRevision,
}) => {
  const modelRef = useRef(null);
  /**
   * Which reading a database read belongs to.
   *
   * A read that was started for one reading must not touch a different one, and
   * the window alone cannot tell them apart: choosing a new Shabad marks the new
   * seed and then waits for its own read, so for as long as that takes the old
   * window is still the current one. A read returning in that gap sees the
   * boundary it started from, unchanged, and concludes it is still current.
   *
   * So ownership is stamped rather than inferred. Every read captures this
   * counter when it starts and abandons itself if the counter has moved on,
   * including in `finally`, since releasing another reading's loading mark is
   * itself enough to let a stale continuation through.
   */
  const readingGenerationRef = useRef(0);
  const loadingRef = useRef(false);
  const endedRef = useRef(false);
  // Latches once the scroll comes to rest at the end of a reading, so the deck
  // is told exactly once. It clears itself: any growth below the current
  // position means the scroll is no longer at the bottom.
  const reachedEndRef = useRef(false);
  const onReadingEndedRef = useRef(onReadingEnded);
  onReadingEndedRef.current = onReadingEnded;
  // Mirrors of `loadingRef`/`endedRef` for the backward (top) direction, so a
  // forward load can't block a backward one and reaching the start of the Granth
  // is tracked independently of reaching its end.
  const loadingPrevRef = useRef(false);
  const atStartRef = useRef(false);
  // Latches from the moment a backward prepend is applied to the DOM until its
  // scroll compensation runs in the layout effect. `loadingPrevRef` only covers
  // the async DB read; it clears the instant the read resolves, which is still
  // one or more frames before React commits the inserted verses and the layout
  // effect corrects scrollTop. In that gap scrollTop is unchanged and still sits
  // below the load-ahead threshold, so an unguarded loadPrevShabad fires again
  // and again, stacking several Shabads' worth of verses (hundreds) before a
  // single compensation runs: the giant reflow then overshoots the view and
  // skips over whole Shabads. Gating on this ref admits exactly one prepend per
  // layout cycle; by the time the next is allowed the compensation has already
  // pushed scrollTop up past the threshold, which self-rate-limits the next load.
  const prependCompPendingRef = useRef(false);
  const pendingSeekRef = useRef(null);
  // Restores the on-screen position of an anchor verse after the DOM grows or
  // shrinks above the viewport. Shared by the top prune (removes verses above)
  // and the backward prepend (inserts verses above); both shift on-screen
  // content and are compensated identically.
  const scrollAnchorRef = useRef(null);
  const lastCenterIdRef = useRef(null);
  // The Shabad the live window was built from. The hook owns the window once it
  // exists, so this, not "is the seed Shabad still mounted", decides when a
  // rebuild is warranted, letting the seed Shabad be pruned off the top during
  // normal scrolling without ever snapping back to the start.
  const windowSeedRef = useRef(null);
  // The selection this hook has already responded to. Seeded from the current
  // value so a mount is never mistaken for a fresh request: the reader asking to
  // be moved is the *only* thing that should tear down and rebuild the window.
  const handledSelectionRef = useRef(verseSelectionNonce);
  // Sub-pixel scroll accumulator. `scrollTop` is an integer, so at slow speeds a
  // frame's advance can round to zero and the scroll stalls; accumulating in a
  // float and only rounding on write keeps even the slowest scroll moving.
  const scrollTopFloatRef = useRef(0);
  // Manual-wheel momentum: wheel events arrive in coarse, discrete deltas, so
  // rather than snapping scrollTop per event (which looks juddery) we accumulate
  // them into a target and glide towards it over successive frames.
  const wheelTargetRef = useRef(null);
  const wheelRafRef = useRef(null);
  // True for the duration of a manual wheel gesture (until it settles). While it
  // is set the autoscroll loop holds and the wheel glide owns scrollTop; when it
  // clears, the autoscroll resumes in whatever play state it was already in. It
  // never touches the global autoplay toggle, so a momentary manual correction
  // doesn't make the play/pause button flicker.
  const manualScrollRef = useRef(false);
  const wheelResumeTimerRef = useRef(null);
  // A seek (search result / navigator click / fresh seed) pins the chosen line
  // to its target on-screen position for a short settle window while
  // late reflow (web font, async content) finishes changing verse heights. While
  // `seekingRef` is set the autoscroll loop holds so it cannot fight the pin, and
  // `seekSettleRafRef` owns the re-pin animation frame so a newer seek, or a
  // manual wheel, can cancel it cleanly.
  const seekingRef = useRef(false);
  const seekSettleRafRef = useRef(null);
  // Incremented on every seek so a late async callback (fonts.ready) belonging to
  // a superseded seek can detect it lost the race and do nothing.
  const seekTokenRef = useRef(0);
  // Owns the post-prepend anchor settle animation frame: as the freshly-mounted
  // previous Shabad inflates above the viewport, this folds the growth into
  // scrollTop so the view stays visually still. Teardown, and anything else
  // that takes charge of the scroll position, cancels it.
  const anchorSettleRafRef = useRef(null);
  // The verse the running settle is holding, and the window it is holding it
  // for. Both live outside the loop's closure so a prepend arriving mid-settle
  // can extend the window without restarting the loop on a different verse.
  const anchorSettleVerseRef = useRef(null);
  const anchorSettleDeadlinesRef = useRef(null);
  const [seekNonce, setSeekNonce] = useState(0);
  // Bumped to re-attempt a seed that failed (e.g. a cold-realm rejection).
  const [seedNonce, setSeedNonce] = useState(0);
  // Per-seed attempt bookkeeping, so that a seed which keeps failing backs off
  // rather than hammering the database, and a genuinely new seed always starts
  // its count fresh.
  const seedAttemptRef = useRef({ id: null, attempts: 0 });
  const seedRetryTimerRef = useRef(null);
  // How the infinite window's seed is getting on:
  //   'idle':    nothing outstanding; whatever is on screen is current
  //   'loading': a read is in flight or a quick retry is pending
  //   'stalled': the quick retries are spent and it has backed off
  // The deck shows a loader for 'loading' only when it has nothing else to show,
  // so an ordinary Shabad change does not flash; 'stalled' always shows one,
  // because by then the Gurbani on screen belongs to a reading the operator has
  // already left.
  const [seedState, setSeedState] = useState('idle');
  // Timestamp of the most recent scroll anchor received from the operator's
  // preview. Its freshness is what makes this window a follower (see
  // `REMOTE_SYNC_STALE_MS`) so no explicit role has to be plumbed through.
  //
  // "Never received one" has to be infinitely stale rather than zero, because
  // this clock counts from the moment the document loaded: with zero, every
  // window would believe it was following for its own first second, swallowing
  // wheel gestures and withholding its anchor during the period an operator is
  // most likely to be setting the reading up.
  const remoteAnchorAtRef = useRef(Number.NEGATIVE_INFINITY);
  // True while another window is telling this one where to scroll. Inferred
  // rather than plumbed, so a window whose source goes away reverts to
  // scrolling under its own steam instead of freezing.
  const isFollowing = () => performance.now() - remoteAnchorAtRef.current < REMOTE_SYNC_STALE_MS;

  // Mirror frequently-read props into refs so the animation loop can stay
  // mounted across speed/content changes without capturing stale values.
  const speedRef = useRef(scrollSpeed);
  const infiniteRef = useRef(infinite);
  const liveFeedRef = useRef(liveFeed);
  const activeVerseRef = useRef(activeVerse);
  // Mirror the selected verse so the seed's async completion aligns to the line
  // the reader actually chose (search result / navigator click) rather than
  // always snapping to the Shabad's first line.
  const activeVerseIdRef = useRef(activeVerseId);
  // Mirrors `isPlaying` so a wheel nudge can freeze the animation loop the same
  // frame, a beat before the paused state round-trips through global settings.
  const isPlayingRef = useRef(isPlaying);
  // Last `layoutRevision` the hook acted on, so the mount pass is a no-op and
  // only a genuine change opens a repair window.
  const layoutRevisionRef = useRef(layoutRevision);
  // Set when the deck has been reflowed by a setting change and the scroll loop
  // has not yet re-pinned the reader's place. Consumed once, on the next frame.
  const relayoutPendingRef = useRef(false);
  // The content point the reader is on, refreshed every frame the layout is
  // quiet and pinned back whenever it is not. A ref rather than a local of the
  // scroll loop because the reflow is signalled from a layout effect, which has
  // to read the anchor captured before the reflow, and does so while the DOM
  // is still unpainted, so the correction lands in the same frame as the change.
  const heldAnchorRef = useRef(null);
  // Where a follower's leader currently is, when that is close enough to be
  // drift rather than a different passage. Held rather than applied so the
  // scroll loop remains the only writer of the scroll position.
  const remoteTargetRef = useRef(null);
  useEffect(() => {
    speedRef.current = scrollSpeed;
  }, [scrollSpeed]);
  useEffect(() => {
    infiniteRef.current = infinite;
  }, [infinite]);
  useEffect(() => {
    liveFeedRef.current = liveFeed;
  }, [liveFeed]);
  useEffect(() => {
    activeVerseRef.current = activeVerse;
  }, [activeVerse]);
  useEffect(() => {
    activeVerseIdRef.current = activeVerseId;
  }, [activeVerseId]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const requestSeek = (verseId, align = 'center') => {
    pendingSeekRef.current = { verseId, align };
    setSeekNonce((nonce) => nonce + 1);
  };

  // Write a scroll position that may carry a fraction of a pixel.
  //
  // Chromium quantises `scrollTop` to a whole *physical* pixel, so on an
  // ordinary 1x projector a velocity of 3.3px/frame is rendered 3, 4, 3, 3, 4:
  // a flutter that is plainly visible at the speeds this view is read at, and
  // which the operator's own 2x laptop screen (a 0.5px quantum) does not show.
  // The whole pixels go to `scrollTop` and the remainder is carried as a
  // transform on the content, which paints at sub-pixel precision.
  //
  // The two must stay complementary. `scroll-anchor` measures verses through a
  // bounding rect, which the transform does shift, so the split is visible to it,
  // and correctly so: a shifted rect read against a truncated `scrollTop`
  // describes the position actually painted. Rounding here instead of
  // truncating, or transforming by anything other than the discarded remainder,
  // would put the anchor on a different line from the one on screen.
  // `scroll-anchor.test.js` pins that.
  const writeScrollPosition = (value) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = wholePixels(value);
    const content = contentRef && contentRef.current;
    if (content) {
      content.style.transform = subPixelTransform(value);
    }
  };

  const clearSubPixelOffset = () => {
    const content = contentRef && contentRef.current;
    if (content) {
      content.style.transform = '';
    }
  };

  // The sub-pixel offset belongs to Akhand Paatth alone, so leaving the view
  // (or unmounting) hands back a wrapper with no residual fraction of a pixel
  // and no transform, a transform being a stacking and compositing boundary that
  // ordinary slides never asked for. This is its own effect: the scroll loop
  // is gated on `isPlaying` and registers no cleanup while paused,
  // so a wheel nudge on a paused deck would otherwise leave an offset behind.
  useEffect(() => clearSubPixelOffset, [akhandpatt]);

  // Write the scroll position and keep the float accumulator in step, clamped so
  // short content can never come to rest scrolled past its end (or above 0).
  const setScrollTop = (value) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const clamped = Math.min(maxScrollTop, Math.max(0, value));
    writeScrollPosition(clamped);
    scrollTopFloatRef.current = clamped;
    // A seek, a pin, or a wheel glide puts the deck where it should be, so any
    // correction still converging towards a position from before that decision is
    // now wrong.
    remoteTargetRef.current = null;
  };

  // Nudge the deck from where it already is, rather than to a position worked out
  // from scratch. Both callers are correcting for content that changed height
  // underneath the reader, so all they know is how far it moved, and the base
  // they add that to has to be the position last asked for, not the truncated one
  // the container reports back. `currentScrollTop` is the only place that choice
  // is made; going through here is what stops a caller making it again, wrongly.
  const moveScrollTopBy = (delta) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    setScrollTop(currentScrollTop(scrollTopFloatRef.current, container.scrollTop) + delta);
  };

  // Put the content point the reader was on back on the centre line. Returns
  // whether it could: the anchor's verse may have been pruned, or the deck may
  // not be mounted yet.
  const pinHeldAnchor = () => {
    const container = containerRef.current;
    // A manual scroll or seek owns scrollTop outright; don't add a second
    // writer. It settles in a moment and the anchor is re-read after it.
    if (!container || manualScrollRef.current || seekingRef.current) {
      return false;
    }
    const target = resolveAnchorScrollTop(container, heldAnchorRef.current);
    if (target === null) {
      return false;
    }
    setScrollTop(target);
    return true;
  };

  // A setting that reflows the deck (line spacing, a font size, a visibility
  // toggle; see `layout-revision.js`) changes how much content sits above the
  // centre line without changing the container's size, so the viewport repair,
  // which watches for size changes, would not notice and the reader's place
  // would slide away under them. The hook does not care *which* setting
  // changed; the caller says only that it did.
  //
  // This has to be a layout effect. React has already written the new styles to
  // the DOM by the time it runs, but the browser has not yet painted them, so
  // re-pinning here corrects the position in the very frame that moved it;
  // the reader sees no jump at all. Deferring to the scroll loop would show one
  // frame of the wrong Gurbani, and worse: that frame would refresh the anchor
  // from the already-drifted position, and the repair that followed would
  // faithfully restore the drift.
  //
  // The repair window is still opened, because the reflow is rarely finished:
  // web fonts and images settle over the following frames, and the loop keeps
  // re-pinning until the height holds still.
  useLayoutEffect(() => {
    if (layoutRevisionRef.current === layoutRevision) {
      return;
    }
    layoutRevisionRef.current = layoutRevision;
    relayoutPendingRef.current = true;
    pinHeldAnchor();
  }, [layoutRevision]);

  const emitOverlay = (verseId) => {
    const verses = activeVerseRef.current;
    if (!verses || !verses.length) {
      return;
    }
    const overlayVerse = filterOverlayVerseItems(verses, verseId);
    if (!overlayVerse || !Object.keys(overlayVerse).length) {
      return;
    }
    // A dedicated channel (rather than `show-line`) lets the main process pick
    // which deck drives the overlay: both scroll in lock-step, so only the
    // operator's preview is broadcast and the external display's duplicate
    // emissions are dropped.
    ipcRenderer.send(
      'akhandpatt-overlay-line',
      JSON.stringify({
        Line: overlayVerse,
        live: liveFeedRef.current,
      }),
    );
  };

  const getCenteredVerseId = () => {
    const container = containerRef.current;
    if (!container) {
      return null;
    }
    const rect = container.getBoundingClientRect();
    const el = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const verseEl = enclosingVerse(el);
    if (!verseEl) {
      return null;
    }
    const verseId = verseIdOf(verseEl);
    return Number.isNaN(verseId) ? null : verseId;
  };

  const syncOverlayToCentre = (force = false) => {
    const verseId = getCenteredVerseId();
    if (verseId === null) {
      return;
    }
    if (!force && verseId === lastCenterIdRef.current) {
      return;
    }
    lastCenterIdRef.current = verseId;
    emitOverlay(verseId);

    // Note the place, so a render fault that unmounts this deck can resume here
    // rather than restarting the reading. Only meaningful while we own the
    // window; the deck drives itself for finite content.
    const model = modelRef.current;
    if (model && windowSeedRef.current !== null) {
      const shabadId = shabadIdOfVerse(model, verseId);
      if (shabadId !== null) {
        rememberReadingPosition(windowSeedRef.current, shabadId, verseId);
      }
    }
  };

  // Cancel any in-flight post-seek settle and release the hold on the autoscroll
  // loop. Bumping the seek token invalidates a still-pending fonts.ready
  // correction from the settle being cancelled. Called before starting a new
  // settle, when a manual wheel takes over, and on teardown.
  const cancelSeekSettle = () => {
    if (seekSettleRafRef.current !== null) {
      cancelAnimationFrame(seekSettleRafRef.current);
      seekSettleRafRef.current = null;
    }
    seekTokenRef.current += 1;
    seekingRef.current = false;
  };

  // Keep a selected line pinned to its intended on-screen position while late
  // reflow settles. The verse's height, and every height above it, is not
  // final on the frame the seek is applied: the Gurmukhi web font and other
  // async content land a few frames later and push the line down, so a one-shot
  // seek leaves the wrong line centred. Re-pin every frame (adjusting scrollTop
  // by however far the line has drifted from its target) for the whole settle
  // window, so however late the reflow completes the line is dragged back onto
  // target. It does not stop early on transient stability: right after placement
  // the line briefly *looks* settled, a beat before the font reflow shoves it;
  // an early exit there would leave the wrong line centred. The autoscroll loop
  // holds while `seekingRef` is set, so this can never fight it; the window is
  // short enough that the brief hold is imperceptible.
  const startSeekSettle = (verseId, align) => {
    cancelSeekSettle();
    if (!containerRef.current) {
      return;
    }
    seekingRef.current = true;
    seekTokenRef.current += 1;
    const token = seekTokenRef.current;
    // Re-pin the line to its target on-screen position; shared by the per-frame
    // settle loop and the one-shot fonts.ready correction below.
    const pin = () => {
      const node = verseRefs.current[verseId];
      if (!containerRef.current || !node) {
        return false;
      }
      const containerRect = containerRef.current.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      const currentY = nodeRect.top - containerRect.top;
      const desiredY =
        align === 'top' ? 0 : (containerRef.current.clientHeight - nodeRect.height) / 2;
      const drift = currentY - desiredY;
      if (Math.abs(drift) > SEEK_SETTLE_TOLERANCE_PX) {
        moveScrollTopBy(drift);
      }
      return true;
    };
    const deadline = performance.now() + SEEK_SETTLE_MS;
    const settle = () => {
      if (!pin()) {
        cancelSeekSettle();
        return;
      }
      if (performance.now() >= deadline) {
        cancelSeekSettle();
        syncOverlayToCentre(true);
        return;
      }
      seekSettleRafRef.current = requestAnimationFrame(settle);
    };
    seekSettleRafRef.current = requestAnimationFrame(settle);
    // A cold Gurmukhi web-font load can complete after the settle window closes;
    // when the fonts finally resolve, re-pin once more so a slow first open still
    // lands on the chosen line, but only if this seek is still the current one
    // and the reader hasn't since taken manual control.
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (seekTokenRef.current === token && !manualScrollRef.current) {
          pin();
          syncOverlayToCentre(true);
        }
      });
    }
  };

  // Content-space Y (in scroll coordinates) of a rendered verse's top edge.
  const verseOffsetInContent = (verseId) => {
    const container = containerRef.current;
    const node = verseRefs.current[verseId];
    if (!container || !node) {
      return null;
    }
    return (
      node.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
    );
  };

  // A verse's on-screen Y relative to the container's top edge, i.e. where it is
  // rendered. Unlike verseOffsetInContent (a content-space coordinate that moves
  // when content is inserted/removed above), this is the rendered viewport
  // position, so comparing it before a DOM change and after the compensation
  // measures the visible skip in screen pixels, independent of scrollTop
  // numerics or the browser's scroll clamp.
  const verseViewportTop = (verseId) => {
    const container = containerRef.current;
    const node = verseRefs.current[verseId];
    if (!container || !node) {
      return null;
    }
    return node.getBoundingClientRect().top - container.getBoundingClientRect().top;
  };

  // Cancel an in-flight post-prepend anchor settle, because the view is tearing
  // down or because something else has taken charge of the scroll position.
  const cancelAnchorSettle = () => {
    if (anchorSettleRafRef.current !== null) {
      cancelAnimationFrame(anchorSettleRafRef.current);
      anchorSettleRafRef.current = null;
    }
    anchorSettleDeadlinesRef.current = null;
  };

  // Hold the view visually still while a newly prepended previous Shabad inflates
  // above the viewport. The prepended verses mount with near-zero height and only
  // reach their true height a few frames later (late web-font/async reflow),
  // growing the content above the anchor by up to a whole Shabad. With overflow
  // anchoring disabled the browser leaves the anchor, and everything below it,
  // to lurch down by that growth: the large backward skip seen scrolling up
  // across a Shabad boundary. The one-shot anchor compensation in the layout
  // effect runs before this late growth, so it cannot see it. Here we track the
  // anchor verse's content offset every frame for the settle window and add any
  // frame-to-frame growth above it to scrollTop (and, if a manual glide is still
  // in flight, its target), so the anchor keeps its on-screen position as the
  // Shabad fills in. This compensates only reflow growth (the offset
  // is a content-space coordinate that a scroll does not change) so an active
  // upward glide continues undisturbed.
  const startAnchorSettle = (verseId) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    // Scrolling up quickly asks for a second Shabad before the first has
    // finished growing. Each prepend anchors on the verse that was the head
    // before it ran, so a later prepend's anchor is always further up the page
    // than the one already being held. An anchor only absorbs growth above
    // itself, so the anchor already running is the one that covers both
    // Shabads; re-anchoring upward would leave the first Shabad's remaining
    // growth to push the reader down by its whole height. Keep the running
    // anchor and give it a fresh window instead, since more content has just
    // arrived above it and has yet to reflow.
    if (anchorSettleRafRef.current !== null && anchorSettleDeadlinesRef.current) {
      const extendedFrom = performance.now();
      anchorSettleDeadlinesRef.current = {
        min: extendedFrom + ANCHOR_SETTLE_MIN_MS,
        max: extendedFrom + ANCHOR_SETTLE_MAX_MS,
      };
      traceScroll('anchorSettleExtend', { held: anchorSettleVerseRef.current, arrived: verseId });
      return;
    }
    cancelAnchorSettle();
    let lastOffset = verseOffsetInContent(verseId);
    if (lastOffset === null) {
      return;
    }
    const startViewportY = verseViewportTop(verseId);
    const startedAt = performance.now();
    anchorSettleVerseRef.current = verseId;
    anchorSettleDeadlinesRef.current = {
      min: startedAt + ANCHOR_SETTLE_MIN_MS,
      max: startedAt + ANCHOR_SETTLE_MAX_MS,
    };
    let totalComp = 0;
    let stableFrames = 0;
    const settle = () => {
      const deadlines = anchorSettleDeadlinesRef.current;
      if (!containerRef.current || !verseRefs.current[verseId] || !deadlines) {
        anchorSettleRafRef.current = null;
        anchorSettleDeadlinesRef.current = null;
        return;
      }
      const offsetNow = verseOffsetInContent(verseId);
      if (offsetNow !== null) {
        const growth = offsetNow - lastOffset;
        if (Math.abs(growth) > SUB_PIXEL_EPSILON_PX) {
          moveScrollTopBy(growth);
          if (wheelTargetRef.current !== null) {
            wheelTargetRef.current += growth;
          }
          totalComp += growth;
          lastOffset = offsetNow;
          stableFrames = 0;
        } else {
          stableFrames += 1;
        }
      }
      // Exit once the prepended Shabad's height has held steady for a short run
      // of frames (reflow done), but only after the minimum floor, since the
      // verses first mount at fallback-font height and can look "stable" for a
      // beat before the real font lands and inflates them. The cap is a safety
      // backstop for a reflow that never settles. Adapting to when reflow
      // actually finishes both stops promptly for a quick reflow and keeps
      // compensating a long/slow one a fixed window would abandon mid-inflation.
      // Both deadlines are read from the ref so a prepend arriving mid-settle
      // can push them out without disturbing the anchor.
      const now = performance.now();
      const settled = now >= deadlines.min && stableFrames >= ANCHOR_SETTLE_STABLE_FRAMES;
      if (!settled && now < deadlines.max) {
        anchorSettleRafRef.current = requestAnimationFrame(settle);
      } else {
        anchorSettleRafRef.current = null;
        anchorSettleDeadlinesRef.current = null;
        const endViewportY = verseViewportTop(verseId);
        traceScroll('anchorSettle', {
          verseId,
          totalComp: Math.round(totalComp),
          stableFrames,
          cappedOut: now >= deadlines.max,
          startViewportY: startViewportY === null ? null : Math.round(startViewportY),
          endViewportY: endViewportY === null ? null : Math.round(endViewportY),
        });
      }
    };
    anchorSettleRafRef.current = requestAnimationFrame(settle);
  };

  const loadNextShabad = () => {
    const container = containerRef.current;
    const model = modelRef.current;
    if (!container || !model || loadingRef.current || endedRef.current) {
      return;
    }
    const remaining = container.scrollHeight - (container.scrollTop + container.clientHeight);
    if (remaining > container.clientHeight * LOAD_AHEAD_SCREENS) {
      return;
    }
    const tailId = lastShabadId(model);
    if (tailId === null) {
      return;
    }
    loadingRef.current = true;
    const generation = readingGenerationRef.current;
    readNextShabad(tailId)
      .then((next) => {
        // Discard a stale load. The generation catches a read left over from a
        // reading the operator has moved on from; the tail check additionally
        // catches the window shifting under a read within one reading. A
        // top-prune leaves the tail untouched, so this still allows a
        // concurrent prune.
        if (readingGenerationRef.current !== generation) {
          return;
        }
        if (lastShabadId(modelRef.current) !== tailId) {
          return;
        }
        // Null means the source really has ended: the feed has already
        // stepped over any gap in the id space.
        if (!next) {
          endedRef.current = true;
          return;
        }
        modelRef.current = appendShabad(modelRef.current, next.shabadId, next.verses);
        // Growth is at the bottom, so existing content, and scrollTop, is undisturbed.
        setActiveVerse(modelRef.current.verses);
        traceScroll('append', {
          nextId: next.shabadId,
          count: next.verses.length,
          segments: modelRef.current.segments.length,
          scrollTop: Math.round(container.scrollTop),
          scrollHeight: container.scrollHeight,
        });
      })
      .catch((error) => {
        // A failed read must not latch `endedRef`: the source has not ended, so
        // leaving the flag clear lets the next sample retry.
        traceScroll('appendFailed', { tailId, message: error && error.message });
      })
      .finally(() => {
        if (readingGenerationRef.current !== generation) {
          return;
        }
        loadingRef.current = false;
      });
  };

  // The backward mirror of loadNextShabad: as the reader manually scrolls up
  // towards the top of the window, fetch the previous Shabad and prepend it so
  // they can scroll back through Shabads already pruned off the top. That
  // preserves a document-style read. Only reached from the manual wheel
  // glide (autoscroll only ever moves forward), so opening a fresh Shabad never
  // eagerly loads the one before it.
  const loadPrevShabad = () => {
    const container = containerRef.current;
    const model = modelRef.current;
    if (
      !container ||
      !model ||
      loadingPrevRef.current ||
      prependCompPendingRef.current ||
      atStartRef.current
    ) {
      return;
    }
    if (container.scrollTop > container.clientHeight * LOAD_AHEAD_SCREENS) {
      return;
    }
    const headId = firstShabadId(model);
    if (headId === null) {
      return;
    }
    loadingPrevRef.current = true;
    const generation = readingGenerationRef.current;
    readPrevShabad(headId)
      .then((prev) => {
        // The forward loader's reasoning, mirrored: the generation catches a
        // read left over from an abandoned reading, the head check catches the
        // window shifting under a read within one reading (a concurrent
        // prepend). A bottom prune leaves the head untouched, so this still
        // allows a concurrent bottom prune.
        if (readingGenerationRef.current !== generation) {
          return;
        }
        if (firstShabadId(modelRef.current) !== headId) {
          return;
        }
        // Null means the start of the source, gaps already stepped over.
        if (!prev) {
          atStartRef.current = true;
          return;
        }
        // Anchor on the current head verse: remember its on-screen position now
        // so the layout effect can restore it after the prepend pushes it (and
        // everything below) down by the inserted height. Same mechanism as the
        // top prune, with growth instead of shrinkage above the viewport.
        const headVerse = modelRef.current.verses[0];
        const headTop = verseOffsetInContent(headVerse.ID);
        // Without a measurable head verse there is nothing to anchor the
        // compensation to. Prepending anyway would shove the viewport backward by
        // the inserted height, and (because the one-per-cycle latch is tied to
        // capturing the anchor) would leave that latch open for the next tick to
        // stack another prepend on top. Return, as `pruneTopShabad` does for its
        // own anchor; the head becomes measurable again within a frame or
        // two and the wheel/autoscroll re-triggers the load.
        if (headTop === null) {
          return;
        }
        scrollAnchorRef.current = {
          verseId: headVerse.ID,
          prevViewportY: headTop - container.scrollTop,
          oldOffset: headTop,
          scrollTopAtCapture: container.scrollTop,
          anchorViewportTop: verseViewportTop(headVerse.ID),
          reason: 'prepend',
        };
        // Block any further prepend until this one's compensation has run (see
        // prependCompPendingRef): one prepend per layout cycle, no large batch.
        // Tied to capturing the anchor so the layout effect (gated on the same
        // anchor) is guaranteed to clear it; no path can wedge it stuck true.
        prependCompPendingRef.current = true;
        modelRef.current = prependShabad(modelRef.current, prev.shabadId, prev.verses);
        setActiveVerse(modelRef.current.verses);
        traceScroll('prepend', {
          prevId: prev.shabadId,
          count: prev.verses.length,
          segments: modelRef.current.segments.length,
          scrollTop: Math.round(container.scrollTop),
        });
      })
      .catch((error) => {
        // As with the forward feed, a failed read leaves `atStartRef` clear so
        // the next wheel-up can retry rather than the top being sealed off.
        traceScroll('prependFailed', { headId, message: error && error.message });
      })
      .finally(() => {
        if (readingGenerationRef.current !== generation) {
          return;
        }
        loadingPrevRef.current = false;
      });
  };

  const pruneTopShabad = () => {
    const container = containerRef.current;
    const model = modelRef.current;
    if (!container || !model || model.segments.length <= MIN_MOUNTED_SEGMENTS) {
      return;
    }
    // The boundary is the first verse of the second segment; once it sits a full
    // screen above the viewport the entire first Shabad is safely off-screen.
    const boundaryVerse = model.verses[model.segments[0].count];
    if (!boundaryVerse) {
      return;
    }
    const boundaryTop = verseOffsetInContent(boundaryVerse.ID);
    if (boundaryTop === null) {
      return;
    }
    if (boundaryTop >= container.scrollTop - container.clientHeight * PRUNE_SAFETY_SCREENS) {
      return;
    }
    // Anchor on the boundary verse: remember its current on-screen position
    // (viewport-relative Y) now, then after the removed verses leave the DOM
    // recompute the scroll position that puts it back at exactly that Y.
    // Capturing the on-screen Y (not a content-space delta) lets compensation be
    // computed absolutely on the far side, so it stays correct even if the
    // browser clamped scrollTop when the shorter content shrank scrollHeight.
    const prevViewportY = boundaryTop - container.scrollTop;
    scrollAnchorRef.current = {
      verseId: boundaryVerse.ID,
      prevViewportY,
      oldOffset: boundaryTop,
      scrollTopAtCapture: container.scrollTop,
      anchorViewportTop: verseViewportTop(boundaryVerse.ID),
      reason: 'prune',
    };
    modelRef.current = dropFirstSegment(model);
    setActiveVerse(modelRef.current.verses);
    // Freeing verses off the top means we're no longer at the start of the Granth.
    atStartRef.current = false;
    traceScroll('prune', {
      boundaryVerseId: boundaryVerse.ID,
      prevViewportY: Math.round(prevViewportY),
      scrollTop: Math.round(container.scrollTop),
      segments: modelRef.current.segments.length,
    });
  };

  // The backward mirror of pruneTopShabad: once the reader has scrolled up far
  // enough that the bottom-most Shabad sits a full screen below the viewport,
  // drop it to keep the DOM bounded. Removing content below the viewport shifts
  // nothing on screen, so, unlike a top prune, no scroll compensation is
  // needed.
  const pruneBottomShabad = () => {
    const container = containerRef.current;
    const model = modelRef.current;
    if (!container || !model || model.segments.length <= MIN_MOUNTED_SEGMENTS) {
      return;
    }
    const lastSegment = model.segments[model.segments.length - 1];
    const lastFirstVerse = model.verses[model.verses.length - lastSegment.count];
    if (!lastFirstVerse) {
      return;
    }
    const lastFirstTop = verseOffsetInContent(lastFirstVerse.ID);
    if (lastFirstTop === null) {
      return;
    }
    const viewportBottom = container.scrollTop + container.clientHeight;
    if (lastFirstTop <= viewportBottom + container.clientHeight * PRUNE_SAFETY_SCREENS) {
      return;
    }
    modelRef.current = dropLastSegment(model);
    setActiveVerse(modelRef.current.verses);
    // Freeing verses off the bottom means we're no longer at the end of the Granth.
    endedRef.current = false;
    traceScroll('pruneBottom', {
      lastShabadId: lastSegment.shabadId,
      scrollTop: Math.round(container.scrollTop),
      segments: modelRef.current.segments.length,
    });
  };

  // Own the sliding window (infinite) or defer to the deck (finite content). The
  // window is rebuilt only for a genuinely new seed Shabad, never because the
  // original seed scrolled off the top, which is what stops the scroll from
  // periodically snapping backwards through a run of short Shabads.
  useEffect(() => {
    if (!akhandpatt) {
      modelRef.current = null;
      windowSeedRef.current = null;
      readingGenerationRef.current += 1;
      setSeedState('idle');
      cancelAnchorSettle();
      prependCompPendingRef.current = false;
      // Leaving the view ends the reading. The remembered place exists to
      // survive a remount *within* a reading, so keeping it here would let a
      // later return to the same Shabad open wherever the last reading drifted
      // to, possibly hours of Gurbani away, instead of the selected line.
      //
      // A misc slide is not leaving. Raising a Quick Insert or an announcement
      // takes the deck off screen for a moment mid-reading, and the reader
      // expects to come back to the line they were on, not to the line they
      // opened hours ago. Only a genuine exit from the view forgets.
      if (!viewSuspended) {
        forgetReadingPosition();
      }
      return undefined;
    }
    if (infinite && seedShabadId) {
      if (windowSeedRef.current === seedShabadId) {
        return undefined;
      }
      // Reset the attempt counter only when the seed Shabad itself changes, so a
      // retry of the same seed keeps counting towards the backoff.
      if (seedAttemptRef.current.id !== seedShabadId) {
        seedAttemptRef.current = { id: seedShabadId, attempts: 0 };
      }
      windowSeedRef.current = seedShabadId;
      // A new reading starts here. Anything still in flight for the old one is
      // now stale, whatever the window happens to look like when it returns.
      readingGenerationRef.current += 1;
      const generation = readingGenerationRef.current;
      endedRef.current = false;
      atStartRef.current = false;
      loadingRef.current = true;
      loadingPrevRef.current = false;
      prependCompPendingRef.current = false;
      lastCenterIdRef.current = null;
      seedAttemptRef.current.attempts += 1;
      // One rule, applied both on the way in and on the way round again, so a
      // stalled seed does not drop back to 'loading' on each slow retry.
      const stalled = seedAttemptRef.current.attempts > SEED_FAST_ATTEMPTS;
      setSeedState(stalled ? 'stalled' : 'loading');

      // Clear the seed marker and schedule another attempt. The deck keeps a
      // loader up for as long as this is retrying, so the reader always sees
      // either Gurbani that is current or a "still loading" state.
      const scheduleReseed = () => {
        windowSeedRef.current = null;
        seedRetryTimerRef.current = setTimeout(
          () => {
            setSeedNonce((nonce) => nonce + 1);
          },
          stalled ? SEED_SLOW_RETRY_DELAY_MS : SEED_RETRY_DELAY_MS,
        );
      };

      // Resume where this reading left off if the deck is remounting (see
      // `reading-position`); otherwise open the Shabad the reader selected.
      const resume = recallReadingPosition(seedShabadId);
      if (!resume) {
        // A different selection, so the previous reading's place is stale. At
        // most one reading is ever remembered, and it is the one on screen.
        forgetReadingPosition();
      }
      const loadShabadId = resume ? resume.shabadId : seedShabadId;

      readShabad(loadShabadId)
        .then((seed) => {
          // Discard a superseded seed if a newer selection landed mid-read.
          if (readingGenerationRef.current !== generation) {
            return;
          }
          if (!seed) {
            scheduleReseed();
            return;
          }
          const { verses } = seed;
          seedAttemptRef.current = { id: seedShabadId, attempts: 0 };
          modelRef.current = createWindow(loadShabadId, verses);
          setActiveVerse(verses);
          setSeedState('idle');
          // Align to the line the reader actually chose. A search result or a
          // navigator click sets `activeVerseId`; centre that line so opening a
          // Shabad lands on the selected verse (not always its first line). When
          // the chosen line *is* the first verse, or nothing specific was
          // selected, top-align instead, so a fresh Shabad opened from its start
          // rests cleanly at the top rather than mid-screen with a blank gap.
          // A resumed reading always centres: its line was mid-screen when the
          // fault hit, and putting it back there is the whole point.
          const chosenId = resume ? resume.verseId : activeVerseIdRef.current;
          const chosenIsMounted = chosenId && verses.some((verse) => verse.ID === chosenId);
          const centreOnChosen = chosenIsMounted && (resume || chosenId !== verses[0].ID);
          if (centreOnChosen) {
            requestSeek(chosenId, 'center');
          } else {
            requestSeek(verses[0].ID, 'top');
          }
          traceScroll('seed', {
            seedShabadId,
            loadShabadId,
            resumed: Boolean(resume),
            count: verses.length,
            chosenId: chosenId || null,
            aligned: centreOnChosen ? 'center' : 'top',
          });
        })
        .catch(() => {
          if (readingGenerationRef.current !== generation) {
            return;
          }
          scheduleReseed();
        })
        .finally(() => {
          if (readingGenerationRef.current !== generation) {
            return;
          }
          loadingRef.current = false;
        });
    } else {
      // Finite Akhand Paatth content: the deck owns activeVerse, we only scroll it.
      modelRef.current = null;
      windowSeedRef.current = null;
      readingGenerationRef.current += 1;
      lastCenterIdRef.current = null;
      forgetReadingPosition();
      setSeedState('idle');
      requestSeek(activeVerseId, 'center');
    }
    // Cancel a pending retry when the seed changes or the deck unmounts, so a
    // stale reseed can't fire against a Shabad the reader has already left.
    return () => {
      if (seedRetryTimerRef.current) {
        clearTimeout(seedRetryTimerRef.current);
        seedRetryTimerRef.current = null;
      }
    };
  }, [akhandpatt, viewSuspended, infinite, seedShabadId, seedNonce]);

  // A verse selection (search result, navigator click) centres that line. If
  // the line is still mounted we seek to it. If it isn't, and the window was
  // already built for the current seed (so the seed effect won't rebuild on its
  // own), the line must have scrolled off the top and been pruned. Rebuild the
  // window from the seed so it remounts, then the seed effect centres it. A
  // brand-new seed is left entirely to the seed effect.
  //
  // `verseSelectionNonce` is in the dependencies so that reselecting the line
  // that is *already* active still seeks. The deck scrolls away from the active
  // line without changing it, so without this the obvious way to get back to a
  // line (click it in the navigator) would silently do nothing.
  useEffect(() => {
    if (!akhandpatt || !activeVerseId) {
      return;
    }
    const isNewSelection = handledSelectionRef.current !== verseSelectionNonce;
    handledSelectionRef.current = verseSelectionNonce;

    if (verseRefs.current[activeVerseId]) {
      requestSeek(activeVerseId, 'center');
      return;
    }
    // The line isn't mounted, but that alone doesn't mean it was pruned: on a
    // mount, and on a newly seeded Shabad, nothing has rendered yet either. The
    // seed effect marks the window as its own synchronously, before its load
    // resolves, so the test below cannot tell those apart on its own; only a
    // change of selection can. Without this the branch would run on every open
    // and every remount, discarding the position the seed effect was about to
    // restore and paying for a second window build.
    if (!isNewSelection) {
      return;
    }
    if (infiniteRef.current && windowSeedRef.current === seedShabadId) {
      traceScroll('reseedForPrunedVerse', { activeVerseId, seedShabadId });
      // The reader has said where to go, so the place this reading had drifted
      // to is no longer the place to return to. Without this the reseed below
      // looks like a remount to the seed effect (same seed id), and it would
      // restore the scroll position instead of honouring the selection, landing
      // back where the reading already was.
      forgetReadingPosition();
      windowSeedRef.current = null;
      setSeedNonce((nonce) => nonce + 1);
    }
  }, [akhandpatt, activeVerseId, verseSelectionNonce, seedShabadId]);

  // Apply pending scroll-anchor compensation (top prune or backward prepend) and
  // seed seeks once the DOM reflects the latest verses. useLayoutEffect keeps
  // both flash-free.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    if (scrollAnchorRef.current) {
      const { verseId, prevViewportY, reason, oldOffset, scrollTopAtCapture, anchorViewportTop } =
        scrollAnchorRef.current;
      const newOffset = verseOffsetInContent(verseId);
      if (newOffset !== null) {
        const before = container.scrollTop;
        // Recompute the absolute scroll position that keeps the anchor verse at
        // the same on-screen Y. Computing it absolutely (newOffset - viewportY)
        // rather than as a delta off the live scrollTop makes it immune to the
        // browser having already clamped scrollTop when the content above the
        // viewport shrank (top prune) or grew (backward prepend); a delta-based
        // shift double-counted the change and yanked the scroll (the old
        // skip-back symptom through runs of short Shabads).
        setScrollTop(newOffset - prevViewportY);
        // A manual wheel glide eases towards an absolute scroll position; shift
        // its target by the same compensation so growing/shrinking content above
        // the viewport (a backward prepend lands mid-glide) doesn't make the
        // glide jump to a now-stale target.
        if (wheelTargetRef.current !== null) {
          wheelTargetRef.current += container.scrollTop - before;
        }
        // `visibleSkip` is how many screen pixels the anchor verse moved between
        // the capture and the post-compensation position. This is what the eye
        // sees, independent of scrollTop numerics or the browser's clamp; a
        // non-zero value is a real, visible skip. `interimDrift` (scrollTop
        // movement since capture) is expected and benign for prunes (the browser
        // clamp) but reveals a late React commit racing a live glide for prepends.
        const newViewportTop = verseViewportTop(verseId);
        const visibleSkip =
          newViewportTop !== null && anchorViewportTop !== null
            ? Math.round(newViewportTop - anchorViewportTop)
            : null;
        traceScroll('anchorComp', {
          reason,
          verseId,
          prevViewportY: Math.round(prevViewportY),
          newOffset: Math.round(newOffset),
          oldOffset: Math.round(oldOffset),
          heightDelta: Math.round(newOffset - oldOffset),
          scrollTopAtCapture: Math.round(scrollTopAtCapture),
          interimDrift: Math.round(before - scrollTopAtCapture),
          visibleSkip,
          before: Math.round(before),
          after: Math.round(container.scrollTop),
        });
        // A backward prepend mounts the previous Shabad above the viewport with
        // near-zero height; it inflates over the next few frames (late reflow),
        // growing the content above the anchor and lurching it down. The one-shot
        // compensation above runs before that growth, so hand off to a short
        // settle that keeps the anchor pinned as the Shabad fills in. Prunes need
        // no settle: the content they remove/leave above the boundary was already
        // on-screen and fully laid out, so it cannot grow late.
        if (reason === 'prepend') {
          startAnchorSettle(verseId);
        }
      }
      scrollAnchorRef.current = null;
      // This commit reflects the prepend, so its compensation has now run;
      // release the one-per-cycle latch to admit the next backward load. Cleared
      // unconditionally (even if the anchor node was missing above) so a missed
      // measurement can never wedge backward loading shut.
      if (reason === 'prepend') {
        prependCompPendingRef.current = false;
      }
    }
    if (pendingSeekRef.current !== null) {
      const { verseId, align } = pendingSeekRef.current;
      const targetTop = verseOffsetInContent(verseId);
      const node = verseRefs.current[verseId];
      if (targetTop !== null && node) {
        // 'top' rests the line at the container's top edge (a fresh Shabad);
        // 'center' lines it up with the centre-line the overlay samples (a
        // resume or a manual re-selection). setScrollTop clamps both so the view
        // can never settle scrolled past the content's end.
        const target =
          align === 'top'
            ? targetTop
            : targetTop - (container.clientHeight - node.offsetHeight) / 2;
        // A seek repositions the view; abandon any in-flight post-prepend anchor
        // settle so the two never fight over scrollTop.
        cancelAnchorSettle();
        setScrollTop(target);
        pendingSeekRef.current = null;
        syncOverlayToCentre(true);
        traceScroll('seekApply', {
          verseId,
          align,
          target: Math.round(target),
          after: Math.round(container.scrollTop),
        });
        // Hold the line on target across the next few frames while late reflow
        // (web font, async content) finishes resizing the verses above it, so the
        // seek lands on the chosen line rather than a stale, pre-reflow position.
        startSeekSettle(verseId, align);
      }
    }
  }, [activeVerse, seekNonce]);

  // The animation loop: only mounted while actually scrolling.
  useEffect(() => {
    if (!akhandpatt || !isPlaying) {
      return undefined;
    }
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }
    let rafId;
    let lastTimestamp = performance.now();
    let sinceCentre = 0;
    let sinceJit = 0;
    // Cached so the velocity does not force a layout read every frame; the deck
    // only changes shape when verses are appended, pruned or reflowed, so the
    // JIT cadence below is a natural refresh point.
    let averageVerseHeight = measureAverageVerseHeight(container);
    // Resume from wherever the scroll currently sits (e.g. after a manual wheel
    // nudge or a seek) so toggling play/pause never causes a jump.
    scrollTopFloatRef.current = container.scrollTop;

    let reportedStepFault = false;

    // Close a fraction of a follower's remaining error each frame, retiring the
    // target once the two windows agree to within a pixel neither can paint.
    const converge = (position) => {
      if (remoteTargetRef.current === null) {
        return position;
      }
      const correction = remoteCorrection(position, remoteTargetRef.current);
      if (!correction) {
        remoteTargetRef.current = null;
        return position;
      }
      return position + correction;
    };

    const stepFrame = (timestamp) => {
      // Bounded so a hitch outside our control becomes a brief pause rather
      // than a proportional leap forward (see `MAX_FRAME_DELTA_SECONDS`).
      const deltaSeconds = Math.min((timestamp - lastTimestamp) / 1000, MAX_FRAME_DELTA_SECONDS);
      lastTimestamp = timestamp;

      // Hold position while a manual wheel gesture owns the scroll (the glide
      // drives scrollTop then hands back once it settles) or if playback was
      // paused. `lastTimestamp` is still advanced above, so on resume the first
      // frame's delta is a single frame, never the whole hold, so there is no
      // catch-up jump.
      if (!isPlayingRef.current || manualScrollRef.current || seekingRef.current) {
        return;
      }

      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      // Detector: between our last write and now, did something move scrollTop
      // backward against our intent? The float is what we last set; if the actual
      // scrollTop is now meaningfully smaller, an external force (a re-render, a
      // prune-compensation overshoot, scroll-anchoring) pulled us back: the
      // "skip-back" symptom. Capture it with full context the instant it
      // happens so the cause is unambiguous.
      const actualBefore = container.scrollTop;
      if (actualBefore < scrollTopFloatRef.current - 4) {
        traceScroll('backJump', {
          intended: Math.round(scrollTopFloatRef.current),
          actual: Math.round(actualBefore),
          delta: Math.round(actualBefore - scrollTopFloatRef.current),
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
          maxScrollTop: Math.round(maxScrollTop),
        });
        // Re-sync the float to the browser's truth so we resume from here rather
        // than snapping forward to a now-invalid float.
        scrollTopFloatRef.current = actualBefore;
      }
      if (scrollTopFloatRef.current < maxScrollTop && averageVerseHeight) {
        // Velocity is verses/second converted through this window's own average
        // verse height, so the preview and the external display advance through
        // the same Gurbani at the same rate despite laying it out differently.
        // Accumulate in a float and only round on write, so a sub-pixel-per-frame
        // advance still moves.
        const velocity = speedToVersesPerSecond(speedRef.current) * averageVerseHeight;
        const advanced = scrollTopFloatRef.current + velocity * deltaSeconds;
        const next = Math.max(0, Math.min(maxScrollTop, converge(advanced)));
        scrollTopFloatRef.current = next;
        writeScrollPosition(next);
      }

      // A reading that has run out of Gurbani stops moving, and nothing else on
      // screen changes, indistinguishable from a hang, which is the failure
      // this whole view exists to avoid. Tell the deck once so it can put the
      // control back to "start", the same way the slide view does when it
      // reaches the last verse. The latch clears on its own as soon as anything
      // is loaded below, because the scroll is then no longer at the bottom.
      // Only a continuous reading can reach this: `endedRef` is latched by the
      // forward loader, which finite content never runs.
      const atBottom = scrollTopFloatRef.current >= maxScrollTop - 1;
      if (endedRef.current && atBottom) {
        if (!reachedEndRef.current) {
          reachedEndRef.current = true;
          traceScroll('readingEnded', { scrollTop: Math.round(maxScrollTop) });
          onReadingEndedRef.current();
        }
      } else {
        reachedEndRef.current = false;
      }

      sinceCentre += deltaSeconds;
      if (sinceCentre >= CENTER_SAMPLE_INTERVAL) {
        sinceCentre = 0;
        syncOverlayToCentre();
      }

      sinceJit += deltaSeconds;
      if (sinceJit >= JIT_SAMPLE_INTERVAL) {
        sinceJit = 0;
        averageVerseHeight = measureAverageVerseHeight(container) || averageVerseHeight;
        if (infiniteRef.current) {
          loadNextShabad();
          pruneTopShabad();
        }
      }
    };

    // The frame body is wrapped so the next frame is always scheduled. A throw
    // from layout measurement, cross-window sync or the JIT loaders would
    // otherwise skip the `requestAnimationFrame` and stop the scroll for good; a
    // React error boundary cannot see a fault raised inside a callback. Report
    // once, then carry on.
    const step = (timestamp) => {
      try {
        stepFrame(timestamp);
      } catch (error) {
        traceScroll('stepFailed', { message: error && error.message });
        if (!reportedStepFault) {
          reportedStepFault = true;
          // eslint-disable-next-line no-console
          console.error('[akhandpatt] scroll frame failed; continuing', error);
        }
      } finally {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [akhandpatt, isPlaying]);

  // Holds the centre line: across viewport changes here, and across windows.
  //
  // One loop, because `heldAnchor` is one value: the content point pinned
  // through a reflow is the same point broadcast to the projection. During a
  // repair the anchor is not re-read, so anything reading its own anchor would
  // publish the mid-reflow position, which is the drift the repair exists to
  // suppress.
  //
  // Both windows mount this hook and run the same loop, so autoplay alone keeps
  // them together: speed is in verses/second precisely so it survives their very
  // different typography. What they cannot agree on unaided is anything done by
  // hand: a wheel nudge back to the Granthi's line moves the preview only, and
  // that offset would never heal. So the preview broadcasts the content point on
  // its centre line and the projection puts that point on its own; the frames in
  // between are the follower's own loop, already running the same speed.
  //
  // Sent every interval, not only when the preview has moved. The follower
  // coasts between anchors, so silence reads as "carry on", not "stay put",
  // and the preview does hold still for a beat after each wheel gesture. Sending
  // unconditionally bounds the follower's coasting error to one interval rather
  // than the whole hold. The main process routes it, being the only component
  // that knows the window topology, and a window that is being told where to
  // scroll stops broadcasting its own position.
  useEffect(() => {
    if (!akhandpatt) {
      return undefined;
    }
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    // The centred line feeds the overlay, which changes at most once a verse.
    // Anchors arrive every frame, and sampling the centre forces a hit-test, so
    // it is rate-limited to the same interval the autoscroll loop uses rather
    // than run sixty times a second on the window driving the sangat's screen.
    let lastCentreSampleMs = 0;
    const onRemoteAnchor = (event, payload) => {
      remoteAnchorAtRef.current = performance.now();
      // Local intent wins while the operator is scrolling this window by hand,
      // and while a seek settles onto a chosen line; both are already driving
      // scrollTop and both resolve within a moment.
      if (manualScrollRef.current || seekingRef.current) {
        return;
      }
      const anchor = JSON.parse(payload);
      const target = resolveAnchorScrollTop(container, anchor);
      if (target !== null) {
        // A follower is running its own copy of this motion, so an anchor is a
        // correction to it, not a position to take. Assigning it here would put
        // two writers on `scrollTop`, this one and the scroll loop, and the
        // projection would visibly lurch around a position both windows already
        // agree on. Hand the loop the target and let it converge.
        //
        // Paused, there is no loop to hand it to, so the position is taken
        // directly. That branch still runs on every anchor, which is every
        // frame, because it is also what repairs a follower whose layout moved
        // under it while nothing was scrolling. Skipping an anchor that resolves
        // to where the float already sits would skip exactly that repair.
        const drifting =
          isPlayingRef.current &&
          Math.abs(target - scrollTopFloatRef.current) < container.clientHeight * SYNC_SNAP_RATIO;
        if (drifting) {
          remoteTargetRef.current = target;
        } else {
          setScrollTop(target);
        }
        const nowMs = performance.now();
        if (nowMs - lastCentreSampleMs >= CENTER_SAMPLE_INTERVAL * 1000) {
          lastCentreSampleMs = nowMs;
          syncOverlayToCentre();
        }
      }
      // Either the anchor's verse is not mounted here, or honouring it would
      // land outside this window's scroll range: the operator has scrolled to
      // Gurbani this window has not loaded (a manual scrub, or it sat paused
      // while the preview moved on). Grow towards them and let a later anchor
      // land exactly. The loaders' own in-flight guards hold this to one load at
      // a time despite an anchor arriving every frame.
      if (!infiniteRef.current) {
        return;
      }
      const verses = mountedVerses(container);
      if (!verses.length) {
        return;
      }
      const behind = target === null ? anchor.verseId < verseIdOf(verses[0]) : target < 0;
      const ahead =
        target === null
          ? anchor.verseId > verseIdOf(verses[verses.length - 1])
          : target > container.scrollHeight - container.clientHeight;
      if (behind) {
        // Same direction-aware policy as the manual glide: grow the edge being
        // travelled towards and free the edge being left, so following a long
        // scrub cannot grow this window's DOM without bound.
        loadPrevShabad();
        pruneBottomShabad();
      } else if (ahead) {
        loadNextShabad();
        pruneTopShabad();
      }
    };
    ipcRenderer.on('akhandpatt-scroll-sync', onRemoteAnchor);

    let rafId;
    let lastWidth = container.clientWidth;
    let lastHeight = container.clientHeight;
    let lastScrollHeight = container.scrollHeight;
    let repairDeadline = 0;
    let repairStableFrames = 0;

    const syncFrame = (timestamp) => {
      // Hold the centre line across viewport changes. The deck is sized in `vh`,
      // so docking the navigator panel, switching between Single-Display and
      // Presentation, or resizing the window reflows every verse, while
      // `scrollTop` is a raw pixel count that survives the reflow pointing at
      // different Gurbani.
      //
      // The repair has to outlast the resize. Measured across a workspace switch,
      // the deck reaches its final size several frames before the verses finish
      // reflowing into it (`scrollHeight` kept shrinking for ~230ms afterwards),
      // and handing back the moment the size held still let the Gurbani slide out
      // from under the centre line, eight verses adrift. So a size change opens
      // a window that re-pins every frame until `scrollHeight` is steady for
      // `ANCHOR_SETTLE_STABLE_FRAMES`, or the `VIEWPORT_REPAIR_MAX_MS` backstop.
      // The anchor is not re-read while it is open, so one content point stays
      // pinned for the whole transition, CSS animation included.
      //
      // A settings-driven reflow needs the same treatment but changes only the
      // content's height, so the caller signals it (`layoutRevision`) rather than
      // it being inferred from `scrollHeight`, which also moves on every load
      // and prune, and those carry their own compensation this must not fight.
      const width = container.clientWidth;
      const height = container.clientHeight;
      const { scrollHeight } = container;
      const sizeChanged = width !== lastWidth || height !== lastHeight;
      const contentChanged = scrollHeight !== lastScrollHeight;
      const relayoutRequested = relayoutPendingRef.current;
      relayoutPendingRef.current = false;
      lastWidth = width;
      lastHeight = height;
      lastScrollHeight = scrollHeight;

      if (sizeChanged || relayoutRequested) {
        repairDeadline = timestamp + VIEWPORT_REPAIR_MAX_MS;
        repairStableFrames = 0;
      } else if (repairDeadline) {
        repairStableFrames = contentChanged ? 0 : repairStableFrames + 1;
        if (repairStableFrames >= ANCHOR_SETTLE_STABLE_FRAMES || timestamp >= repairDeadline) {
          repairDeadline = 0;
        }
      }

      if (repairDeadline) {
        pinHeldAnchor();
      } else if (!contentChanged) {
        // Only re-read when the layout is quiet. A frame that lands mid-reflow
        // would capture the drifted position the repair exists to undo, and
        // since the repair resolves whatever it finds here, that drift would be
        // restored rather than corrected, losing the reader's place for good.
        heldAnchorRef.current = readScrollAnchor(container) || heldAnchorRef.current;
      }

      // Broadcast the anchor every frame. The projection predicts the gaps using
      // the same speed setting, so during autoplay each anchor arrives where it
      // was already heading and the correction is invisible. The gap only shows
      // when the two move at different rates: a wheel gesture, where the preview
      // glides many times faster, and the hand-back pause after it.
      //
      // Rate-limiting this to a nominal frame was measured to make things worse:
      // at 60Hz it never fired, and above 60Hz it fired the wrong way, holding a
      // 144Hz display to every third frame, a *lower* anchor rate than a 60Hz
      // display gets. Sending costs 0.0022ms. Receiving costs under 0.05ms on
      // both arms of the receiver, which measured within noise of each other
      // (0.045ms scrolling, 0.047ms paused), so even at 144Hz the path is under
      // 1% of a thread measured 91% idle.
      //
      // A follower's position is not its own to publish.
      if (isFollowing()) {
        return;
      }
      if (heldAnchorRef.current) {
        ipcRenderer.send('akhandpatt-scroll-sync', JSON.stringify(heldAnchorRef.current));
      }
    };

    // Wrapped for the same reason as the autoscroll loop, and more urgently: this
    // one runs for as long as the deck is open, not just while playing, and it
    // carries the anchor the projection follows. A throw that ended it would
    // unmirror the display and stop holding the reader's place, in silence.
    let reportedSyncFault = false;
    const frame = (timestamp) => {
      rafId = requestAnimationFrame(frame);
      try {
        syncFrame(timestamp);
      } catch (error) {
        traceScroll('syncFailed', { message: error && error.message });
        if (!reportedSyncFault) {
          reportedSyncFault = true;
          // eslint-disable-next-line no-console
          console.error('[akhandpatt] anchor sync frame failed; continuing', error);
        }
      }
    };
    rafId = requestAnimationFrame(frame);

    return () => {
      ipcRenderer.removeListener('akhandpatt-scroll-sync', onRemoteAnchor);
      cancelAnimationFrame(rafId);
      remoteAnchorAtRef.current = Number.NEGATIVE_INFINITY;
    };
  }, [akhandpatt]);

  // Wheeling over the deck takes momentary manual control: it glides the
  // document to follow the wheel so the operator can make a one-off correction
  // (nudging back to the Granthi's line) without juggling the speed. It is a
  // *momentary override*: while the wheel is active the autoscroll loop holds
  // (see `manualScrollRef` in the step loop), and once the gesture settles the
  // autoscroll resumes in whatever play state it was already in. It never
  // flips the global autoplay toggle, so the play/pause button doesn't flicker
  // and pausing/playing stays under the operator's explicit control.
  // Wheel events are coarse and discrete, so we accumulate their deltas into a
  // target and ease towards it over successive frames rather than snapping per
  // event, which keeps the motion smooth like any native document. It works in
  // the in-app preview and the external display alike, since both mount the
  // deck. The Akhand Paatth view hides its native scrollbar, so preventDefault
  // only stops the wheel bubbling to an ancestor.
  useEffect(() => {
    if (!akhandpatt) {
      return undefined;
    }
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    // Advances the glide by one frame. Returns whether the gesture is still
    // running, so that `glideFrame` below is the only place that owns the frame
    // handle: there is then exactly one path that arms it and one that clears
    // it, whether the glide finishes normally or throws.
    const glide = () => {
      // The gesture settling (or the view tearing down) hands scroll ownership
      // back to the autoscroll; abandon the glide so the two never fight.
      if (!containerRef.current || wheelTargetRef.current === null || !manualScrollRef.current) {
        wheelTargetRef.current = null;
        return false;
      }
      // Ease towards the target off the sub-pixel float accumulator, not the
      // browser-snapped integer `scrollTop`. Reading the integer back each frame
      // quantised the motion (a small remaining distance eased by 22% rounded to
      // 0px), making the wheel scroll judder; gliding off the float advances
      // smoothly and only rounds on write.
      const { current } = scrollTopFloatRef;
      const diff = wheelTargetRef.current - current;
      const absDiff = Math.abs(diff);
      if (absDiff < SUB_PIXEL_EPSILON_PX) {
        setScrollTop(wheelTargetRef.current);
        wheelTargetRef.current = null;
        syncOverlayToCentre(true);
        return false;
      }
      // Ease toward the target, but clamp the per-frame velocity between a floor
      // and a cap so the glide keeps a uniform pace. A plain ease-out spikes as a
      // notch lands then decays to a slow limp near the end: the pulsing that
      // reads as judder at slow speeds. The cap trims the spike (stacked notches
      // no longer lurch), the floor removes the decaying tail, and the final
      // `Math.min(..., absDiff)` lands exactly on the target without overshooting.
      const eased = absDiff * WHEEL_GLIDE_EASING;
      const clampedStep = Math.min(
        WHEEL_GLIDE_MAX_STEP_PX,
        Math.max(WHEEL_GLIDE_MIN_STEP_PX, eased),
      );
      const stepPx = Math.min(clampedStep, absDiff) * Math.sign(diff);
      setScrollTop(current + stepPx);
      syncOverlayToCentre();
      // Manual scrolling feeds the same just-in-time window as autoscroll, so the
      // reader can wheel straight on into the next Shabad (down) or back into an
      // already-pruned previous one (up). The load/prune calls are direction-aware:
      // only the edge we are travelling towards is grown, and only the edge we are
      // leaving is freed. Pruning the trailing edge shrinks scrollHeight, which
      // would re-trip the *leading* edge's near-boundary guard if both ran
      // together, thrashing the same Shabad on and off the far edge (load<->prune)
      // every frame. Both edges must prune: a top prune moves
      // scrollTop and scrollHeight by the same amount, so the glide's absolute
      // target is corrected by the anchor compensation in the layout effect and
      // the distance to the bottom boundary is unchanged.
      if (infiniteRef.current) {
        if (diff > 0) {
          loadNextShabad();
          pruneTopShabad();
        } else {
          loadPrevShabad();
          pruneBottomShabad();
        }
      }
      return true;
    };

    // Runs one glide frame and owns the frame handle for it. A throw anywhere in
    // the glide would otherwise leave the handle set and the target non-null, and
    // `onWheel` only starts a glide when both are clear, so the wheel would be
    // dead for the rest of the session, with no way back short of restarting the
    // app. Abandoning the gesture instead lets the very next notch start a fresh
    // glide.
    const glideFrame = () => {
      try {
        wheelRafRef.current = glide() ? requestAnimationFrame(glideFrame) : null;
      } catch (error) {
        wheelRafRef.current = null;
        wheelTargetRef.current = null;
        traceScroll('glideFailed', { message: error && error.message });
      }
    };

    const onWheel = (event) => {
      event.preventDefault();
      // The external display mirrors the operator's preview; its scroll position
      // is not its own. A wheel here would be overwritten within a frame by the
      // next anchor, so swallow it rather than let the operator fight the mirror;
      // the same gesture on the preview is honoured and reaches the projection
      // through the mirror anyway.
      if (isFollowing()) {
        return;
      }
      // A manual wheel gesture overrides any in-flight post-seek settle so the
      // two never fight over scrollTop.
      cancelSeekSettle();
      // Take manual control and (re)arm the hand-back. Resetting the timer on
      // every event means a burst of notches counts as one gesture; once the
      // wheel goes quiet for WHEEL_RESUME_DELAY_MS the autoscroll takes over
      // again in whatever play state it was in.
      manualScrollRef.current = true;
      if (wheelResumeTimerRef.current) {
        clearTimeout(wheelResumeTimerRef.current);
      }
      wheelResumeTimerRef.current = setTimeout(() => {
        manualScrollRef.current = false;
        wheelResumeTimerRef.current = null;
        traceScroll('wheelResume', { scrollTop: Math.round(container.scrollTop) });
      }, WHEEL_RESUME_DELAY_MS);

      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const base = wheelTargetRef.current === null ? container.scrollTop : wheelTargetRef.current;
      if (wheelTargetRef.current === null) {
        // Start the glide from exactly where the view sits so its first frame
        // never jumps if the float drifted from the integer scrollTop.
        scrollTopFloatRef.current = container.scrollTop;
      }
      // Normalise the notch to pixels (mice may report lines/pages) and scale it
      // down so a manual nudge is gentle; smaller impulses also read as smoother
      // at slow speeds, since each notch is its own ease curve.
      const step = normalizeWheelDeltaY(event, container.clientHeight);
      const wish = base + step;
      wheelTargetRef.current = Math.min(maxScrollTop, Math.max(0, wish));
      // A wish outside the loaded range is the reader asking for Gurbani that
      // is not in the window yet, and it has to be served here rather than in
      // the glide below. The glide can only ask for more as a side-effect of
      // moving, and at an edge there is nowhere to move: the target clamps to
      // the position already held, so the glide finishes before it reaches its
      // own load call. A Shabad shorter than the viewport never has room to
      // move at all. The periodic loader would cover both, but it only runs
      // while playing, and paused is where a reading starts.
      if (infiniteRef.current) {
        if (wish > maxScrollTop) {
          loadNextShabad();
        } else if (wish < 0) {
          loadPrevShabad();
        }
      }
      if (wheelRafRef.current === null) {
        wheelRafRef.current = requestAnimationFrame(glideFrame);
      }
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
      if (wheelRafRef.current !== null) {
        cancelAnimationFrame(wheelRafRef.current);
        wheelRafRef.current = null;
      }
      if (wheelResumeTimerRef.current) {
        clearTimeout(wheelResumeTimerRef.current);
        wheelResumeTimerRef.current = null;
      }
      cancelSeekSettle();
      cancelAnchorSettle();
      manualScrollRef.current = false;
      wheelTargetRef.current = null;
      prependCompPendingRef.current = false;
    };
  }, [akhandpatt]);

  return { seedState };
};
