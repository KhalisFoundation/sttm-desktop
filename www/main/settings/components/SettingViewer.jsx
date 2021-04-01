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
  } = useStoreState(state => state.userSettings);

  const commonStyles = {
    textAlign: leftAlign ? 'left' : 'center',
    backgroundImage: `${themeBg && themeBg.url ? `url(${themeBg.url})` : 'none'}`,
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

  return (
    <div className={`settings-viewer theme-${theme}`} style={commonStyles}>
      <h1 className="gurbani gurmukhi" style={gurbaniStyles}>
        <div>
          <span className="padchhed">
            <span>ik®pw</span>
            <span>kry</span>
            <span>jy</span>
            <span className="visraam-main visraam-sttm2">AwpxI</span>
            <span>qw</span>
            <span>hir</span>
            <span>rKw</span>
            <span>aur</span>
            <span>
              <span>Dwir</span>
              <i> </i>
              <span>]1]</span>
            </span>
          </span>
          <span className="larivaar">
            <span>ik®pw</span>
            <wbr />
            <span>kry</span>
            <wbr />
            <span>jy</span>
            <wbr />
            <span className="visraam-main visraam-sttm2">AwpxI</span>
            <wbr />
            <span>qw</span>
            <wbr />
            <span>hir</span>
            <wbr />
            <span>rKw</span>
            <wbr />
            <span>aur</span>
            <wbr />
            <span>
              <span>Dwir</span>
              <i> </i>
              <span>]1]</span>
            </span>
          </span>
        </div>
      </h1>
      <h2 className="translation" style={translationStyles}>
        <div>
          <div className="english-translation transtext">
            If the Lord shows His Mercy, then I keep Him enshrined within my heart. ||1||
          </div>
          <div className="spanish-translation transtext">
            Cuando el Señor así nos bendice, enaltecemos al Guru en la mente. (1)
          </div>
          <div className="hindi-translation transtext">
            अगर परमात्मा अपनी मेहर करे।तो मैं भी उसका नाम हृदय में परो के रखूँ। 1।
          </div>
        </div>
      </h2>
      <h2 className="teeka" style={teekaStyles}>
        jy prmwqmw AwpxI myhr kry, qW mYN BI aus dw nwm ihrdy ivc pro r`KW [1[
      </h2>
      <h2 className="transliteration" style={transliterationStyles}>
        <div>
          <div className="english-transliteration translittext">
            kirapaa kare je aapanee taa har rakhaa ur dhaar ||1||
          </div>
          <div className="shahmukhi-transliteration translittext">
            کِ®پا کرے جے آپݨیِ تا هر رکھا اُر دھار ۔۔۱۔۔
          </div>
          <div className="devanagari-transliteration translittext">
            कृपा करे जे आपणी ता हरि रखा उर धारि ॥१॥
          </div>
        </div>
      </h2>
      <h1 className="gurbani gurmukhi next-line" style={nextLineStyles}>
        <div>
          <span className="padchhed">
            <span>ik®pw</span>
            <span>kry</span>
            <span>jy</span>
            <span className="visraam-main visraam-sttm2">AwpxI</span>
            <span>qw</span>
            <span>hir</span>
            <span>rKw</span>
            <span>aur</span>
            <span>
              <span>Dwir</span>
              <i> </i>
              <span>]1]</span>
            </span>
          </span>
          <span className="larivaar">
            <span>ik®pw</span>
            <wbr />
            <span>kry</span>
            <wbr />
            <span>jy</span>
            <wbr />
            <span className="visraam-main visraam-sttm2">AwpxI</span>
            <wbr />
            <span>qw</span>
            <wbr />
            <span>hir</span>
            <wbr />
            <span>rKw</span>
            <wbr />
            <span>aur</span>
            <wbr />
            <span>
              <span>Dwir</span>
              <i> </i>
              <span>]1]</span>
            </span>
          </span>
        </div>
      </h1>
    </div>
  );
};

export default SettingViewer;
