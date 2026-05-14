import { handleRequestControl } from '../utils';
import { changeFontSize } from '../../../quick-tools-utils';

const remote = require('@electron/remote');

const analytics = remote.getGlobal('analytics');

// Maps a wire-format history entry { shabadId, verseId?, label, kind } back to
// the desktop's verseHistory entry shape. Returns null on anything malformed.
const fromWireHistoryEntry = (wire) => {
  if (!wire || typeof wire !== 'object') return null;
  const shabadId = parseInt(wire.shabadId, 10);
  if (!shabadId) return null;
  const kind = wire.kind === 'bani' || wire.kind === 'ceremony' ? wire.kind : 'shabad';
  const verseId = parseInt(wire.verseId, 10) || shabadId;
  return {
    shabadId,
    verseId,
    label: typeof wire.label === 'string' ? wire.label : '',
    type: kind,
    meta: { baniLength: '' },
    versesRead: [verseId],
    continueFrom: verseId,
    homeVerse: 0,
  };
};

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
  // New, optional. Default to safe no-op behavior so existing callers that
  // don't pass these don't change their semantics.
  isAnnouncement = false,
  setIsAnnouncement = () => {},
  verseHistory = [],
  setVerseHistory = () => {},
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
        // Honor the announcement flag from the wire. Default to false when the
        // field is absent so legacy clients keep producing regular misc slides.
        const wantsAnnouncement = Boolean(payload.isAnnouncement);
        if (wantsAnnouncement !== isAnnouncement) {
          setIsAnnouncement(wantsAnnouncement);
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
        const hasVerseId = !Number.isNaN(verseId) && verseId > 0;
        const hasLineCount = !Number.isNaN(lineCount) && lineCount > 0;
        if (hasLineCount && lineNumber !== lineCount) {
          setLineNumber(lineCount);
        }
        // Honor an optional baniLength from the wire (e.g. when the web
        // controller wants to project a specific length variant). The
        // payload key matches what BaaniSearchPanel / handleBani send.
        if (
          payload.baniLength &&
          typeof payload.baniLength === 'string' &&
          payload.baniLength !== baniLength &&
          global.setUserSettings &&
          typeof global.setUserSettings.setBaniLength === 'function'
        ) {
          global.setUserSettings.setBaniLength(payload.baniLength);
        }
        // Navigation events should drop the misc-slide overlay so the
        // operator's projection actually switches to the bani — otherwise a
        // prior Waheguru / Mool Mantra / announcement stays on screen and
        // the state change happens invisibly behind it.
        if (isMiscSlide) {
          setIsMiscSlide(false);
        }
        if (isAnnouncement) {
          setIsAnnouncement(false);
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

        if (hasVerseId && savedCrossPlatformId !== verseId) {
          // savedCrossPlatformId triggers the verse-highlight effect in
          // ShabadText (matches against crossPlatformId, then falls back to
          // verseId for clients like web that don't have crossPlatformId).
          setSavedCrossPlatformId(verseId);
        }
        // Pass verseId into updatePane so the pane's activeVerse is set
        // directly — fallback in case the savedCrossPlatformId effect
        // misses on a same-bani re-trigger.
        updatePane('bani', baniId, hasVerseId ? verseId : undefined);
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
        const hasVerseId = !Number.isNaN(verseId) && verseId > 0;
        const hasLineCount = !Number.isNaN(lineCount) && lineCount > 0;
        // Pipe lineCount into the navigator's lineNumber state so the
        // ShabadText effect can fall back to position-based seeking when
        // the BaniDB-global verseId from web doesn't match desktop's
        // Realm-local verseIds (ceremonies in particular live in a
        // different ID space).
        if (hasLineCount && lineNumber !== lineCount) {
          setLineNumber(lineCount);
        }
        // Same misc-slide / announcement cleanup as the bani path — a
        // ceremony click should exit any active text overlay so the
        // ceremony view becomes visible on the projection.
        if (isMiscSlide) {
          setIsMiscSlide(false);
        }
        if (isAnnouncement) {
          setIsAnnouncement(false);
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
        if (hasVerseId && savedCrossPlatformId !== verseId) {
          // Mirror the bani path: setting savedCrossPlatformId triggers the
          // verse-highlight effect in ShabadText so a remote verse-click
          // actually navigates the ceremony pane.
          setSavedCrossPlatformId(verseId);
        }
        // Pass verseId into updatePane so the pane's activeVerse is set
        // directly. This is a belt-and-suspenders fallback: even if the
        // savedCrossPlatformId effect in ShabadText misses (race or stale
        // closure), the pane attributes carry the active verse so the
        // ShabadText load/resume path lands on the right row.
        updatePane('ceremony', ceremonyPayload, hasVerseId ? verseId : undefined);
        analytics.trackEvent({
          category: 'controller',
          action: 'ceremony',
          label: 'ceremonyId',
          value: ceremonyPayload,
        });
      },
      history: (payload) => {
        // Web → desktop history sync. Loose-coupled to verseHistory in the
        // navigator store. All actions are idempotent, so dropped/duplicate
        // events are safe. Dedup on shabadId only to match the local
        // saveToHistory invariant (HistoryPane keys by shabadId).
        const action = payload && payload.action;
        if (action === 'sync' && Array.isArray(payload.entries)) {
          const mapped = payload.entries.map(fromWireHistoryEntry).filter(Boolean);
          const seen = new Set();
          const next = mapped.filter((e) => {
            if (seen.has(e.shabadId)) return false;
            seen.add(e.shabadId);
            return true;
          });
          setVerseHistory(next);
          return;
        }
        if (action === 'add' && payload.entry) {
          const incoming = fromWireHistoryEntry(payload.entry);
          if (!incoming) return;
          const exists = verseHistory.some((h) => h.shabadId === incoming.shabadId);
          if (!exists) {
            setVerseHistory([incoming, ...verseHistory]);
          }
          return;
        }
        if (action === 'remove' && payload.entry) {
          const target = fromWireHistoryEntry(payload.entry);
          if (!target) return;
          setVerseHistory(verseHistory.filter((h) => h.shabadId !== target.shabadId));
          return;
        }
        if (action === 'clear') {
          setVerseHistory([]);
        }
      },
      'request-control': () =>
        handleRequestControl(
          isPinCorrect,
          fontSizes,
          activeShabad,
          activeShabadId,
          activeVerseId,
          homeVerse,
          ceremonyId,
          sundarGutkaBaniId,
          baniLength,
          // mangalPosition,
          verseHistory,
          adminPin,
          {
            isMiscSlide,
            isAnnouncement,
            miscSlideText,
            isMiscSlideGurmukhi,
          },
        ),
      settings: (payload) => {
        const { settings } = payload;
        if (settings.action === 'changeFontSize') {
          // Web sends labelled controller targets (gurbani / translation /
          // teeka / transliteration). The userSettings store keys those
          // sliders as content1/2/3 — without this map, changeFontSize
          // looks up setTranslationFontSize / setTeekaFontSize /
          // setTransliterationFontSize, which don't exist, and the call
          // silently no-ops.
          const FONT_TARGET_MAP = {
            gurbani: 'gurbani',
            translation: 'content1',
            teeka: 'content2',
            transliteration: 'content3',
          };
          const target = FONT_TARGET_MAP[settings.target] || settings.target;
          changeFontSize(target, settings.value === 'plus');
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
