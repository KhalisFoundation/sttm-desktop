import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

const SlideAnnouncement = ({ isWaheguruSlide }) => {
  const { announcementsFontSize } = useStoreState(state => state.userSettings);
  const { announcementString, announcementGurmukhi } = useStoreState(state => state.navigator);

  const getAnnouncementText = waheguruSlide => {
    if (waheguruSlide) {
      return 'vwihgurU';
    }

    return announcementString;
  };

  return (
    <div className="slide-announcement">
      <span
        style={{ fontSize: `${announcementsFontSize * 3}px` }}
        className={isWaheguruSlide || announcementGurmukhi ? 'gurmukhi-vaak-thick' : ''}
      >
        {getAnnouncementText(isWaheguruSlide)}
      </span>
    </div>
  );
};

SlideAnnouncement.propTypes = {
  isWaheguruSlide: PropTypes.bool,
};

export default SlideAnnouncement;
