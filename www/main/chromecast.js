/* eslint
  global-require: 0,
  import/no-unresolved: 0,
  no-inner-declarations: 0,
  no-use-before-define: 0,
  no-console: 0,
  no-shadow: 0,
  no-unused-vars: 0,
  no-undef: 0,
  prefer-template: 0
*/

import chromecast from 'electron-chromecast';
import { CHROMECAST } from './locales/en.json';
import { convertToLegacySettingsObj } from './js/common/utils';

const { store } = require('electron').remote.require('./app');
const { ipcRenderer } = require('electron');
const tingle = require('./assets/js/vendor/tingle.js');

// Find receiver and show to viewer
let trigID = 0;
const receiverFn = async receivers =>
  new Promise(resolve => {
    trigID += 1;
    // instantiate new modal
    const modal = new tingle.Modal({
      footer: true,
      stickyFooter: false,
      closeMethods: ['overlay', 'button', 'escape'],
    });
    let numReceivers = 0;
    receivers.forEach(receiver => {
      const fullName = receiver.service_fullname;
      const blacklist = ['Chromecast-Audio', 'Google-Home', 'Sound-Bar', 'Google-Cast-Group'];
      if (!new RegExp(blacklist.join('|')).test(fullName)) {
        numReceivers += 1;
        // add cast button
        modal.addCastBtn(
          receiver.friendlyName,
          'tingle-btn tingle-btn--primary',
          `${receiver.ipAddress}_${receiver.port}_${trigID}`,
          e => {
            if (
              e.target.getAttribute('data-reciever-id') ===
              `${receiver.ipAddress}_${receiver.port}_${trigID}`
            ) {
              resolve(receiver);
              appendMessage(receiver);
            }
            modal.close();
          },
        );
      }
    });

    // set content
    const message = numReceivers === 0 ? CHROMECAST.NO_DEVICES_FOUND : CHROMECAST.SELECT_DEVICE;
    modal.setContent('<h2>' + message + '</h2>');
    // add cancel button
    const cancelTitle = numReceivers === 0 ? 'OK' : CHROMECAST.CANCEL;
    modal.addFooterBtn(cancelTitle, 'tingle-btn tingle-btn--pull-right tingle-btn--default', () => {
      modal.close();
    });

    // open modal
    modal.open();
  });

chromecast(receiverFn);

const applicationID = '3F64A19C';
const namespace = 'urn:x-cast:com.khalis.cast.sttm.gurbani';
let session = null;
let isCastInitialized = false;
const castCur = {
  gurmukhi:
    '<span class="visraam-yamki visraam-sttm visraam-igurbani">ddw</span> <span>dwqw</span> <span>eyku</span> <span class="visraam-main visraam-sttm visraam-igurbani visraam-sttm2">hY</span> <span>sB</span> <span>kau</span> <span><span>dyvnhwr</span><i> </i><span>]</span></span>',
  larivaar:
    '<span class="visraam-yamki visraam-sttm visraam-igurbani">ddw</span><wbr><span>dwqw</span><wbr><span>eyku</span><wbr><span class="visraam-main visraam-sttm visraam-igurbani visraam-sttm2">hY</span><wbr><span>sB</span><wbr><span>kau</span><wbr><span><span>dyvnhwr</span><i> </i><span>]</span></span>',
  translation: {
    Spanish: 'DADDA: Él, el Señor es el Único Dador, Él es quien da a todos, y sin ningún límite, ',
    English: 'DADDA: The One Lord is the Great Giver; He is the Giver to all.',
    Hindi: 'एक प्रभू ही (ऐसा) दाता है जो सब जीवों को रिजक पहुँचाने के स्मर्थ है।',
  },
  teeka: 'iek pRBU hI (AYsw) dwqw hY jo sB jIvW ƒ irzk ApVwx dy smrQ hY',
  transliteration: {
    Devanagari: 'ददा दाता एकु है सभ कउ देवनहार ॥',
    English: 'dhadhaa dhaataa ek hai sabh kau dhevanahaar ||',
    Shahmukhi: 'ددا داتا اےک هَے سبھ کا دےونهار ۔۔',
  },
  nextLine:
    '<span>dyNdy</span> <span>qoit</span> <span>n</span> <span class="visraam-main visraam-sttm visraam-igurbani visraam-sttm2">AwveI</span> <span>Agnq</span> <span>Bry</span> <span><span>BMfwr</span><i> </i><span>]</span></span>',
  prefs: {
    toolbar: {
      'gurbani-options': { 'display-visraams': false },
      vishraam: { 'vishraam-options': 'colored-words', 'vishraam-source': 'sttm2' },
    },
    'slide-layout': {
      fields: {
        'display-translation': true,
        'display-transliteration': true,
        'display-teeka': true,
        'display-next-line': false,
      },
      'font-sizes': { announcements: 7, gurbani: 11, translation: 6, transliteration: 6, teeka: 5 },
      'language-settings': {
        'translation-language': 'English',
        'transliteration-language': 'English',
      },
      'larivaar-settings': { 'assist-type': 'single-color' },
      'display-options': { larivaar: false, 'larivaar-assist': false, 'left-align': false },
    },
    app: { theme: 'light-theme' },
  },
};

const castToReceiver = () => {
  sendMessage(JSON.stringify(castCur));
  setTimeout(() => {
    sendMessage(JSON.stringify(castCur));
  }, 4000);
};

/**
 * append message to debug message window
 * @param {string} message A message string
 */
function appendMessage(message) {
  console.log(message);
}

/**
 * initialization success callback
 */
function onInitSuccess() {
  appendMessage('onInitSuccess');
  isCastInitialized = true;
}

/**
 * generic success callback
 */
function onSuccess(message) {
  appendMessage('onSuccess: ' + message);
}

function onRequestSessionSuccess(e) {
  appendMessage('onRequestSessionSuccess');
  session = e;
  global.platform.ipc.send('cast-session-active');
  castToReceiver();
}

function requestSession() {
  if (!isCastInitialized) {
    initializeCastApi();
  }
  chrome.cast.requestSession(onRequestSessionSuccess, onError);
}

/**
 * listener for session updates
 */
function sessionUpdateListener(isAlive) {
  let message = isAlive ? CHROMECAST.SESSION_UPDATED : CHROMECAST.SESSION_REMOVED;
  message += ': ' + session.sessionId;
  appendMessage(message);
  if (!isAlive) {
    session = null;
    global.platform.ipc.send('cast-session-stopped');
  }
}

/**
 * utility function to log messages from the receiver
 * @param {string} namespace The namespace of the message
 * @param {string} message A message string
 */
function receiverMessage(namespace, message) {
  appendMessage('receiverMessage: ' + namespace + ', ' + message);
}

/**
 * session listener during initialization
 */
function sessionListener(e) {
  appendMessage('New session ID:' + e.sessionId);
  session = e;
  session.addUpdateListener(sessionUpdateListener);
  session.addMessageListener(namespace, receiverMessage);
}

/**
 * receiver listener during initialization
 */
function receiverListener(e) {
  if (e === chrome.cast.ReceiverAvailability.AVAILABLE) {
    appendMessage('receiver found');
  } else {
    appendMessage('receiver list empty: ' + e);
  }
}

/**
 * initialization error callback
 */
function onError(message) {
  appendMessage('onError: ' + JSON.stringify(message));

  switch (message.code) {
    case 'RECEIVER_UNAVAILABLE':
      displayError(CHROMECAST.NO_DEVICES_DETECTED);
      break;
    default:
      displayError(CHROMECAST.TRY_AGAIN);
      break;
  }
}

function displayError(errorMessage) {
  const modal = new tingle.Modal({
    footer: true,
    stickyFooter: false,
    closeMethods: ['overlay', 'button', 'escape'],
  });

  modal.setContent('<h2>' + errorMessage + '</h2>');
  // add ok button
  modal.addFooterBtn('OK', 'tingle-btn tingle-btn--pull-right tingle-btn--default', () => {
    modal.close();
  });

  // open modal
  modal.open();
}

/**
 * initialization
 */
function initializeCastApi() {
  appendMessage('initializing');
  const sessionRequest = new chrome.cast.SessionRequest(applicationID);
  const apiConfig = new chrome.cast.ApiConfig(sessionRequest, sessionListener, receiverListener);
  chrome.cast.initialize(apiConfig, onInitSuccess, onError);
}

/**
 * callback on success for stopping app
 */
function onStopAppSuccess() {
  appendMessage('onStopAppSuccess');
}

/**
 * stop app/session
 */
function stopApp() {
  global.platform.ipc.send('cast-session-stopped');
  session.stop(onStopAppSuccess, onError);
}

/**
 * send a message to the receiver using the custom namespace
 * receiver CastMessageBus message handler will be invoked
 * @param {string} message A message string
 */
function sendMessage(message) {
  if (session != null && session.status !== 'STOPPED') {
    session.sendMessage(
      namespace,
      message,
      onSuccess.bind(this, CHROMECAST.MSG_SENT + message),
      onError,
    );
  } else {
    appendMessage('Cannot send because session is null');
  }
}

// IPC
global.platform.ipc.on('search-cast', (event, pos) => {
  requestSession();
  appendMessage(event);
  appendMessage(pos);
});

global.platform.ipc.on('stop-cast', (event, pos) => {
  stopApp();
});

global.platform.ipc.on('cast-to-receiver2', (event, pos) => {
  console.log('event, pos', event, pos);
});

ipcRenderer.on('cast-to-receiver2', (event, pos) => {
  console.log('from ipc renderer', event, pos);
});
