/* global chrome */
import { ipcRenderer } from 'electron';

const remote = require('@electron/remote');

/* eslint-disable global-require */
export const tingle = require('../../../assets/js/vendor/tingle');
/* eslint-enable */

const { i18n } = remote.require('./app');
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
  /* eslint-disable no-console */
  console.log(message);
  /* eslint-enable */
};

const displayError = (errorMessage) => {
  const modal = new tingle.Modal({
    footer: true,
    stickyFooter: false,
    closeMethods: ['overlay', 'button', 'escape'],
  });

  modal.setContent(`<h2>${errorMessage}</h2>`);
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

// Removes quicktools and svg from clonedNode of viewer
const getSanitizedViewer = () => {
  const viewerHtml = document.querySelector('#viewer-container')
    ? document.querySelector('#viewer-container').cloneNode(true)
    : '';
  viewerHtml.children[1].remove();
  viewerHtml.children[0].children[0].remove();
  viewerHtml.children[0].removeAttribute('style');
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
  sendMessage(JSON.stringify(getSanitizedViewer()));
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
  analytics.trackEvent('chromecast', 'start');
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
