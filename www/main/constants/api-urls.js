import { version as appVersion } from '../../../package.json';

const useStageAPI = appVersion.includes('alpha') || process.env.NODE_ENV === 'development';
export const API_ENDPOINT = useStageAPI
  ? 'https://stgapi.sikhitothemax.org'
  : 'https://api.sikhitothemax.org';

export const SOCKET_SCRIPT_SOURCE = `${API_ENDPOINT}/socket.io/socket.io.js`;
