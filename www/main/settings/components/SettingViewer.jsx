import React, { useEffect, useState } from 'react';
import { useStoreState } from 'easy-peasy';

const themes = require('../../../configs/themes.json');

const SettingViewer = () => {
  const { themeBg } = useStoreState((state) => state.userSettings);
  const { slideOrder } = useStoreState((state) => state.viewerSettings);

  const [translationOrder, setTranslationOrder] = useState();
  const [teekaOrder, setTeekaOrder] = useState();
  const [transliterationOrder, setTransliterationOrder] = useState();

  const orderFunctions = {
    translation: (item) => {
      if (translationOrder !== item) {
        setTranslationOrder(item);
      }
    },
    transliteration: (item) => {
      if (transliterationOrder !== item) {
        setTransliterationOrder(item);
      }
    },
    teeka: (item) => {
      if (teekaOrder !== item) {
        setTeekaOrder(item);
      }
    },
  };

  const {
    gurbaniFontSize,
    translationFontSize,
    teekaFontSize,
    transliterationFontSize,
    displayNextLine,
    leftAlign,
    theme,
    larivaar,
    larivaarAssist,
    larivaarAssistType,
    vishraamType,
    displayVishraams,
  } = useStoreState((state) => state.userSettings);

  const verseSlideBg = () => {
    const currentTheme = themes.find((themeObj) => themeObj.key === theme);
    if (themeBg.type === 'video') {
      return {
        background: currentTheme['background-color'],
      };
    }
    return {
      textAlign: leftAlign ? 'left' : 'center',
      backgroundImage: `${themeBg && themeBg.url ? `url(${themeBg.url})` : 'none'}`,
      backgroundPosition: 'center',
    };
  };

  const gurbaniStyles = {
    fontSize: `${gurbaniFontSize * 3}px`,
  };

  const translationStyles = {
    fontSize: `${translationFontSize * 3}px`,
  };

  const transliterationStyles = {
    fontSize: `${transliterationFontSize * 3}px`,
  };

  const teekaStyles = {
    fontSize: `${teekaFontSize * 3}px`,
  };

  const nextLineStyles = {
    fontSize: `${gurbaniFontSize * 3}px`,
    opacity: 0.5,
    display: displayNextLine ? 'block' : 'none',
  };

  useEffect(() => {
    slideOrder.forEach((element, index) => {
      orderFunctions[element](index + 2);
    });
  }, [slideOrder]);

  const getLarivaarAssistClass = () => {
    if (larivaarAssist) {
      return larivaarAssistType === 'single-color'
        ? 'larivaar-assist-single-color'
        : 'larivaar-assist-multi-color';
    }
    return '';
  };

  const getVishraamType = () => {
    if (displayVishraams) {
      if (!(larivaar && larivaarAssist)) {
        return vishraamType === 'colored-words' ? 'vishraam-colored' : 'vishraam-gradient';
      }
    }
    return '';
  };

  return (
    <>
      <div className="settings-preview-title">
        <span>Preview</span>
      </div>
      <div className={`settings-viewer theme-${theme}`}>
        {themeBg.type === 'video' && (
          <video className="video_preview" src={themeBg.url} autoPlay muted loop />
        )}
        <div className="verse-slide" style={verseSlideBg()}>
          <h1 className="slide-gurbani gurbani gurmukhi" style={gurbaniStyles}>
            <div className={`settings-verse ${getLarivaarAssistClass()} ${getVishraamType()}`}>
              {!larivaar ? (
                <span className="padchhed">
                  <span>jo</span>
                  <span>mwgih</span>
                  <span>Twkur</span>
                  <span>Apuny</span>
                  <wbr />
                  <span className="vishraam vishraam-v">qy</span>
                  <wbr />
                  <span>soeI</span>
                  <span>soeI</span>
                  <wbr />
                  <span>
                    <span>dyvY</span>
                    <i> </i>
                    <span>]</span>
                  </span>
                </span>
              ) : (
                <span className="larivaar">
                  <span>jo</span>
                  <wbr />
                  <span>mwgih</span>
                  <wbr />
                  <span>Twkur</span>
                  <wbr />
                  <span>Apuny</span>
                  <wbr />
                  <span className="vishraam vishraam-v">qy</span>
                  <wbr />
                  <span>soeI</span>
                  <wbr />
                  <span>soeI</span>
                  <wbr />
                  <span>dyvY</span>
                  <wbr />
                  <span>]</span>
                </span>
              )}
            </div>
          </h1>
          <h2
            className="slide-translation translation"
            style={{ ...translationStyles, order: translationOrder }}
          >
            <div>
              <div className="english-translation transtext">
                Whatever I ask for from my Lord and Master, he gives that to me.
              </div>
              <div className="spanish-translation transtext">
                Lo que sea que el Esclavo del Señor, Nanak recita con sus labios,{' '}
              </div>
              <div className="hindi-translation transtext">
                हे भाई ! प्रभू के दास अपने प्रभू से जो कुछ माँगते हैं वह वही कुछ उनको देता है।
              </div>
            </div>
          </h2>
          <h2 className="slide-teeka teeka" style={{ ...teekaStyles, order: teekaOrder }}>
            <div>
              hy BweI! pRBU dy dws Awpxy pRBU pwsoN jo kuJ mMgdy hn auh auhI kuJ auhnW ƒ dyNdw hY [
            </div>
          </h2>
          <h2
            className="slide-transliteration transliteration"
            style={{ ...transliterationStyles, order: transliterationOrder }}
          >
            <div>
              <div className="english-transliteration translittext">
                jo maageh Thaakur apune te soiee soiee dhevai ||
              </div>
              <div className="shahmukhi-transliteration translittext">
                جو ماگه ٹھاکر اپنے تے سوای سوای دےوَے ۔۔
              </div>
              <div className="devanagari-transliteration translittext">
                जो मागहि ठाकुर अपुने ते सोई सोई देवै ॥
              </div>
            </div>
          </h2>
          <h1
            className="slide-next-line slide-gurbani gurbani gurmukhi next-line"
            style={nextLineStyles}
          >
            <div>
              <span className="padchhed">
                <span>jo</span>
                <span>mwgih</span>
                <span>Twkur</span>
                <span>Apuny</span>
                <wbr />
                <span className="visraam-main visraam-sttm visraam-igurbani visraam-sttm2">qy</span>
                <wbr />
                <span>soeI</span>
                <span>soeI</span>
                <wbr />
                <span>
                  <span>dyvY</span>
                  <i> </i>
                  <span>]</span>
                </span>
              </span>
              <span className="larivaar">
                <span>jo</span>
                <wbr />
                <span>mwgih</span>
                <wbr />
                <span>Twkur</span>
                <wbr />
                <span>Apuny</span>
                <span className="visraam-main visraam-sttm visraam-igurbani visraam-sttm2">qy</span>
                <span>soeI</span>
                <wbr />
                <span>soeI</span>
                <wbr />
                <span>dyvY</span>
                <wbr />
                <span>]</span>
              </span>
            </div>
          </h1>
        </div>
      </div>
    </>
  );
};

export default SettingViewer;
