import React from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';
import ReactHtmlParser from 'react-html-parser';

const SlideAnnouncement = ({ getFontSize }) => {
  const { announcementsFontSize } = useStoreState(state => state.userSettings);
  const { isMiscSlideGurmukhi, miscSlideText, isAnnoucement } = useStoreState(
    state => state.navigator,
  );
  let gurmukhi = true;

  if (isAnnoucement) {
    gurmukhi = isMiscSlideGurmukhi;
  }

  return (
    <div className="slide-announcement">
      <span
        style={getFontSize(announcementsFontSize)}
        className={gurmukhi ? 'gurmukhi-announcement-slide' : ''}
      >
        {ReactHtmlParser(miscSlideText)}
      </span>
    </div>
  );
};

SlideAnnouncement.propTypes = {
  getFontSize: PropTypes.func,
};

export default SlideAnnouncement;
