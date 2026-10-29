/* global chrome */
import { ipcRenderer } from 'electron';
import { i18n } from '../../common/i18n';

const remote = require('@electron/remote');

/* eslint-disable-next-line global-require */
export const tingle = require('../../../assets/js/vendor/tingle');

const analytics = remote.getGlobal('analytics');

const applicationID = 'ECF05819';
const namespace = 'urn:x-cast:com.khalis.cast.sttm.gurbani';
let session = null;
let isCastInitialized = false;

/**
 * append message to debug message window
 * @param {string} message A message string
 */
export const appendMessage = (message) => {
  /* eslint-disable-next-line no-console */
  console.log(message);
};

const displayError = (errorMessage) => {
  const modal = new tingle.Modal({
    footer: true,
    stickyFooter: false,
    closeMethods: ['overlay', 'button', 'escape'],
  });

  modal.setContent(`<h2 class='tingle-heading'>${errorMessage}</h2>`);
  // add ok button
  modal.addFooterBtn('OK', 'tingle-btn tingle-btn--pull-right tingle-btn--default', () => {
    modal.close();
  });

  // open modal
  modal.open();
};

/**
 * initialization error callback
 */
const onError = (message) => {
  appendMessage(`onError: ${JSON.stringify(message)}`);

  switch (message.code) {
    case 'RECEIVER_UNAVAILABLE':
      displayError(i18n.t('CHROMECAST.NO_DEVICES_DETECTED'));
      break;
    default:
      displayError(i18n.t('CHROMECAST.TRY_AGAIN'));
      break;
  }
};

// The receiver (sttm-chromecast) has its own stylesheet, which doesn't know
// some of ours: the shabad info bar, the translation review QR code, the shabad
// overview slide, and the Devanagari and Shahmukhi text that shouldn't be bold.
// Those rules are taken from ours and sent along with the slide. The info bar's,
// QR code's and overview's are scoped under #viewer-container here; the scope is
// dropped so they work in the receiver's own container.
const RECEIVER_MISSING_RULES =
  /shabad-info|shabad-deck--with-info|translation-review-qr|shabad-overview|\.slide-(translation|transliteration)\.(devanagari|shahmukhi)/;

// Rules only the receiver needs: its .shabad-deck has a bottom padding that
// would leave a gap under the info bar.
const RECEIVER_ONLY_CSS = '.shabad-deck--with-info { padding-bottom: 0; }';

let receiverCss = null;
const getReceiverCss = () => {
  if (receiverCss === null) {
    receiverCss = Array.from(document.styleSheets)
      .flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules);
        } catch (e) {
          return [];
        }
      })
      .map((rule) => rule.cssText)
      .filter((cssText) => RECEIVER_MISSING_RULES.test(cssText))
      .map((cssText) => cssText.replace(/#viewer-container\s+/g, ''))
      .concat(RECEIVER_ONLY_CSS)
      .join('\n');
  }
  return receiverCss;
};

// Removes quicktools, paddingtools, and svg from clonedNode of viewer
const getSanitizedViewer = () => {
  const viewerHtml = document.querySelector('#viewer-container')
    ? document.querySelector('#viewer-container').cloneNode(true)
    : '';
  viewerHtml.querySelector('.viewer-logo')?.remove();
  viewerHtml.querySelector('.shabad-info__logo')?.remove();
  viewerHtml.querySelector('.slide-quicktools')?.remove();
  viewerHtml.querySelector('.slide-paddingtools')?.remove();
  viewerHtml.querySelector('video')?.remove();
  viewerHtml.querySelector('.shabad-deck')?.removeAttribute('style');
  viewerHtml.querySelector('.verse-slide-wrapper')?.removeAttribute('style');

  // The info bar, or the QR code on its own once the bar hides.
  const hasShabadInfo = !!viewerHtml.querySelector('.shabad-deck--with-info');
  const slideWrapper = viewerHtml.querySelector('#viewer-container-slide-wrapper');
  if (slideWrapper) {
    slideWrapper.style.width = '100%';
    // With the info bar, the slide takes the height left above it instead.
    if (!hasShabadInfo) {
      slideWrapper.style.height = '100%';
    }
    slideWrapper.style.padding = '0';
  }
  const style = document.createElement('style');
  style.textContent = getReceiverCss();
  viewerHtml.prepend(style);
  return viewerHtml.innerHTML;
};

/**
 * initialization success callback
 */
const onInitSuccess = () => {
  appendMessage('onInitSuccess');
  isCastInitialized = true;
};

/**
 * generic success callback
 */
const onSuccess = (message) => {
  appendMessage(`onSuccess: ${message}`);
};

/**
 * send a message to the receiver using the custom namespace
 * receiver CastMessageBus message handler will be invoked
 * @param {string} message A message string
 */
export const sendMessage = (message) => {
  if (session != null && session.status !== 'STOPPED') {
    session.sendMessage(
      namespace,
      message,
      onSuccess.bind(this, i18n.t('CHROMECAST.MSG_SENT') + message),
      onError,
    );
  } else {
    appendMessage('Cannot send because session is null');
  }
};

export const castToReceiver = () => {
  const waitForAnimationComplete = (attempts = 0) => {
    if (attempts > 30) {
      appendMessage('Animation timeout reached, casting anyway');
      sendMessage(JSON.stringify(getSanitizedViewer()));
      return;
    }

    const fadeElements = document.querySelectorAll(
      '.fade-enter, .fade-enter-active, .fade-exit, .fade-exit-active',
    );

    if (fadeElements.length > 0) {
      setTimeout(() => waitForAnimationComplete(attempts + 1), 50);
      return;
    }

    const viewerContainer = document.querySelector('#viewer-container');
    if (viewerContainer) {
      const computedStyle = window.getComputedStyle(viewerContainer);
      const opacity = parseFloat(computedStyle.opacity);

      if (opacity < 1) {
        setTimeout(() => waitForAnimationComplete(attempts + 1), 50);
        return;
      }
    }

    appendMessage('Fade animation complete, sending content to Chromecast');
    sendMessage(JSON.stringify(getSanitizedViewer()));
  };

  waitForAnimationComplete();
};

const onRequestSessionSuccess = (e) => {
  appendMessage('onRequestSessionSuccess');
  session = e;
  ipcRenderer.send('cast-session-active');
  castToReceiver();
};

/**
 * listener for session updates
 */
const sessionUpdateListener = (isAlive) => {
  let message = isAlive
    ? i18n.t('CHROMECAST.SESSION_UPDATED')
    : i18n.t('CHROMECAST.SESSION_REMOVED');
  message += `: ${session.sessionId}`;
  appendMessage(message);
  if (!isAlive) {
    session = null;
    ipcRenderer.send('cast-session-stopped');
  }
};

/**
 * utility function to log messages from the receiver
 * @param {string} givenNamespace The namespace of the message
 * @param {string} message A message string
 */
const receiverMessage = (givenNamespace, message) => {
  appendMessage(`receiverMessage: ${givenNamespace}, ${message}`);
};

/**
 * session listener during initialization
 */
const sessionListener = (e) => {
  appendMessage(`New session ID:${e.sessionId}`);
  session = e;
  session.addUpdateListener(sessionUpdateListener);
  session.addMessageListener(namespace, receiverMessage);
};

/**
 * receiver listener during initialization
 */
const receiverListener = (e) => {
  if (e === chrome.cast.ReceiverAvailability.AVAILABLE) {
    appendMessage('receiver found');
  } else {
    appendMessage(`receiver list empty: ${e}`);
  }
};

/**
 * initialization
 */
const initializeCastApi = () => {
  appendMessage('initializing');
  const sessionRequest = new chrome.cast.SessionRequest(applicationID);
  const apiConfig = new chrome.cast.ApiConfig(sessionRequest, sessionListener, receiverListener);
  chrome.cast.initialize(apiConfig, onInitSuccess, onError);
  analytics.trackEvent({
    category: 'chromecast',
    action: 'initialize',
  });
};

/**
 * callback on success for stopping app
 */
const onStopAppSuccess = () => {
  appendMessage('onStopAppSuccess');
};

export const requestSession = () => {
  if (!isCastInitialized) {
    initializeCastApi();
  }
  chrome.cast.requestSession(onRequestSessionSuccess, onError);
};

/**
 * stop app/session
 */
export const stopApp = () => {
  ipcRenderer.send('cast-session-stopped');
  session.stop(onStopAppSuccess, onError);
};
