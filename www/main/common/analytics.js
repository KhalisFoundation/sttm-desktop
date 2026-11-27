// Small helpers around the main process's analytics (see /analytics.js), so
// renderer code can send an event in one line.
const remote = require('@electron/remote');

const getAnalytics = () => {
  try {
    return remote.getGlobal('analytics');
  } catch (e) {
    return null;
  }
};

export const track = (category, action, label, value) => {
  const analytics = getAnalytics();
  if (analytics) {
    analytics.trackEvent({ category, action, label, value });
  }
};

// Every way a shabad gets opened sends this one event, labelled with where it
// was opened from, so the most opened shabads can be counted in one place.
export const trackShabadOpen = (source, shabadId) => {
  if (shabadId === undefined || shabadId === null) return;
  track('display', 'shabad-open', source, shabadId);
};

// Counts things that happen many times (line changes, shortcuts) and, when
// flushed, sends one event per key (label: the key, value: how many times),
// instead of one event each time.
export const createCounter = (category, action) => {
  let counts = {};
  return {
    add: (key) => {
      counts[key] = (counts[key] || 0) + 1;
    },
    flush: () => {
      Object.keys(counts).forEach((key) => track(category, action, key, counts[key]));
      counts = {};
    },
  };
};

// For controls that change many times in a row (sliders, colour pickers): only
// the last change within `delay` ms is sent.
const debounceTimers = {};
export const trackDebounced = (key, category, action, label, value, delay = 1500) => {
  clearTimeout(debounceTimers[key]);
  debounceTimers[key] = setTimeout(() => {
    delete debounceTimers[key];
    track(category, action, label, value);
  }, delay);
};
