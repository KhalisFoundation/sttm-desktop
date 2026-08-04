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
  lineNumber,
  setLineNumber,
  updatePane,
) => {
  if (socketData) {
    const isPinCorrect = parseInt(socketData.pin, 10) === adminPin;
    const listenerActions = {
      shabad: (payload) => {
        const shabadId = parseInt(payload.shabadId, 10);
        const verseId = parseInt(payload.verseId, 10);
        const lineCount = parseInt(payload.lineCount, 10);

        changeActiveShabad(shabadId, verseId);
        if (lineNumber !== lineCount) setLineNumber(lineCount);
        analytics.trackEvent({
          category: 'controller',
          action: 'shabad',
          label: 'shabadId',
          value: shabadId,
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
        const baniId = parseInt(payload.baniId, 10);
        const verseId = parseInt(payload.verseId, 10);
        // The viewer renders nothing but the misc slide while this is set, so
        // leaving it would silently swallow the request. The `shabad` handler is
        // covered by `changeActiveShabad`. See `viewer-entry-points.test.js`.
        if (isMiscSlide) {
          setIsMiscSlide(false);
        }
        if (isCeremonyBani) {
          setIsCeremonyBani(false);
        }

        if (!isSundarGutkaBani) {
          setIsSundarGutkaBani(true);
        }

        if (sundarGutkaBaniId !== baniId) {
          setSundarGutkaBaniId(baniId);
        }

        if (verseId && activeVerseId !== verseId) {
          if (savedCrossPlatformId !== verseId) {
            setSavedCrossPlatformId(verseId);
          }
        }
        updatePane('bani', baniId);
        analytics.trackEvent({
          category: 'controller',
          action: 'bani',
          label: 'baniId',
          value: baniId,
        });
      },
      ceremony: (payload) => {
        const ceremonyPayload = parseInt(payload.ceremonyId, 10);
        // See the `bani` handler above.
        if (isMiscSlide) {
          setIsMiscSlide(false);
        }
        if (!isCeremonyBani) {
          setIsCeremonyBani(true);
        }

        if (isSundarGutkaBani) {
          setIsSundarGutkaBani(false);
        }

        if (ceremonyId !== ceremonyPayload) {
          setCeremonyId(ceremonyPayload);
        }
        updatePane('ceremony', ceremonyPayload);
        analytics.trackEvent({
          category: 'controller',
          action: 'ceremony',
          label: 'ceremonyId',
          value: ceremonyPayload,
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
