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
 * Average mounted verse height, excluding the deck's centring padding.
 * Used to convert verses/second to this window's pixels/second.
 *
 * Averaged over the whole mounted window rather than per verse, so the velocity
 * glides as verse lengths vary instead of stepping from one verse to the next.
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
 * Drives the Akhand Paatth teleprompter scroll and centred-line overlay.
 *
 * Infinite SGGS content uses a bounded sliding window of Shabads. Finite content
 * keeps its caller-owned verse list and uses the same scrolling.
 *
 * The rAF loops share refs so they can read current props without restarting.
 * Effects list only values that should trigger them; adding render-local helpers
 * as dependencies would restart the loops on every render. `react-hooks/
 * exhaustive-deps` is not enabled in this repo and would flag these as missing;
 * they are deliberate.
 *
 * Roughly a third of the file is four frame loops and the state they share
 * between frames, which is why it is one module. In reading order:
 *
 *   refs               Props mirrored into refs for the loops to read.
 *   requestSeek        Ask for a verse to be centred; a layout effect does it.
 *   writeScrollPosition The only assignment to `scrollTop` in the file.
 *   pinHeldAnchor      Re-pins the reader's line, before paint, after a reflow.
 *   overlay            Which verse is on the centre line, and telling the app.
 *   settle loops       One waits for a seek to land, one for a reflow to stop.
 *   the window         Load the next/previous Shabad, prune the far one away.
 *   seed effect        Build the window for a new Shabad.
 *   selection effect   Honour a manual selection, remounting a pruned line.
 *   layout effect      Apply pending anchor compensation once the DOM is ready.
 *   autoscroll loop    Mounted only while playing.
 *   anchor loop        Holds the centre line and broadcasts it to the other window.
 *   wheel handler      A momentary manual override of the autoscroll.
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
   * Tags async reads with the reading that started them. The old window can
   * remain mounted while a new seed loads, so its contents cannot identify stale
   * reads. The generation check also applies in `finally`.
   */
  const readingGenerationRef = useRef(0);
  const loadingRef = useRef(false);
  const endedRef = useRef(false);
  // Latches the end callback until content grows below the current position.
  // This keeps the deck's end transition to one call per stop.
  const reachedEndRef = useRef(false);
  const onReadingEndedRef = useRef(onReadingEnded);
  onReadingEndedRef.current = onReadingEnded;
  // Separate load and boundary state for the backward direction, so forward and
  // backward reads can overlap without sharing an end marker.
  const loadingPrevRef = useRef(false);
  const atStartRef = useRef(false);
  // `loadingPrevRef` clears before React commits the prepend. Keep this set until
  // layout compensation runs, otherwise the load-ahead check can queue several
  // Shabads against the same scroll position.
  const prependCompPendingRef = useRef(false);
  const pendingSeekRef = useRef(null);
  // Anchor used to compensate for a prepend or prune above the viewport. Both
  // operations move visible content despite having opposite height deltas.
  const scrollAnchorRef = useRef(null);
  const lastCenterIdRef = useRef(null);
  // Tracks window ownership even after the seed Shabad has been pruned. Mounted
  // content cannot answer whether a seed change requires a rebuild.
  const windowSeedRef = useRef(null);
  // Seeded with the current selection so mounting does not look like a new request.
  // Only explicit selection changes should rebuild a pruned line.
  const handledSelectionRef = useRef(verseSelectionNonce);
  // Float accumulator keeps sub-pixel advances that `scrollTop` rounds away.
  // The rounded browser value is only used when local state has to be reset.
  const scrollTopFloatRef = useRef(0);
  // Wheel deltas accumulate into a target for the glide loop instead of moving
  // the deck once per coarse wheel event.
  const wheelTargetRef = useRef(null);
  const wheelRafRef = useRef(null);
  // Gives the wheel glide temporary ownership of scrollTop without changing autoplay.
  // Autoscroll resumes in the existing play state after the gesture.
  const manualScrollRef = useRef(false);
  const wheelResumeTimerRef = useRef(null);
  // Holds autoscroll while a seek is re-pinned through late font/content reflow.
  // The frame handle allows a newer seek or wheel gesture to cancel the old one.
  const seekingRef = useRef(false);
  const seekSettleRafRef = useRef(null);
  // Invalidates late `fonts.ready` callbacks from superseded seeks, including
  // callbacks left behind after manual wheel input.
  const seekTokenRef = useRef(0);
  // Frame handle for compensating late growth in a prepended Shabad. Other
  // scroll owners cancel this loop before writing their own position.
  const anchorSettleRafRef = useRef(null);
  // Stored outside the loop so an overlapping prepend can extend its deadlines
  // while keeping the older anchor.
  const anchorSettleVerseRef = useRef(null);
  const anchorSettleDeadlinesRef = useRef(null);
  const [seekNonce, setSeekNonce] = useState(0);
  // Bumped to retry a failed seed through the seed effect.
  const [seedNonce, setSeedNonce] = useState(0);
  // Per-seed attempts control retry backoff. A different seed starts again with
  // fast retries.
  const seedAttemptRef = useRef({ id: null, attempts: 0 });
  const seedRetryTimerRef = useRef(null);
  // Infinite seed state: idle means current content is ready;
  //   loading: a read or quick retry is pending
  //   stalled: quick retries are exhausted
  const [seedState, setSeedState] = useState('idle');
  // A fresh remote anchor marks this window as a follower. Negative infinity
  // keeps a new window from following during its first `REMOTE_SYNC_STALE_MS`.
  // No explicit window role is needed.
  const remoteAnchorAtRef = useRef(Number.NEGATIVE_INFINITY);
  // Inference lets a window resume local control when its source disappears
  // instead of leaving it frozen as a follower.
  const isFollowing = () => performance.now() - remoteAnchorAtRef.current < REMOTE_SYNC_STALE_MS;

  // Keep loop inputs current without remounting the animation loop. Recreating a
  // loop would discard its timing and in-flight correction state.
  const speedRef = useRef(scrollSpeed);
  const infiniteRef = useRef(infinite);
  const liveFeedRef = useRef(liveFeed);
  const activeVerseRef = useRef(activeVerse);
  // Lets an async seed completion use the latest selected verse, including a
  // navigator selection made while the database read was pending.
  const activeVerseIdRef = useRef(activeVerseId);
  // Lets a wheel nudge hold the loop before global state catches up in this window.
  const isPlayingRef = useRef(isPlaying);
  // Makes the initial layout revision a no-op; later values open a repair window.
  const layoutRevisionRef = useRef(layoutRevision);
  // Requests one repair window after a settings reflow. It is consumed by the
  // next anchor frame rather than inferred from changing scrollHeight.
  const relayoutPendingRef = useRef(false);
  // Last quiet-layout anchor, shared with the pre-paint layout repair. Keeping it
  // outside the loop preserves the pre-reflow value through React's commit.
  const heldAnchorRef = useRef(null);
  // Nearby leader position for gradual correction by the scroll loop. Large
  // differences are applied directly as passage changes.
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
    // Defer measurement until React has committed the requested verse. The layout
    // effect below applies the seek before paint.
    pendingSeekRef.current = { verseId, align };
    setSeekNonce((nonce) => nonce + 1);
  };

  // Chromium quantises `scrollTop` to a whole *physical* pixel, so on an
  // ordinary 1x projector 3.3px/frame paints as 3, 4, 3, 3, 4. Write whole
  // pixels to `scrollTop` and paint the remainder as a transform.
  // A 2x laptop has a 0.5px quantum and can hide the same flutter.
  //
  // The values must stay complementary: anchor measurements use transformed
  // bounding rects against truncated `scrollTop`. See `scroll-anchor.test.js`.
  // Rounding either side differently makes the measured anchor disagree with
  // the position actually painted.
  // `wholePixels` and `subPixelTransform` implement the same split.
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

  // Clear the transform on exit, including while paused. A leftover transform
  // would create a stacking/compositing boundary for ordinary slides that reuse
  // the wrapper.
  useEffect(() => clearSubPixelOffset, [akhandpatt]);

  // Clamp writes and keep the float accumulator in step. Short content cannot
  // retain a position beyond its current end.
  // All direct positioning paths pass through this helper.
  const setScrollTop = (value) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const clamped = Math.min(maxScrollTop, Math.max(0, value));
    writeScrollPosition(clamped);
    scrollTopFloatRef.current = clamped;
    // Direct local writes invalidate an older remote correction, which was
    // calculated from the previous position.
    remoteTargetRef.current = null;
  };

  // Apply layout compensation to the last requested position, not the browser's
  // truncated `scrollTop`.
  // Both callers supply a height delta, so they need the float as their base.
  const moveScrollTopBy = (delta) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    setScrollTop(currentScrollTop(scrollTopFloatRef.current, container.scrollTop) + delta);
  };

  // Re-pin the held content point, returning false if it is no longer mounted
  // or the deck is temporarily unavailable.
  const pinHeldAnchor = () => {
    const container = containerRef.current;
    // Manual scroll and seek have temporary ownership of scrollTop. The held
    // anchor is refreshed after they finish.
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

  // Settings can reflow content without resizing the container. Re-pin before
  // paint, then repair late font/image reflow without sampling a drifted anchor.
  // The revision says only that caller-owned layout changed.
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
    // The dedicated channel lets the main process discard duplicate projection output.
    // Both decks emit centred lines, but only the preview should drive the overlay.
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
    // Hit-test the painted centre so transforms and differing verse heights are
    // reflected in the overlay line.
    const el = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const verseEl = enclosingVerse(el);
    if (!verseEl) {
      return null;
    }
    const verseId = verseIdOf(verseEl);
    return Number.isNaN(verseId) ? null : verseId;
  };

  const syncOverlayToCentre = (force = false) => {
    // Normal samples emit only when the centred verse changes. Forced samples
    // refresh consumers after a seek or settle.
    const verseId = getCenteredVerseId();
    if (verseId === null) {
      return;
    }
    if (!force && verseId === lastCenterIdRef.current) {
      return;
    }
    lastCenterIdRef.current = verseId;
    emitOverlay(verseId);

    // Remember the place for an infinite window remount. Finite content keeps its
    // own position through the deck.
    const model = modelRef.current;
    if (model && windowSeedRef.current !== null) {
      const shabadId = shabadIdOfVerse(model, verseId);
      if (shabadId !== null) {
        rememberReadingPosition(windowSeedRef.current, shabadId, verseId);
      }
    }
  };

  // Cancel settling and invalidate its pending `fonts.ready` correction. This is
  // shared by replacement seeks, wheel takeover, and teardown.
  // Clearing `seekingRef` hands control back to autoscroll.
  const cancelSeekSettle = () => {
    if (seekSettleRafRef.current !== null) {
      cancelAnimationFrame(seekSettleRafRef.current);
      seekSettleRafRef.current = null;
    }
    seekTokenRef.current += 1;
    seekingRef.current = false;
  };

  // Re-pin the selected line while the Gurmukhi font and async content reflow.
  // Fallback-font layout can look stable before the real font lands. Autoscroll
  // waits for the fixed window and one final `fonts.ready` correction.
  const startSeekSettle = (verseId, align) => {
    cancelSeekSettle();
    if (!containerRef.current) {
      return;
    }
    seekingRef.current = true;
    seekTokenRef.current += 1;
    const token = seekTokenRef.current;
    // Shared by the frame loop and final `fonts.ready` correction so both use the
    // same alignment calculation.
    const pin = () => {
      const node = verseRefs.current[verseId];
      if (!containerRef.current || !node) {
        return false;
      }
      const containerRect = containerRef.current.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      const currentY = nodeRect.top - containerRect.top;
      // Compute drift in viewport coordinates; content offsets may change while
      // the font is reflowing.
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
    // A cold font load may finish after the settle window. Re-pin once when
    // `fonts.ready` resolves, but only for the current seek and scroll owner.
    // The token prevents an old promise from moving a newer selection.
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (seekTokenRef.current === token && !manualScrollRef.current) {
          pin();
          syncOverlayToCentre(true);
        }
      });
    }
  };

  // Content-space Y of a rendered verse's top edge. Unlike viewport Y, this
  // changes when content is inserted or removed above it.
  // Adding scrollTop removes ordinary viewport movement from the measurement.
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

  // Rendered Y relative to the container, independent of scrollTop clamping.
  // Comparing it before and after compensation measures the visible skip.
  const verseViewportTop = (verseId) => {
    const container = containerRef.current;
    const node = verseRefs.current[verseId];
    if (!container || !node) {
      return null;
    }
    return node.getBoundingClientRect().top - container.getBoundingClientRect().top;
  };

  // Cancel post-prepend settling and discard its mutable deadlines.
  const cancelAnchorSettle = () => {
    if (anchorSettleRafRef.current !== null) {
      cancelAnimationFrame(anchorSettleRafRef.current);
      anchorSettleRafRef.current = null;
    }
    anchorSettleDeadlinesRef.current = null;
  };

  // Prepended verses keep growing after the layout effect. Track the anchor's
  // content offset during that reflow and add growth to scrollTop and any wheel
  // target. Content-space offsets do not change during the active upward glide.
  // Overflow anchoring is disabled, so this loop owns the late compensation.
  // A one-shot layout-effect correction cannot observe this later growth.
  const startAnchorSettle = (verseId) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    // On overlapping prepends, keep the older anchor: it sits below both new
    // Shabads and absorbs growth from each. Only restart the deadlines.
    // Switching to the newer, higher anchor would miss remaining growth in the
    // first prepend.
    // The running loop keeps its original `lastOffset`.
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
        // Fold only layout growth into scroll state; user scrolling does not alter
        // this content-space offset.
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
      // The minimum deadline covers false stability at fallback-font height.
      // Stop after stable frames or at the maximum deadline; both deadlines are
      // in the ref so another prepend can extend them.
      // The cap handles fonts or content that never report a stable run.
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
    // Start a forward read once the remaining content falls inside the load-ahead
    // distance. The loading flag coalesces repeated JIT samples.
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
        // The generation rejects old readings; the tail rejects a shifted window.
        // A concurrent top prune leaves both checks valid.
        // The checks run before touching either model or loading state.
        if (readingGenerationRef.current !== generation) {
          return;
        }
        if (lastShabadId(modelRef.current) !== tailId) {
          return;
        }
        // The feed returns null only after stepping over gaps in the id space,
        // so this can latch the real end of the source.
        // A rejected read follows the retry path instead.
        if (!next) {
          endedRef.current = true;
          return;
        }
        modelRef.current = appendShabad(modelRef.current, next.shabadId, next.verses);
        // Growth is at the bottom, so existing content, and scrollTop, is
        // undisturbed. That is why an append needs no anchor and a prepend does.
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
        // Leave `endedRef` clear so a failed read can retry on the next JIT sample.
        traceScroll('appendFailed', { tailId, message: error && error.message });
      })
      .finally(() => {
        if (readingGenerationRef.current !== generation) {
          return;
        }
        loadingRef.current = false;
      });
  };

  // Load a previous Shabad when a manual upward scroll approaches the window's
  // top. Autoscroll only moves forward, so fresh windows do not preload backward.
  // This restores Shabads that have already been pruned from the top.
  const loadPrevShabad = () => {
    // The prepend-compensation latch extends beyond the database loading flag and
    // blocks another read until React has committed this one.
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
        // The generation rejects old readings; the head rejects a shifted window.
        // A concurrent bottom prune leaves both checks valid.
        // The checks run before capturing a compensation anchor.
        if (readingGenerationRef.current !== generation) {
          return;
        }
        if (firstShabadId(modelRef.current) !== headId) {
          return;
        }
        // Null means the feed reached the start after stepping over gaps. Failed
        // reads leave this marker clear.
        if (!prev) {
          atStartRef.current = true;
          return;
        }
        // Capture the head's screen position for post-prepend compensation. The
        // inserted height will otherwise move every mounted verse downward.
        // The same anchor shape is consumed for top pruning.
        const headVerse = modelRef.current.verses[0];
        const headTop = verseOffsetInContent(headVerse.ID);
        // Do not prepend without a measurable anchor. The next wheel sample retries
        // after the head is laid out.
        // The latch is not set until this measurement succeeds.
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
        // Admit one prepend per layout-compensation cycle. The layout effect that
        // consumes this anchor releases the latch.
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
        // Leave `atStartRef` clear so the next wheel-up can retry instead of
        // treating a database error as the start of the Granth.
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
    // Keep a safety screen above the viewport before removing the oldest segment.
    // The next segment's first verse survives as the compensation anchor.
    const container = containerRef.current;
    const model = modelRef.current;
    if (!container || !model || model.segments.length <= MIN_MOUNTED_SEGMENTS) {
      return;
    }
    // The second segment's first verse marks when the first is safely off-screen,
    // including the configured safety margin.
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
    // Capture the boundary's screen Y. Restoration can then be absolute and
    // remains correct if the shorter content makes the browser clamp scrollTop.
    // A content-space delta cannot recover the pre-clamp screen position.
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
    atStartRef.current = false;
    traceScroll('prune', {
      boundaryVerseId: boundaryVerse.ID,
      prevViewportY: Math.round(prevViewportY),
      scrollTop: Math.round(container.scrollTop),
      segments: modelRef.current.segments.length,
    });
  };

  // Drop a trailing Shabad once it is safely below an upward-moving viewport.
  // Content removed below the viewport needs no compensation.
  // Keeping the same minimum segment count bounds both scroll directions.
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
    endedRef.current = false;
    traceScroll('pruneBottom', {
      lastShabadId: lastSegment.shabadId,
      scrollTop: Math.round(container.scrollTop),
      segments: modelRef.current.segments.length,
    });
  };

  // Rebuild an infinite window only for a new seed, not when its original seed
  // is pruned. `windowSeedRef` records ownership independently of mounted segments.
  // Generation changes invalidate any feed work from the previous window.
  useEffect(() => {
    if (!akhandpatt) {
      modelRef.current = null;
      windowSeedRef.current = null;
      readingGenerationRef.current += 1;
      setSeedState('idle');
      cancelAnchorSettle();
      prependCompPendingRef.current = false;
      // Keep the reading position through temporary suspension by a misc slide.
      // A genuine exit clears it so a later reading starts at its selection.
      // This distinguishes an interrupted reading from a later use of the same seed.
      if (!viewSuspended) {
        forgetReadingPosition();
      }
      return undefined;
    }
    if (infinite && seedShabadId) {
      if (windowSeedRef.current === seedShabadId) {
        return undefined;
      }
      // Retries of the same seed keep counting toward backoff. A new seed resets
      // the attempt record before its first read.
      if (seedAttemptRef.current.id !== seedShabadId) {
        seedAttemptRef.current = { id: seedShabadId, attempts: 0 };
      }
      windowSeedRef.current = seedShabadId;
      // Invalidate all reads from the previous reading before starting the new
      // database request.
      readingGenerationRef.current += 1;
      const generation = readingGenerationRef.current;
      endedRef.current = false;
      atStartRef.current = false;
      loadingRef.current = true;
      loadingPrevRef.current = false;
      prependCompPendingRef.current = false;
      lastCenterIdRef.current = null;
      seedAttemptRef.current.attempts += 1;
      // Slow retries remain stalled rather than flashing back to loading. The
      // state changes only when the seed succeeds or changes.
      const stalled = seedAttemptRef.current.attempts > SEED_FAST_ATTEMPTS;
      setSeedState(stalled ? 'stalled' : 'loading');

      // Clear ownership before scheduling the next seed attempt. The nonce then
      // re-enters this effect for the same seed.
      // Backoff controls how quickly that nonce is bumped.
      const scheduleReseed = () => {
        windowSeedRef.current = null;
        seedRetryTimerRef.current = setTimeout(
          () => {
            setSeedNonce((nonce) => nonce + 1);
          },
          stalled ? SEED_SLOW_RETRY_DELAY_MS : SEED_RETRY_DELAY_MS,
        );
      };

      // Resume a remount from its saved Shabad and verse; otherwise open the
      // selected seed.
      // Reading-position storage holds only the current continuous reading.
      const resume = recallReadingPosition(seedShabadId);
      if (!resume) {
        // At most one reading position is retained, so a different selection
        // discards the previous reading.
        forgetReadingPosition();
      }
      const loadShabadId = resume ? resume.shabadId : seedShabadId;

      readShabad(loadShabadId)
        .then((seed) => {
          // Discard a superseded seed if a newer selection landed mid-read. Its
          // `finally` block uses the same generation guard.
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
          // Centre an explicit selection or resumed position. A fresh Shabad
          // starting at its first verse is top-aligned to avoid a blank gap.
          // A selection outside these verses falls back to the first verse.
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
      // Finite content keeps caller-owned verses and skips the feed window.
      modelRef.current = null;
      windowSeedRef.current = null;
      readingGenerationRef.current += 1;
      lastCenterIdRef.current = null;
      forgetReadingPosition();
      setSeedState('idle');
      requestSeek(activeVerseId, 'center');
    }
    // Cancel retries when the seed changes or the deck unmounts. Generation
    // checks handle database requests that cannot be cancelled.
    return () => {
      if (seedRetryTimerRef.current) {
        clearTimeout(seedRetryTimerRef.current);
        seedRetryTimerRef.current = null;
      }
    };
  }, [akhandpatt, viewSuspended, infinite, seedShabadId, seedNonce]);

  // Seek mounted selections and rebuild pruned ones. The selection nonce allows
  // reselecting the active line and distinguishes a pruned line from initial render.
  // The seed effect owns alignment after a rebuild.
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
    // An unmounted line may still be waiting for its initial render. Only a new
    // selection can mean the owned window needs rebuilding.
    // Rebuilding on mount would discard a saved position and start a second read.
    if (!isNewSelection) {
      return;
    }
    if (infiniteRef.current && windowSeedRef.current === seedShabadId) {
      traceScroll('reseedForPrunedVerse', { activeVerseId, seedShabadId });
      // A manual selection supersedes the remembered remount position. Clear it
      // before making the same seed look new to the seed effect.
      forgetReadingPosition();
      windowSeedRef.current = null;
      setSeedNonce((nonce) => nonce + 1);
    }
  }, [akhandpatt, activeVerseId, verseSelectionNonce, seedShabadId]);

  // Apply anchor compensation and seeks after DOM updates but before paint.
  // Both operations depend on measurements from the committed verse nodes.
  // Pending work stays in refs across the render that changes the verse list.
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
        // Restore absolutely as `newOffset - viewportY`. A delta from live
        // scrollTop double-counts any browser clamp after content grows or shrinks.
        // This is used for both prepends and top prunes.
        // The captured viewport Y survives either clamp direction.
        setScrollTop(newOffset - prevViewportY);
        // Shift an active wheel target by the same compensation; it stores an
        // absolute destination in the changing content coordinates.
        if (wheelTargetRef.current !== null) {
          wheelTargetRef.current += container.scrollTop - before;
        }
        // `visibleSkip` measures rendered movement despite scrollTop clamping.
        // `interimDrift` records movement before React's commit, separating a
        // visible skip from expected numeric movement. These values are diagnostics only.
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
        // Prepended verses keep growing after this layout effect, so continue
        // pinning their anchor. Pruned content was already laid out.
        // The settle loop observes the late offset growth frame by frame.
        // Only prepends open this second compensation phase.
        if (reason === 'prepend') {
          startAnchorSettle(verseId);
        }
      }
      scrollAnchorRef.current = null;
      // Release the prepend latch even when its anchor measurement failed. A
      // missing node must not block every later backward load.
      if (reason === 'prepend') {
        prependCompPendingRef.current = false;
      }
    }
    if (pendingSeekRef.current !== null) {
      const { verseId, align } = pendingSeekRef.current;
      const targetTop = verseOffsetInContent(verseId);
      const node = verseRefs.current[verseId];
      if (targetTop !== null && node) {
        // Fresh Shabads use the top edge; resumes and selections use the centre.
        // `setScrollTop` clamps either alignment for short content.
        const target =
          align === 'top'
            ? targetTop
            : targetTop - (container.clientHeight - node.offsetHeight) / 2;
        // A seek takes ownership from post-prepend settling before its first write.
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
        // Keep the line pinned through late font/content reflow. The initial
        // layout-effect measurement is not the final verse geometry.
        startSeekSettle(verseId, align);
      }
    }
  }, [activeVerse, seekNonce]);

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
    // Cached to avoid a layout read every frame; refresh on the JIT cadence when
    // appends, prunes, and reflows may have changed the mounted average.
    let averageVerseHeight = measureAverageVerseHeight(container);
    // Resume from the current position after a wheel, seek, or pause instead of
    // carrying an older float into the new loop.
    scrollTopFloatRef.current = container.scrollTop;

    let reportedStepFault = false;

    // Close part of a follower's remaining error each frame. Retire the target
    // once the remaining difference is below the paintable threshold.
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
      // Cap long frame gaps so a browser hitch pauses instead of leaping forward.
      // This also covers a backgrounded or blocked renderer.
      const deltaSeconds = Math.min((timestamp - lastTimestamp) / 1000, MAX_FRAME_DELTA_SECONDS);
      lastTimestamp = timestamp;

      // Hold while paused, seeking, or under wheel control. Advancing
      // `lastTimestamp` prevents a catch-up jump when control returns.
      // The active owner writes scrollTop independently.
      if (!isPlayingRef.current || manualScrollRef.current || seekingRef.current) {
        return;
      }

      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      // Trace unexpected backward movement since the last float write. React
      // commits, anchor compensation, and browser anchoring can all move it.
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
        // Resume from the browser's position after an external move instead of
        // snapping forward to the stale float.
        scrollTopFloatRef.current = actualBefore;
      }
      if (scrollTopFloatRef.current < maxScrollTop && averageVerseHeight) {
        // Speed is verses/second, converted through each window's average verse
        // height so preview and projection advance together across different layouts.
        // The float retains advances smaller than one physical pixel.
        const velocity = speedToVersesPerSecond(speedRef.current) * averageVerseHeight;
        const advanced = scrollTopFloatRef.current + velocity * deltaSeconds;
        const next = Math.max(0, Math.min(maxScrollTop, converge(advanced)));
        scrollTopFloatRef.current = next;
        writeScrollPosition(next);
      }

      // Report the end of continuous content once. Appending below clears the latch.
      // Finite content never sets `endedRef`.
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

    // Keep scheduling after callback errors, which React error boundaries do not catch.
    // Log only the first failure to avoid flooding the renderer console.
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

  // The same held centre anchor repairs local reflows and synchronises windows.
  // Autoplay uses verses/second in each layout; anchors carry manual movement.
  // Followers continue their own loop between updates, so the preview broadcasts
  // even while stationary. A follower never publishes its received position.
  useEffect(() => {
    if (!akhandpatt) {
      return undefined;
    }
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    // Rate-limit the centre hit-test used for overlay updates. Remote anchors
    // arrive every frame, while the centred verse changes much less often.
    let lastCentreSampleMs = 0;
    const onRemoteAnchor = (event, payload) => {
      // Receipt time doubles as follower-role detection and is updated even when
      // local wheel or seek ownership delays applying the anchor.
      remoteAnchorAtRef.current = performance.now();
      // Wheel and seek retain local ownership until they settle. Applying a
      // remote anchor here would introduce a second scrollTop writer.
      if (manualScrollRef.current || seekingRef.current) {
        return;
      }
      const anchor = JSON.parse(payload);
      const target = resolveAnchorScrollTop(container, anchor);
      if (target !== null) {
        // While playing, nearby anchors become correction targets for the existing
        // loop. Paused or far-away followers take the position directly. Apply
        // every paused anchor because it also repairs layout changes.
        // `SYNC_SNAP_RATIO` separates ordinary drift from a different passage.
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
      // Grow toward an anchor outside the mounted/range window. Loader guards
      // limit the per-frame requests to one in-flight read.
      // A later anchor resolves exactly once the required Shabad is mounted.
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
        // Grow the approached edge and prune the trailing edge. This keeps a long
        // remote scrub from expanding the follower DOM without bound.
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
      // Viewport changes reflow `vh` content while retaining pixel scrollTop.
      // `scrollHeight` kept shrinking for ~230ms after the container stopped
      // resizing, so keep one anchor pinned until height is stable or the repair
      // deadline expires.
      // Ending at the container resize left the reading eight verses adrift in
      // the workspace-switch probe.
      //
      // Settings reflows are signalled by `layoutRevision`; inferring them from
      // scrollHeight would also catch loads and prunes with their own compensation.
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
        // Keep the old held anchor for the whole repair window.
        repairDeadline = timestamp + VIEWPORT_REPAIR_MAX_MS;
        repairStableFrames = 0;
      } else if (repairDeadline) {
        // Stability is based on content height, not container size.
        repairStableFrames = contentChanged ? 0 : repairStableFrames + 1;
        if (repairStableFrames >= ANCHOR_SETTLE_STABLE_FRAMES || timestamp >= repairDeadline) {
          repairDeadline = 0;
        }
      }

      if (repairDeadline) {
        pinHeldAnchor();
      } else if (!contentChanged) {
        // Do not replace the held anchor with a mid-reflow position. Re-reading
        // there would make the repair preserve the drift it is correcting.
        heldAnchorRef.current = readScrollAnchor(container) || heldAnchorRef.current;
      }

      // Broadcast once per native frame; a nominal 60Hz limiter suppressed 60Hz
      // updates and reduced 144Hz to every third frame. Sending costs 0.0022ms;
      // receiving measured 0.045ms scrolling and 0.047ms paused (under 0.05ms).
      // At 144Hz this used under 1% of a thread measured 91% idle.
      // Followers return before publishing.
      if (isFollowing()) {
        return;
      }
      if (heldAnchorRef.current) {
        ipcRenderer.send('akhandpatt-scroll-sync', JSON.stringify(heldAnchorRef.current));
      }
    };

    // Keep the always-on anchor loop running after callback errors. It remains
    // active while paused because viewport repair and window sync still apply.
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

  // Wheel input temporarily owns scrollTop without changing autoplay. Coarse
  // deltas accumulate into a target and glide over successive frames. Native
  // scrolling is hidden, so prevent the event from reaching an ancestor.
  // The same handler is mounted in preview and projection; followers reject it.
  useEffect(() => {
    if (!akhandpatt) {
      return undefined;
    }
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    // Return whether `glideFrame` should schedule another frame. That wrapper is
    // the sole owner of `wheelRafRef`.
    const glide = () => {
      // Hand scroll ownership back when the gesture settles or the deck unmounts.
      // Clear the target before returning to the autoscroll loop.
      if (!containerRef.current || wheelTargetRef.current === null || !manualScrollRef.current) {
        wheelTargetRef.current = null;
        return false;
      }
      // Glide from the float accumulator. Reading rounded scrollTop each frame
      // makes a small remaining distance eased by 22% round to 0px and stall.
      // Only the final write is quantised for Chromium.
      const { current } = scrollTopFloatRef;
      const diff = wheelTargetRef.current - current;
      const absDiff = Math.abs(diff);
      // Snap the final sub-pixel remainder and release the target.
      if (absDiff < SUB_PIXEL_EPSILON_PX) {
        setScrollTop(wheelTargetRef.current);
        wheelTargetRef.current = null;
        syncOverlayToCentre(true);
        return false;
      }
      // Clamp each eased step: the cap handles stacked notches, the floor removes
      // the slow tail, and `absDiff` prevents overshoot.
      // This keeps the middle of the glide close to a uniform pace.
      const eased = absDiff * WHEEL_GLIDE_EASING;
      const clampedStep = Math.min(
        WHEEL_GLIDE_MAX_STEP_PX,
        Math.max(WHEEL_GLIDE_MIN_STEP_PX, eased),
      );
      const stepPx = Math.min(clampedStep, absDiff) * Math.sign(diff);
      setScrollTop(current + stepPx);
      syncOverlayToCentre();
      // Manual glides use the same JIT window, growing only the approached edge
      // and pruning the trailing one. Running both directions together can make
      // the trailing prune re-trigger the opposite load guard.
      // Top-prune compensation also shifts the glide's absolute target.
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

    // Clear glide state after an error so the next wheel event can restart it.
    // A stale non-null frame handle would otherwise block `onWheel`.
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
      // Ignore wheel input on a following display; the next anchor would replace it.
      // The same gesture on the preview reaches this display through sync.
      if (isFollowing()) {
        return;
      }
      // Wheel input takes ownership from seek settling before changing the target.
      cancelSeekSettle();
      // Group a burst of notches into one gesture before handing back to autoscroll.
      // Each event resets the quiet-period timer.
      manualScrollRef.current = true;
      if (wheelResumeTimerRef.current) {
        clearTimeout(wheelResumeTimerRef.current);
      }
      wheelResumeTimerRef.current = setTimeout(() => {
        // Resume from the position maintained by the glide's float accumulator.
        manualScrollRef.current = false;
        wheelResumeTimerRef.current = null;
        traceScroll('wheelResume', { scrollTop: Math.round(container.scrollTop) });
      }, WHEEL_RESUME_DELAY_MS);

      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const base = wheelTargetRef.current === null ? container.scrollTop : wheelTargetRef.current;
      if (wheelTargetRef.current === null) {
        // Start a new glide from the browser's current position. This discards
        // float drift left by the previous scroll owner.
        scrollTopFloatRef.current = container.scrollTop;
      }
      // Normalise line/page wheel modes to the configured pixel nudge. Different
      // mouse drivers do not agree on the unit in `deltaY`.
      const step = normalizeWheelDeltaY(event, container.clientHeight);
      const wish = base + step;
      wheelTargetRef.current = Math.min(maxScrollTop, Math.max(0, wish));
      // Load immediately when the requested target lies outside the window. At
      // an edge the clamped glide cannot move far enough to invoke its loader,
      // especially while paused or when a Shabad is shorter than the viewport.
      // The periodic loader is unavailable while paused.
      // In-flight guards coalesce repeated edge notches.
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
      // Release every timer and scroll owner used by the wheel effect.
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
      // The sub-pixel transform is cleared by the separate view cleanup effect.
    };
  }, [akhandpatt]);

  return { seedState };
};
