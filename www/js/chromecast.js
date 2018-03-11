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
  new Promise((resolve) => {
    trigID += 1;
    // instanciate new modal
    const modal = new tingle.Modal({
      footer: true,
      stickyFooter: false,
      closeMethods: ['overlay', 'button', 'escape'],
    });
    let numReceivers = 0;
    receivers.forEach((receiver) => {
      if (receiver.service_fullname.includes('Chromecast')) {
        numReceivers += 1;
      // add a button
        modal.addCastBtn(receiver.friendlyName, 'tingle-btn tingle-btn--primary', `${receiver.ipAddress}_${receiver.port}_${trigID}`, (e) => {
          if (e.target.getAttribute('data-reciever-id') === `${receiver.ipAddress}_${receiver.port}_${trigID}`) {
            resolve(receiver);
            appendMessage(receiver);
          }
          modal.close();
        });
      }
    });

    // set content
    const message = numReceivers === 0 ? 'No Chromecast devices found' : 'Select Cast device';
    modal.setContent('<h2>' + message + '</h2>');
    // add another button
    const cancelTitle = numReceivers === 0 ? 'OK' : 'Cancel';
    modal.addFooterBtn(cancelTitle, 'tingle-btn tingle-btn--pull-right tingle-btn--default', () => {
      // here goes some logic
      modal.close();
    });

    // open modal
    modal.open();
  });

require('electron-chromecast')(receiverFn);

const applicationID = 'ECF05819';
const namespace = 'urn:x-cast:com.khalis.cast.sttm.gurbani';
let session = null;

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
}

function requestSession() {
  initializeCastApi();
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
}

/**
 * initialization
 */
function initializeCastApi() {
  appendMessage('initializing');
  const sessionRequest = new chrome.cast.SessionRequest(applicationID);
  const apiConfig = new chrome.cast.ApiConfig(sessionRequest,
    sessionListener,
    receiverListener);
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
  if (session != null) {
    session.sendMessage(namespace, message, onSuccess.bind(this, 'Message sent: ' + message),
      onError);
  } else {
    appendMessage('Cannot send because session is null');
  }
}
