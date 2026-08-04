import { SUB_PIXEL_EPSILON_PX, SYNC_CORRECTION_GAIN } from './scroll-config';

export const remoteCorrection = (position, target) => {
  const error = target - position;
  return Math.abs(error) < SUB_PIXEL_EPSILON_PX ? 0 : error * SYNC_CORRECTION_GAIN;
};

export const wholePixels = (position) => Math.floor(position);

// Chromium quantises scrollTop to physical pixels; translate up by the discarded fraction.
export const subPixelTransform = (position) => {
  const fraction = position - wholePixels(position);
  return fraction ? `translateY(${-fraction}px)` : '';
};

// Preserve the requested fraction unless a whole-pixel gap shows another writer moved it.
export const currentScrollTop = (requested, reported) =>
  Math.abs(requested - reported) < 1 ? requested : reported;
