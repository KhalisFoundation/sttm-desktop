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
  isAnnouncement,
  setIsAnnouncement,
) => {
  if (socketData) {
    const isPinCorrect = parseInt(socketData.pin, 10) === adminPin;
    const listenerActions = {
      shabad: (payload) => {
        const shabadId = parseInt(payload.shabadId, 10);
        const verseId = parseInt(payload.verseId, 10);
        const lineCount = parseInt(payload.lineCount, 10);

        // A web controller can send a partial payload (e.g. an undefined
        // shabadId that parses to NaN). Don't push NaN into navigator state /
        // the banidb query — bail instead of loading a bogus shabad.
        if (Number.isNaN(shabadId)) {
          return;
        }

        changeActiveShabad(shabadId, verseId);
        if (!Number.isNaN(lineCount) && lineNumber !== lineCount) setLineNumber(lineCount);
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
        // SlideAnnouncement only honours isMiscSlideGurmukhi when isAnnouncement
        // is set; without it English text renders in the Gurmukhi font.
        if (isAnnouncement !== !!payload.isAnnouncement) {
          setIsAnnouncement(!!payload.isAnnouncement);
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
        const lineCount = parseInt(payload.lineCount, 10);
        if (isCeremonyBani) {
          setIsCeremonyBani(false);
        }

        if (!isSundarGutkaBani) {
          setIsSundarGutkaBani(true);
        }

        const isNewBani = sundarGutkaBaniId !== baniId;
        if (isNewBani) {
          setSundarGutkaBaniId(baniId);
        }

        if (verseId && activeVerseId !== verseId) {
          if (savedCrossPlatformId !== verseId) {
            setSavedCrossPlatformId(verseId);
          }
        } else if (isNewBani && savedCrossPlatformId != null) {
          // New bani with no target verse — drop the previous bani's verse so
          // its stale highlight isn't re-applied to the freshly-loaded bani.
          setSavedCrossPlatformId(null);
        }
        // Record the 1-based line position so ShabadText resolves the verse by
        // index (web + desktop share the bani's verse order; verse ids don't
        // share a space across the two, so position is the reliable key). On a
        // fresh bani with no target verse, reset the position so the effect
        // can't re-apply the previous bani's stale index — it opens at the start.
        if (!Number.isNaN(lineCount)) {
          if (lineNumber !== lineCount) setLineNumber(lineCount);
        } else if (isNewBani && lineNumber != null) {
          setLineNumber(null);
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
        const verseId = parseInt(payload.verseId, 10);
        const lineCount = parseInt(payload.lineCount, 10);
        if (!isCeremonyBani) {
          setIsCeremonyBani(true);
        }

        if (isSundarGutkaBani) {
          setIsSundarGutkaBani(false);
        }

        const isNewCeremony = ceremonyId !== ceremonyPayload;
        if (isNewCeremony) {
          setCeremonyId(ceremonyPayload);
        }

        // Apply a verse change within the ceremony. The web controller sends the
        // BaniDB verseId; ShabadText matches it against its verse list (see the
        // savedCrossPlatformId effect). Mirrors the `bani` handler — without this
        // the ceremony verse change was dropped entirely.
        if (verseId && activeVerseId !== verseId) {
          if (savedCrossPlatformId !== verseId) {
            setSavedCrossPlatformId(verseId);
          }
        } else if (isNewCeremony && savedCrossPlatformId != null) {
          // New ceremony, no target verse — drop the previous item's verse so
          // its stale highlight isn't re-applied to the new ceremony.
          setSavedCrossPlatformId(null);
        }
        // Ceremony verses come from the Realm Verse table with Realm-local IDs
        // and no crossPlatformID, so the web's global BaniDB verseId never
        // matches by id. Record the 1-based line position (both lists share the
        // ceremony's Seq order) so ShabadText can resolve the verse by position.
        // On a fresh ceremony with no target verse, reset the position so the
        // effect can't re-apply the previous item's stale index.
        if (!Number.isNaN(lineCount)) {
          if (lineNumber !== lineCount) setLineNumber(lineCount);
        } else if (isNewCeremony && lineNumber != null) {
          setLineNumber(null);
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
      const actionType = isPinCorrect ? socketData.type : 'request-control';
      const handler = listenerActions[actionType];
      // Guard the boundary: an unknown `type` would otherwise be `undefined(...)`
      // — an instant crash — and a malformed payload must never take the
      // desktop down. Ignore unknown types; swallow handler errors.
      if (typeof handler === 'function') {
        try {
          handler(socketData);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(`controller data handler "${actionType}" threw:`, error);
        }
      }
      // else: unknown/unhandled type — ignore
    }
  }
};

export default useSocketListeners;
