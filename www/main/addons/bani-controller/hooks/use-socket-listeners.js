import { remote } from 'electron';

import { handleRequestControl } from '../utils';
import { changeFontSize } from '../../../quick-tools-utils';

const analytics = remote.getGlobal('analytics');

const useSocketListeners = (
  socketData,
  changeActiveShabad,
  adminPin,
  activeShabad,
  activeShabadId,
  activeVerseId,
  homeVerse,
  ceremonyId,
  sundarGutkaBaniId,
  fontSizes,
  baniLength,
  mangalPosition,
  isSundarGutkaBani,
  isCeremonyBani,
  setIsCeremonyBani,
  setIsSundarGutkaBani,
  setSundarGutkaBaniId,
  setCeremonyId,
  isMiscSlide,
  miscSlideText,
  isMiscSlideGurmukhi,
  setIsMiscSlide,
  setMiscSlideText,
  setIsMiscSlideGurmukhi,
) => {
  if (socketData) {
    const isPinCorrect = parseInt(socketData.pin, 10) === adminPin;
    const listenerActions = {
      shabad: payload => {
        changeActiveShabad(payload.shabadId, payload.verseId);
        analytics.trackEvent('controller', 'shabad', `${payload.shabadId}`);
      },
      text: payload => {
        if (!isMiscSlide) {
          setIsMiscSlide(true);
        }
        if (miscSlideText !== payload.text) {
          setMiscSlideText(payload.text);
        }
        if (isMiscSlideGurmukhi !== payload.isGurmukhi) {
          setIsMiscSlideGurmukhi(payload.isGurmukhi);
        }
      },
      bani: payload => {
        if (isCeremonyBani) {
          setIsCeremonyBani(false);
        }

        if (!isSundarGutkaBani) {
          setIsSundarGutkaBani(true);
        }

        if (sundarGutkaBaniId !== payload.baniId) {
          setSundarGutkaBaniId(payload.baniId);
        }
      },
      ceremony: payload => {
        if (!isCeremonyBani) {
          setIsCeremonyBani(true);
        }

        if (isSundarGutkaBani) {
          setIsSundarGutkaBani(false);
        }

        if (ceremonyId !== payload.ceremonyId) {
          setCeremonyId(payload.ceremonyId);
        }
      },
      'request-control': () =>
        handleRequestControl(
          adminPin,
          fontSizes,
          activeShabad,
          activeShabadId,
          activeVerseId,
          homeVerse,
          ceremonyId,
          sundarGutkaBaniId,
          baniLength,
          mangalPosition,
        ),
      settings: payload => {
        const { settings } = payload;
        if (settings.action === 'changeFontSize') {
          changeFontSize(settings.target, settings.value === 'plus');
        }
      },
    };
    // if its an event from web and not from desktop itself
    if (socketData.host !== 'sttm-desktop') {
      listenerActions[isPinCorrect ? socketData.type : 'request-control'](socketData);
    }
  }
};

export default useSocketListeners;
