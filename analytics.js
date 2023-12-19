const { trackEvent } = require('@aptabase/electron/main');
const ua = require('universal-analytics');
const isOnline = require('is-online');
require('dotenv').config();

const pjson = require('./package.json');

const appVersion = pjson.version;
const trackingId = process.env.GOOGLE_ANALYTICS_ID;

class Analytics {
  constructor(userId, store) {
    if (trackingId) {
      this.usr = ua(trackingId, userId);
      this.store = store;
    }
  }

  trackEvent({ category, action, label, value }) {
    const useragent = this.store.get('user-agent');
    const params = {
      ec: category,
      ea: action,
      el: label,
      ev: value,
      cd1: appVersion,
      useragent,
    };

    if (process.env.NODE_ENV !== 'development') {
      // TODO: need to add variable that stops statistics collection
      isOnline().then((online) => {
        // TODO: for offline users, come up with a way of storing and send when online.
        if (online && this.usr) {
          this.usr.event(params).send();
          trackEvent(action, {
            category,
            label,
            value,
          });
        }
      });
    } else {
      console.log(
        `Tracking Event suppressed for development ec: ${category}, ea: ${action}, el: ${label}, ev: ${value}, useragent: ${useragent}`,
      );
    }
  }

  /**
   *
   * @param path
   * @param title
   * @param hostname
   */
  trackPageView(path, title, hostname = 'SikhiToTheMax Desktop') {
    if (process.env.NODE_ENV !== 'development') {
      if (this.store.get('userPrefs.app.analytics.collectStatistics')) {
        isOnline().then((online) => {
          if (online && this.usr) {
            this.usr
              .pageview({
                dp: path,
                dt: title,
                dh: hostname,
              })
              .send();
          }
        });
      }
    } else {
      console.log('Tracking Page suppressed for development');
    }
  }
}

module.exports = Analytics;
