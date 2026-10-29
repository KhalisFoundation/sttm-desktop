import React, { useState, useEffect, useRef } from 'react';
import { useStoreActions, useStoreState } from 'easy-peasy';

import Slide from '../Slide/Slide';
import QuickTools from '../Slide/QuickTools';

import {
  loadShabadVerse,
  loadBaniVerse,
  loadBani,
  loadCeremony,
  loadShabad,
} from '../../navigator/utils';
import ViewerIcon from '../icons/ViewerIcon';
import PaddingTools from '../Slide/PaddingTools';
import AutoPlayIcon from '../Slide/AutoPlayIcon';
import { ShabadInfo } from '../Slide/ShabadInfo';
import { TranslationReviewQr } from '../Slide/TranslationReviewQr';
import { ShabadOverview } from '../Slide/ShabadOverview';
import { useShabadInfo } from '../hooks/use-shabad-info';
import { useTranslationReviewQr } from '../hooks/use-translation-review-qr';
import { BASE_BANI_OPTIONS } from '../../banidb/constants';
import { i18n } from '../../common/i18n';

const os = require('os');
const remote = require('@electron/remote');
const aiTranslationDB = require('../../banidb/pss-db');

const platform = os.platform();

// The viewer also runs in a webview inside the main window, as the preview in
// the Presenter and Multi-Pane workspaces and as the display in Single-Display.
const isInAppViewer = remote.getCurrentWebContents().getType() === 'webview';

const themes = require('../../../configs/themes.json');

function ShabadDeck() {
  const {
    activeShabadId,
    activePaneId,
    activeVerseId,
    isMiscSlide,
    miscSlideText,
    shabadOverview,
    sundarGutkaBaniId,
    isSundarGutkaBani,
    ceremonyId,
    isCeremonyBani,
    minimizedBySingleDisplay,
    pane1,
    pane2,
    pane3,
    filteredBaniOptions,
  } = useStoreState((state) => state.navigator);

  const { setFilteredBaniOptions } = useStoreActions((state) => state.navigator);

  const {
    theme: currentTheme,
    akhandpatt,
    baniLength,
    displayNextLine,
    themeBg,
    currentWorkspace,
    defaultPaneId,
    teekaSource,
    translationEnglishSource,
    shabadInfoTranslationReview,
  } = useStoreState((state) => state.userSettings);
  const { containerPadding } = useStoreState((state) => state.viewerSettings);
  const showContinuousVerses = akhandpatt;
  const [activeVerse, setActiveVerse] = useState([]);
  const [nextVerse, setNextVerse] = useState({});
  const verseRefKeys = useRef([]);

  const baniLengthCols = {
    short: 'existsSGPC',
    medium: 'existsMedium',
    long: 'existsTaksal',
    extralong: 'existsBuddhaDal',
  };

  const verseRefs = useRef({});

  const updateVerseRef = (verseId, ref) => {
    if (ref) {
      verseRefs.current[verseId] = ref;
      if (!verseRefKeys.current.includes(verseId)) {
        verseRefKeys.current = [...verseRefKeys.current, verseId];
      }
    }
  };

  const getCurrentThemeInstance = () => themes.find((theme) => theme.key === currentTheme);

  const bakeThemeStyles = (themeInstance, themeObj) => {
    const backgroundImageObj =
      themeObj.type === 'default'
        ? {
            backgroundImage: `url('assets/img/custom_backgrounds/${themeInstance['background-image-full']}')`,
          }
        : {
            backgroundImage: `url('${themeObj.url}')`,
          };
    const backgroundColorObj = {
      backgroundColor: themeInstance['background-color'],
    };
    return themeInstance['background-image-full'] || themeObj.type === 'custom'
      ? backgroundImageObj
      : backgroundColorObj;
  };

  const applyTheme = () => {
    const themeInstance = getCurrentThemeInstance();
    return bakeThemeStyles(themeInstance, themeBg);
  };

  const applyOverlay = () => {
    const themeInstance = getCurrentThemeInstance();
    if (themeBg.type === 'video') {
      return themeInstance['background-color'];
    }
    return '';
  };

  const bakeEmptyVerse = () => ({
    Gurmukhi: '',
    Visraam: '',
  });

  const getFilteredBaniOptions = () => {
    if (!activeVerse.length) return BASE_BANI_OPTIONS;

    try {
      const translations = JSON.parse(activeVerse[0].Translations);

      // Inject the AI translation when one of its sources is selected, so the
      // English option's visibility is computed from the text actually shown
      if (aiTranslationDB.isAiSource(translationEnglishSource)) {
        const translationText = aiTranslationDB.getTranslation(
          activeVerse[0].ID,
          translationEnglishSource,
        );
        if (translationText) {
          if (!translations.en) translations.en = {};
          translations.en[translationEnglishSource] = translationText;
        }
      }

      const visibilityMap = {
        'teeka-punjabi': translations?.pu?.[teekaSource]?.length,
        'translation-english': translations?.en?.[translationEnglishSource]?.length,
        'translation-hindi': translations?.hi?.ss?.length,
        'translation-spanish': translations?.es?.sn?.length,
        'transliteration-english': true,
        'transliteration-hindi': true,
      };

      return BASE_BANI_OPTIONS.map((group) => ({
        ...group,
        options: group.options.filter((option) => visibilityMap[option.id]),
      }));
    } catch (error) {
      return BASE_BANI_OPTIONS;
    }
  };

  const classNames = (...classes) => classes.filter(Boolean).join(' ');

  // Shabad info is only shown for shabads (banis and ceremonies mix Angs), and
  // only while there's something to show; otherwise the display is unchanged.
  const isShabad = !isMiscSlide && !isSundarGutkaBani && !isCeremonyBani;
  const shabadInfoDetails = useShabadInfo(isShabad ? activeVerse[0] : null);

  // The shabad overview (from the info button in the shabad pane) takes the
  // slide's place, without the info bar or the review QR code under it. A misc
  // slide still goes over it, and opening a line takes it down.
  const showsOverview = !!shabadOverview && isShabad;

  // While a shabad is on the display, whatever the translation source, the info
  // bar has a QR code linking to the verse's review page, where the sangat can
  // give feedback on its translation. It's for the sangat, so it isn't on the
  // in-app preview.
  const isSingleDisplay = currentWorkspace === i18n.t('WORKSPACES.SINGLE_DISPLAY');
  const showsReviewQr =
    shabadInfoTranslationReview && (!isInAppViewer || isSingleDisplay) && isShabad;
  const reviewQr = useTranslationReviewQr(
    showsReviewQr ? activeVerse[0]?.Shabads?.[0]?.ShabadID : undefined,
    showsReviewQr ? activeVerse[0]?.ID : undefined,
  );

  // The bar is shown while there are details. Once it hides (or when it's off),
  // the QR code stays on its own, without the bar.
  const showsShabadInfo = !showsOverview && shabadInfoDetails.length > 0;
  const showsCompactQr = !showsOverview && !showsShabadInfo && !!reviewQr;

  // The bar comes and goes on its own (once the details or QR code load, and
  // when the "Show for n seconds" time is up), not only on a line change, so
  // recast then.
  const shabadInfoKey = shabadInfoDetails.join('|');
  useEffect(() => {
    global.platform.ipc.send('cast-to-receiver');
  }, [shabadInfoKey, reviewQr]);

  useEffect(() => {
    let currentShabad = activeShabadId;
    if (!currentShabad) {
      const activePane = activePaneId || defaultPaneId;
      if (activePane === 1) {
        currentShabad = pane1.activeShabad;
      } else if (activePane === 2) {
        currentShabad = pane2.activeShabad;
      } else if (activePane === 3) {
        currentShabad = pane3.activeShabad;
      }
    }
    // A bani or ceremony has its own lookup below. Its line ids (1, 2, 3, …)
    // aren't verse ids, so looking them up in the pane's "shabad" (the bani
    // id) showed that shabad's verses instead, e.g. Japji Sahib's for Gur
    // Mantar (bani 1 → shabad 1).
    const isShabadShown = !isSundarGutkaBani && !isCeremonyBani;
    if (!isMiscSlide && activeVerseId && isShabadShown) {
      if (showContinuousVerses) {
        loadShabad(currentShabad).then((verses) => setActiveVerse(verses));
      } else {
        loadShabadVerse(currentShabad, activeVerseId).then((result) =>
          result.map((activeRes) => setActiveVerse([activeRes])),
        );
        // load next line of searched shabad verse from db
        if (displayNextLine && !isMiscSlide) {
          loadShabadVerse(currentShabad, activeVerseId, displayNextLine).then((result) => {
            if (result.length) {
              result.map((activeRes) => setNextVerse(activeRes));
            } else {
              setNextVerse(bakeEmptyVerse());
            }
          });
        }
      }
    }
    if (!isMiscSlide && sundarGutkaBaniId && isSundarGutkaBani) {
      if (akhandpatt) {
        // mangalPosition was removed from 3rd argument of loadBani
        loadBani(sundarGutkaBaniId, baniLengthCols[baniLength]).then((baniRows) => {
          setActiveVerse([...baniRows]);
        });
      } else {
        // load current bani verse from db and set in the state
        loadBaniVerse(
          sundarGutkaBaniId,
          activeVerseId,
          baniLengthCols[baniLength],
          // mangalPosition,
        ).then((rows) => {
          if (rows.length > 1) {
            setActiveVerse([rows[0]]);
          } else if (rows.length === 1) {
            setActiveVerse([...rows]);
          }
        });
        // load next line of bani
        if (displayNextLine && !isMiscSlide) {
          loadBaniVerse(
            sundarGutkaBaniId,
            activeVerseId,
            baniLengthCols[baniLength],
            displayNextLine,
            // mangalPosition,
          ).then((rows) => {
            if (rows.length === 1) {
              setNextVerse(...rows);
            } else {
              setNextVerse(bakeEmptyVerse());
            }
          });
        }
      }
    }
    if (!isMiscSlide && ceremonyId && isCeremonyBani) {
      loadCeremony(ceremonyId).then((ceremonyVersesArray) => {
        let ceremonyVerses;
        try {
          ceremonyVerses = ceremonyVersesArray.flat(1);
        } finally {
          const activeCeremonyVerse = ceremonyVerses.filter((ceremonyVerse) => {
            if (ceremonyVerse && ceremonyVerse.ID === activeVerseId) {
              return true;
            }
            return false;
          });
          // filters next line of ceremony verse
          const nextCeremonyVerse = ceremonyVerses.filter(
            (ceremonyVerse) => ceremonyVerse && ceremonyVerse.ID === activeVerseId + 1,
          );
          setNextVerse(...nextCeremonyVerse);
          if (akhandpatt) {
            setActiveVerse([...ceremonyVerses]);
          } else {
            setActiveVerse([...activeCeremonyVerse]);
          }
        }
      });
    }
  }, [
    activeShabadId,
    activeVerseId,
    showContinuousVerses,
    sundarGutkaBaniId,
    ceremonyId,
    akhandpatt,
    displayNextLine,
    isMiscSlide,
    pane1,
    pane2,
    pane3,
  ]);

  useEffect(() => {
    if (activeVerseId && showContinuousVerses) {
      const verseDOM = verseRefs.current[activeVerseId];

      if (!verseDOM) {
        return;
      }

      const rect = verseDOM.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const isVisible = rect.top >= 0 && rect.bottom <= viewportHeight;

      if (isVisible) {
        return;
      }

      verseDOM.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activeVerseId, showContinuousVerses, verseRefKeys.current]);

  useEffect(() => {
    if (isMiscSlide) {
      if (activeVerse.length !== 0) {
        setActiveVerse([]);
      }
    }
  }, [isMiscSlide]);

  useEffect(() => {
    const updatedOptions = getFilteredBaniOptions().filter((option) => option.options.length);
    setFilteredBaniOptions(updatedOptions);
    global.platform.ipc.send(
      'update-global-setting',
      JSON.stringify({
        actionName: `setFilteredBaniOptions`,
        payload: updatedOptions,
        settingType: 'navigator',
      }),
    );
  }, [activeVerse, setFilteredBaniOptions, translationEnglishSource, teekaSource]);

  return (
    <>
      {activeVerse.length && akhandpatt ? <AutoPlayIcon /> : null}
      {themeBg.type === 'video' && (
        <>
          <video className="video-preview" src={themeBg.url} autoPlay muted loop />
          <div className="video-overlay" style={{ background: applyOverlay() }} />
        </>
      )}
      <div
        className={classNames(
          'shabad-deck',
          isSingleDisplay && 'single-display-mode',
          miscSlideText === '' && 'empty-slide',
          minimizedBySingleDisplay && 'single-display-minimized',
          showContinuousVerses && !isMiscSlide && 'akhandpatt-view',
          platform === 'win32' && 'win32',
          `theme-${getCurrentThemeInstance().key}`,
          // The info bar (or QR code) sits under the slide, which shrinks to
          // make room.
          (showsShabadInfo || showsCompactQr) && 'shabad-deck--with-info',
        )}
        style={applyTheme()}
      >
        {!minimizedBySingleDisplay && (
          <QuickTools
            isMiscSlide={isMiscSlide}
            baniOptions={filteredBaniOptions.length ? filteredBaniOptions : BASE_BANI_OPTIONS}
          />
        )}
        {!minimizedBySingleDisplay && !akhandpatt && <PaddingTools isMiscSlide={isMiscSlide} />}
        <div
          id="viewer-container-slide-wrapper"
          style={{
            padding: `${containerPadding.top}px ${containerPadding.right}px ${containerPadding.bottom}px ${containerPadding.left}px`,
          }}
        >
          {showsOverview && (
            <ShabadOverview shabadId={shabadOverview.shabadId} verseId={shabadOverview.verseId} />
          )}
          {!showsOverview &&
            (activeVerse.length ? (
              activeVerse.map((activeVerseObj, index) => (
                <Slide
                  key={index}
                  verseObj={activeVerseObj}
                  nextLineObj={nextVerse}
                  isMiscSlide={isMiscSlide}
                  continuousView={showContinuousVerses}
                  updateVerseRef={updateVerseRef}
                  slideIndex={index}
                />
              ))
            ) : (
              <Slide isMiscSlide={isMiscSlide} bgColor={applyOverlay()} />
            ))}
        </div>
        {showsShabadInfo ? (
          <ShabadInfo
            details={shabadInfoDetails}
            color={getCurrentThemeInstance()['translation-color']}
          >
            {reviewQr && (
              <TranslationReviewQr
                src={reviewQr}
                source={translationEnglishSource}
                color={getCurrentThemeInstance()['translation-color']}
              />
            )}
          </ShabadInfo>
        ) : null}
        {showsCompactQr && (
          <TranslationReviewQr src={reviewQr} source={translationEnglishSource} compact />
        )}
      </div>
      {/* The info bar carries the logo while it's shown. */}
      {!showsShabadInfo && <ViewerIcon className="viewer-logo" />}
    </>
  );
}

export default ShabadDeck;
