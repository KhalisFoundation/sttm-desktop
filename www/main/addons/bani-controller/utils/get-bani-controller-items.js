import React from 'react';
import { remote } from 'electron';
import { useStoreState, useStoreActions } from 'easy-peasy';

const { i18n } = remote.require('./app');
const analytics = remote.getGlobal('analytics');

const getBaniControllerItems = ({
  code,
  adminPin,
  isAdminPinVisible,
  setAdminPinVisibility,
  toggleLockScreen,
}) => {
  const { isMiscSlide, isMiscSlideGurmukhi, isAnnoucement } = useStoreState(
    state => state.navigator,
  );
  const {
    setMiscSlideText,
    setIsMiscSlide,
    setIsMiscSlideGurmukhi,
    setIsAnnoucement,
  } = useStoreActions(state => state.navigator);
  return [
    {
      title: i18n.t('TOOLBAR.SYNC_CONTROLLER.SANGAT_SYNC'),
      description: (
        <>
          {i18n.t('TOOLBAR.SYNC_CONTROLLER.SYNC_DESC.1')} <strong>sttm.co/sync</strong>
          {i18n.t('TOOLBAR.SYNC_CONTROLLER.SYNC_DESC.2')}
        </>
      ),
      control: (
        <button
          className="button copy-code-btn"
          onClick={() => {
            if (code) {
              if (!isAnnoucement) {
                setIsAnnoucement(true);
              }
              if (!isMiscSlide) {
                setIsMiscSlide(true);
              }
              if (isMiscSlideGurmukhi) {
                setIsMiscSlideGurmukhi(false);
              }
              // ToDo: Remove Math.random() and fix easy peasy state update issue
              const garbageValue = Math.random();
              const syncString = i18n.t('TOOLBAR.SYNC_CONTROLLER.SYNC_STRING', {
                garbageValue,
                code,
              });
              setMiscSlideText(syncString);
              analytics.trackEvent('controller', 'codePresented', true);
            }
          }}
        >
          {i18n.t('TOOLBAR.SYNC_CONTROLLER.PRESENT_CODE')}
        </button>
      ),
    },
    {
      title: i18n.t('TOOLBAR.BANI_CONTROLLER'),
      description: (
        <>
          {i18n.t('TOOLBAR.BANI_DESC.1')}
          <strong>sttm.co/control</strong> {i18n.t('TOOLBAR.BANI_DESC.2')}
        </>
      ),
      control: (
        <div>
          <div className="large-text">
            <span className="admin-pin">
              {i18n.t('TOOLBAR.SYNC_CONTROLLER.PIN')}:
              {isAdminPinVisible && adminPin ? adminPin : '...'}
            </span>
            <span className="hide-btn" onClick={() => setAdminPinVisibility(!isAdminPinVisible)}>
              <i className={`fa ${isAdminPinVisible ? 'fa-eye' : 'fa-eye-slash'}`} />
            </span>
          </div>
          <button className="button lock-screen-btn" onClick={toggleLockScreen}>
            Lock Screen
          </button>
        </div>
      ),
    },
  ];
};

export default getBaniControllerItems;
