// eslint-disable-next-line import/no-unresolved
const { trackEvent } = require('@aptabase/electron/main');
const isOnline = require('is-online');
require('dotenv').config();

class Analytics {
  trackEvent({ category, action, label, value }) {
    if (process.env.NODE_ENV !== 'development') {
      // TODO: need to add variable that stops statistics collection
      isOnline().then((online) => {
        // TODO: for offline users, come up with a way of storing and send when online.
        if (online && this.usr) {
          trackEvent(action, {
            category,
            label,
            value,
          });
        }
      });
    } else {
      console.log(
        `Tracking Event suppressed for development ec: ${category}, ea: ${action}, el: ${label}, ev: ${value}`,
      );
    }
  }
}

module.exports = Analytics;
