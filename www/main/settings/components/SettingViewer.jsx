import React from 'react';
import { useStoreState } from 'easy-peasy';

const themes = require('../../../configs/themes.json');

const SettingViewer = () => {
  const { themeBg } = useStoreState((state) => state.userSettings);

  const {
    gurbaniFontSize,
    content1FontSize,
    content2FontSize,
    content3FontSize,
    content1Visibility,
    content2Visibility,
    content3Visibility,
    content1,
    content2,
    content3,
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

  const content1Styles = {
    display: content1Visibility ? 'block' : 'none',
    fontSize: `${content1FontSize * 3}px`,
    fontWeight: 'normal',
  };

  const content2Styles = {
    display: content2Visibility ? 'block' : 'none',
    fontSize: `${content2FontSize * 3}px`,
  };

  const content3Styles = {
    display: content3Visibility ? 'block' : 'none',
    fontSize: `${content3FontSize * 3}px`,
  };

  const nextLineStyles = {
    fontSize: `${gurbaniFontSize * 3}px`,
    opacity: 0.5,
    display: displayNextLine ? 'block' : 'none',
  };

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

  const multilingual = {
    'translation-english': (
      <div className="slide-translation translation">
        <span className="english-translation transtext">
          Whatever I ask for from my Lord and Master, he gives that to me.
        </span>
      </div>
    ),
    'translation-hindi': (
      <div className="slide-translation translation">
        <span className="hindi-translation transtext">
          हे भाई ! प्रभू के दास अपने प्रभू से जो कुछ माँगते हैं वह वही कुछ उनको देता है।
        </span>
      </div>
    ),
    'translation-spanish': (
      <div className="slide-translation translation">
        <span className="spanish-translation transtext">
          Lo que sea que el Esclavo del Señor, Nanak recita con sus labios
        </span>
      </div>
    ),
    'teeka-punjabi': (
      <div className="slide-teeka teeka">
        hy BweI! pRBU dy dws Awpxy pRBU pwsoN jo kuJ mMgdy hn auh auhI kuJ auhnW ƒ dyNdw hY [
      </div>
    ),
    'transliteration-english': (
      <div className="slide-transliteration transliteration">
        jo maageh Thaakur apune te soiee soiee dhevai ||
      </div>
    ),
    'transliteration-hindi': (
      <div className="slide-transliteration transliteration">
        जो मागहि ठाकुर अपुने ते सोई सोई देवै ॥
      </div>
    ),
    'transliteration-shahmukhi': (
      <div className="slide-transliteration transliteration">
        {' '}
        جو ماگه ٹھاکر اپنے تے سوای سوای دےوَے ۔۔
      </div>
    ),
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
          <h2 style={{ ...content1Styles }}>{multilingual[content1]}</h2>
          <h2 style={{ ...content2Styles }}>{multilingual[content2]}</h2>
          <h2 style={{ ...content3Styles }}>{multilingual[content3]}</h2>
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
