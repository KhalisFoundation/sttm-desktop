import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

const SlideAnnouncement = ({
  getFontSize,
  isWaheguruSlide,
  isMoolMantraSlide,
  isEmptySlide,
  isDhanGuruSlide,
}) => {
  const { announcementsFontSize } = useStoreState(state => state.userSettings);
  const { announcementString, announcementGurmukhi, dhanGuruString } = useStoreState(
    state => state.navigator,
  );

  const getAnnouncementText = (waheguruSlide, moolMantraSlide) => {
    if (waheguruSlide) {
      return 'vwihgurU';
    }
    if (moolMantraSlide) {
      return '<> siq nwmu krqw purKu inrBau inrvYru Akwl mUriq AjUnI sYBM gur pRswid ]';
    }
    if (isEmptySlide) {
      return '';
    }
    if (isDhanGuruSlide) {
      return dhanGuruString;
    }
    return announcementString;
  };

  return (
    <div className="slide-announcement">
      <span
        style={getFontSize(announcementsFontSize)}
        className={
          isWaheguruSlide || announcementGurmukhi || isMoolMantraSlide || isDhanGuruSlide
            ? 'gurmukhi-announcement-slide'
            : ''
        }
      >
        {getAnnouncementText(isWaheguruSlide, isMoolMantraSlide)}
      </span>
    </div>
  );
};

SlideAnnouncement.propTypes = {
  getFontSize: PropTypes.func,
  isWaheguruSlide: PropTypes.bool,
  isMoolMantraSlide: PropTypes.bool,
  isEmptySlide: PropTypes.bool,
  isDhanGuruSlide: PropTypes.bool,
};

export default SlideAnnouncement;
