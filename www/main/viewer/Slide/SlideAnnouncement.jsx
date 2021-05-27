import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

const SlideAnnouncement = ({ isWaheguruSlide, isMoolMantraSlide, isEmptySlide }) => {
  const { announcementsFontSize } = useStoreState(state => state.userSettings);
  const { announcementString, announcementGurmukhi } = useStoreState(state => state.navigator);

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
    return announcementString;
  };

  return (
    <div className="slide-announcement">
      <span
        style={{ fontSize: `${announcementsFontSize * 3}px` }}
        className={
          isWaheguruSlide || announcementGurmukhi || isMoolMantraSlide
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
  isWaheguruSlide: PropTypes.bool,
  isMoolMantraSlide: PropTypes.bool,
  isEmptySlide: PropTypes.bool,
};

export default SlideAnnouncement;
