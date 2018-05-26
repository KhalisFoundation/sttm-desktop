const { promisify } = require('util');
const request = promisify(require('request'));
const h = require('hyperscript');

const SYNC_API_URL = 'http://localhost:1337';
const SOCKET_SCRIPT_SOURCE = `${SYNC_API_URL}/socket.io/socket.io.js`;

module.exports = {
  $content: null,
  $connectBtn: null,

  init() {
    this.$content = document.querySelector('#sync-page .block-list');
    this.$connectBtn = this.$content.querySelector('.connect-btn');

    if (
      document.querySelector(`script[src="${SOCKET_SCRIPT_SOURCE}"]`) === null
    ) {
      const script = document.createElement('script');
      script.src = SOCKET_SCRIPT_SOURCE;
      document.body.appendChild(script);
    }

    Object.assign(this.$content.style, {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    });

    this.$connectBtn.addEventListener('click', () => this.tryConnection());
  },
  async tryConnection() {
    const {
      body: { data, error },
    } = await request(`${SYNC_API_URL}/sync/begin`, {
      json: true,
    });

    if (error) {
      // TODO: do something
      this.$content.appendChild(
        h('h1', "Couldn't establish connection with sync server"),
      );
    } else {
      const { namespaceString } = data;

      if (window.io !== undefined) {
        this.onConnect(namespaceString);
      } else {
        // TODO: Wait for io or something
      }
    }
  },
  onConnect(namespaceString) {
    this.$connectBtn.classList.add('hidden');
    this.$connectBtn.style.display = 'none';
    window.socket = window.io(`${SYNC_API_URL}/${namespaceString}`);

    this.$content.appendChild(
      h(
        'div.share-box',
        {
          style: `
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
          `,
        },
        [
          h(
            'h1',
            {
              style: `
                margin; 10px;
                `,
            },
            'Ready to share!',
          ),
          h('input', {
            readonly: true,
            onclick() {
              this.select();
            },
            value: namespaceString,
          }),
          h(
            'button',
            {
              className: 'button',
              onclick: () => this.onEnd(namespaceString),
            },
            'Stop sharing',
          ),
          h(
            'button',
            {
              className: 'button',
              // TODO(SYNC): remove this once you emit automatically
              onclick: () => {
                /* eslint-disable no-use-before-define */
                window.socket.emit('data', mockData);
                /* eslint-enable no-use-before-define */
              },
            },
            'Send test data',
          ),
        ],
      ),
    );
  },
  async onEnd(namespaceString) {
    window.socket.disconnect();
    await request(`${SYNC_API_URL}/sync/end/${namespaceString}`);
    window.socket = undefined;
    this.$connectBtn.classList.remove('hidden');
    this.$connectBtn.style.display = 'block';
    this.$content.querySelector('.share-box').remove();
  },
};

const mockData = {
  info: {
    id: '2882',
    pageno: '762',
    source: {
      id: 'G',
      gurmukhi: 'sRI gurU gRMQ swihb jI',
      unicode: 'ਸ੍ਰੀ ਗੁਰੂ ਗ੍ਰੰਥ ਸਾਹਿਬ ਜੀ',
      english: 'Sri Guru Granth Sahib Ji',
      pageno: '762',
    },
    raag: {
      id: '19',
      gurmukhi: 'rwgu sUhI',
      unicode: 'ਰਾਗੁ ਸੂਹੀ',
      english: 'Raag Soohee',
      startang: null,
      endang: null,
      raagwithpage: 'Soohee (728-794)',
    },
    writer: {
      id: '1',
      gurmukhi: 'mÚ 1',
      unicode: null,
      english: 'Guru Nanak Dev Ji',
    },
  },
  navigation: { previous: '2881', next: '2883' },
  gurbani: [
    {
      shabad: {
        id: '32551',
        gurbani: {
          gurmukhi: 'sUhI mhlw 1 sucjI ]',
          unicode: 'ਸੂਹੀ ਮਹਲਾ ੧ ਸੁਚਜੀ ॥',
        },
        larivaar: {
          gurmukhi: 'sUhImhlw1sucjI]',
          unicode: 'ਸੂਹੀਮਹਲਾ੧ਸੁਚਜੀ॥',
        },
        translation: {
          english: {
            ssk:
              'Soohee, First Mehla, Suchajee ~ The Noble And Graceful Bride:',
          },
          punjabi: { bms: { gurmukhi: null, unicode: '' } },
          spanish:
            'Suji, Mejl Guru Nanak, Primer Canal Divino, Suchayi. La Novia Noble y Graciosa.',
        },
        transliteration: 'soohee mahalaa pehilaa suchajee ||',
        shabadid: '2882',
        pageno: '762',
        lineno: '14',
        updated: '2018-02-11 01:17:01',
        firstletters: { ascii: ',115,109,115,', english: 'smps' },
        bisram: { sttm: null, igurbani1: null, igurbani2: null },
      },
    },
    {
      shabad: {
        id: '32552',
        gurbani: {
          gurmukhi: 'jw qU qw mY sBu ko qU swihbu myrI rwis jIau ]',
          unicode: 'ਜਾ ਤੂ ਤਾ ਮੈ ਸਭੁ ਕੋ ਤੂ ਸਾਹਿਬੁ ਮੇਰੀ ਰਾਸਿ ਜੀਉ ॥',
        },
        larivaar: {
          gurmukhi: 'jwqUqwmYsBukoqUswihbumyrIrwisjIau]',
          unicode: 'ਜਾਤੂਤਾਮੈਸਭੁਕੋਤੂਸਾਹਿਬੁਮੇਰੀਰਾਸਿਜੀਉ॥',
        },
        translation: {
          english: {
            ssk:
              'When I have You, then I have everything. O my Lord and Master, You are my wealth and capital.',
          },
          punjabi: {
            bms: {
              gurmukhi:
                'hy pRBU! jdoN qUµ (myry vl huMdw hYN) qdoN hryk jIv mYƒ (Awdr dyNdw hY) [ qUµ hI myrw mwlk hYN, qUµ hI myrw srmwieAw hYN [',
              unicode:
                'ਹੇ ਪ੍ਰਭੂ! ਜਦੋਂ ਤੂੰ (ਮੇਰੇ ਵਲ ਹੁੰਦਾ ਹੈਂ) ਤਦੋਂ ਹਰੇਕ ਜੀਵ ਮੈਨੂੰ (ਆਦਰ ਦੇਂਦਾ ਹੈ) । ਤੂੰ ਹੀ ਮੇਰਾ ਮਾਲਕ ਹੈਂ, ਤੂੰ ਹੀ ਮੇਰਾ ਸਰਮਾਇਆ ਹੈਂ ।',
            },
          },
          spanish:
            'Cuando Estás conmigo, yo logro todo; Tú, oh Señor, eres mi Maestro, mi único Capital.',
        },
        transliteration:
          'jaa too taa mai sabh ko too saahib meree raas jeeau ||',
        shabadid: '2882',
        pageno: '762',
        lineno: '14',
        updated: '2018-05-13 22:17:02',
        firstletters: {
          ascii: ',106,113,113,109,115,107,113,115,109,114,106,',
          english: 'jttmsktsmrj',
        },
        bisram: { sttm: '19', igurbani1: null, igurbani2: null },
      },
    },
    {
      shabad: {
        id: '32553',
        gurbani: {
          gurmukhi: 'quDu AMqir hau suiK vsw qUM AMqir swbwis jIau ]',
          unicode: 'ਤੁਧੁ ਅੰਤਰਿ ਹਉ ਸੁਖਿ ਵਸਾ ਤੂੰ ਅੰਤਰਿ ਸਾਬਾਸਿ ਜੀਉ ॥',
        },
        larivaar: {
          gurmukhi: 'quDuAMqirhausuiKvswqUMAMqirswbwisjIau]',
          unicode: 'ਤੁਧੁਅੰਤਰਿਹਉਸੁਖਿਵਸਾਤੂੰਅੰਤਰਿਸਾਬਾਸਿਜੀਉ॥',
        },
        translation: {
          english: {
            ssk:
              'Within You, I abide in peace; within You, I am congratulated.',
          },
          punjabi: {
            bms: {
              gurmukhi:
                'jdoN mYN qYƒ Awpxy ihrdy ivc vsw lYNdI hW qdoN mYN suKI vsdI hW jdoN qUµ myry ihrdy ivc prgt ho jWdw hYN qdoN mYƒ (hr QW) soBw imldI hY [',
              unicode:
                'ਜਦੋਂ ਮੈਂ ਤੈਨੂੰ ਆਪਣੇ ਹਿਰਦੇ ਵਿਚ ਵਸਾ ਲੈਂਦੀ ਹਾਂ ਤਦੋਂ ਮੈਂ ਸੁਖੀ ਵਸਦੀ ਹਾਂ ਜਦੋਂ ਤੂੰ ਮੇਰੇ ਹਿਰਦੇ ਵਿਚ ਪਰਗਟ ਹੋ ਜਾਂਦਾ ਹੈਂ ਤਦੋਂ ਮੈਨੂੰ (ਹਰ ਥਾਂ) ਸੋਭਾ ਮਿਲਦੀ ਹੈ ।',
            },
          },
          spanish:
            'Cuando habitas en mi ser, estoy en Paz; bendecido soy cuando vives en mí.',
        },
        transliteration:
          'tudh a(n)tar hau sukh vasaa too(n) a(n)tar saabaas jeeau ||',
        shabadid: '2882',
        pageno: '762',
        lineno: '15',
        updated: '2018-05-13 22:17:02',
        firstletters: {
          ascii: ',113,065,104,115,118,113,065,115,106,',
          english: 'tahsvtasj',
        },
        bisram: { sttm: '24', igurbani1: null, igurbani2: null },
      },
    },
    {
      shabad: {
        id: '32554',
        gurbani: {
          gurmukhi: 'BwxY qKiq vfweIAw BwxY BIK audwis jIau ]',
          unicode: 'ਭਾਣੈ ਤਖਤਿ ਵਡਾਈਆ ਭਾਣੈ ਭੀਖ ਉਦਾਸਿ ਜੀਉ ॥',
        },
        larivaar: {
          gurmukhi: 'BwxYqKiqvfweIAwBwxYBIKaudwisjIau]',
          unicode: 'ਭਾਣੈਤਖਤਿਵਡਾਈਆਭਾਣੈਭੀਖਉਦਾਸਿਜੀਉ॥',
        },
        translation: {
          english: {
            ssk:
              'By the Pleasure of Your Will, You bestow thrones and greatness. And by the Pleasure of Your Will, You make us beggars and wanderers.',
          },
          punjabi: {
            bms: {
              gurmukhi:
                'pRBU dI rzw ivc hI koeI q^q auqy bYTw hY qy vifAweIAW iml rhIAW hn, aus dI rzw ivc hI koeI ivrkq ho ky (dr dr qy) iB`iCAw mMgdw iPrdw hY [',
              unicode:
                'ਪ੍ਰਭੂ ਦੀ ਰਜ਼ਾ ਵਿਚ ਹੀ ਕੋਈ ਤਖ਼ਤ ਉਤੇ ਬੈਠਾ ਹੈ ਤੇ ਵਡਿਆਈਆਂ ਮਿਲ ਰਹੀਆਂ ਹਨ, ਉਸ ਦੀ ਰਜ਼ਾ ਵਿਚ ਹੀ ਕੋਈ ਵਿਰਕਤ ਹੋ ਕੇ (ਦਰ ਦਰ ਤੇ) ਭਿੱਛਿਆ ਮੰਗਦਾ ਫਿਰਦਾ ਹੈ ।',
            },
          },
          spanish:
            'Si tal es Tu Voluntad, me conviertes en un rey o en un pordiosero sin nada en el mundo.',
        },
        transliteration:
          'bhaanai takhat vaddaieeaa bhaanai bheekh audhaas jeeau ||',
        shabadid: '2882',
        pageno: '762',
        lineno: '15',
        updated: '2018-05-13 22:17:02',
        firstletters: {
          ascii: ',066,113,118,066,066,097,106,',
          english: 'btvbbaj',
        },
        bisram: { sttm: '18', igurbani1: null, igurbani2: null },
      },
    },
    {
      shabad: {
        id: '32555',
        gurbani: {
          gurmukhi: 'BwxY Ql isir sru vhY kmlu PulY Awkwis jIau ]',
          unicode: 'ਭਾਣੈ ਥਲ ਸਿਰਿ ਸਰੁ ਵਹੈ ਕਮਲੁ ਫੁਲੈ ਆਕਾਸਿ ਜੀਉ ॥',
        },
        larivaar: {
          gurmukhi: 'BwxYQlisirsruvhYkmluPulYAwkwisjIau]',
          unicode: 'ਭਾਣੈਥਲਸਿਰਿਸਰੁਵਹੈਕਮਲੁਫੁਲੈਆਕਾਸਿਜੀਉ॥',
        },
        translation: {
          english: {
            ssk:
              'By the Pleasure of Your Will, the ocean flows in the desert, and the lotus blossoms in the sky.',
          },
          punjabi: {
            bms: {
              gurmukhi:
                'pRBU dI rzw ivc hI ikqy su`kI DrqI auqy srovr cl pYNdw hY qy kOl Pu`l AwkwS ivc iKV AwauNdw hY (Bwv, iksy AhMkwrI pRym-hIx ihrdy ivc pRym dw pRvwh c`l pYNdw hY) [',
              unicode:
                'ਪ੍ਰਭੂ ਦੀ ਰਜ਼ਾ ਵਿਚ ਹੀ ਕਿਤੇ ਸੁੱਕੀ ਧਰਤੀ ਉਤੇ ਸਰੋਵਰ ਚਲ ਪੈਂਦਾ ਹੈ ਤੇ ਕੌਲ ਫੁੱਲ ਆਕਾਸ਼ ਵਿਚ ਖਿੜ ਆਉਂਦਾ ਹੈ (ਭਾਵ, ਕਿਸੇ ਅਹੰਕਾਰੀ ਪ੍ਰੇਮ-ਹੀਣ ਹਿਰਦੇ ਵਿਚ ਪ੍ਰੇਮ ਦਾ ਪ੍ਰਵਾਹ ਚੱਲ ਪੈਂਦਾ ਹੈ) ।',
            },
          },
          spanish:
            'Si tal es Tu Voluntad los mares aparecerán en el corazón del desierto y el loto florecerá en el cielo de la mente.',
        },
        transliteration:
          'bhaanai thal sir sar vahai kamal fulai aakaas jeeau ||',
        shabadid: '2882',
        pageno: '762',
        lineno: '16',
        updated: '2018-05-13 22:17:02',
        firstletters: {
          ascii: ',066,081,115,115,118,107,080,065,106,',
          english: 'btssvkfaj',
        },
        bisram: { sttm: null, igurbani1: null, igurbani2: null },
      },
    },
    {
      shabad: {
        id: '32556',
        gurbani: {
          gurmukhi: 'BwxY Bvjlu lµGIAY BwxY mMiJ BrIAwis jIau ]',
          unicode: 'ਭਾਣੈ ਭਵਜਲੁ ਲੰਘੀਐ ਭਾਣੈ ਮੰਝਿ ਭਰੀਆਸਿ ਜੀਉ ॥',
        },
        larivaar: {
          gurmukhi: 'BwxYBvjlulµGIAYBwxYmMiJBrIAwisjIau]',
          unicode: 'ਭਾਣੈਭਵਜਲੁਲੰਘੀਐਭਾਣੈਮੰਝਿਭਰੀਆਸਿਜੀਉ॥',
        },
        translation: {
          english: {
            ssk:
              'By the Pleasure of Your Will, one crosses over the terrifying world-ocean; by the Pleasure of Your Will, he sinks down into it.',
          },
          punjabi: {
            bms: {
              gurmukhi:
                'pRBU dI rzw ivc hI sMswr-smuMdr qoN pwr lMG jweIdw hY; aus dI rzw Anuswr hI ivkwrW nwl BrIj ky iv`cy hI fu`b jweIdw hY [',
              unicode:
                'ਪ੍ਰਭੂ ਦੀ ਰਜ਼ਾ ਵਿਚ ਹੀ ਸੰਸਾਰ-ਸਮੁੰਦਰ ਤੋਂ ਪਾਰ ਲੰਘ ਜਾਈਦਾ ਹੈ; ਉਸ ਦੀ ਰਜ਼ਾ ਅਨੁਸਾਰ ਹੀ ਵਿਕਾਰਾਂ ਨਾਲ ਭਰੀਜ ਕੇ ਵਿੱਚੇ ਹੀ ਡੁੱਬ ਜਾਈਦਾ ਹੈ ।',
            },
          },
          spanish:
            'Por Tu Voluntad cruzamos el mar de la existencia, por Tu Voluntad nuestra carga se hunde en medio de la corriente.',
        },
        transliteration:
          'bhaanai bhavajal la(n)gheeaai bhaanai ma(n)jh bhareeaas jeeau ||',
        shabadid: '2882',
        pageno: '762',
        lineno: '16',
        updated: '2018-05-13 22:17:02',
        firstletters: {
          ascii: ',066,066,108,066,109,066,106,',
          english: 'bblbmbj',
        },
        bisram: { sttm: '18', igurbani1: null, igurbani2: null },
      },
    },
    {
      shabad: {
        id: '32557',
        gurbani: {
          gurmukhi: 'BwxY so shu rMgulw isPiq rqw guxqwis jIau ]',
          unicode: 'ਭਾਣੈ ਸੋ ਸਹੁ ਰੰਗੁਲਾ ਸਿਫਤਿ ਰਤਾ ਗੁਣਤਾਸਿ ਜੀਉ ॥',
        },
        larivaar: {
          gurmukhi: 'BwxYsoshurMgulwisPiqrqwguxqwisjIau]',
          unicode: 'ਭਾਣੈਸੋਸਹੁਰੰਗੁਲਾਸਿਫਤਿਰਤਾਗੁਣਤਾਸਿਜੀਉ॥',
        },
        translation: {
          english: {
            ssk:
              'By the Pleasure of His Will, that Lord becomes my Husband, and I am imbued with the Praises of the Lord, the treasure of virtue.',
          },
          punjabi: {
            bms: {
              gurmukhi:
                'aus dI rzw ivc hI iksy jIv-iesq®I ƒ auh pRBU-pqI ipAwrw l`gdw hY, rzw Anuswr hI koeI jIv aus guxW dy ^zwny pRBU dIAW is&qW ivc msq rihMdw hY [',
              unicode:
                'ਉਸ ਦੀ ਰਜ਼ਾ ਵਿਚ ਹੀ ਕਿਸੇ ਜੀਵ-ਇਸਤ੍ਰੀ ਨੂੰ ਉਹ ਪ੍ਰਭੂ-ਪਤੀ ਪਿਆਰਾ ਲੱਗਦਾ ਹੈ, ਰਜ਼ਾ ਅਨੁਸਾਰ ਹੀ ਕੋਈ ਜੀਵ ਉਸ ਗੁਣਾਂ ਦੇ ਖ਼ਜ਼ਾਨੇ ਪ੍ਰਭੂ ਦੀਆਂ ਸਿਫ਼ਤਾਂ ਵਿਚ ਮਸਤ ਰਹਿੰਦਾ ਹੈ ।',
            },
          },
          spanish:
            'Por Tu Voluntad Te encuentro como a un Ser Colorido y entonces soy imbuido en Tu Alabanza, oh Tesoro de Virtud.',
        },
        transliteration:
          'bhaanai so sahu ra(n)gulaa sifat rataa gunataas jeeau ||',
        shabadid: '2882',
        pageno: '762',
        lineno: '17',
        updated: '2018-05-13 22:17:02',
        firstletters: {
          ascii: ',066,115,115,114,115,114,103,106,',
          english: 'bssrsrgj',
        },
        bisram: { sttm: '19', igurbani1: null, igurbani2: null },
      },
    },
    {
      shabad: {
        id: '32558',
        gurbani: {
          gurmukhi: 'BwxY shu BIhwvlw hau Awvix jwix mueIAwis jIau ]',
          unicode: 'ਭਾਣੈ ਸਹੁ ਭੀਹਾਵਲਾ ਹਉ ਆਵਣਿ ਜਾਣਿ ਮੁਈਆਸਿ ਜੀਉ ॥',
        },
        larivaar: {
          gurmukhi: 'BwxYshuBIhwvlwhauAwvixjwixmueIAwisjIau]',
          unicode: 'ਭਾਣੈਸਹੁਭੀਹਾਵਲਾਹਉਆਵਣਿਜਾਣਿਮੁਈਆਸਿਜੀਉ॥',
        },
        translation: {
          english: {
            ssk:
              'By the Pleasure of Your Will, O my Husband Lord, I am afraid of You, and I come and go, and die.',
          },
          punjabi: {
            bms: {
              gurmukhi:
                'ieh BI aus dI rzw ivc hI hY ik kdy auh Ksm mYƒ jIv-iesq®I ƒ frwauxw l`gdw hY, qy mYN jnm mrn dy gyV ivc pY ky Awqmk mOqy mrdI hW [',
              unicode:
                'ਇਹ ਭੀ ਉਸ ਦੀ ਰਜ਼ਾ ਵਿਚ ਹੀ ਹੈ ਕਿ ਕਦੇ ਉਹ ਖਸਮ ਮੈਨੂੰ ਜੀਵ-ਇਸਤ੍ਰੀ ਨੂੰ ਡਰਾਉਣਾ ਲੱਗਦਾ ਹੈ, ਤੇ ਮੈਂ ਜਨਮ ਮਰਨ ਦੇ ਗੇੜ ਵਿਚ ਪੈ ਕੇ ਆਤਮਕ ਮੌਤੇ ਮਰਦੀ ਹਾਂ ।',
            },
          },
          spanish:
            'Por Tu Voluntad sufro el horror de perderme en el ciclo de las idas y venidas.',
        },
        transliteration:
          'bhaanai sahu bheehaavalaa hau aavan jaan muieeaas jeeau ||',
        shabadid: '2882',
        pageno: '762',
        lineno: '17',
        updated: '2018-05-13 22:17:02',
        firstletters: {
          ascii: ',066,115,066,104,065,106,109,106,',
          english: 'bsbhajmj',
        },
        bisram: { sttm: '17', igurbani1: null, igurbani2: null },
      },
    },
    {
      shabad: {
        id: '32559',
        gurbani: {
          gurmukhi: 'qU shu Agmu Aqolvw hau kih kih Fih peIAwis jIau ]',
          unicode: 'ਤੂ ਸਹੁ ਅਗਮੁ ਅਤੋਲਵਾ ਹਉ ਕਹਿ ਕਹਿ ਢਹਿ ਪਈਆਸਿ ਜੀਉ ॥',
        },
        larivaar: {
          gurmukhi: 'qUshuAgmuAqolvwhaukihkihFihpeIAwisjIau]',
          unicode: 'ਤੂਸਹੁਅਗਮੁਅਤੋਲਵਾਹਉਕਹਿਕਹਿਢਹਿਪਈਆਸਿਜੀਉ॥',
        },
        translation: {
          english: {
            ssk:
              'You, O my Husband Lord, are inaccessible and immeasurable; talking and speaking of You, I have fallen at Your Feet.',
          },
          punjabi: {
            bms: {
              gurmukhi:
                'hy pRBU-pqI! qUµ AphuMc hYN, qUµ byAMq guxW dw mwlk hYN [ mYN ArdwsW kr kr ky qyry hI dr qy Fih peI hW (mYN qyrw hI Awsrw-prnw ilAw hY) [',
              unicode:
                'ਹੇ ਪ੍ਰਭੂ-ਪਤੀ! ਤੂੰ ਅਪਹੁੰਚ ਹੈਂ, ਤੂੰ ਬੇਅੰਤ ਗੁਣਾਂ ਦਾ ਮਾਲਕ ਹੈਂ । ਮੈਂ ਅਰਦਾਸਾਂ ਕਰ ਕਰ ਕੇ ਤੇਰੇ ਹੀ ਦਰ ਤੇ ਢਹਿ ਪਈ ਹਾਂ (ਮੈਂ ਤੇਰਾ ਹੀ ਆਸਰਾ-ਪਰਨਾ ਲਿਆ ਹੈ) ।',
            },
          },
          spanish:
            'Oh Señor, Tú eres Insondable, Incalculable; hablando de Ti yo postro mi ser a Tus Pies. ',
        },
        transliteration:
          'too sahu agam atolavaa hau keh keh ddeh pieeaas jeeau ||',
        shabadid: '2882',
        pageno: '762',
        lineno: '18',
        updated: '2018-05-13 22:17:02',
        firstletters: {
          ascii: ',113,115,065,065,104,107,107,070,112,106,',
          english: 'tsaahkkdpj',
        },
        bisram: { sttm: '19', igurbani1: null, igurbani2: null },
      },
    },
    {
      shabad: {
        id: '32560',
        gurbani: {
          gurmukhi: 'ikAw mwgau ikAw kih suxI mY drsn BUK ipAwis jIau ]',
          unicode: 'ਕਿਆ ਮਾਗਉ ਕਿਆ ਕਹਿ ਸੁਣੀ ਮੈ ਦਰਸਨ ਭੂਖ ਪਿਆਸਿ ਜੀਉ ॥',
        },
        larivaar: {
          gurmukhi: 'ikAwmwgauikAwkihsuxImYdrsnBUKipAwisjIau]',
          unicode: 'ਕਿਆਮਾਗਉਕਿਆਕਹਿਸੁਣੀਮੈਦਰਸਨਭੂਖਪਿਆਸਿਜੀਉ॥',
        },
        translation: {
          english: {
            ssk:
              'What should I beg for? What should I say and hear? I am hungry and thirsty for the Blessed Vision of Your Darshan.',
          },
          punjabi: {
            bms: {
              gurmukhi:
                'mYN qyry dr qoN hor kIh mMgW? qYƒ hor kIh AwKW jo qUµ suxyN? mYƒ qyry dIdwr dI Bu`K hY, mYN qyry drsn dI ipAwsI hW [',
              unicode:
                'ਮੈਂ ਤੇਰੇ ਦਰ ਤੋਂ ਹੋਰ ਕੀਹ ਮੰਗਾਂ? ਤੈਨੂੰ ਹੋਰ ਕੀਹ ਆਖਾਂ ਜੋ ਤੂੰ ਸੁਣੇਂ? ਮੈਨੂੰ ਤੇਰੇ ਦੀਦਾਰ ਦੀ ਭੁੱਖ ਹੈ, ਮੈਂ ਤੇਰੇ ਦਰਸਨ ਦੀ ਪਿਆਸੀ ਹਾਂ ।',
            },
          },
          spanish:
            '¿Qué podría yo pedir? díganme, ¿qué podría yo recitar?, excepto que estoy sediento y hambriento por Ti. ',
        },
        transliteration:
          'kiaa maagau kiaa keh sunee mai dharasan bhookh piaas jeeau ||',
        shabadid: '2882',
        pageno: '762',
        lineno: '19',
        updated: '2018-05-13 22:17:02',
        firstletters: {
          ascii: ',107,109,107,107,115,109,100,066,112,106,',
          english: 'kmkksmdbpj',
        },
        bisram: { sttm: '25', igurbani1: null, igurbani2: null },
      },
    },
    {
      shabad: {
        id: '32561',
        gurbani: {
          gurmukhi: 'gur sbdI shu pwieAw scu nwnk kI Ardwis jIau ]2]',
          unicode: 'ਗੁਰ ਸਬਦੀ ਸਹੁ ਪਾਇਆ ਸਚੁ ਨਾਨਕ ਕੀ ਅਰਦਾਸਿ ਜੀਉ ॥੨॥',
        },
        larivaar: {
          gurmukhi: 'gursbdIshupwieAwscunwnkkIArdwisjIau]2]',
          unicode: 'ਗੁਰਸਬਦੀਸਹੁਪਾਇਆਸਚੁਨਾਨਕਕੀਅਰਦਾਸਿਜੀਉ॥੨॥',
        },
        translation: {
          english: {
            ssk:
              "Through the Word of the Guru's Teachings, I have found my Husband Lord. This is Nanak's true prayer. ||2||",
          },
          punjabi: {
            bms: {
              gurmukhi:
                'qUµ sdw-iQr rihx vwlw Ksm gurU dy Sbd dI rwhIN imldw hYN [ myrI nwnk dI qyry A`gy ArzoeI hY ik mYƒ BI gurU dI srn pw ky iml [2[',
              unicode:
                'ਤੂੰ ਸਦਾ-ਥਿਰ ਰਹਿਣ ਵਾਲਾ ਖਸਮ ਗੁਰੂ ਦੇ ਸ਼ਬਦ ਦੀ ਰਾਹੀਂ ਮਿਲਦਾ ਹੈਂ । ਮੇਰੀ ਨਾਨਕ ਦੀ ਤੇਰੇ ਅੱਗੇ ਅਰਜ਼ੋਈ ਹੈ ਕਿ ਮੈਨੂੰ ਭੀ ਗੁਰੂ ਦੀ ਸਰਨ ਪਾ ਕੇ ਮਿਲ ।੨।',
            },
          },
          spanish:
            'A través de la Palabra de las Enseñanzas, he encontrado a mi Esposo, el Señor, esta es la Verdadera oración de Nanak.(2)',
        },
        transliteration:
          'gur sabadhee sahu paiaa sach naanak kee aradhaas jeeau ||2||',
        shabadid: '2882',
        pageno: '762',
        lineno: '19',
        updated: '2018-05-13 22:17:02',
        firstletters: {
          ascii: ',103,115,115,112,115,110,107,065,106,',
          english: 'gsspsnkaj',
        },
        bisram: { sttm: '20', igurbani1: null, igurbani2: null },
      },
    },
  ],
  error: false,
};
