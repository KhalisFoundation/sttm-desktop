const ua = require('universal-analytics'); // https://www.npmjs.com/package/universal-analytics
const isOnline = require('is-online');
require('dotenv').config();
const fetch = require('node-fetch');

const pjson = require('./package.json');

const appVersion = pjson.version;
// ToDo: Revert back to .env after setting up on AWS build server
const trackingId = 'UA-45513519-12';

class Analytics {
  constructor(userId, store) {
    if (trackingId) {
      this.usr = ua(trackingId, userId);
      this.store = store;
    }
  }

  /**
   * https://developers.google.com/analytics/devguides/collection/analyticsjs/events
   * Name           | type | required | example
   * ------------------------------------------
   * eventCategory  | text |  yes     | Typically the object that was interacted with (e.g. 'Video')
   * eventAction    | text |  yes     | The type of interaction (e.g. 'play')
   * eventLabel     | text |  no      | Useful for categorizing events (e.g. 'Fall Campaign')
   * eventValue     | int  |  no      | A numeric value associated with the event (e.g. 42)
   * @param category
   * @param action
   * @param label
   * @param value
   */
  trackEvent(category, action, label, value) {
    const useragent = this.store.get('user-agent');
    const params = {
      ec: category,
      ea: action,
      el: label,
      ev: value,
      cd1: appVersion,
      useragent,
    };
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${process.env.MEASUREMENT_ID}&api_secret=${process.env.API_SECRET}`;
    const requestData = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.usr.cid,
        events: [
          {
            name: category,
            params,
          },
        ],
      }),
    };

    if (process.env.NODE_ENV !== 'development') {
      // TODO: need to add variable that stops statistics collection
      isOnline().then((online) => {
        // TODO: for offline users, come up with a way of storing and send when online.
        if (online && this.usr) {
          this.usr.event(params).send();

          // Code specific to GA4
          fetch(url, requestData)
            .then((response) => {
              if (response.ok) {
                console.log('Event sent successfully using GA4');
              } else {
                console.error('Error sending event using GA4:');
              }
            })
            .catch((error) => {
              console.error('Error occurred while sending event using GA4:', error);
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
  // when we will remove UA, we can safely remove the below function since it will be outdated
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
