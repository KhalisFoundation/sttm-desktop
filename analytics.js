const { trackEvent } = require('@aptabase/electron/main');

class Analytics {
  trackEvent({ category, action, label, value }) {
    if (process.env.NODE_ENV !== 'development') {
      trackEvent(action, {
        category,
        label,
        value,
      });
    }
  }
}

module.exports = Analytics;
