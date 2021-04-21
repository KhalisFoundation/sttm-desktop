import React from 'react';
import { useStoreState } from 'easy-peasy';
import Slide from '../Slide/Slide';

const themes = require('../../../../www/configs/themes.json');

function ShabadDeck() {
  const { theme: currentTheme } = useStoreState(state => state.userSettings);

  const getCurrentThemeInstance = () => {
    return themes.find(theme => theme.key === currentTheme);
  };

  const bakeThemeStyles = themeInstance => {
    return themeInstance['background-image-full']
      ? {
          backgroundImage: `url('assets/img/custom_backgrounds/${
            themeInstance['background-image-full']
          }')`,
        }
      : {
          backgroundColor: themeInstance['background-color'],
        };
  };

  const applyTheme = () => {
    const themeInstance = getCurrentThemeInstance();
    return bakeThemeStyles(themeInstance);
  };

  const tempVerse = {
    ID: 11228,
    Gurmukhi: 'ddw dwqw eyku hY sB kau dyvnhwr ]',
    Translations: {
      en: {
        bdb: 'DADDA: The One Lord is the Great Giver; He is the Giver to all.',
        ms: 'D: The unique Lord is the Bestower, He is the Giver to all.',
        ssk: 'DADDA: The One Lord is the Great Giver; He is the Giver to all.',
      },
      pu: {
        ss: 'iek pRBU hI (AYsw) dwqw hY jo sB jIvW ƒ irzk ApVwx dy smrQ hY',
        ft: 'ddy duAwry ly kr khqy hYN: srb ko dyxy hwr dwqw eyk vwhgurU hI hY]',
        bdb: 'iek pRBU hI (AYsw) dwqw hY jo sB jIvW ƒ irzk ApVwx dy smrQ hY',
        ms: 'd-Adu`qI swihb dI dwqwr hY[ auh swirAW ƒ dyx vwlw hY[',
      },
      puu: {
        ss: 'ਇਕ ਪ੍ਰਭੂ ਹੀ (ਐਸਾ) ਦਾਤਾ ਹੈ ਜੋ ਸਭ ਜੀਵਾਂ ਨੂੰ ਰਿਜ਼ਕ ਅਪੜਾਣ ਦੇ ਸਮਰਥ ਹੈ',
        ft: 'ਦਦੇ ਦੁਆਰੇ ਲੇ ਕਰ ਕਹਤੇ ਹੈਂ: ਸਰਬ ਕੋ ਦੇਣੇ ਹਾਰ ਦਾਤਾ ਏਕ ਵਾਹਗੁਰੂ ਹੀ ਹੈ॥',
        bdb: 'ਇਕ ਪ੍ਰਭੂ ਹੀ (ਐਸਾ) ਦਾਤਾ ਹੈ ਜੋ ਸਭ ਜੀਵਾਂ ਨੂੰ ਰਿਜ਼ਕ ਅਪੜਾਣ ਦੇ ਸਮਰਥ ਹੈ',
        ms: 'ਦ-ਅਦੁੱਤੀ ਸਾਹਿਬ ਦੀ ਦਾਤਾਰ ਹੈ। ਉਹ ਸਾਰਿਆਂ ਨੂੰ ਦੇਣ ਵਾਲਾ ਹੈ।',
      },
      es: {
        sn: 'DADDA: Él, el Señor es el Único Dador, Él es quien da a todos, y sin ningún límite, ',
      },
      hi: {
        ss: 'एक प्रभू ही (ऐसा) दाता है जो सब जीवों को रिजक पहुँचाने के स्मर्थ है।',
        sts: 'द- एक परमात्मा ही वह दाता है जो समस्त जीवों को भोजन-पदार्थ देने वाला है।',
      },
    },
    Writer: { WriterID: 5, WriterEnglish: 'Guru Arjan Dev Ji', WriterGurmukhi: 'mÚ 5' },
    Raag: {
      RaagID: 7,
      RaagGurmukhi: 'rwgu gauVI',
      RaagEnglish: 'Raag Gauree',
      StartID: 151,
      EndID: 6232,
      RaagWithPage: 'Gauree (151-346)',
    },
    PageNo: 257,
    LineNo: 10,
    Source: {
      SourceID: 'G',
      SourceGurmukhi: 'sRI gurU gRMQ swihb jI',
      SourceEnglish: 'Sri Guru Granth Sahib Ji',
    },
    FirstLetterStr: ',100,100,101,104,115,107,100,',
    MainLetters: 'dd dq ek h sB ka dvnhr',
    Visraam:
      '{"sttm": [{"p": 3, "t": "v"}, {"p": 0, "t": "y"}], "igurbani": [{"p": 3, "t": "v"}, {"p": 0, "t": "y"}], "sttm2": [{"p": 3, "t": "v"}]}',
    FirstLetterEng: 'ddehskd',
    Updated: '2021-02-18T03:58:37.000Z',
    FirstLetterLen: 1,
    Shabads: { '0': { ShabadID: 827 } },
  };
  return (
    <div className="shabad-deck" style={applyTheme()}>
      <Slide verseObj={tempVerse} themeStyleObj={getCurrentThemeInstance()} />
    </div>
  );
}

export default ShabadDeck;
