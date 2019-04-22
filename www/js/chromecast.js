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
let trigID = 0;
const receiverFn = receivers =>
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
    const message =
      numReceivers === 0 ? 'No compatible Chromecast devices found.' : 'Select Cast device';
    modal.setContent('<h2>' + message + '</h2>');
    // add cancel button
    const cancelTitle = numReceivers === 0 ? 'OK' : 'Cancel';
    modal.addFooterBtn(cancelTitle, 'tingle-btn tingle-btn--pull-right tingle-btn--default', () => {
      modal.close();
    });

    // open modal
    modal.open();
  });

require('electron-chromecast')(receiverFn);

const applicationID = '3F64A19C';
const namespace = 'urn:x-cast:com.khalis.cast.sttm.gurbani';
let session = null;
let isCastInitialized = false;

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
  let message = isAlive ? 'Session Updated' : 'Session Removed';
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
      displayError('No Chromecast devices detected.');
      break;
    default:
      displayError('An error occured. Please try again.');
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
      onSuccess.bind(this, 'Message sent: ' + message),
      onError,
    );
  } else {
    appendMessage('Cannot send because session is null');
  }
}
