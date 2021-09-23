const pjson = require('../../package.json');

const appVersion = pjson.version;
const useStageAPI = appVersion.includes('alpha') || process.env.NODE_ENV === 'development';
const API_ENDPOINT = useStageAPI
  ? 'https://api.sikhitothemax.org'
  : 'https://api.sikhitothemax.org';

module.exports = {
  API_ENDPOINT,
};
