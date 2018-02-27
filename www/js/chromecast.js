let trigID = 0;
      const receiverFn = (receivers) =>
        new Promise((resolve, reject) => {
          let dialog = document.createElement('paper-dialog');
          trigID++;
          const body = document.getElementById('choose_device');

          const title = 'Choose Cast Device'; // TODO: New translate key needed
          const h3 = document.createElement('h3');
          h3.textContent = title;
          dialog.appendChild(h3);

          const listContainer = document.createElement('paper-listbox');
          receivers.forEach((receiver) => {
            const cast = document.createElement('button');
            cast.textContent = receiver.friendlyName;
            cast.setAttribute('data-reciever-id', `${receiver.ipAddress}_${receiver.port}_${trigID}`);
            listContainer.appendChild(cast);
            document.body.addEventListener('click', (e) => {
              if (e.target.getAttribute('data-reciever-id') === `${receiver.ipAddress}_${receiver.port}_${trigID}`) {
                dialog.parentNode.removeChild(dialog);
                dialog = null;
                resolve(receiver);
                appendMessage(receiver);
              }
            });
          });
          dialog.appendChild(listContainer);
          body.appendChild(dialog);
        });

      require('electron-chromecast')(receiverFn);
      var applicationID = 'ECF05819';
      var namespace = 'urn:x-cast:com.khalis.cast.sttm.gurbani';
      var session = null;


      function init() {
        initializeCastApi();
      }

      function reqSession() {
        chrome.cast.requestSession(onRequestSessionSuccess, onError);
      }

      function clearDebugAll() {
        var debugarea = document.getElementById('debugmessage');
        debugarea.innerHTML = "";
      }

      // /**
      //  * Call initialization for Cast
      //  */
      // if (!chrome.cast || !chrome.cast.isAvailable) {
      //   setTimeout(initializeCastApi, 1000);
      // }

      /**
       * initialization
       */
      function initializeCastApi() {

        var sessionRequest = new chrome.cast.SessionRequest(applicationID);
        var apiConfig = new chrome.cast.ApiConfig(sessionRequest,
          sessionListener,
          receiverListener);
        chrome.cast.initialize(apiConfig, onInitSuccess, onError);
      }

      /**
       * initialization success callback
       */
      function onInitSuccess() {
        appendMessage('onInitSuccess');
        //chrome.cast.requestSession(onRequestSessionSuccess, onError);
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
      }

      /**
       * initialization error callback
       */
       function onError(message) {
        appendMessage('onError: ' + JSON.stringify(message));
      }

      /**
       * callback on success for stopping app
       */
      function onStopAppSuccess() {
        appendMessage('onStopAppSuccess');
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
       * listener for session updates
       */
      function sessionUpdateListener(isAlive) {
        var message = isAlive ? 'Session Updated' : 'Session Removed';
        message += ': ' + session.sessionId;
        appendMessage(message);
        if (!isAlive) {
          session = null;
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
       * receiver listener during initialization
       */
      function receiverListener(e) {
        if(e === chrome.cast.ReceiverAvailability.AVAILABLE) {
          appendMessage('receiver found');
        }
        else {
          appendMessage('receiver list empty' + e);
        }
      }

      /**
       * stop app/session
       */
      function stopApp() {
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
        }
        else {
          appendMessage('Cannot send because session is null');
        }
      }

      /**
       * append message to debug message window
       * @param {string} message A message string
       */
      function appendMessage(message) {
        console.log(message);
        document.getElementById('debugmessage').innerHTML += '\n' + JSON.stringify(message);
      }

      /**
       * utility function to handle text typed in by user in the input field
       */
      function update() {
        sendMessage(document.getElementById('input').value);
      }

      /**
       * handler for the transcribed text from the speech input
       * @param {string} words A transcibed speech string
       */
      function transcribe(words) {
        sendMessage(words);
      }
