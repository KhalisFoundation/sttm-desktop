import { SOCKET_SCRIPT_SOURCE } from './api-urls';

const globalInit = {
  socket: () => {
    // Inject socket.io script
    if (document.querySelector(`script[src="${SOCKET_SCRIPT_SOURCE}"]`) === null) {
      const script = document.createElement('script');
      script.src = SOCKET_SCRIPT_SOURCE;
      document.body.appendChild(script);
    }
  },
};

export default globalInit;
