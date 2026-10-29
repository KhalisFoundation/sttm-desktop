// Banis Voice Autopilot follows at a longer Sundar Gutka length than the user's (pure;
// unit-tested in baniLength.test.js). While Autopilot has one of these Banis on screen the
// user's Bani length is raised to it (never lowered) and put back once the screen moves on
// (see pendingLengthAction in VoiceFollow.jsx); nothing else ever changes the setting.
//
// Rehras, extra-long: it contains every shorter Rehras (the long readers' opening "Har jug
// jug bhagat upaya" and its salok, the extra Dasam shabads) plus the Chaupai pauris and
// dohras some Gurdwara Sahibs (Renton) read; a reader of any length is then followed from
// the first line, and the paath follower steps over the lines a shorter reader leaves out.
// (The Taksal list's only lines the extra-long one lacks are three headers and a repeated
// dohra.)
// Aarti, extra-long: a sung Aarti (Renton) runs through pieces the short list lacks (Kabir's
// Sorath "Bhookhe bhagat na keejai", the opening Savaiya), and a Bani profile without those
// lines has nothing to show while they are sung.
// Kirtan Sohila, long: before Sohila proper the sangat at Renton reads the long Sohila's
// opening shabads (Sorath Mahala 5 on Ang 626, the Bilaval Mahala 5 shabad on Ang 819, and two
// saloks). The short and medium lists have none of them, so there was nothing to follow while
// they were read. Long, not extra-long: the extra-long list adds further pieces before and
// after (another shabad, Japji's opening, Dasam Bani) that a long reader does not read.
const REHRAS_BANI = 21;
const AARTI_BANI = 22;
const SOHILA_BANI = 23;
const LENGTH_ORDER = ['short', 'medium', 'long', 'extralong'];
const BANI_MIN_LENGTH = {
  [REHRAS_BANI]: 'extralong',
  [AARTI_BANI]: 'extralong',
  [SOHILA_BANI]: 'long',
};

// The length a Bani is followed at for a user who chose `userLength`.
const baniLengthFor = (baniId, userLength) => {
  const min = BANI_MIN_LENGTH[baniId];
  return min && LENGTH_ORDER.indexOf(userLength) < LENGTH_ORDER.indexOf(min) ? min : userLength;
};

// Of the shabads a raised length adds, only the ones that OPEN the Bani may open it by the
// reading rule (PAATH_READ_LINES lines read straight through) or by two shabads in order; a
// single line never does, since these shabads are also sung as kirtan in their own right.
// Rehras: its opening (Har jug jug bhagat upaya and the salok after it); its closing saloks
// and pauris (e.g. 1944) are sung as kirtan (Level 2 clip04) and never open it.
// Sohila: its four opening pieces, in reading order (2367 Sorath Mahala 5, 3085 Bilaval
// Mahala 5, and the saloks 820 and 1958). The only other shabad the long Sohila adds to the
// short one, the Pavan Guru salok (39, also Japji's closing salok), never opens it.
const READ_OPENING = {
  [REHRAS_BANI]: new Set([1661, 1721]),
  [SOHILA_BANI]: new Set([2367, 3085, 820, 1958]),
};

// May shabad `sid` of Bani `bani` open that Bani by the reading rule? `userShabads` maps a
// raised Bani to the shabads of its user-length list (those always may). While Akhand Paath
// following is on (`akhandPaath`), Sri Guru Granth Sahib Ji is being read Ang after Ang, so a
// shabad only the raised list has (Sohila's opening on Angs 256, 519, 626 and 819) is that
// reading going on, not the Bani: it never opens it then.
const readRuleMayOpen = (bani, sid, userShabads, akhandPaath = false) => {
  const own = userShabads && userShabads[bani];
  if (!READ_OPENING[bani] || !own || own.has(sid)) return true;
  return !akhandPaath && READ_OPENING[bani].has(sid);
};

module.exports = {
  REHRAS_BANI,
  AARTI_BANI,
  SOHILA_BANI,
  LENGTH_ORDER,
  BANI_MIN_LENGTH,
  READ_OPENING,
  baniLengthFor,
  readRuleMayOpen,
};
