// eslint-disable-next-line import/no-unresolved
const { trackEvent } = require('@aptabase/electron/main');
const isOnline = require('is-online');
require('dotenv').config();

class Analytics {
  trackEvent({ category, action, label, value }) {
    isOnline().then((online) => {
      // TODO: for offline users, come up with a way of storing and send when online.
      if (online) {
        console.log('action', action, 'options', { category, label, value });
        trackEvent(action, {
          category,
          label,
          value,
        });
      }
    });
  }
}

module.exports = Analytics;
