// Scroll speed uses verses per second; each window applies its rendered verse height.
// A 907x497 preview measured 3.75 verses/screen versus 5.69 at 2560x1440, a 1.5x ratio.

// Match the 1-100 range stored by the user setting.
export const MIN_SPEED = 1;
export const MAX_SPEED = 100;

// Move the speed control in five-point increments.
export const SPEED_STEP = 5;

// 0.02-0.5 verses/s gives 1.2-30 verses/min. Roughly 60,000 lines over 48
// hours averages about 0.35 verses/s.
const MIN_VERSES_PER_SECOND = 0.02;
const MAX_VERSES_PER_SECOND = 0.5;

export const speedToVersesPerSecond = (speed) => {
  const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
  const progress = (clamped - MIN_SPEED) / (MAX_SPEED - MIN_SPEED);
  return MIN_VERSES_PER_SECOND + progress * (MAX_VERSES_PER_SECOND - MIN_VERSES_PER_SECOND);
};

// Sample the centred verse and overlay four times per second.
export const CENTER_SAMPLE_INTERVAL = 0.25;

// Check loading and pruning five times per second.
export const JIT_SAMPLE_INTERVAL = 0.2;

// Correct 20% of follower error per frame to smooth differences in pixel grids.
export const SYNC_CORRECTION_GAIN = 0.2;

// Snap errors over half a viewport; they indicate a seek or manual scrub rather than drift.
export const SYNC_SNAP_RATIO = 0.5;

// Clamp integration to 50ms to avoid a jump after a stalled frame.
export const MAX_FRAME_DELTA_SECONDS = 0.05;

// Resume autonomous scrolling if no remote anchor arrives for one second.
export const REMOTE_SYNC_STALE_MS = 1000;

// Resume autoscroll 400ms after the final wheel event in a gesture.
export const WHEEL_RESUME_DELAY_MS = 400;

// Move 22% of the remaining wheel distance per frame.
export const WHEEL_GLIDE_EASING = 0.22;

// Keep wheel-glide steps between 3.5px and 18px to trim spikes and slow tails.
export const WHEEL_GLIDE_MIN_STEP_PX = 3.5;
export const WHEEL_GLIDE_MAX_STEP_PX = 18;

// Scale a typical 300px wheel notch to about a 100px correction.
export const WHEEL_STEP_FACTOR = 0.33;

// Treat wheel deltas reported in line units as 40px per line.
export const WHEEL_LINE_HEIGHT_PX = 40;

// Convert line and page wheel deltas to pixels before applying the step scale.
export const normalizeWheelDeltaY = (event, viewportHeight) => {
  const { deltaY, deltaMode } = event;
  let pixels;
  if (deltaMode === 1) {
    pixels = deltaY * WHEEL_LINE_HEIGHT_PX;
  } else if (deltaMode === 2) {
    pixels = deltaY * viewportHeight;
  } else {
    pixels = deltaY;
  }
  return pixels * WHEEL_STEP_FACTOR;
};

// Re-pin a seek for 800ms while late Gurmukhi font reflow changes verse heights.
export const SEEK_SETTLE_MS = 800;

// Corrections below 1px are not visible.
export const SEEK_SETTLE_TOLERANCE_PX = 1;

// scrollTop is written as an integer, so changes below 0.5px round away.
export const SUB_PIXEL_EPSILON_PX = 0.5;

// Hold a prepended anchor until its height is stable for six frames. Wait at least
// 900ms for font reflow and stop after 2500ms.
export const ANCHOR_SETTLE_STABLE_FRAMES = 6;
export const ANCHOR_SETTLE_MIN_MS = 900;
export const ANCHOR_SETTLE_MAX_MS = 2500;

// Stop resize repair after 1200ms so re-pinning cannot hold against autoscroll.
export const VIEWPORT_REPAIR_MAX_MS = 1200;

// Start the next database load with 1.5 viewports remaining.
export const LOAD_AHEAD_SCREENS = 1.5;

// Keep at least three Shabads mounted before pruning an edge.
export const MIN_MOUNTED_SEGMENTS = 3;

// Prune beyond two viewports, outside the 1.5-viewport load range.
// The gap prevents short Shabads alternating between fetch and prune.
export const PRUNE_SAFETY_SCREENS = 2;

// Retry the first 25 seed loads every 300ms, then every 3s for persistent failures.
export const SEED_RETRY_DELAY_MS = 300;
export const SEED_SLOW_RETRY_DELAY_MS = 3000;
export const SEED_FAST_ATTEMPTS = 25;
