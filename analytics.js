const ua = require('universal-analytics'); // https://www.npmjs.com/package/universal-analytics
const isOnline = require('is-online');

const trackingId = 'UA-129669333-1';

class Analytics {
  constructor(userId) {
    if (trackingId) {
      this.usr = ua(trackingId, userId);
    }
  }

  /**
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
    isOnline().then((online) => {
      if (online && this.usr) {
        this.usr
          .event({
            ec: category,
            ea: action,
            el: label,
            ev: value,
          })
          .send();
      }
    });
  }
}

module.exports = Analytics;
