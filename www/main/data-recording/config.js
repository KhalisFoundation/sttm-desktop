// STTM Data recording settings. The Hugging Face write token is never in the source: the
// placeholder is replaced after `npm run build` by packaging/inject-data-token.js from the
// VF_HF_TOKEN environment variable (CI secret). Without it the recording bar stays hidden.
const HF_NAMESPACE = 'khalisfoundation';
const HF_TOKEN = '__VF_HF_TOKEN__';

const hfToken = () => (HF_TOKEN && !HF_TOKEN.startsWith('__') ? HF_TOKEN : '');

module.exports = { HF_NAMESPACE, HF_TOKEN, hfToken };
