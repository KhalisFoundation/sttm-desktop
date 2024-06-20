import { handleRequestControl } from '../utils';
import { changeFontSize } from '../../../quick-tools-utils';

const remote = require('@electron/remote');

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
  // mangalPosition,
  isSundarGutkaBani,
  isCeremonyBani,
  savedCrossPlatformId,
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
  setSavedCrossPlatformId,
  setLineNumber,
) => {
  if (socketData) {
    const isPinCorrect = parseInt(socketData.pin, 10) === adminPin;
    const listenerActions = {
      shabad: (payload) => {
        changeActiveShabad(payload.shabadId, payload.verseId);
        setLineNumber(payload.lineCount);
        analytics.trackEvent({
          category: 'controller',
          action: 'shabad',
          label: 'shabadId',
          value: payload.shabadId,
        });
      },
      text: (payload) => {
        if (!isMiscSlide) {
          setIsMiscSlide(true);
        }
        if (miscSlideText !== payload.text) {
          setMiscSlideText(payload.text);
        }
        if (isMiscSlideGurmukhi !== payload.isGurmukhi) {
          setIsMiscSlideGurmukhi(payload.isGurmukhi);
        }
        analytics.trackEvent({
          category: 'controller',
          action: 'send text',
          label: 'text',
          value: payload.text,
        });
      },
      bani: (payload) => {
        if (isCeremonyBani) {
          setIsCeremonyBani(false);
        }

        if (!isSundarGutkaBani) {
          setIsSundarGutkaBani(true);
        }

        if (sundarGutkaBaniId !== payload.baniId) {
          setSundarGutkaBaniId(payload.baniId);
        }

        if (payload.verseId && activeVerseId !== payload.verseId) {
          if (savedCrossPlatformId !== payload.verseId) {
            setSavedCrossPlatformId(payload.verseId);
          }
        }
        analytics.trackEvent({
          category: 'controller',
          action: 'bani',
          label: 'baniId',
          value: payload.baniId,
        });
      },
      ceremony: (payload) => {
        if (!isCeremonyBani) {
          setIsCeremonyBani(true);
        }

        if (isSundarGutkaBani) {
          setIsSundarGutkaBani(false);
        }

        if (ceremonyId !== payload.ceremonyId) {
          setCeremonyId(payload.ceremonyId);
        }
        analytics.trackEvent({
          category: 'controller',
          action: 'ceremony',
          label: 'ceremonyId',
          value: payload.ceremonyId,
        });
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
          // mangalPosition,
        ),
      settings: (payload) => {
        const { settings } = payload;
        if (settings.action === 'changeFontSize') {
          changeFontSize(settings.target, settings.value === 'plus');
        }
        analytics.trackEvent({
          category: 'controller',
          action: 'settings',
          label: settings.action,
          value: settings.value,
        });
      },
    };
    // if its an event from web and not from desktop itself
    if (socketData.host !== 'sttm-desktop') {
      listenerActions[isPinCorrect ? socketData.type : 'request-control'](socketData);
    }
  }
};

export default useSocketListeners;
