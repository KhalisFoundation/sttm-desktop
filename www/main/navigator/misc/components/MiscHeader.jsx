import React from 'react';
import { useStoreState, useStoreActions } from 'easy-peasy';
import { classNames } from '../../../common/utils';

const remote = require('@electron/remote');

const analytics = remote.getGlobal('analytics');

export const MiscHeader = () => {
  const { currentMiscPanel } = useStoreState((state) => state.navigator);
  const { setCurrentMiscPanel } = useStoreActions((state) => state.navigator);

  const isHistory = currentMiscPanel === 'History';
  const isAnnouncement = currentMiscPanel === 'Announcement';
  const isOther = currentMiscPanel === 'Others';
  const isDhanGuru = currentMiscPanel === 'DhanGuru';

  const setTab = (tabName) => {
    if (tabName !== currentMiscPanel) {
      setCurrentMiscPanel(tabName);
    }
    analytics.trackEvent({
      category: 'Misc',
      action: 'set-tab',
      label: tabName,
    });
  };

  const getTurbanIcon = () =>
    isDhanGuru ? 'assets/img/icons/turban-filled.png' : 'assets/img/icons/turban-outline.png';

  return (
    <div className="misc-header">
      <a
        className={classNames('misc-button', isHistory && 'misc-active')}
        onClick={() => setTab('History')}
      >
        <i className="fa fa-clock-o">
          <span className="Icon-label" key="History">
            History
          </span>
        </i>
      </a>

      <a
        className={classNames('misc-button', isAnnouncement && 'misc-active')}
        onClick={() => setTab('Announcement')}
      >
        <i className="fa fa-desktop">
          <span className="Icon-label" key="Announcement">
            Announcement
          </span>
        </i>
      </a>
      <a
        className={classNames('misc-button', isDhanGuru && 'misc-active')}
        onClick={() => setTab('DhanGuru')}
      >
        <img className="turban-icon" src={getTurbanIcon()} alt="Dhan Guru" />
        <span className="Icon-label" key="DhanGuru">
          Gurus
        </span>
      </a>
      <a
        className={classNames('misc-button', isOther && 'misc-active')}
        onClick={() => setTab('Others')}
      >
        <i className="fa fa-ellipsis-h">
          <span className="Icon-label" key="Others">
            Others
          </span>
        </i>
      </a>
    </div>
  );
};
