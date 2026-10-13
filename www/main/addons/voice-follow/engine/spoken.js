// Gurbani text as it is said aloud, for matching against what is heard:
//   ੴ                -> ਇਕ ਓਅੰਕਾਰ
//   ਮਹਲਾ ੧ / ਮਃ ੧    -> ਮਹਲਾ ਪਹਿਲਾ   (੨ ਦੂਜਾ, ੩ ਤੀਜਾ, ੪ ਚਉਥਾ, ੫ ਪੰਜਵਾ, ੯ ਨਾਵਾ)
//   ਪਾਤਿਸ਼ਾਹੀ ੧੦       -> ਪਾਤਿਸ਼ਾਹੀ ਦਸਵੀ
// Other numerals (verse numbers) are not said and are dropped by the callers.
const ORD = { '੧': 'ਪਹਿਲਾ', '੨': 'ਦੂਜਾ', '੩': 'ਤੀਜਾ', '੪': 'ਚਉਥਾ', '੫': 'ਪੰਜਵਾ', '੯': 'ਨਾਵਾ' };
const spoken = (u) =>
  (u || '')
    .normalize('NFC')
    .replace(/ੴ/g, 'ਇਕ ਓਅੰਕਾਰ ')
    .replace(/(ਮਹਲਾ|ਮਃ)\s*([੧-੯])(?![੦-੯])/g, (_, w, d) => `ਮਹਲਾ ${ORD[d] || ''} `)
    .replace(/ਪਾਤਿ(ਸ਼|ਸ਼|ਸ)ਾਹੀ\s*੧੦/g, 'ਪਾਤਿਸ਼ਾਹੀ ਦਸਵੀ ');
module.exports = { spoken };
