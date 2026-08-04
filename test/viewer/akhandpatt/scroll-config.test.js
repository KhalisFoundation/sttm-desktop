import {
  MIN_SPEED,
  MAX_SPEED,
  SPEED_STEP,
  speedToVersesPerSecond,
  normalizeWheelDeltaY,
  WHEEL_STEP_FACTOR,
  WHEEL_LINE_HEIGHT_PX,
  WHEEL_GLIDE_MIN_STEP_PX,
  WHEEL_GLIDE_MAX_STEP_PX,
  MAX_FRAME_DELTA_SECONDS,
  SYNC_SNAP_RATIO,
  REMOTE_SYNC_STALE_MS,
  VIEWPORT_REPAIR_MAX_MS,
  ANCHOR_SETTLE_MAX_MS,
  LOAD_AHEAD_SCREENS,
  PRUNE_SAFETY_SCREENS,
} from '../../../www/main/viewer/akhandpatt/scroll-config';
import { settings } from '../../../www/configs/user-settings.json';

describe('speedToVersesPerSecond', () => {
  it('expresses speed in verses per second, not pixels or screens', () => {
    // Screens/second ran 1.5x fast on one display because the same Gurbani
    // occupied 14.5 screens
    // on the preview and 9.6 on the projection. Verses/second is content-relative;
    // each window converts it through its own measured verse height. These bounds
    // are what makes that conversion
    // meaningful, so a change here is a change to the sync contract.
    expect(speedToVersesPerSecond(MIN_SPEED)).toBeCloseTo(0.02, 6);
    expect(speedToVersesPerSecond(MAX_SPEED)).toBeCloseTo(0.5, 6);
  });

  it('puts a recited Akhand Paatth pace in the upper half of the slider', () => {
    // ~60,000 lines over 48 hours is roughly 0.35 verses/second. Reciting pace
    // belongs at a *fast* setting rather than a middling one: reading along with
    // a scrolling page wants noticeably less than the reciter's own pace, so the
    // slider gives more resolution to its lower range.
    const recitationPace = 0.35;
    expect(speedToVersesPerSecond(MAX_SPEED)).toBeGreaterThan(recitationPace);
    const speedAtRecitationPace = Array.from(
      { length: MAX_SPEED },
      (unused, i) => i + MIN_SPEED,
    ).find((speed) => speedToVersesPerSecond(speed) >= recitationPace);
    expect(speedAtRecitationPace).toBeGreaterThan(MAX_SPEED / 2);
  });

  it('increases monotonically across the slider', () => {
    for (let speed = MIN_SPEED; speed < MAX_SPEED; speed += 1) {
      expect(speedToVersesPerSecond(speed + 1)).toBeGreaterThan(speedToVersesPerSecond(speed));
    }
  });

  it('clamps out-of-range settings rather than extrapolating', () => {
    // A persisted setting from an older build, or an unclamped keyboard nudge,
    // must not produce a negative or runaway velocity.
    expect(speedToVersesPerSecond(0)).toBe(speedToVersesPerSecond(MIN_SPEED));
    expect(speedToVersesPerSecond(-500)).toBe(speedToVersesPerSecond(MIN_SPEED));
    expect(speedToVersesPerSecond(101)).toBe(speedToVersesPerSecond(MAX_SPEED));
    expect(speedToVersesPerSecond(1e9)).toBe(speedToVersesPerSecond(MAX_SPEED));
  });
});

describe('SPEED_STEP', () => {
  it('lets the steppers reach both ends of the slider', () => {
    // The steppers clamp to the slider's range. A step size that does not divide
    // it would leave the last press short of the end and then jump.
    expect(Number.isInteger(SPEED_STEP)).toBe(true);
    expect(SPEED_STEP).toBeGreaterThan(0);
    expect((MAX_SPEED - MIN_SPEED + 1) % SPEED_STEP).toBe(0);
  });
});

describe('normalizeWheelDeltaY', () => {
  const VIEWPORT = 497;

  it('treats a pixel delta as pixels', () => {
    expect(normalizeWheelDeltaY({ deltaY: 300, deltaMode: 0 }, VIEWPORT)).toBeCloseTo(
      300 * WHEEL_STEP_FACTOR,
      6,
    );
  });

  it('converts line and page deltas to pixels first', () => {
    // Most mice report pixels, but some devices and platforms report lines or
    // pages. Without normalising, the same physical gesture would scroll wildly
    // different distances depending on the operator's hardware.
    expect(normalizeWheelDeltaY({ deltaY: 3, deltaMode: 1 }, VIEWPORT)).toBeCloseTo(
      3 * WHEEL_LINE_HEIGHT_PX * WHEEL_STEP_FACTOR,
      6,
    );
    expect(normalizeWheelDeltaY({ deltaY: 1, deltaMode: 2 }, VIEWPORT)).toBeCloseTo(
      VIEWPORT * WHEEL_STEP_FACTOR,
      6,
    );
  });

  it('preserves direction', () => {
    expect(normalizeWheelDeltaY({ deltaY: -300, deltaMode: 0 }, VIEWPORT)).toBeLessThan(0);
    expect(normalizeWheelDeltaY({ deltaY: -3, deltaMode: 1 }, VIEWPORT)).toBeLessThan(0);
  });

  it('scales a notch down, so one notch is a nudge rather than a jump', () => {
    // The wheel is for nudging back to the Granthi's line, not for navigating.
    // A raw notch overshot, and larger impulses also read as coarser because each
    // notch is its own ease curve.
    expect(WHEEL_STEP_FACTOR).toBeLessThan(1);
    expect(Math.abs(normalizeWheelDeltaY({ deltaY: 300, deltaMode: 0 }, VIEWPORT))).toBeLessThan(
      300,
    );
  });
});

describe('timing constants', () => {
  it('integrates at most a few frames of elapsed time in one step', () => {
    // The loop advances by velocity x elapsed, so an unbounded elapsed turns a
    // collection, compositor stall, or scheduling delay into one proportional
    // leap.
    // Long enough that ordinary jitter still integrates exactly; short enough
    // that a stall reads as a pause rather than a jump.
    expect(MAX_FRAME_DELTA_SECONDS).toBeGreaterThan(2 / 60);
    expect(MAX_FRAME_DELTA_SECONDS).toBeLessThan(0.2);
  });

  it('snaps once the windows are a viewport-relative distance apart', () => {
    // Below this the windows are drifting and easing is right; above it they are
    // showing different Gurbani, and easing would be a slow smear through
    // verses nobody asked for. Expressed as a fraction of a viewport.
    expect(SYNC_SNAP_RATIO).toBeGreaterThan(0);
    expect(SYNC_SNAP_RATIO).toBeLessThanOrEqual(1);
  });

  it('treats an anchor as stale only well after several missed broadcasts', () => {
    // Follower mode is inferred from anchor freshness, and anchors are broadcast
    // every frame, so this window has to outlast the longest gap between frames
    // that can happen while the leader is still broadcasting. `MAX_FRAME_DELTA`
    // is where the code already draws that line: beyond it a gap is treated as a
    // stall rather than motion. Too tight and one stall flips the projection
    // into scrolling autonomously mid-Paatth, which is two writers on the same
    // scroll position.
    expect(REMOTE_SYNC_STALE_MS).toBeGreaterThan(MAX_FRAME_DELTA_SECONDS * 1000 * 10);
  });

  it('caps the viewport repair well below the seek settle', () => {
    // The viewport repair pins the deck against the autoscroll, so an over-long
    // backstop reads as the scroll stalling. The seek settle has no such conflict
    // (the autoscroll is already held) and can afford to be patient.
    expect(VIEWPORT_REPAIR_MAX_MS).toBeLessThan(ANCHOR_SETTLE_MAX_MS);
  });
});

describe('wheel glide velocity clamp', () => {
  it('keeps a usable band between the floor and the cap', () => {
    // A plain ease-out swings between a spike as each notch lands and a near-zero
    // tail as it approaches, producing judder. The floor removes the tail and the
    // cap trims the spike.
    expect(WHEEL_GLIDE_MIN_STEP_PX).toBeGreaterThan(0);
    expect(WHEEL_GLIDE_MAX_STEP_PX).toBeGreaterThan(WHEEL_GLIDE_MIN_STEP_PX * 2);
  });
});

describe('load and prune thresholds', () => {
  it('leaves a band where a Shabad is neither loaded nor pruned', () => {
    // Without a gap, a Shabad shorter than the overlap (two or three verses)
    // would sit far enough out to prune while still being close enough to load.
    // The separation prevents repeated fetching and dropping regardless of
    // which check runs first.
    expect(PRUNE_SAFETY_SCREENS).toBeGreaterThan(LOAD_AHEAD_SCREENS);
  });
});

describe('the persisted scroll speed', () => {
  it('starts inside the range the control offers', () => {
    // The schema seeds the store and the control clamps to `scroll-config`, so a
    // default outside that range would snap on first use and disagree with the
    // settings file.
    const { initialValue } = settings['akhandpatt-scroll-speed'];
    expect(initialValue).toBeGreaterThanOrEqual(MIN_SPEED);
    expect(initialValue).toBeLessThanOrEqual(MAX_SPEED);
  });

  it('has no display metadata', () => {
    // The speed lives in the schema only so it persists; it is not listed in any
    // settings category, so `min`/`max`/`step` metadata would render nowhere.
    // The control bounds are `MIN_SPEED` and `MAX_SPEED`.
    expect(Object.keys(settings['akhandpatt-scroll-speed'])).toEqual(['initialValue']);
  });
});
