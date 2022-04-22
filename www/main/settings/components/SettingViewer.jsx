import React from 'react';
import { useStoreState } from 'easy-peasy';

const SettingViewer = () => {
  const { themeBg } = useStoreState(state => state.userSettings);

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
  } = useStoreState(state => state.userSettings);

  const commonStyles = {
    textAlign: leftAlign ? 'left' : 'center',
    backgroundImage: `${themeBg && themeBg.url ? `url(${themeBg.url})` : 'none'}`,
    backgroundPosition: 'center',
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

  const getLarivaarAssistClass = () => {
    if (larivaarAssist) {
      return larivaarAssistType === 'single-color'
        ? 'larivaar-assist-single-color'
        : 'larivaar-assist-multi-color';
    }
    return '';
  };

  const getVishraamType = () => {
    if (displayVishraams && !larivaarAssist) {
      return vishraamType === 'colored-words' ? 'vishraam-colored' : 'vishraam-gradient';
    }
    return '';
  };

  return (
    <>
      <div className="settings-preview-title">
        <span>Preview</span>
      </div>
      <div className={`settings-viewer theme-${theme}`} style={commonStyles}>
        <h1 className="gurbani gurmukhi" style={gurbaniStyles}>
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
        <h2 className="translation" style={translationStyles}>
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
        <h2 className="teeka" style={teekaStyles}>
          hy BweI! pRBU dy dws Awpxy pRBU pwsoN jo kuJ mMgdy hn auh auhI kuJ auhnW ƒ dyNdw hY [
        </h2>
        <h2 className="transliteration" style={transliterationStyles}>
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
        <h1 className="gurbani gurmukhi next-line" style={nextLineStyles}>
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
    </>
  );
};

export default SettingViewer;
