// How some Gurbani is said aloud, read ALONGSIDE the pangti (never in place of it):
//   ੴ                -> ਇਕ ਓਅੰਕਾਰ
//   ਮਹਲਾ ੧ / ਮਃ ੧    -> ਮਹਲਾ ਪਹਿਲਾ   (੨ ਦੂਜਾ, ੩ ਤੀਜਾ, ੪ ਚਉਥਾ, ੫ ਪੰਜਵਾ, ੯ ਨਾਵਾ)
//   ਪਾਤਿਸ਼ਾਹੀ ੧੦       -> ਪਾਤਿਸ਼ਾਹੀ ਦਸਵੀ
// The pangti stays exactly as the database gives it. A follower compares what it hears with
// the written word and, as a second path for the same span, with its spoken reading; whichever
// fits better counts. Other numerals (verse numbers) are not said; they are skipped while
// comparing.
const ORD = { '੧': 'ਪਹਿਲਾ', '੨': 'ਦੂਜਾ', '੩': 'ਤੀਜਾ', '੪': 'ਚਉਥਾ', '੫': 'ਪੰਜਵਾ', '੯': 'ਨਾਵਾ' };

// ੴ (one code point) and its reading
const EK_OANKAR = 0x0a74;
const EK_OANKAR_SAID = 'ਇਕ ਓਅੰਕਾਰ';

// The words said together with the numeral after them. ਸ਼ in either form BaniDB may use
// (one character, or ਸ followed by a nukta), so the pangti is matched as it is written.
const MAHALA = /^(?:ਮਹਲਾ|ਮਃ)$/;
const PATISHAHI = /^ਪਾਤਿ(?:ਸ਼|ਸ਼?)ਾਹੀ$/;

// The spoken reading of a written word `word` followed by the written word `next`, when the
// two are said as one (ਮਹਲਾ ੧, ਮਃ ੧, ਪਾਤਿਸ਼ਾਹੀ ੧੦): { reading } for the pair, `reading` null
// when it is said just as written; null when `word` is not such a word.
function spokenPair(word, next) {
  const w = word || '';
  const n = next || '';
  if (!/^[੦-੯]+/.test(n)) return null;
  if (MAHALA.test(w)) {
    const m = /^([੧-੯])(?![੦-੯])/.exec(n);
    if (!m) return { reading: null };
    return { reading: `ਮਹਲਾ ${ORD[m[1]] || ''}` };
  }
  if (PATISHAHI.test(w)) return { reading: /^੧੦/.test(n) ? 'ਪਾਤਿਸ਼ਾਹੀ ਦਸਵੀ' : null };
  return null;
}

module.exports = { spokenPair, EK_OANKAR, EK_OANKAR_SAID };
