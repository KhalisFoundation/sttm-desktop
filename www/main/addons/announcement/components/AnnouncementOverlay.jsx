import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useStoreState } from 'easy-peasy';

import { Overlay, Switch } from '../../../common/sttm-ui';
import Announcement from './Annoucement';
import { DhanGuru } from './DhanGuru';
import MiscSlides from './MiscSlides';

const AnnouncementPane = ({ onScreenClose, className }) => {
  const { isMiscSlideGurmukhi } = useStoreState((state) => state.navigator);
  // const { setIsMiscSlideGurmukhi } = useStoreActions((state) => state.navigator);

  const [isGurmukhi, setIsGurmukhi] = useState(isMiscSlideGurmukhi);

  const changeGurmukhiLanguage = (value) => {
    if (isGurmukhi !== value) {
      setIsGurmukhi(value);
    }
  };

  return (
    <Overlay onScreenClose={onScreenClose} className={className}>
      <div className="addon-overlay">
        <header>
          <h2>Announcement</h2>
          <Switch
            title="Gurmukhi"
            controlId="gurmukhi-switch"
            className="gurmukhi-switch"
            value={isMiscSlideGurmukhi}
            onToggle={changeGurmukhiLanguage}
          />
        </header>
        <Announcement isGurmukhi={isGurmukhi} />
        <MiscSlides />
        <DhanGuru isGurmukhi={isGurmukhi} />
      </div>
    </Overlay>
  );
};

AnnouncementPane.propTypes = {
  onScreenClose: PropTypes.func,
  className: PropTypes.string,
};

export default AnnouncementPane;
