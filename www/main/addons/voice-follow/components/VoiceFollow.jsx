import React, { useState, useRef, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';

import { filterRequiredVerseItems } from '../../../navigator/shabad/utils/filter-verse-items';
import { loadBani as loadBaniRows } from '../../../navigator/utils/load-bani';
import { useNewShabad } from '../../../navigator/search/hooks/use-new-shabad';
import updateMultipane from '../../../navigator/search/utils/update-multipane';

const anvaad = require('anvaad-js');
const { ipcRenderer } = require('electron');
const banidb = require('../../../banidb');
const { slideStrings } = require('../../../common/constants/slidedb');
// In-process native engine (onnxruntime-node): no Python sidecar, no websocket.
const engine = require('../engine');
const { Follower: AcousticFollower } = require('../engine/follower');
const { SP: AcousticSP } = require('../engine/sentencepiece');
const { createRendererRetrieval } = require('../engine/retrieval/renderer-client');
const sessionLog = require('../engine/session-log');
const { createBoard, mergeTranscript } = require('./liveBoard');
const { installDemoAudio } = require('./devAudio');

installDemoAudio(); // developer demos only (VF_DEMO_WAV); a no-op otherwise

const { norm: vfNorm, partialRatio } = engine;

// Pure, unit-tested switch/display policy (see switchPolicy.js + .test.js).
const {
  nextSwitchWins,
  nextEmptyStreak,
  maxLineScore,
  bestLineMatch,
  orderFreeLineScore,
  sameGurbani,
} = require('./switchPolicy');

// maxLineScore lives in ./switchPolicy (same implementation, unit-tested there)
// so the benchmarked length-penalty math is shared, not duplicated.

// Best match against only the lines NEAR a cursor (a band [cursor-back, cursor+ahead]).
// Used to score the CURRENT shabad from where we actually are, so a coincidental
// match to a distant line can't keep the current shabad artificially ahead of a real
// new one. Falls back to the global max when the cursor is unknown.
function cursorLineScore(hypNorm, linesNorm, cursor, back, ahead) {
  if (!hypNorm || !linesNorm || !linesNorm.length) return 0;
  if (cursor == null || cursor < 0) return maxLineScore(hypNorm, linesNorm);
  const lo = Math.max(0, cursor - back);
  const hi = Math.min(linesNorm.length - 1, cursor + ahead);
  let best = 0;
  for (let i = lo; i <= hi; i += 1) {
    const ln = linesNorm[i];
    if (ln) {
      const s = partialRatio(hypNorm, ln) / 100;
      if (s > best) best = s;
    }
  }
  return best;
}

// "First letter anywhere" search — the primitive used to identify a shabad from
// the Gurmukhi first-letters of what's being sung (matches banidb's FirstLetterStr).
const { FIRST_LETTERS_ANYWHERE } = banidb.CONSTS.SEARCH_TYPES;
const FIRST_LETTERS_START = banidb.CONSTS.SEARCH_TYPES.FIRST_LETTERS; // BEGINSWITH

// Blind auto-detect tuning. We build a first-letter query from the trailing part
// of the running transcript, preferring the most specific window that still hits,
// then vote across windows so one misheard letter doesn't decide the lock.
const DETECT_MIN_LETTERS = 4; // need at least this many first-letters to search
// The recognizer mishears the odd letter, and FirstLetterStr search is an exact
// contiguous CONTAINS — so one wrong letter kills a long window. Instead we slide
// several shorter n-grams across what we've heard and vote: clean fragments still
// hit the right shabad even when a neighbour letter is wrong. Longer grams are
// more specific, so they carry more weight.
const GRAM_SIZES = [8, 6, 5, 4]; // contiguous first-letter windows to slide (down to 4)
const DETECT_MAX_GRAMS = 16; // cap queries per decode (realm search is cheap, but bound it)
const DETECT_VOTE_DECAY = 0.8; // fade old evidence so a new shabad can overtake
const DETECT_STABLE = 2; // leader must hold this many decodes before auto-select
// Confidence = the leader's SEPARATION from the runner-up: best / (best + second).
// (Share-of-all-candidates looks tiny because short first-letters are ambiguous —
// dozens of shabads collect a few votes each, diluting the leader's slice.)
// 0.65 ≈ leader roughly 2x the runner-up.
const AUTO_LOCK_CONF = 0.65; // separation needed to auto-select
const DETECT_MIN_EVIDENCE = 8; // leader must have this much absolute vote weight too
const DETECT_TOP_N = 3; // how many candidates to surface in the UI
// A shabad that BEGINS with what's being sung is a much stronger signal than one
// that merely contains it, so start-anchored hits carry extra weight.
const START_MATCH_WEIGHT = 12;

// Autopilot gates. Design: the first-letter detector is a fast, noisy PROPOSER
// (high recall — catch that a different shabad might be starting), and the switch
// itself is judged ACOUSTICALLY (high precision — does the recent audio actually
// match the candidate's lines better than the shabad we're on?). This separation
// is what makes switching both fast and reliable, and lets the first lock be
// permissive (a wrong lock self-corrects: the correct shabad simply wins the
// acoustic comparison and we switch to it).
const AP_LOCK_MIN_LETTERS = 5; // a small phrase is enough to lock the FIRST shabad
const AP_LOCK_STABLE = 2; // hold the lead this many decodes before the first lock
// The FIRST lock needs a clear full-text leader: many shabads share a line (e.g.
// "charan kamal rid antar dhaare" is in both 1452 and 4590), and a near-tie is a
// coin flip that then costs ~40 s to undo. Level 2 benchmark: every correct first
// lock had a margin >= 0.12 over the runner-up; the one wrong lock had 0.00.
const AP_LOCK_TEXT_MARGIN = 0.08;
const VOTE_CAP = 60; // clamp votes so a long shabad can't become impossible to switch away from
// The recognizer WINDOW is a two-sided lever, so autopilot uses a DIFFERENT one
// per phase (goal: each capability as good as its dedicated feature):
//  - SEARCHING: identifying a shabad from scratch wants as much context as
//    possible, so use the SAME 10s window the standalone auto-detect uses. This
//    makes autopilot's initial detection identical to that feature — no regress.
//  - FOLLOWING: a long window keeps several seconds of the PREVIOUS shabad's
//    audio, so a switch only wins the acoustic test once the window refills
//    (~15s — the slow-switch bug). A short window (~4s ≈ one sung line) lets the
//    new shabad take over quickly. Offline-tuned on concatenated benchmark
//    shabads: WIN=4/HOP=0.5 gives ~3-7s switch latency at 100% recall / 0 false
//    switches. (Offline concatenated-shabad benchmark; audio harness not shipped.)
const AP_SEARCH_WIN_S = 10; // recognizer window while SEARCHING (matches standalone detect)
// Kept at 4 after cross-voice validation: a shorter FOLLOW window (3) helped a
// second raagi's stream but REGRESSED the primary 86-min stream (erroneous 13.2->14.9,
// recall 85->83) and was ~a wash on the 9s stress stream — not voice-agnostic, so 4 stays.
const AP_FOLLOW_WIN_S = 4; // recognizer window while FOLLOWING (fast switching)
const AP_REC_HOP_S = 0.5; // recognizer decode hop while in autopilot

// Acoustic switch test (runs while following). Each recognizer decode we score the
// recent decoded audio against the CURRENT shabad's lines and against a proposed
// DIFFERENT candidate's lines. A candidate only counts as "winning" when it beats
// the current shabad by a clear margin AND matches well in absolute terms; a few
// consecutive wins commit the switch.
const SWITCH_CAND_MIN_VOTES = 6; // detector interest before we bother acoustic-testing a candidate
const SWITCH_HYP_SLICE = 35; // chars of recent decoded audio to score (≈ the current line, not older shabad)
// Precision gate (offline-tuned): a real shabad change scores the new shabad ≥0.67
// with a ≥0.33 margin over the current one, while a borderline confusion (a shared
// closing phrase between two shabads) tops out around 0.60 / 0.20 margin. These
// thresholds sit cleanly between the two, so real switches pass and the confusion
// is rejected — without needing slower confirmation (offline confusion-pair
// benchmark; harness not shipped).
const SWITCH_ACOUSTIC_MIN = 0.65; // candidate must match the recent audio at least this well
const SWITCH_ACOUSTIC_MARGIN = 0.15; // ...and beat the current shabad by at least this much
// Length-aware penalty applied to the CANDIDATE score only (the current shabad is
// scored by cursorLineScore, which we leave untouched so it stays strong). A proposed
// switch to a shabad whose only match is a short line contained in the hyp is
// discounted. 15 chars ≈ a few Gurmukhi words; validated to cut erroneous switches
// with no recall loss (see maxLineScore comment; validated on the offline
// sung-kirtan benchmark, harness not shipped).
const SWITCH_CAND_MIN_LINE_CHARS = 15;
// 3 net winning decodes — the knee on the 86-min real-kirtan switch benchmark
// (offline 86-min sung-kirtan benchmark; harness not shipped), ranked by a UX
// metric that splits "wrong" into STALE
// (still showing the previous shabad — a graceful late switch) vs ERRONEOUS (jumped
// to an unrelated shabad — the jarring failure to avoid). Over the full 86min:
//   CONFIRM=2: on-correct 68.3%  erroneous 20.6%  (thrashes: 159 false switches)
//   CONFIRM=3: on-correct 68.9%  erroneous 13.2%  (52 false)   <- best on both axes
//   CONFIRM=4: on-correct 63.4%  erroneous 13.1%  (32 false)
// Going 3->4 cuts the false-switch COUNT but buys ~zero erroneous-TIME (the extra
// suppressed switches were brief); it only adds latency/stale, dropping on-correct
// 5.5pts. So 3 minimizes jarring wrong jumps AND maximizes time on the right shabad.
// CROSS-VALIDATED (2026-09, on-correct/stale/erroneous): CONFIRM=3 is the only value
// that is never worst across all three real-kirtan regimes —
//   86-min live (voice A):        69 / 18 / 13
//   51-shabad ~45s (voice B):     74 / 11 / 15
//   9s rapid-switch stress test:  35 / 38 / 27  (fails to STALE, not ERRONEOUS)
// CONFIRM=4 looked good on long clean 45s segments but COLLAPSES under rapid switching
// (misses switches: recall 68->60%), so raising it is not safe. The 9s stress ceiling
// (~35% on-correct) is latency-bound (react time ~4-5s vs 9s dwell), not tunable.
const SWITCH_CONFIRM = 3; // consecutive winning decodes needed to commit a switch
// Same-Gurbani lock (ported from cycle 11): the same text stored as two shabads (Aarti in
// Sohila and in Dhanasari, a Rehras shabad and its SGGS original) searches as an exact
// tie, and a tie never locks. 1 = while searching, treat such copies as one candidate.
const DUP_AWARE_LOCK = 1;
// Mool Mantar home (ported from cycle 12): the Mool Mantar begins dozens of shabads, so
// it ties exactly and never locks, leaving nothing on screen. After this many distinct
// heard fragments that tie between Japji's Mool Mantar and other shabads, show Japji's
// opening shabad (the right words); Japji Sahib itself opens only once pauri 1 is read.
const MOOL_HOME = 4;
const MOOL_HOME_MIN = 0.6;
// Returning to the shabad we JUST left is low-risk (we were confidently following
// it moments ago) and slow returns are the main cost of a brief pramaan quote or a
// mistaken switch: the true shabad kept reaching 2 wins but the shared contender
// slot was hijacked by transient candidates and reset (Level 2 clip 21: 76 s away).
// So the previous shabad keeps its own slot for a while and returns on 2 wins.
const RETURN_CONFIRM = 2;
// A sevadaar tap is folded into the judge, not bolted beside it: the shabad the
// sevadaar tapped AWAY from is vetoed as a switch candidate for a while, so the
// same false evidence that put it on screen cannot pull it straight back.
const TAP_VETO_DECODES = 120; // judged decodes (~1 min of kirtan) the left shabad stays vetoed
// Bani follow: when two shabads of the same Bani are heard in recitation order
// (the second within BANI_NEXT_MAX shabads of the first), the recitation is that
// Bani, so follow the WHOLE Bani instead of shabad by shabad. One shabad alone
// never triggers it: Sodar, So Purakh and Aarti shabads are also sung as kirtan.
const BANI_NEXT_MAX = 3;
const BANI_KEY = 'bani:';
const baniIdOf = (id) =>
  typeof id === 'string' && id.startsWith(BANI_KEY) ? Number(id.slice(BANI_KEY.length)) : null;
// Paath Banis (Nitnem): a line that ONLY a paath contains opens that Bani on the
// first line heard, instead of waiting for two shabads in order. Several are
// stored as one or a few huge shabads (Chaupai 1, Tav Prasad Savaiye 2, Anand 3),
// so the two-shabad rule above could never see them. Listed in preference order:
// the 6-pauri Anand (1000) is recited far more often than the full 40 (10), so a
// pauri 1-5 or 40 line opens it and a pauri 6-39 line opens (or moves up to) 10.
// Rehras and Sohila are NOT here: their shabads are sung as kirtan too, so they keep
// the two-shabads-in-order and reading rules. Aarti IS here, opened at the user's length
// exactly as Sundar Gutka's popular list opens it, but only by lines no other paath
// has (Bhagat Dhanna ji's "Jo jan tumree bhagat karante"); a line Aarti shares with
// Sohila (Gagan mai thaal) or Rehras (the Savaiya and Dohra) never opens it.
const PAATH_BANIS = [1000, 10, 2, 4, 6, 7, 9, 22]; // Anand 6, Anand, Japji, Jaap, Savaiye x2, Chaupai, Aarti
const AARTI_BANI = 22;
const AARTI_SHARED_BANIS = [21, 23]; // Rehras, Sohila
const PAATH_FAMILY = {
  1000: 'anand',
  10: 'anand',
  2: 'japji',
  4: 'jaap',
  6: 'savaiye',
  7: 'savaiye',
  9: 'chaupai',
  22: 'aarti',
};
// A line also in one of these is said or sung outside a paath (Mool Mantar, Aarti
// chhands, Sohila, Ardas), so it never opens a paath on its own.
const NOT_PAATH_BANIS = [1, 23, 24]; // Gur Mantar, Sohila, Ardas (Aarti is a paath family now)
// Shabads of a paath that are also sung as kirtan in their own right.
const PAATH_SKIP_SHABADS = new Set([
  39, // Japji closing salok (Pavan Guru), also in Sohila
  7423, // Jaap Sahib chhand, also sung in Aarti
]);
// Mool Mantar and the "Aad sach ... Hai bhee sach" salok open Japji's paath but
// are recited and sung on their own (simran, before kirtan), so they never open it.
const PAATH_SKIP_VERSES = new Set([1, 2, 3, 4]);
// Rehras and Sohila shabads are sung as kirtan too, so one line never opens those
// Banis. But paath reads straight through while kirtan keeps returning to its rahao:
// this many distinct lines of the shown shabad read in order, never stepping back,
// is a paath, and a shabad that belongs to exactly one of these Banis opens it.
const PAATH_READ_LINES = 3;
// Rehras, Sohila, and Japji (whose opening shabad starts with the Mool Mantar, which
// never opens it on its own line).
const PAATH_READ_BANIS = [21, 23, 2, 22]; // + Aarti: a shabad in both Sohila and Aarti opens neither
// Jaap Sahib is stored as 22 chhand shabads of short, similar lines: while searching,
// the evidence spreads over several of them and no single chhand ever leads, so it
// never locks. Pool the votes of a paath Bani's shabads (split over at least two)
// into one candidate; a steady clear pooled lead locks its best shabad, and the
// one-line paath rule then opens the Bani.
const PAATH_POOL_BANIS = [4, AARTI_BANI]; // Jaap Sahib; Aarti (a medley of pieces)
const PAATH_POOL_STABLE = 3; // decodes the pooled lead must hold
// The same pooling on the full-text search (the first letters of Jaap's short words
// are often misheard, so the vote above can stay empty): this many of the last
// PAATH_POOL_WINDOW searches whose top line is a shabad of that Bani lock it.
const PAATH_POOL_WINDOW = 8;
const PAATH_POOL_HITS = 5;
// Aarti needs fewer: its pieces are long Savaiye whose words score low when a whole hall
// sings them, so the top line lands on an Aarti piece persistently but weakly. 4 of 8 at
// the same score floor fires on no kirtan cold start (41 Level 2 clips) that 5 of 8 did not.
const PAATH_POOL_HITS_BY_BANI = { [AARTI_BANI]: 4 };
const PAATH_POOL_TEXT_MIN = 0.2; // minimum full-text score of that top line
// Rehras is followed at the long length by default: the long Rehras contains the short
// one plus long readers' opening ("Har jug jug bhagat upaya" and its salok) and the extra
// Dasam shabads, so both kinds of reader are followed from the first line. While Rehras
// is open the Bani length is raised to this (never lowered) and restored when it ends.
const REHRAS_BANI = 21;
const REHRAS_LENGTH = 'long';
const LENGTH_ORDER = ['short', 'medium', 'long', 'extralong'];
// Aarti likewise is followed at the extra-long length: a sung Aarti (Renton) runs through
// pieces the short list lacks (Kabir's Sorath "Bhookhe bhagat na keejai", the opening
// Savaiya), and a Bani profile without those lines has nothing to show while they are sung.
const AARTI_LENGTH = 'extralong';
const BANI_MIN_LENGTH = { [REHRAS_BANI]: REHRAS_LENGTH, [AARTI_BANI]: AARTI_LENGTH };
const baniLengthFor = (baniId, userLength) => {
  const min = BANI_MIN_LENGTH[baniId];
  return min && LENGTH_ORDER.indexOf(userLength) < LENGTH_ORDER.indexOf(min) ? min : userLength;
};
// Of the long Rehras's extra shabads, only its opening (Har jug jug bhagat upaya and the
// salok after it) may open Rehras by the reading rule: its closing saloks and pauris
// (e.g. 1944) are sung as kirtan in their own right (Level 2 clip04).
const REHRAS_READ_OPENING = new Set([1661, 1721]);
const BANI_LENGTH_ALL = ['existsSGPC', 'existsMedium', 'existsTaksal', 'existsBuddhaDal'];
// Pooled search votes of one PAATH_POOL_BANIS Bani (see there), or null.
function poolPaathVotes(ranked, index) {
  let bani = null;
  let pool = 0;
  let other = 0;
  let bestSid = null;
  let bestV = 0;
  let members = 0;
  ranked.forEach(([sid, v]) => {
    const b = (index.byShabad.get(sid) || [])
      .map((x) => x.bani)
      .find((x) => PAATH_POOL_BANIS.includes(x));
    if (b != null && !PAATH_SKIP_SHABADS.has(sid) && (bani == null || b === bani)) {
      bani = b;
      pool += v;
      members += 1;
      if (v > bestV) {
        bestV = v;
        bestSid = sid;
      }
    } else if (v > other) other = v;
  });
  if (bani == null || members < 2 || pool < DETECT_MIN_EVIDENCE) return null;
  if (pool / (pool + other) < AUTO_LOCK_CONF) return null;
  return { bani, sid: bestSid };
}
// The Bani in which `nextId` follows `prevId` most closely, in order; else null.
// Two Banis can hold the same pair in order (the Savaiya and Dohra close both the long
// Rehras and the Aarti): then the Bani that also holds the shabads shown just before
// wins (`prefer`: bani -> how many recent shabads it contains), and failing that Aarti,
// whose pieces are sung straight through, over Rehras, which the reading rule catches.
function findBaniSequence(index, prevId, nextId, prefer = null) {
  const a = index.byShabad.get(prevId) || [];
  const b = index.byShabad.get(nextId) || [];
  let best = null;
  let bestGap = Infinity;
  let bestPref = -1;
  const rank = (bani) => ((prefer && prefer.get(bani)) || 0) + (bani === AARTI_BANI ? 0.5 : 0);
  a.forEach((x) =>
    b.forEach((y) => {
      const gap = y.pos - x.pos;
      if (x.bani !== y.bani || gap < 1 || gap > BANI_NEXT_MAX) return;
      const pref = rank(x.bani);
      if (gap < bestGap || (gap === bestGap && pref > bestPref)) {
        best = x.bani;
        bestGap = gap;
        bestPref = pref;
      }
    }),
  );
  return best;
}
// Recently shown shabads (newest last), for the Bani preference above.
const RECENT_SHABADS = 4;
function baniPreference(index, recent) {
  const prefer = new Map();
  recent.forEach((sid) =>
    (index.byShabad.get(sid) || []).forEach((x) =>
      prefer.set(x.bani, (prefer.get(x.bani) || 0) + 1),
    ),
  );
  return prefer;
}
const CORRECTION_SECONDS = 45; // audio kept before a sevadaar correction
const RETURN_WINDOW_DECODES = 240; // ~2 min at the 0.5 s following hop
// Strong-win fast path: a win this decisive (far above the 0.60/0.20 confusion
// zone, inside the >=0.67/>=0.33 zone real switches score) counts double, so a
// clear new shabad commits in ~2 decodes (~1s) instead of ~3. Borderline matches
// still need the full 3 — the false-switch protection is untouched, only the
// unmistakable cases go faster.
const SWITCH_STRONG_MIN = 0.8; // candidate absolute score for a decisive win
const SWITCH_STRONG_MARGIN = 0.3; // ...and margin over the current shabad
// Acoustic backstop (FOLLOWING phase): sung shabads the first-letter vote never
// surfaces are the measured starvation case, so a second proposer screens the
// WHOLE shabad field by first-letter overlap (cheap) and rescores survivors by
// line text. Overlap 2 keeps the full win on real kirtan; 3+ collapses recall.
const BACKSTOP_TOP_N = 60; // survivors rescored per decode (ranked by overlap)
const BACKSTOP_MAX_LOADS = 3; // uncached line-profile loads kicked per decode
const BACKSTOP_CACHE_MAX = 300; // cap on cached line profiles (oldest evicted)
// Heard-length hold: a decode thinner than this neither wins nor steps back.
// Short fragments fully contained in an unrelated short line score ~1.0 and
// were ~3/4 of false switches on the 86-min sung stream; holding for the next
// decode (~0.5s later) costs ~nothing.
const SWITCH_HYP_MIN = 8; // chars of heard audio needed to count a win
// Display hold: sung audio often yields a decode with no banidb hit, and in
// kirtan a single pangti can take 5-25s with natural pauses. Wiping the visible
// shortlist on empty decodes deletes what the user is watching mid-shabad, so
// the last shortlist stays up until fresh votes replace it. The backstop (~30s
// at hop 0.5) only clears a truly dead session, so a stale list can never sit
// in front of the presenter for a full minute.
const EMPTY_HOLD_DECODES = 60;
// The CURRENT shabad is scored RELATIVE TO THE FOLLOWER CURSOR, not as a global max
// over all its lines. Otherwise, starting a new shabad whose opening words happen to
// appear in some far-off line of the shabad we're on keeps the current score high
// and blocks the switch. We only credit the current shabad for matching where we
// actually are (a small band around the cursor, biased forward for normal singing).
const CUR_SCORE_BACK = 1; // lines behind the cursor still counted as "current"
const CUR_SCORE_AHEAD = 5; // lines ahead of the cursor still counted as "current"
// A Bani on screen has hundreds of lines (Rehras ~300, full Anand ~200), and some line
// of it partly matches almost any new kirtan, so judging the current text across ALL its
// lines kept the app inside the Bani long after a new shabad began. For a Bani, the
// all-lines bar only looks this far around the cursor (a shabad-sized neighbourhood).
const BANI_CUR_SPAN = 8;
// Highlight gating: don't chase the projected line onto similar-worded lines of the
// OLD shabad. Freeze entirely while a switch is being evaluated; otherwise move on
// any reasonably confident frame. (Kept modest so a freshly-switched follower, which
// starts with low confidence, isn't frozen in place — that read as "stops working".)
const UI_MOVE_CONF = 0.4;
const HEARD_MIN_CONF = 0.88; // what-it-hears strip: below this the text is letters, not words
const HEARD_CLEAR_MS = 5000; // strip empties after this long without a confident word
const HEARD_TENTATIVE_WORDS = 2; // the tail of a decode is still being sung: shown lighter // follower confidence required to move the on-screen line

// Two modes carried over from the web lab: Path (spoken paatth) and Kirtan
// (sung). Both map to the karansea CTC + line decoder with the same tuned
// params (the JS engine DEFAULTS), so the label is the only difference for now.
const MODES = {
  kirtan: { label: 'Kirtan (sung)', profile: 'kirtan' },
  path: { label: 'Path (recitation)', profile: 'karansea' },
};

// Raw Float32 PCM worklet, inlined as a Blob so there is no file:// path to
// resolve inside the packaged app. Mirrors public/voice-follow-pcm-worklet.js.
const WORKLET_SRC = `
class VoiceFollowPcm extends AudioWorkletProcessor {
  constructor() { super(); this._chunk = new Float32Array(2048); this._filled = 0; }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const ch = input[0];
      for (let i = 0; i < ch.length; i++) {
        this._chunk[this._filled++] = ch[i];
        if (this._filled === this._chunk.length) {
          const out = this._chunk.slice(0);
          this.port.postMessage(out.buffer, [out.buffer]);
          this._filled = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('voice-follow-pcm', VoiceFollowPcm);
`;

// Sundar-gutka banis (Japji, Rehras, …) are stored with a per-length flag column;
// this maps the user's chosen baniLength to the DB column loadBani() filters on.
const BANI_LENGTH_COLS = {
  short: 'existsSGPC',
  medium: 'existsMedium',
  long: 'existsTaksal',
  extralong: 'existsBuddhaDal',
};

// Split a Unicode Gurmukhi line into word tokens for the aligner. The server
// normalizes further (strips punctuation/matras irrelevant to matching); this
// only needs to break on whitespace and drop dandas/line numbers.
const tokenize = (uni) =>
  (uni || '')
    .replace(/[॥।]|\d+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

// The DB's FirstLetterStr is keyed on ASCII-FONT first-letter char codes (e.g.
// s=115, k=107, A=65), NOT Unicode codepoints. The recognizer emits Unicode, so a
// Unicode first-letter query never matches. Build a Unicode-base -> ASCII-font
// first-letter map once from anvaad (so it always tracks the installed font), then
// convert the recognizer's transcript into the ASCII-font first-letters the search
// actually expects.
const UNI_TO_ASCII_FL = (() => {
  const m = {};
  for (let code = 33; code < 127; code += 1) {
    const c = String.fromCharCode(code);
    let base = '';
    try {
      base = anvaad.firstLetters(anvaad.unicode(c)) || '';
    } catch (_) {
      base = '';
    }
    if (base.length === 1 && !(base in m)) m[base] = c;
  }
  return m;
})();

// Unicode Gurmukhi text -> ASCII-font first-letters string (the DB search format).
const toAsciiFirstLetters = (uniText) => {
  const fl = anvaad.firstLetters(uniText || '') || '';
  return Array.from(fl, (ch) => UNI_TO_ASCII_FL[ch] || '').join('');
};

const DOT = {
  idle: '#888',
  connecting: '#f39c12',
  detecting: '#5b73ff',
  listening: '#27ae60',
  error: '#c0392b',
  stopped: '#888',
};
const STATUS_LABEL = {
  idle: 'Ready',
  connecting: 'Starting',
  detecting: 'Finding the Shabad',
  listening: 'Listening',
  error: 'Something went wrong',
  stopped: 'Stopped',
};

// A live percentage: eases to each new calibrated value in ~0.2 s (the value itself updates
// every decode, so the motion tracks real evidence), coloured by level.
const pctLevel = (v) => {
  if (v >= 0.8) return 'is-high';
  if (v >= 0.4) return 'is-mid';
  return 'is-low';
};
const fmtPct = (v) => `${Math.min(99.9, Math.max(0, v * 100)).toFixed(1)}%`;
// Continuous colour for a percentage: red (0) through yellow (0.5) to green (1), so the
// tint moves with the number instead of snapping between three fixed colours.
const pctHue = (v) => {
  const x = Math.min(1, Math.max(0, v));
  return x <= 0.5 ? 4 + (48 - 4) * (x / 0.5) : 48 + (135 - 48) * ((x - 0.5) / 0.5);
};
const pctColor = (v) => `hsl(${pctHue(v).toFixed(0)} 70% 42%)`;
// Each card carries its percentage as CSS variables; the card style (wash / rail / clean,
// chosen by the sevadar) decides how that shows. Colour lives in what moves, not in a box.
const pctVars = (v) => ({ '--pc': pctColor(v), '--pct': `${Math.round(v * 1000) / 10}%` });
// True while a value is still moving: drives the sheen that shows the bar is alive.
const useMoving = (value) => {
  const [moving, setMoving] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (Math.abs(value - prev.current) >= 0.004) {
      prev.current = value;
      setMoving(true);
      const t = setTimeout(() => setMoving(false), 1400);
      return () => clearTimeout(t);
    }
    prev.current = value;
    return undefined;
  }, [value]);
  return moving;
};
// A change rolls through the numbers in between (odometer style) rather than jumping:
// the bigger the move, the longer the roll, so 33% -> 67% is seen counting up.
const rollMs = (from, to) => 350 + 1800 * Math.min(1, Math.abs(to - from));
const LivePct = ({ value }) => {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  useEffect(() => {
    const from = shownRef.current;
    const t0 = performance.now();
    const dur = rollMs(from, value);
    let raf = 0;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const v = from + (value - from) * (1 - (1 - k) ** 2);
      shownRef.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <span className={`vf2-live-pct ${pctLevel(value)}`} style={{ color: pctColor(shown) }}>
      {fmtPct(shown)}
    </span>
  );
};
LivePct.propTypes = { value: PropTypes.number.isRequired };
const LiveBar = ({ value }) => {
  const moving = useMoving(value);
  const prev = useRef(value);
  const dur = rollMs(prev.current, value);
  useEffect(() => {
    prev.current = value;
  }, [value]);
  return (
    <div className="vf2-cand-track">
      <span
        className={`vf2-live-fill ${pctLevel(value)}${moving ? ' is-moving' : ''}`}
        style={{
          width: `${Math.round(value * 1000) / 10}%`,
          background: pctColor(value),
          transitionDuration: `${dur}ms, ${dur}ms`,
        }}
      />
    </div>
  );
};
LiveBar.propTypes = { value: PropTypes.number.isRequired };

const VoiceFollow = ({ isOpen, onScreenClose }) => {
  // Select the primitive directly rather than holding the whole navigator slice
  // object across renders — a slice reference can be an immer proxy that gets
  // revoked between selection and render.
  const activeShabadId = useStoreState((state) => state.navigator.activeShabadId);
  // Banis (Japji/Rehras/…) load via a separate content path: sundarGutkaBaniId +
  // the chosen baniLength, NOT activeShabadId. Ceremonies stay unsupported.
  const isSundarGutkaBani = useStoreState((state) => state.navigator.isSundarGutkaBani);
  const isCeremonyBani = useStoreState((state) => state.navigator.isCeremonyBani);
  const sundarGutkaBaniId = useStoreState((state) => state.navigator.sundarGutkaBaniId);
  const baniLength = useStoreState((state) => state.userSettings.baniLength);
  const { setActiveVerseId, setLineNumber } = useStoreActions((actions) => actions.navigator);
  const setBaniLength = useStoreActions((actions) => actions.userSettings.setBaniLength);
  const setBaniLengthRef = useRef(setBaniLength);
  setBaniLengthRef.current = setBaniLength;
  // { prev }: the user's own Bani length while Voice-Follow has raised it for Rehras.
  const lengthOverrideRef = useRef(null);
  const {
    setIsSundarGutkaBani,
    setSundarGutkaBaniId,
    setIsCeremonyBani,
    setSingleDisplayActiveTab,
  } = useStoreActions((actions) => actions.navigator);
  const { setIsMiscSlide, setMiscSlideText } = useStoreActions((actions) => actions.navigator);
  const isMiscSlide = useStoreState((state) => state.navigator.isMiscSlide);
  const setOverlayScreen = useStoreActions((actions) => actions.app.setOverlayScreen);
  // Proper "open this shabad" action (drives viewer/projector/history/socket).
  // Kept in a ref so the async detect->lock path always calls the latest one.
  const changeActiveShabad = useNewShabad();
  const openShabadRef = useRef(changeActiveShabad);
  openShabadRef.current = changeActiveShabad;
  // The navigator pane (bottom-left in Presentation) shows whatever its pane
  // attributes name; opening a Bani must update them too, exactly as the Sundar
  // Gutka screen does, or the pane keeps the old content and never highlights.
  const updatePane = updateMultipane();
  const updatePaneRef = useRef(updatePane);
  updatePaneRef.current = updatePane;

  const [status, setStatus] = useState('idle'); // idle|connecting|listening|detecting|error|stopped
  const [autopilot] = useState(true); // hands-free: detect + follow + auto-switch, one press
  const vetoRef = useRef(null); // { id, left }: shabad a tap just left, and judged decodes remaining
  const baniLengthRef = useRef('short');
  baniLengthRef.current = baniLength;
  // The user's own length (what they chose), even while Rehras has it raised.
  const userLength = () =>
    (lengthOverrideRef.current && lengthOverrideRef.current.prev) || baniLengthRef.current;
  const restoreBaniLength = () => {
    const o = lengthOverrideRef.current;
    if (!o) return;
    lengthOverrideRef.current = null;
    try {
      setBaniLengthRef.current(o.prev);
    } catch (_) {
      /* Closing store. */
    }
  };
  const baniIndexRef = useRef(null); // { col, promise } shabad<->Bani index, built once per length
  const curBaniShabadsRef = useRef(null); // Set of shabads inside the Bani being followed
  const seqReadRef = useRef({ id: null, last: -1, lines: new Set(), fired: false }); // PAATH_READ_LINES
  const recentShabadsRef = useRef([]); // last RECENT_SHABADS plain shabads shown (see baniPreference)
  const autopilotLockRef = useRef(null);
  // Settings > Other Options > "Help Improve Voice-Follow" (on by default): keep the
  // audio before a sevadaar correction, on this computer only.
  const saveAudio = useStoreState((state) => state.userSettings.improveVoiceFollow) !== false;
  const saveAudioRef = useRef(true);
  saveAudioRef.current = saveAudio;
  const ringRef = useRef(null); // rolling audio for corrections
  const sessionIdRef = useRef(null);
  const sessionStartRef = useRef(0);
  const lastAutoDecisionRef = useRef(0);
  const [autoDetect, setAutoDetect] = useState(false); // blind: identify the shabad from audio, then follow (one-shot)
  // Acoustic text stays inside matching; only canonical BaniDB text is rendered.
  const [, setCands] = useState([]); // [{shabadId, verseId, verse, display, share}] shortlist
  const [audioView, setAudioView] = useState({ seconds: 0, level: 0, device: '' });
  const audioViewRef = useRef({ samples: 0, published: 0 });
  const [currentView, setCurrentView] = useState(null);
  const [, setRankedView] = useState([]);
  const rankedViewRef = useRef(0);
  // Presentation snapshots never feed the matching or projection policy.
  const publishRanks = useCallback((rows) => {
    const now = Date.now();
    if (now - rankedViewRef.current < 2000) return;
    rankedViewRef.current = now;
    setRankedView(rows.filter((row) => row.display).slice(0, 3));
  }, []);

  const [mode, setMode] = useState('kirtan');
  const [detail, setDetail] = useState('');
  const [pos, setPos] = useState(null); // { lineIndex, wordIndex, confidence }
  const [dlProgress, setDlProgress] = useState(null); // 0..1 during first-run model download, else null
  // Zoom-style floating widget: collapse the panel down to just the pill, and
  // drag either one anywhere on screen. `widgetPos` is null until first dragged
  // (then it overrides the default anchored position).
  const [collapsed, setCollapsed] = useState(false);
  const [widgetPos, setWidgetPos] = useState(null); // { top, left } | null
  const movedRef = useRef(false); // set during a drag so the pill click doesn't also expand

  const followerRef = useRef(null); // Follower (track a known shabad/bani)
  const recognizerRef = useRef(null); // Recognizer (blind auto-detect)
  const chainRef = useRef(Promise.resolve()); // serialize async inference per chunk
  const sessionRef = useRef(0); // invalidates asynchronous work after cleanup/restart
  const transcriptSeqRef = useRef(0);
  const transcriptAbortRef = useRef(null);
  const retrievalOwnerRef = useRef(null);
  // Autopilot: one continuous session that detects, follows, and auto-switches
  // shabads hands-free. phaseRef gates which engine each audio chunk feeds.
  const autopilotRef = useRef(false);
  const phaseRef = useRef('searching'); // 'searching' (detect) | 'following' (track)
  const lockingRef = useRef(false); // a lock/switch is mid-commit — don't double-fire
  const sampleRateRef = useRef(null); // mic sample rate, for building engine sessions
  const currentShabadIdRef = useRef(null); // shabad currently projected (avoid re-open)
  const curLinesNormRef = useRef([]); // normalized lines of the current shabad (acoustic scoring)
  const curWordsNormRef = useRef([]); // per-line normalized words of the current shabad (order-free defense)
  const curProfileRef = useRef(null); // full profile of the current shabad (kept for a fast return)
  const prevShabadRef = useRef(null); // { id, profile, decodesSince } — shabad we just switched away from
  const returnSlotRef = useRef(null); // { shabadId, wins, index, lastScore } — in-flight return evaluation
  const curCursorRef = useRef(null); // follower's current line index within the current shabad
  const [switchView, setSwitchView] = useState(null); // { cand, sCand, sCur, wins } for the following-phase UI
  // Panel: the switch judge's live candidates, published every decode while
  // following — { sCur, items: [{ shabadId, line, score, wins, needed, kind }] }.
  // score = the candidate's match to the last ~10 s of audio (the number the
  // judge actually compares), wins = confirmation progress. Honest by design:
  // what the sevadar sees is exactly what decides a switch.
  const [liveCands, setLiveCands] = useState({ sCur: 0, items: [] });
  // Live board: calibrated % for the current Shabad and every Shabad in contention, updated
  // every decode (see liveBoard.js); and a rolling transcript of what the model hears.
  const boardRef = useRef(null);
  if (!boardRef.current) boardRef.current = createBoard();
  const [board, setBoard] = useState([]);
  const boardAtRef = useRef(0);
  const publishBoard = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - boardAtRef.current < 180) return;
    boardAtRef.current = now;
    setBoard(boardRef.current.snapshot());
  }, []);
  const heardRef = useRef('');
  const [heard, setHeard] = useState('');
  const heardAtRef = useRef(0);
  const [showHeard, setShowHeard] = useState(() => {
    try {
      return window.localStorage.getItem('vf-show-heard') !== '0';
    } catch (_) {
      return true;
    }
  });
  const toggleHeard = useCallback(() => {
    setShowHeard((v) => {
      try {
        window.localStorage.setItem('vf-show-heard', v ? '0' : '1');
      } catch (_) {
        /* preference only */
      }
      return !v;
    });
  }, []);
  // The strip shows words, not noise: between lines the recognizer still emits lone letters
  // from tabla, harmonium and room sound at low confidence (sung lines score ~0.93-0.99),
  // so a hypothesis has to be confident and contain at least one real word to be shown,
  // and the strip clears after a few seconds without one.
  const heardClearRef = useRef(0);
  // Each decode covers the last few seconds of audio, so its final word or two is usually
  // cut mid-word and gets re-spelt on the next decode. Those are shown lighter as "still
  // hearing"; only words that were fully sung join the settled text.
  const tentativeRef = useRef('');
  const noteHeard = useCallback((text, confidence = 1) => {
    const all = (text || '').split(/\s+/).filter(Boolean);
    const words = all.filter((w) => w.length >= 3);
    if (confidence < HEARD_MIN_CONF || !words.length) return;
    const settled = all.slice(0, -HEARD_TENTATIVE_WORDS).join(' ');
    tentativeRef.current = all.slice(-HEARD_TENTATIVE_WORDS).join(' ');
    if (settled) heardRef.current = mergeTranscript(heardRef.current, settled);
    const now = Date.now();
    if (now - heardAtRef.current >= 200) {
      heardAtRef.current = now;
      setHeard(`${heardRef.current}\u0001${tentativeRef.current}`);
    }
    clearTimeout(heardClearRef.current);
    heardClearRef.current = setTimeout(() => {
      heardRef.current = '';
      tentativeRef.current = '';
      setHeard('');
    }, HEARD_CLEAR_MS);
  }, []);
  const [lineExpanded, setLineExpanded] = useState(true); // full pangti (wrapped) vs one line
  const liveSigRef = useRef('');
  const liveAtRef = useRef(0);
  const [, setNextView] = useState(null);
  const nextViewRef = useRef(0);
  useEffect(() => {
    if (!switchView) {
      setNextView(null);
      return;
    }
    const now = Date.now();
    if (now - nextViewRef.current >= 2000) {
      nextViewRef.current = now;
      setNextView(switchView);
    }
  }, [switchView]);
  // Acoustic switch candidate being evaluated while following:
  // { shabadId, verseId, verse, linesNorm, wins, loading }
  const switchCandRef = useRef(null);
  // Acoustic backstop contender (same shape + display/lastScore/committed):
  // the best line-text match across the screened shabad field.
  const backstopRef = useRef(null);
  // Read-only canonical retrieval service, isolated from the renderer process.
  const flIndexRef = useRef(null); // ready retrieval client
  const flIndexLoadingRef = useRef(null); // in-flight index promise
  const lineCacheRef = useRef(new Map()); // shabadId -> { linesNorm, verses } | null (loading)
  const bsWinsRef = useRef(new Map()); // backstop wins banked per shabadId (survives screen flap)
  const sameGurbaniRef = useRef(new Map()); // 'a:b' -> Promise<boolean> (DUP_AWARE_LOCK)
  const bsAdoptKeyRef = useRef(''); // last screened field we ran adoption against
  const flIndexFailAtRef = useRef(0); // last index-build failure (backoff clock)
  // Seeking slide: while a switch evaluation is genuinely live (a contender is
  // beating the current shabad), the projector shows the Waheguru slide instead
  // of a possibly-wrong shabad. seekingRef tracks whether WE put it up, so we
  // never clear a misc slide the user opened themselves.
  const seekingRef = useRef(false);
  const isMiscSlideRef = useRef(false);
  isMiscSlideRef.current = isMiscSlide;
  const ctxRef = useRef(null);
  const streamRef = useRef(null);
  const nodeRef = useRef(null);
  const srcRef = useRef(null);
  const linesRef = useRef([]); // [{ verseId }] indexed by aligner lineIndex
  const lastVerseRef = useRef(null);
  const followingKeyRef = useRef(null); // session key: `shabad:<id>` or `bani:<id>`
  const panelRef = useRef(null); // flyout panel, for click-outside dismissal
  // Blind-detect session state (mutable, avoids re-render churn per decode).
  const recognizingRef = useRef(false); // true while blindly identifying a shabad
  const contextEvidenceRef = useRef(null);
  const detectVotesRef = useRef(new Map()); // shabadId -> accumulated vote weight
  const detectRowsRef = useRef(new Map()); // shabadId -> best {verseId, verse, shabadId, rank}
  const detectStableRef = useRef({ id: null, count: 0 }); // leader-stability counter
  const poolStableRef = useRef({ bani: null, count: 0 }); // PAATH_POOL_STABLE counter
  const emptyStreakRef = useRef(0); // consecutive no-hit decodes (shortlist hold)

  const cleanup = useCallback(() => {
    sessionRef.current += 1;
    transcriptSeqRef.current += 1;
    transcriptAbortRef.current?.abort();
    transcriptAbortRef.current = null;
    const retrieval = retrievalOwnerRef.current;
    retrievalOwnerRef.current = null;
    flIndexRef.current = null;
    flIndexLoadingRef.current = null;
    flIndexFailAtRef.current = 0;
    lineCacheRef.current = new Map();
    if (retrieval) retrieval.dispose().catch(() => {});
    // Detach the worklet handler first so no in-flight chunk pushes into a
    // torn-down engine session.
    if (nodeRef.current) {
      try {
        nodeRef.current.port.onmessage = null;
      } catch (_) {
        /* Resource may already be closed during teardown. */
      }
    }
    try {
      nodeRef.current?.disconnect();
    } catch (_) {
      /* Resource may already be closed during teardown. */
    }
    try {
      srcRef.current?.disconnect();
    } catch (_) {
      /* Resource may already be closed during teardown. */
    }
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch (_) {
      /* Resource may already be closed during teardown. */
    }
    try {
      ctxRef.current?.close();
    } catch (_) {
      /* Resource may already be closed during teardown. */
    }
    ctxRef.current = null;
    streamRef.current = null;
    nodeRef.current = null;
    srcRef.current = null;
    followerRef.current = null;
    recognizerRef.current = null;
    chainRef.current = Promise.resolve();
    // Take down our seeking slide if we put one up; never touch the user's own.
    if (seekingRef.current) {
      seekingRef.current = false;
      try {
        setIsMiscSlide(false);
      } catch (_) {
        // Store unavailable here; the seeking flag above already prevents leaks.
      }
    }
  }, [setIsMiscSlide]);

  useEffect(() => () => cleanup(), [cleanup]);

  // Shared mic + worklet pipeline. Resolves the AudioContext sample rate, then
  // streams raw Float32 PCM chunks to `onChunk` (awaited serially so we never run
  // two inferences on the same ONNX session concurrently). Returns the sample
  // rate so callers can build the engine session at the right input rate.
  const startAudio = useCallback(async (onChunk) => {
    const session = sessionRef.current;
    // Preserve the actual capture error; missing/busy devices are not all
    // permission denials. The caller handles it only for its current session.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false },
    });
    if (session !== sessionRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return null;
    }
    streamRef.current = stream;
    audioViewRef.current = { samples: 0, published: 0 };
    rankedViewRef.current = 0;
    setRankedView([]);
    setCurrentView(null);
    const device = stream.getAudioTracks?.()[0]?.label || 'Microphone';
    setAudioView({ seconds: 0, level: 0, device });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctxRef.current = ctx;
    const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    if (session !== sessionRef.current) return null;
    const node = new AudioWorkletNode(ctx, 'voice-follow-pcm');
    chainRef.current = Promise.resolve();
    node.port.onmessage = (ev) => {
      if (session !== sessionRef.current) return;
      const pcm = new Float32Array(ev.data);
      const capture = audioViewRef.current;
      capture.samples += pcm.length;
      const now = Date.now();
      if (now - capture.published >= 250) {
        let energy = 0;
        for (let i = 0; i < pcm.length; i += 1) energy += pcm[i] * pcm[i];
        const rms = Math.sqrt(energy / (pcm.length || 1));
        capture.published = now;
        setAudioView({
          seconds: Math.floor(capture.samples / ctx.sampleRate),
          level: Math.min(1, rms * 8),
          device,
        });
      }
      chainRef.current = chainRef.current
        .then(() => (session === sessionRef.current ? onChunk(pcm) : undefined))
        .catch(() => {});
    };
    const src = ctx.createMediaStreamSource(stream);
    nodeRef.current = node;
    srcRef.current = src;
    src.connect(node);
    // Deliberately not connected to destination — no playback.
    return ctx.sampleRate;
  }, []);

  const stop = useCallback(() => {
    restoreBaniLength();
    if (sessionIdRef.current) {
      sessionLog.logEvent('session_end', {
        session: sessionIdRef.current,
        seconds: Math.round((Date.now() - sessionStartRef.current) / 1000),
      });
      sessionIdRef.current = null;
    }
    recognizingRef.current = false;
    autopilotRef.current = false;
    phaseRef.current = 'searching';
    lockingRef.current = false;
    currentShabadIdRef.current = null;
    curLinesNormRef.current = [];
    curWordsNormRef.current = [];
    curProfileRef.current = null;
    curBaniShabadsRef.current = null;
    setLiveCands({ sCur: 0, items: [] });
    boardRef.current.reset();
    setBoard([]);
    vetoRef.current = null;
    prevShabadRef.current = null;
    returnSlotRef.current = null;
    curCursorRef.current = null;
    switchCandRef.current = null;
    backstopRef.current = null;
    bsWinsRef.current.clear();
    bsAdoptKeyRef.current = '';
    setSwitchView(null);
    cleanup();
    setStatus('stopped');
    setDetail('');
    setDlProgress(null);
    setCands([]);
  }, [cleanup]);

  const start = useCallback(async () => {
    // Ceremonies (Anand Karaj, Antam Sanskar, …) are free-form and not supported.
    if (isCeremonyBani) {
      setStatus('error');
      setDetail("Voice-Follow supports Shabads and Banis — ceremonies aren't supported yet.");
      return;
    }
    const isBani = isSundarGutkaBani && !!sundarGutkaBaniId;
    if (!isBani && !activeShabadId) {
      setStatus('error');
      setDetail('Open a Shabad first, then press Start.');
      return;
    }
    // Tear down any prior session so switching content mid-listen re-attaches
    // cleanly instead of leaking a socket/mic bound to the old shabad/bani.
    cleanup();
    const session = sessionRef.current;
    setStatus('connecting');
    setDetail(isBani ? 'loading bani lines…' : 'loading shabad lines…');
    lastVerseRef.current = null;
    followingKeyRef.current = isBani ? `bani:${sundarGutkaBaniId}` : `shabad:${activeShabadId}`;
    setPos(null);

    // Resolve the displayed content's lines -> {verseId, unicode words}. Banis
    // return verse rows directly (each with .ID/.Gurmukhi); shabads come through
    // filterRequiredVerseItems. Both must be anvaad.unicode()'d before matching.
    let verses;
    try {
      if (isBani) {
        const col = BANI_LENGTH_COLS[baniLength] || BANI_LENGTH_COLS.short;
        const rows = await loadBaniRows(sundarGutkaBaniId, col);
        if (session !== sessionRef.current) return;
        const filtered = (rows || []).filter((r) => r && r.ID != null && r.Gurmukhi);
        linesRef.current = filtered.map((r) => ({ verseId: r.ID }));
        verses = filtered.map((r) => ({
          verseId: r.ID,
          words: tokenize(anvaad.unicode(r.Gurmukhi)),
        }));
      } else {
        const rows = await banidb.loadShabad(activeShabadId);
        if (session !== sessionRef.current) return;
        const filtered = filterRequiredVerseItems(rows).filter(
          (it) => it && it.verseId != null && it.verse,
        );
        linesRef.current = filtered.map((it) => ({ verseId: it.verseId }));
        verses = filtered.map((it) => ({
          verseId: it.verseId,
          words: tokenize(anvaad.unicode(it.verse)),
        }));
      }
    } catch (e) {
      if (session !== sessionRef.current) return;
      setStatus('error');
      setDetail(`could not load ${isBani ? 'bani' : 'shabad'}: ${e?.message || e}`);
      return;
    }
    if (!verses.length) {
      setStatus('error');
      setDetail(`${isBani ? 'bani' : 'shabad'} has no lines to follow.`);
      return;
    }

    // First run only: fetch the ~184 MB int8 model and load the ONNX session.
    // Subsequent starts are instant (cached in userData + session kept warm).
    if (!engine.isReady()) {
      setDetail('Downloading the voice model (184 MB, one time)');
      setDlProgress(0);
    }
    try {
      await engine.ready((p) => {
        if (session !== sessionRef.current) return;
        setDlProgress(p);
        setDetail(`downloading recognition model… ${Math.round(p * 100)}% (one time)`);
      });
    } catch (e) {
      if (session !== sessionRef.current) return;
      setStatus('error');
      setDetail(`could not prepare the recognition model: ${e?.message || e}`);
      setDlProgress(null);
      return;
    }
    if (session !== sessionRef.current) return;
    setDlProgress(null);

    // Wire the mic; each PCM chunk is pushed into the follower (serialized).
    let sampleRate;
    try {
      sampleRate = await startAudio(async (pcm) => {
        const f = followerRef.current;
        if (!f) return;
        const out = await f.push(pcm);
        // A stop or content change can replace the follower during inference.
        if (!out || followerRef.current !== f) return;
        setPos({
          lineIndex: out.lineIndex,
          wordIndex: out.wordIndex,
          confidence: out.confidence,
          shabadId: currentShabadIdRef.current,
        });
        if (typeof out.lineIndex === 'number') {
          const line = linesRef.current[out.lineIndex];
          if (line && line.verseId != null && line.verseId !== lastVerseRef.current) {
            lastVerseRef.current = line.verseId;
            setActiveVerseId(line.verseId);
            setLineNumber(out.lineIndex + 1);
          }
        }
      });
    } catch (e) {
      if (session !== sessionRef.current) return;
      setStatus('error');
      setDetail(e?.message || 'audio setup failed');
      cleanup();
      return;
    }

    if (session !== sessionRef.current) return;
    try {
      const follower = await engine.createFollower(verses, { inputSr: sampleRate });
      if (session !== sessionRef.current) return;
      followerRef.current = follower;
    } catch (e) {
      if (session !== sessionRef.current) return;
      setStatus('error');
      setDetail(`engine init failed: ${e?.message || e}`);
      cleanup();
      return;
    }
    setStatus('listening');
    setDetail(`${verses.length} lines · ${MODES[mode].label}`);
  }, [
    activeShabadId,
    isSundarGutkaBani,
    isCeremonyBani,
    sundarGutkaBaniId,
    baniLength,
    mode,
    cleanup,
    startAudio,
    setActiveVerseId,
    setLineNumber,
  ]);

  // -- Blind auto-detect: identify the shabad from audio, then follow it --------

  // A confident, stable candidate emerged. Open that shabad in the app and hand
  // off to the normal follower (the re-attach effect below starts it once
  // activeShabadId updates).
  const lockOnto = useCallback(
    (cand) => {
      recognizingRef.current = false;
      cleanup();
      followingKeyRef.current = null;
      lastVerseRef.current = null;
      setPos(null);
      setCands([]);
      setStatus('connecting');
      setDetail('Found it');
      openShabadRef.current(cand.shabadId, cand.verseId, cand.verse);
    },
    [cleanup],
  );

  // -- Autopilot: hands-free detect -> follow -> auto-switch, one session -------

  // Drop back to detecting (the current shabad stopped matching, or we're just
  // starting). Keeps whatever is on screen; spins up a FRESH recognizer so the
  // previous shabad's audio tail can't bias the next identification.
  const enterSearching = useCallback(async () => {
    phaseRef.current = 'searching';
    followerRef.current = null;
    curLinesNormRef.current = [];
    curWordsNormRef.current = [];
    curProfileRef.current = null;
    curBaniShabadsRef.current = null;
    setLiveCands({ sCur: 0, items: [] });
    boardRef.current.reset();
    setBoard([]);
    vetoRef.current = null;
    prevShabadRef.current = null;
    returnSlotRef.current = null;
    curCursorRef.current = null;
    switchCandRef.current = null;
    backstopRef.current = null;
    bsWinsRef.current.clear();
    bsAdoptKeyRef.current = '';
    setSwitchView(null);
    contextEvidenceRef.current = null;
    detectVotesRef.current = new Map();
    detectRowsRef.current = new Map();
    detectStableRef.current = { id: null, count: 0 };
    emptyStreakRef.current = 0;
    setCands([]);
    setPos(null);
    setStatus('detecting');
    setDetail('Listening for the next Shabad');
    try {
      if (sampleRateRef.current) {
        recognizerRef.current = await engine.createRecognizer({
          inputSr: sampleRateRef.current,
          windowS: AP_SEARCH_WIN_S, // searching: full context, like standalone detect
          hopS: AP_REC_HOP_S,
        });
      }
    } catch (_) {
      /* keep the existing recognizer if a fresh one can't be built */
    }
  }, []);

  // Load a shabad's verses (tokenized, for a Follower) and normalized line texts
  // (for acoustic scoring). Throws if it can't be loaded / has no usable lines.
  const getBaniIndex = useCallback(() => {
    const col = BANI_LENGTH_COLS[userLength()] || BANI_LENGTH_COLS.short;
    if (!baniIndexRef.current || baniIndexRef.current.col !== col) {
      // Banis followed at a longer length than the user's (Rehras, Aarti) take their shabad
      // list from that length, so sequence and copy rules see every piece they can follow.
      const longer = Object.keys(BANI_MIN_LENGTH)
        .map(Number)
        .map((b) => [b, BANI_LENGTH_COLS[baniLengthFor(b, userLength())]])
        .filter(([, c]) => c !== col);
      const extraCols = [...new Set(longer.map(([, c]) => c))];
      const promise = Promise.all([
        banidb.loadBaniIndex(col),
        ...extraCols.map((c) => banidb.loadBaniIndex(c)),
      ]).then(([banis, ...extra]) => {
        // The user-length Rehras, kept for the reading rule (see REHRAS_READ_OPENING).
        const rehrasUser = new Set(banis[REHRAS_BANI] || []);
        longer.forEach(([b, c]) => {
          const got = extra[extraCols.indexOf(c)];
          // eslint-disable-next-line no-param-reassign
          if (got && got[b]) banis[b] = got[b];
        });
        const byShabad = new Map();
        Object.keys(banis).forEach((b) =>
          banis[b].forEach((sid, order) => {
            const list = byShabad.get(sid) || [];
            list.push({ bani: Number(b), pos: order });
            byShabad.set(sid, list);
          }),
        );
        return { banis, byShabad, rehrasUser };
      });
      promise.catch(() => {
        if (baniIndexRef.current && baniIndexRef.current.promise === promise) {
          baniIndexRef.current = null;
        }
      });
      baniIndexRef.current = { col, promise };
    }
    return baniIndexRef.current.promise;
  }, []);

  // Same shape as a shabad profile, over every line of the Bani (the same rows
  // and length setting Sundar Gutka shows), plus the shabads the Bani contains.
  // verseId -> paath Bani for lines only a paath contains (see PAATH_BANIS).
  const paathLinesRef = useRef(null);
  const getPaathLines = useCallback(() => {
    const col = BANI_LENGTH_COLS[userLength()] || BANI_LENGTH_COLS.short;
    if (!paathLinesRef.current || paathLinesRef.current.col !== col) {
      const verseIds = (rows) =>
        (rows || []).filter((r) => r && r.Verse && r.Verse.ID != null).map((r) => r.Verse.ID);
      const promise = Promise.all([
        Promise.all(PAATH_BANIS.map((b) => banidb.loadBani(b, col))),
        Promise.all(NOT_PAATH_BANIS.map((b) => banidb.loadBani(b, col))),
        Promise.all(AARTI_SHARED_BANIS.map((b) => banidb.loadBani(b, col))),
      ]).then(([paath, notPaath, aartiShared]) => {
        const blocked = new Set();
        notPaath.forEach((rows) => verseIds(rows).forEach((v) => blocked.add(v)));
        const aartiBlocked = new Set();
        aartiShared.forEach((rows) => verseIds(rows).forEach((v) => aartiBlocked.add(v)));
        const families = new Map();
        const lines = new Map();
        paath.forEach((rows, k) => {
          const bani = PAATH_BANIS[k];
          verseIds(rows).forEach((v) => {
            const fams = families.get(v) || new Set();
            fams.add(PAATH_FAMILY[bani]);
            families.set(v, fams);
            if (!lines.has(v)) lines.set(v, bani); // first in preference order
          });
        });
        // Headers and lines shared by two different paaths decide nothing.
        families.forEach((fams, v) => {
          if (fams.size > 1 || blocked.has(v)) lines.delete(v);
          else if (lines.get(v) === AARTI_BANI && aartiBlocked.has(v)) lines.delete(v);
        });
        PAATH_SKIP_VERSES.forEach((v) => lines.delete(v));
        return lines;
      });
      promise.catch(() => {
        if (paathLinesRef.current && paathLinesRef.current.promise === promise) {
          paathLinesRef.current = null;
        }
      });
      paathLinesRef.current = { col, promise };
    }
    return paathLinesRef.current.promise;
  }, []);

  const loadBaniProfile = useCallback(async (baniId) => {
    const col = BANI_LENGTH_COLS[baniLengthFor(baniId, userLength())] || BANI_LENGTH_COLS.short;
    const rows = await loadBaniRows(baniId, col);
    const filtered = (rows || []).filter((r) => r && r.ID != null && r.Gurmukhi);
    const verses = filtered.map((r) => ({
      verseId: r.ID,
      words: tokenize(anvaad.unicode(r.Gurmukhi)),
    }));
    const linesNorm = verses.map((v) => vfNorm((v.words || []).join(' ')));
    const displayLines = filtered.map((r) => anvaad.unicode(r.Gurmukhi));
    const rawLines = filtered.map((r) => r.Gurmukhi);
    // Every length's shabads belong to the Bani being followed: a reader of the
    // long Rehras reads shabads the short one lacks, and those must hold the
    // Bani on screen rather than pull the app out of it to a separate shabad.
    const shabadIds = new Set();
    const all = await Promise.all(
      BANI_LENGTH_ALL.map((c) => banidb.loadBaniIndex(c).catch(() => ({}))),
    );
    all.forEach((idx) => ((idx && idx[baniId]) || []).forEach((sid) => shabadIds.add(sid)));
    return { verses, linesNorm, displayLines, rawLines, shabadIds };
  }, []);

  const loadShabadProfile = useCallback(async (shabadId) => {
    const rows = await banidb.loadShabad(shabadId);
    const filtered = filterRequiredVerseItems(rows).filter(
      (it) => it && it.verseId != null && it.verse,
    );
    const verses = filtered.map((it) => ({
      verseId: it.verseId,
      words: tokenize(anvaad.unicode(it.verse)),
    }));
    const linesNorm = verses.map((v) => vfNorm((v.words || []).join(' ')));
    // Preserve the exact BaniDB text for display, separately from tokenized
    // alignment words (which omit punctuation and verse numbers).
    const displayLines = filtered.map((it) => anvaad.unicode(it.verse));
    const rawLines = filtered.map((it) => it.verse);
    return { verses, linesNorm, displayLines, rawLines };
  }, []);

  // DUP_AWARE_LOCK: whether two shabads are one Gurbani text stored twice (cached).
  const isSameGurbani = useCallback(
    (a, b) => {
      if (a === b) return Promise.resolve(false);
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const cache = sameGurbaniRef.current;
      if (!cache.has(key)) {
        cache.set(
          key,
          Promise.all([loadShabadProfile(a), loadShabadProfile(b)])
            .then(([pa, pb]) => sameGurbani(pa.displayLines, pb.displayLines))
            .catch(() => false),
        );
      }
      return cache.get(key);
    },
    [loadShabadProfile],
  );

  // Synchronous view of isSameGurbani for the switch judge: false until known. The first
  // time a pair meets, the check starts in the background; a switch needs several wins
  // over a second or more, so the answer is in by the time it matters.
  const sameKnownRef = useRef(new Map());
  const knownSame = (a, b) => {
    if (typeof a !== 'number' || typeof b !== 'number' || a === b) return false;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const known = sameKnownRef.current;
    if (known.has(key)) return known.get(key);
    known.set(key, false);
    isSameGurbani(a, b)
      .then((same) => known.set(key, same))
      .catch(() => {});
    return false;
  };

  // Drop search leaders that are a copy of a higher-ranked leader, keeping n.
  const distinctLeaders = useCallback(
    async (list, n) => {
      if (!list || list.length < 2) return list;
      const copies = await Promise.all(
        list.map((c, i) =>
          Promise.all(list.slice(0, i).map((o) => isSameGurbani(o.shabadId, c.shabadId))).then(
            (r) => r.some(Boolean),
          ),
        ),
      );
      return list.filter((c, i) => !copies[i]).slice(0, n);
    },
    [isSameGurbani],
  );

  // Identical copies of a shabad inside the PAATH_READ_BANIS it is not in itself, as
  // Map bani -> copy shabadId (Gagan mai thaal is stored once in Sohila, once in Aarti).
  // A lock picks whichever copy ranks first, so both paath rules must see the others.
  const paathCopiesRef = useRef(new Map());
  const paathCopies = useCallback(
    (sid, index) => {
      if (!paathCopiesRef.current.has(sid)) {
        const own = new Set((index.byShabad.get(sid) || []).map((x) => x.bani));
        const jobs = [];
        PAATH_READ_BANIS.forEach((b) => {
          if (own.has(b)) return;
          (index.banis[b] || []).forEach((s2) => {
            if (s2 !== sid)
              jobs.push(isSameGurbani(sid, s2).then((same) => (same ? [b, s2] : null)));
          });
        });
        paathCopiesRef.current.set(
          sid,
          Promise.all(jobs).then((r) => new Map(r.filter(Boolean))),
        );
      }
      return paathCopiesRef.current.get(sid);
    },
    [isSameGurbani],
  );

  // Prepare independently of audio inference. A failed service backs off;
  // obsolete preparation cannot publish into a restarted microphone session.
  const ensureFlIndex = useCallback(() => {
    if (flIndexRef.current) return Promise.resolve(flIndexRef.current);
    if (flIndexLoadingRef.current) return flIndexLoadingRef.current;
    if (flIndexFailAtRef.current && Date.now() - flIndexFailAtRef.current < 60000) {
      return Promise.resolve(null);
    }
    const session = sessionRef.current;
    const client = createRendererRetrieval(ipcRenderer);
    retrievalOwnerRef.current = client;
    const p = client.ready
      .then(() => {
        if (session !== sessionRef.current || retrievalOwnerRef.current !== client) return null;
        flIndexRef.current = client;
        return client;
      })
      .catch(() => {
        if (session === sessionRef.current && retrievalOwnerRef.current === client) {
          flIndexFailAtRef.current = Date.now();
          retrievalOwnerRef.current = null;
        }
        client.dispose().catch(() => {});
        return null;
      });
    flIndexLoadingRef.current = p;
    p.then(() => {
      if (flIndexLoadingRef.current === p) flIndexLoadingRef.current = null;
    });
    return p;
  }, []);

  const searchCanonicalText = useCallback(
    async (text, cap, signal) => {
      const client = await ensureFlIndex();
      if (!client || signal.aborted) return null;
      try {
        return await client.search(text, cap, { signal });
      } catch (error) {
        if (error.name !== 'AbortError' && retrievalOwnerRef.current === client) {
          retrievalOwnerRef.current = null;
          flIndexRef.current = null;
          flIndexFailAtRef.current = Date.now();
          client.dispose().catch(() => {});
        }
        return null;
      }
    },
    [ensureFlIndex],
  );

  // A confident, stable shabad emerged — either the FIRST one (initial lock) or a
  // DIFFERENT one that has WON the acoustic switch test while following. Build a
  // follower for it, project it (unless it's the one already up), and (keep)
  // following — all without tearing down the single continuous mic session.
  // Re-entrancy-guarded so overlapping detections can't double-commit.
  const autopilotLock = useCallback(
    async (cand, opts = {}) => {
      if (!cand || !cand.verse) return;
      if (lockingRef.current) return; // a lock/switch is already committing
      lockingRef.current = true;
      const session = sessionRef.current;
      // On a switch we already have a working follower; a transient failure below
      // must NOT drop it, so remember whether this is the first lock or a switch.
      const isSwitch = !!followerRef.current;
      const fromId = currentShabadIdRef.current;
      const baniId = baniIdOf(cand.shabadId);
      try {
        setStatus('connecting');
        setDetail(isSwitch ? 'switching to the new shabad…' : 'Found it');

        let profile;
        try {
          profile =
            baniId != null ? await loadBaniProfile(baniId) : await loadShabadProfile(cand.shabadId);
        } catch (e) {
          if (session !== sessionRef.current) return;
          setDetail(`could not load shabad: ${e?.message || e}`);
          if (!isSwitch) await enterSearching();
          return;
        }
        if (session !== sessionRef.current || !autopilotRef.current) return;
        if (!profile.verses.length) {
          if (!isSwitch) await enterSearching();
          return;
        }

        let follower;
        try {
          follower = await engine.createFollower(profile.verses, {
            inputSr: sampleRateRef.current,
          });
        } catch (e) {
          if (session !== sessionRef.current) return;
          setDetail(`engine init failed: ${e?.message || e}`);
          if (!isSwitch) await enterSearching();
          return;
        }
        // A restart makes autopilot true again, so check the session as well.
        if (!autopilotRef.current || session !== sessionRef.current) return;

        // Commit the new shabad. The return slot is read BEFORE it is overwritten
        // below, so the session log can tell a return from a fresh switch.
        const prevBefore = prevShabadRef.current;
        phaseRef.current = 'following';
        lastVerseRef.current = null;
        followerRef.current = follower;
        if (
          isSwitch &&
          !opts.promote &&
          currentShabadIdRef.current != null &&
          currentShabadIdRef.current !== cand.shabadId
        ) {
          prevShabadRef.current = {
            id: currentShabadIdRef.current,
            profile: curProfileRef.current,
            decodesSince: 0,
          };
        } else if (!isSwitch || opts.promote) prevShabadRef.current = null;
        curBaniShabadsRef.current = baniId != null ? profile.shabadIds : null;
        returnSlotRef.current = null;
        curProfileRef.current = profile;
        curLinesNormRef.current = profile.linesNorm;
        curWordsNormRef.current = profile.verses.map((v) =>
          (v.words || []).map(vfNorm).filter(Boolean),
        );
        setCurrentView({ id: cand.shabadId, line: anvaad.unicode(cand.verse) });
        curCursorRef.current = null; // new shabad — cursor unknown until the follower reports
        // Seed the panel's position at the verse we locked on. Without this the
        // stale fix from the previous shabad (or line 1) shows for a beat until
        // the new follower reports, which reads as a jump to the wrong pangti.
        {
          const at = profile.verses.findIndex((v) => v.verseId === cand.verseId);
          setPos({
            lineIndex: at >= 0 ? at : null,
            wordIndex: 0,
            confidence: 0,
            shabadId: cand.shabadId,
          });
        }
        setSwitchView(null);
        switchCandRef.current = null; // clear any in-flight switch evaluation
        vetoRef.current = null;
        {
          const from = currentShabadIdRef.current;
          if (opts.manual && from != null && from !== cand.shabadId) {
            // The sevadaar said "not that one": no return slot back to it, and it
            // cannot win a switch for a while. Any OTHER shabad still can.
            prevShabadRef.current = null;
            vetoRef.current = { id: from, left: TAP_VETO_DECODES };
          }
          let kind = 'lock';
          if (opts.promote) kind = 'bani_follow';
          else if (opts.manual) kind = 'override';
          else if (isSwitch && prevBefore && prevBefore.id === cand.shabadId) kind = 'return';
          else if (isSwitch) kind = 'switch';
          const now = Date.now();
          const sinceLastAuto = lastAutoDecisionRef.current
            ? Math.round((now - lastAutoDecisionRef.current) / 1000)
            : null;
          sessionLog.logEvent(kind, {
            session: sessionIdRef.current,
            from,
            to: cand.shabadId,
            verseId: cand.verseId,
            sinceLastAuto,
            sinceStart: Math.round((now - sessionStartRef.current) / 1000),
          });
          if (!opts.manual) lastAutoDecisionRef.current = now;
          if (opts.manual && saveAudioRef.current && ringRef.current) {
            const saved = sessionLog.saveCorrection(
              ringRef.current.snapshot(),
              ringRef.current.sampleRate,
              {
                session: sessionIdRef.current,
                from,
                to: cand.shabadId,
                verseId: cand.verseId,
                sinceLastAuto,
              },
            );
            if (saved)
              sessionLog.logEvent('correction_saved', {
                session: sessionIdRef.current,
                to: cand.shabadId,
              });
          }
        }
        backstopRef.current = null;
        bsWinsRef.current.clear();
        bsAdoptKeyRef.current = '';
        if (cand.shabadId !== currentShabadIdRef.current) {
          currentShabadIdRef.current = cand.shabadId;
          if (typeof cand.shabadId === 'number') {
            recentShabadsRef.current = [
              ...recentShabadsRef.current.filter((x) => x !== cand.shabadId),
              cand.shabadId,
            ].slice(-RECENT_SHABADS);
          }
          const wantLength = baniId != null ? baniLengthFor(baniId, userLength()) : null;
          if (wantLength && wantLength !== baniLengthRef.current) {
            if (!lengthOverrideRef.current) lengthOverrideRef.current = { prev: userLength() };
            setBaniLengthRef.current(wantLength);
          } else if (!wantLength || wantLength === userLength()) {
            restoreBaniLength();
          }
          if (baniId != null) {
            // Same actions the Sundar Gutka screen uses to open a Bani, plus the
            // pane (at the recited line, so it does not restart at the top).
            updatePaneRef.current('bani', baniId, cand.verseId);
            setIsCeremonyBani(false);
            setSingleDisplayActiveTab('shabad');
            setIsSundarGutkaBani(true);
            setSundarGutkaBaniId(baniId);
            if (cand.verseId != null) setActiveVerseId(cand.verseId);
          } else {
            openShabadRef.current(cand.shabadId, cand.verseId, cand.verse);
          }
        }
        // A commit resolves the uncertainty: take down our seeking slide if up
        // (opening the shabad already dismisses misc slides; this covers the
        // keep-follower transient-failure path too).
        if (seekingRef.current) {
          seekingRef.current = false;
          sessionLog.logEvent('seeking', {
            session: sessionIdRef.current,
            visible: false,
            to: cand.shabadId,
          });
          try {
            setIsMiscSlide(false);
          } catch (_) {
            // Store unavailable here; the seeking flag above already prevents leaks.
          }
        }
        // Fresh vote slate so the shabad we just committed to can't immediately
        // re-trigger a switch, and so evidence for the next one starts clean.
        contextEvidenceRef.current = null;
        detectVotesRef.current = new Map();
        detectRowsRef.current = new Map();
        detectStableRef.current = { id: null, count: 0 };
        emptyStreakRef.current = 0;
        // Also give the recognizer a clean buffer: its window still holds up to
        // ~10s of the PREVIOUS shabad's audio, which would otherwise keep matching
        // the old shabad and could flip us straight back. A fresh session starts
        // identification from now. (Cheap — shares the already-loaded session.)
        try {
          if (sampleRateRef.current) {
            const recognizer = await engine.createRecognizer({
              inputSr: sampleRateRef.current,
              windowS: AP_FOLLOW_WIN_S, // now following: short window = fast next switch
              hopS: AP_REC_HOP_S,
            });
            if (session !== sessionRef.current) return;
            recognizerRef.current = recognizer;
          }
        } catch (_) {
          /* keep the existing recognizer if a fresh one can't be built */
        }
        if (session !== sessionRef.current) return;
        setCands([]);
        setStatus('listening');
        setDetail('Following');
      } finally {
        if (session === sessionRef.current) lockingRef.current = false;
      }
      // A line only a paath contains: open that Bani straight away.
      if (
        !opts.promote &&
        !opts.manual &&
        baniId == null &&
        !PAATH_SKIP_SHABADS.has(cand.shabadId) &&
        session === sessionRef.current &&
        autopilotRef.current &&
        currentShabadIdRef.current === cand.shabadId
      ) {
        let lines = null;
        try {
          lines = await getPaathLines();
        } catch (_) {
          lines = null;
        }
        const paathBani = lines && lines.get(cand.verseId);
        if (
          paathBani != null &&
          session === sessionRef.current &&
          currentShabadIdRef.current === cand.shabadId &&
          !lockingRef.current &&
          autopilotLockRef.current
        ) {
          autopilotLockRef.current(
            { shabadId: `${BANI_KEY}${paathBani}`, verseId: cand.verseId, verse: cand.verse },
            { promote: true },
          );
          return;
        }
      }
      // Two shabads of one Bani in recitation order: follow the whole Bani.
      if (
        !opts.promote &&
        baniId == null &&
        typeof fromId === 'number' &&
        fromId !== cand.shabadId &&
        session === sessionRef.current &&
        autopilotRef.current &&
        currentShabadIdRef.current === cand.shabadId
      ) {
        let index = null;
        try {
          index = await getBaniIndex();
        } catch (_) {
          index = null;
        }
        if (
          index &&
          session === sessionRef.current &&
          currentShabadIdRef.current === cand.shabadId &&
          !lockingRef.current
        ) {
          const prefer = baniPreference(index, recentShabadsRef.current.slice(0, -1));
          let bani = findBaniSequence(index, fromId, cand.shabadId, prefer);
          // The previous shabad may have been locked as the other Bani's copy of the
          // same Gurbani (Sohila's Gagan mai thaal before Aarti's next shabad).
          if (
            bani == null &&
            (index.byShabad.get(fromId) || []).some((x) => PAATH_READ_BANIS.includes(x.bani))
          ) {
            let copies = null;
            try {
              copies = await paathCopies(fromId, index);
            } catch (_) {
              copies = null;
            }
            [...((copies && copies.values()) || [])].some((c) => {
              bani = findBaniSequence(index, c, cand.shabadId, prefer);
              return bani != null;
            });
            if (
              session !== sessionRef.current ||
              currentShabadIdRef.current !== cand.shabadId ||
              lockingRef.current
            ) {
              bani = null;
            }
          }
          if (bani != null && autopilotLockRef.current) {
            autopilotLockRef.current(
              { shabadId: `${BANI_KEY}${bani}`, verseId: cand.verseId, verse: cand.verse },
              { promote: true },
            );
          }
        }
      }
    },
    [enterSearching, loadShabadProfile, loadBaniProfile, getBaniIndex, getPaathLines],
  );
  autopilotLockRef.current = autopilotLock;

  // A sevadaar tap: adopt this shabad NOW through the same path every automatic
  // lock and switch uses, so following, the return slot and every rule behave
  // exactly as after an automatic switch. Nothing is remembered about the tap.
  const pickCandidate = useCallback(
    async (c) => {
      if (!c || c.shabadId == null || lockingRef.current) return;
      let verse = c.verse || null;
      try {
        if (!verse && c.verseId != null) verse = await banidb.getVerse(c.shabadId, c.verseId);
      } catch (_) {
        verse = null;
      }
      if (!verse) {
        setDetail('Could not open that Shabad');
        return;
      }
      vetoRef.current = null;
      autopilotLock({ shabadId: c.shabadId, verseId: c.verseId, verse }, { manual: true });
    },
    [autopilotLock],
  );

  // Each decode from the recognizer: turn it into Gurmukhi first-letters, slide
  // several n-grams across them, search banidb for each, and vote. Surface the
  // running shortlist, and auto-select once one shabad is confidently ahead.
  const handleTranscript = useCallback(
    async (text) => {
      if (!recognizingRef.current) return;
      const session = sessionRef.current;
      // Accumulate distinct hypotheses while identifying the first Shabad.
      // Canonical retrieval supplies identities; recognized text is never displayed.
      if (autopilotRef.current && phaseRef.current === 'searching' && !lockingRef.current) {
        const prior = contextEvidenceRef.current;
        const memory =
          prior && prior.session === session ? prior : { session, step: 0, entries: [] };
        contextEvidenceRef.current = memory;
        memory.step += 1;
        const { step } = memory;
        memory.entries = memory.entries.filter((e) => step - e.step <= 24);
        const hyp = vfNorm(text);
        if (hyp.length >= 8) {
          const acousticRecognizer = recognizerRef.current;
          const acousticPcm = acousticRecognizer?.buf;
          transcriptAbortRef.current?.abort();
          const request = new AbortController();
          transcriptAbortRef.current = request;
          let leaders = await searchCanonicalText(text, 3 + DUP_AWARE_LOCK, request.signal);
          if (DUP_AWARE_LOCK) leaders = await distinctLeaders(leaders, 3);
          if (
            session !== sessionRef.current ||
            !recognizingRef.current ||
            phaseRef.current !== 'searching' ||
            lockingRef.current ||
            contextEvidenceRef.current !== memory ||
            memory.step !== step
          )
            return;
          const top = leaders?.[0];
          const margin = top ? top.score - (leaders[1]?.score || 0) : 0;
          if (
            MOOL_HOME > 0 &&
            top &&
            top.shabadId === 1 &&
            top.verseId === 1 &&
            top.score >= MOOL_HOME_MIN &&
            leaders[1] &&
            Math.abs(top.score - leaders[1].score) < 1e-9
          ) {
            const mm =
              memory.mool && step - memory.mool.last <= 4
                ? memory.mool
                : { hyps: new Set(), last: step };
            mm.hyps.add(hyp);
            mm.last = step;
            memory.mool = mm;
            if (mm.hyps.size >= MOOL_HOME) {
              let moolProfile;
              try {
                moolProfile = await loadShabadProfile(1);
              } catch (_) {
                return;
              }
              if (
                session !== sessionRef.current ||
                !recognizingRef.current ||
                phaseRef.current !== 'searching' ||
                lockingRef.current ||
                contextEvidenceRef.current !== memory ||
                memory.step !== step
              )
                return;
              const at = moolProfile.verses.findIndex((v) => v.verseId === 1);
              if (at >= 0) {
                autopilotLock({ shabadId: 1, verseId: 1, verse: moolProfile.rawLines[at] });
                return;
              }
            }
          }
          // Full-text pooling for PAATH_POOL_BANIS (Jaap): the top line keeps landing
          // on one of that Bani's shabads, whichever chhand it is.
          const stale = () =>
            session !== sessionRef.current ||
            !recognizingRef.current ||
            phaseRef.current !== 'searching' ||
            lockingRef.current ||
            contextEvidenceRef.current !== memory ||
            memory.step !== step;
          const poolIndex = await getBaniIndex().catch(() => null);
          if (stale()) return;
          const poolBani =
            top &&
            poolIndex &&
            top.score >= PAATH_POOL_TEXT_MIN &&
            !PAATH_SKIP_SHABADS.has(top.shabadId)
              ? (poolIndex.byShabad.get(top.shabadId) || [])
                  .map((x) => x.bani)
                  .find((b) => PAATH_POOL_BANIS.includes(b))
              : undefined;
          memory.pool = [...(memory.pool || []), poolBani ?? null].slice(-PAATH_POOL_WINDOW);
          if (
            poolBani != null &&
            memory.pool.filter((b) => b === poolBani).length >=
              (PAATH_POOL_HITS_BY_BANI[poolBani] || PAATH_POOL_HITS)
          ) {
            let poolProfile;
            try {
              poolProfile = await loadShabadProfile(top.shabadId);
            } catch (_) {
              return;
            }
            if (stale()) return;
            const at = poolProfile.verses.findIndex((v) => v.verseId === top.verseId);
            if (at >= 0) {
              memory.pool = [];
              autopilotLock({
                shabadId: top.shabadId,
                verseId: top.verseId,
                verse: poolProfile.rawLines[at],
              });
              return;
            }
          }
          if (
            top &&
            top.score >= 0.3 &&
            margin >= AP_LOCK_TEXT_MARGIN &&
            leaders.length >= 3 &&
            acousticPcm?.length
          ) {
            try {
              const profiles = await Promise.all(leaders.map((c) => loadShabadProfile(c.shabadId)));
              const emissions = await acousticRecognizer.infer.emissions(acousticPcm);
              if (
                session !== sessionRef.current ||
                !recognizingRef.current ||
                phaseRef.current !== 'searching' ||
                lockingRef.current ||
                recognizerRef.current !== acousticRecognizer ||
                contextEvidenceRef.current !== memory ||
                memory.step !== step
              )
                return;
              if (!memory.acousticSP) memory.acousticSP = AcousticSP.load();
              const scored = profiles
                .map((profile, index) => ({
                  id: leaders[index].shabadId,
                  score: Math.max(
                    ...profile.displayLines.map((line) => {
                      const tokens = memory.acousticSP.encode(
                        line
                          .replace(/[।॥|0-9੦-੯.,;:!?-]+/g, ' ')
                          .replace(/\s+/g, ' ')
                          .trim(),
                      );
                      // Reuse the follower scorer so acquisition uses the same audio evidence.
                      return tokens.length
                        ? // eslint-disable-next-line no-underscore-dangle
                          AcousticFollower.prototype._ctcScore(emissions, tokens, [
                            0,
                            emissions.frames,
                          ])
                        : -Infinity;
                    }),
                  ),
                }))
                .sort((a, b) => b.score - a.score);
              memory.acousticVotes = (memory.acousticVotes || []).filter(
                (v) => step - v.step <= 16,
              );
              if (
                scored[0].id === top.shabadId &&
                scored[0].score - scored[1].score >= 0.05 &&
                !memory.acousticVotes.some((v) => v.hyp === hyp)
              ) {
                memory.acousticVotes.push({ id: top.shabadId, step, hyp });
              }
              const agreeing = memory.acousticVotes.filter((v) => v.id === top.shabadId);
              if (
                agreeing.length >= 3 &&
                step - agreeing[0].step >= 4 &&
                scored[0].id === top.shabadId &&
                scored[0].score - scored[1].score >= 0.05
              ) {
                const profile = profiles[0];
                const canonicalIndex = profile.verses.findIndex((v) => v.verseId === top.verseId);
                if (canonicalIndex >= 0) {
                  autopilotLock({
                    shabadId: top.shabadId,
                    verseId: top.verseId,
                    verse: profile.displayLines[canonicalIndex],
                  });
                  return;
                }
              }
            } catch (_) {
              // Optional acoustic assistance must not prevent existing acquisition.
              if (
                session !== sessionRef.current ||
                contextEvidenceRef.current !== memory ||
                memory.step !== step
              )
                return;
            }
          }
          if (top) {
            if (!memory.entries.some((e) => e.hyp === hyp)) {
              memory.entries.push({
                step,
                hyp,
                candidates: leaders,
                anchor: top.score >= 0.8 && margin >= 0.2,
              });
            }
            memory.entries = memory.entries.slice(-12);
            const tally = new Map();
            memory.entries.forEach((e) =>
              e.candidates.forEach((candidate, rank) => {
                if (candidate.score < 0.2) return;
                const acc = tally.get(candidate.shabadId) || {
                  id: candidate.shabadId,
                  count: 0,
                  score: 0,
                  wins: 0,
                  anchor: false,
                  verses: new Set(),
                };
                acc.count += 1;
                acc.score += candidate.score;
                if (
                  rank === 0 &&
                  (!e.candidates[1] || e.candidates[0].score > e.candidates[1].score + 1e-9)
                ) {
                  acc.wins += 1;
                  acc.verses.add(candidate.verseId);
                  acc.anchor = acc.anchor || e.anchor;
                }
                tally.set(candidate.shabadId, acc);
              }),
            );
            const rankedContext = [...tally.values()].sort((a, b) => b.score - a.score);
            const winner = rankedContext[0];
            // Panel only: how far each lock route has got, so the box shows the Shabad
            // that is actually being built toward, not just first-letter guesses.
            {
              const prog = new Map();
              const bump = (id, verseId, p) => {
                const cur = prog.get(id);
                if (!cur || p > cur.p) prog.set(id, { p, verseId: verseId ?? cur?.verseId });
              };
              rankedContext.forEach((c) => {
                const p =
                  Math.min(c.count / 6, c.wins / 4) * (c.anchor || c.verses.size >= 2 ? 1 : 0.7);
                bump(c.id, (leaders.find((l) => l.shabadId === c.id) || {}).verseId, p);
              });
              if (poolBani != null)
                bump(
                  top.shabadId,
                  top.verseId,
                  memory.pool.filter((b) => b === poolBani).length /
                    (PAATH_POOL_HITS_BY_BANI[poolBani] || PAATH_POOL_HITS),
                );
              const agreeingNow = (memory.acousticVotes || []).filter(
                (v) => v.id === top.shabadId,
              ).length;
              if (agreeingNow) bump(top.shabadId, top.verseId, agreeingNow / 3);
              const items = [...prog.entries()]
                .map(([id, v]) => ({ shabadId: id, verseId: v.verseId, pct: Math.min(0.95, v.p) }))
                .sort((a, b) => b.pct - a.pct)
                .slice(0, 3);
              items.forEach((it) => {
                if (boardRef.current.known(it.shabadId) || it.verseId == null) return;
                banidb
                  .getVerse(it.shabadId, it.verseId)
                  .then((verse) => {
                    if (verse)
                      boardRef.current.remember({
                        shabadId: it.shabadId,
                        verseId: it.verseId,
                        verse,
                      });
                  })
                  .catch(() => {});
              });
              boardRef.current.progress(items, Date.now());
              publishBoard();
            }
            if (
              winner?.id === top.shabadId &&
              margin >= AP_LOCK_TEXT_MARGIN &&
              winner.count >= 6 &&
              winner.wins >= 4 &&
              (winner.anchor || winner.verses.size >= 2) &&
              winner.score - (rankedContext[1]?.score || 0) >= 1
            ) {
              let profile;
              try {
                profile = await loadShabadProfile(top.shabadId);
              } catch (_) {
                return;
              }
              if (
                session !== sessionRef.current ||
                !recognizingRef.current ||
                phaseRef.current !== 'searching' ||
                lockingRef.current ||
                contextEvidenceRef.current !== memory ||
                memory.step !== step
              )
                return;
              const canonicalIndex = profile.verses.findIndex((v) => v.verseId === top.verseId);
              if (canonicalIndex >= 0) {
                autopilotLock({
                  shabadId: top.shabadId,
                  verseId: top.verseId,
                  verse: profile.displayLines[canonicalIndex],
                });
                return;
              }
            }
          }
        }
      } else contextEvidenceRef.current = null;
      // Search uses ASCII-font first letters (the DB's FirstLetterStr encoding).
      // The recognizer's unverified text is never a display or canonical source.
      const fl = toAsciiFirstLetters(text);
      if (fl.length < DETECT_MIN_LETTERS) return;
      const sequence = ++transcriptSeqRef.current;
      const phase = phaseRef.current;
      const originShabad = currentShabadIdRef.current;
      transcriptAbortRef.current?.abort();
      const abort = new AbortController();
      transcriptAbortRef.current = abort;
      const isCurrentTranscript = () =>
        session === sessionRef.current &&
        sequence === transcriptSeqRef.current &&
        recognizingRef.current &&
        phase === phaseRef.current &&
        originShabad === currentShabadIdRef.current;

      // Fade prior evidence a touch each decode so the tally tracks what's being
      // sung now, not a false start from a few seconds ago.
      const votes = detectVotesRef.current;
      votes.forEach((v, k) => {
        const nv = v * DETECT_VOTE_DECAY;
        if (nv < 0.4) votes.delete(k);
        else votes.set(k, nv);
      });

      // Build the query set: contiguous n-grams (CONTAINS — tolerant of errors in
      // the surrounding letters), a couple of leave-one-out variants of the recent
      // window (tolerates ONE spurious inserted letter), and a start-anchored query
      // (BEGINSWITH — a shabad that begins with what's sung is a strong match).
      const queries = [];
      const seenQ = new Set();
      const addQ = (q, w, type) => {
        if (!q || q.length < 4 || queries.length >= DETECT_MAX_GRAMS) return;
        const key = `${type}:${q}`;
        if (seenQ.has(key)) return;
        seenQ.add(key);
        queries.push({ q, w, type });
      };
      // Start-anchored first (strongest signal), then sliding windows most-recent
      // and longest first, then one-letter-drop variants of the recent window.
      addQ(fl.slice(0, Math.min(fl.length, 8)), START_MATCH_WEIGHT, FIRST_LETTERS_START);
      for (let gi = 0; gi < GRAM_SIZES.length; gi += 1) {
        const k = GRAM_SIZES[gi];
        if (fl.length < k) continue; // eslint-disable-line no-continue
        for (let s = fl.length - k; s >= 0; s -= 1)
          addQ(fl.slice(s, s + k), k, FIRST_LETTERS_ANYWHERE);
      }
      const tail = fl.slice(-8);
      for (let d = 1; d < tail.length - 1; d += 1) {
        addQ(tail.slice(0, d) + tail.slice(d + 1), tail.length - 1, FIRST_LETTERS_ANYWHERE);
      }
      if (!queries.length) return;

      const results = await Promise.all(
        queries.map((g) =>
          banidb
            .query(g.q, g.type, 'all', 8)
            .then((r) => ({ g, r }))
            .catch(() => ({ g, r: [] })),
        ),
      );
      if (!isCurrentTranscript()) return;

      const rowByShabad = detectRowsRef.current;
      results.forEach(({ g, r }) => {
        if (!r || !r.length) return;
        r.forEach((row, i) => {
          let sid = null;
          try {
            sid = row.Shabads[0].ShabadID;
          } catch (_) {
            sid = null;
          }
          if (sid == null) return;
          // Longer gram + higher rank in its result set => stronger evidence.
          const weight = g.w * ((r.length - i) / r.length);
          // Cap the tally so a long-running shabad can't build a lead so large it
          // becomes impossible to ever switch away from it.
          votes.set(sid, Math.min(VOTE_CAP, (votes.get(sid) || 0) + weight));
          if (!rowByShabad.has(sid)) {
            rowByShabad.set(sid, { verseId: row.ID, verse: row.Gurmukhi, shabadId: sid });
          }
        });
      });

      if (!votes.size) {
        if (!(autopilotRef.current && phaseRef.current === 'following')) {
          // Hold the last shortlist across a few no-hit decodes (sung audio
          // often misses a decode) instead of flashing it away; only clear
          // after sustained silence so the user can watch the match build.
          const hold = nextEmptyStreak(emptyStreakRef.current, false, EMPTY_HOLD_DECODES);
          emptyStreakRef.current = hold.streak;
          if (hold.clear) {
            setCands([]);
            setDetail("Couldn't recognise that — keep singing, or tap a match below");
          } else {
            setDetail('Listening');
          }
        }
        return;
      }
      emptyStreakRef.current = 0;

      // Rank by accumulated votes. Confidence is the leader's SEPARATION from the
      // runner-up (best / (best + second)) — meaningful and reachable, unlike a
      // share of the whole ambiguous field. Candidate bars are shown relative to
      // the leader so the top guess reads as a full bar.
      const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
      const best = ranked[0][1];
      let runnerUp = 1;
      if (DUP_AWARE_LOCK && autopilotRef.current && phaseRef.current === 'searching') {
        // A copy of the leader's text is the same candidate, not its rival.
        while (
          runnerUp < 3 &&
          ranked[runnerUp] &&
          // eslint-disable-next-line no-await-in-loop
          (await isSameGurbani(ranked[0][0], ranked[runnerUp][0]))
        )
          runnerUp += 1;
        if (!isCurrentTranscript()) return;
      }
      const second = ranked[runnerUp] ? ranked[runnerUp][1] : 0;
      const leaderId = ranked[0][0];
      const lead = best / (best + second || best);

      const shortlist = ranked.slice(0, DETECT_TOP_N).map(([sid, v]) => {
        const row = rowByShabad.get(sid) || {};
        return {
          shabadId: sid,
          verseId: row.verseId,
          verse: row.verse,
          display: row.verse ? anvaad.unicode(row.verse) : '',
          share: v / best,
        };
      });
      publishRanks(shortlist);
      if (!(autopilotRef.current && phaseRef.current === 'following')) {
        boardRef.current.search({ ranked, rows: rowByShabad });
        publishBoard();
      }
      // Don't surface the detect shortlist while following — it's background
      // switch-detection, not something the presenter should see or tap.
      if (!(autopilotRef.current && phaseRef.current === 'following')) setCands(shortlist);

      const st = detectStableRef.current;
      if (leaderId === st.id) st.count += 1;
      else {
        st.id = leaderId;
        st.count = 1;
      }
      // Nudge: with only a few letters the match is ambiguous — more sung words
      // narrow it down, and the shortlist is tappable in the meantime. While
      // already following (autopilot), stay quiet so detection running in the
      // background doesn't churn the "following — sing on" status.
      if (!(autopilotRef.current && phaseRef.current === 'following')) {
        if (lead >= AUTO_LOCK_CONF && best >= DETECT_MIN_EVIDENCE) {
          setDetail('Almost there, keep going');
        } else {
          setDetail('Keep going');
        }
      }

      const cand = shortlist[0];
      if (!cand || !cand.verse) return;

      if (autopilotRef.current) {
        // A lock/switch already committing? Let it finish before deciding again.
        if (lockingRef.current) return;

        if (phaseRef.current === 'searching') {
          // Paath evidence split across a Bani's shabads (Jaap): pool it.
          if (fl.length >= AP_LOCK_MIN_LETTERS) {
            const index = await getBaniIndex().catch(() => null);
            if (!isCurrentTranscript() || lockingRef.current) return;
            const pooled = index && poolPaathVotes(ranked, index);
            const ps = poolStableRef.current;
            if (!pooled) poolStableRef.current = { bani: null, count: 0 };
            else if (ps.bani === pooled.bani) ps.count += 1;
            else poolStableRef.current = { bani: pooled.bani, count: 1 };
            const row = pooled && rowByShabad.get(pooled.sid);
            if (row && row.verse && poolStableRef.current.count >= PAATH_POOL_STABLE) {
              poolStableRef.current = { bani: null, count: 0 };
              autopilotLock({ shabadId: pooled.sid, verseId: row.verseId, verse: row.verse });
              return;
            }
          }
          // Require the unique full-text leader to agree with the first-letter
          // nominee. Ties and stale asynchronous answers cannot establish a lock.
          if (
            fl.length >= AP_LOCK_MIN_LETTERS &&
            lead >= AUTO_LOCK_CONF &&
            best >= DETECT_MIN_EVIDENCE &&
            st.count >= AP_LOCK_STABLE
          ) {
            let leaders = await searchCanonicalText(text, 2 + DUP_AWARE_LOCK, abort.signal);
            if (DUP_AWARE_LOCK) leaders = await distinctLeaders(leaders, 2);
            if (
              DUP_AWARE_LOCK &&
              leaders?.[0] &&
              leaders[0].shabadId !== cand.shabadId &&
              (await isSameGurbani(leaders[0].shabadId, cand.shabadId))
            )
              leaders = [{ ...leaders[0], shabadId: cand.shabadId }, ...leaders.slice(1)];
            if (
              !isCurrentTranscript() ||
              lockingRef.current ||
              detectStableRef.current.id !== cand.shabadId ||
              detectStableRef.current.count < AP_LOCK_STABLE
            )
              return;
            if (!leaders) {
              setDetail('Search is not available right now. Press Stop and try again.');
              return;
            }
            if (
              leaders[0]?.shabadId !== cand.shabadId ||
              (leaders[1] && leaders[0].score - leaders[1].score < AP_LOCK_TEXT_MARGIN)
            )
              return;
            autopilotLock(cand);
          }
          return;
        }

        // FOLLOWING: judge a switch ACOUSTICALLY, from TWO proposers. The vote
        // detector proposes the loudest different shabad it sees; the backstop
        // proposes whichever shabad's LINES best match the recent audio (it
        // catches sung shabads the first-letter vote never surfaces — the
        // measured starvation case). Each contender is scored against the
        // current shabad's lines; only a clear, sustained acoustic win commits
        // the switch — this is what makes it both switch reliably and not
        // chase similar-worded lines.
        const textCandidates = await searchCanonicalText(text, BACKSTOP_TOP_N + 1, abort.signal);
        if (!isCurrentTranscript() || lockingRef.current) return;
        if (!textCandidates) {
          setDetail('Search is not available right now. Press Stop and try again.');
          return;
        }
        const curId = currentShabadIdRef.current;
        const tiedLeaderIds = new Set();
        if (
          textCandidates.length > 1 &&
          Math.abs(textCandidates[0].score - textCandidates[1].score) < 1e-9
        ) {
          textCandidates.forEach((candidate) => {
            if (Math.abs(candidate.score - textCandidates[0].score) < 1e-9) {
              tiedLeaderIds.add(candidate.shabadId);
              bsWinsRef.current.delete(candidate.shabadId);
            }
          });
        }
        const hypFull = vfNorm(text).slice(-SWITCH_HYP_SLICE); // recent decoded audio
        // Current shabad scored from the cursor, candidates scored across all
        // their lines (a new shabad may be entered anywhere, usually its start).
        const sCurWindow = cursorLineScore(
          hypFull,
          curLinesNormRef.current,
          curCursorRef.current,
          CUR_SCORE_BACK,
          CUR_SCORE_AHEAD,
        );
        // Defense against false switches on long kirtan: before a candidate can
        // out-score the current shabad, the current shabad is also judged across
        // ALL its lines (the rahao lives outside the cursor window when it is
        // re-sung) and with word order ignored (kirtan rotates phrases). The
        // candidate keeps its own scoring; only the bar it must clear is honest.
        const hypWordsNorm = tokenize(text).map(vfNorm).filter(Boolean);
        let curLinesAll = curLinesNormRef.current;
        let curWordsAll = curWordsNormRef.current;
        if (baniIdOf(curId) != null && curCursorRef.current != null && curLinesAll) {
          const from = Math.max(0, curCursorRef.current - BANI_CUR_SPAN);
          const to = curCursorRef.current + BANI_CUR_SPAN + 1;
          curLinesAll = curLinesAll.slice(from, to);
          curWordsAll = (curWordsAll || []).slice(from, to);
        }
        const sCurAll = Math.max(
          maxLineScore(hypFull, curLinesAll, SWITCH_CAND_MIN_LINE_CHARS),
          orderFreeLineScore(hypWordsNorm, curWordsAll, SWITCH_CAND_MIN_LINE_CHARS),
        );
        const sCurFull = Math.max(sCurWindow, sCurAll);
        const acousticCfg = {
          min: SWITCH_ACOUSTIC_MIN,
          margin: SWITCH_ACOUSTIC_MARGIN,
          strongMin: SWITCH_STRONG_MIN,
          strongMargin: SWITCH_STRONG_MARGIN,
          hypLen: hypFull.length,
          hypMin: SWITCH_HYP_MIN,
        };
        const stepSlot = (slot, sCand) => {
          // Suppress confirmation only for identities in the tied leader set.
          const vetoed =
            !!(vetoRef.current && vetoRef.current.id === slot.shabadId) ||
            !!(curBaniShabadsRef.current && curBaniShabadsRef.current.has(slot.shabadId)) ||
            // Another copy of the same Gurbani is not a new shabad: same words on screen.
            knownSame(curId, slot.shabadId);
          if (tiedLeaderIds.has(slot.shabadId) || vetoed) {
            slot.wins = 0; // eslint-disable-line no-param-reassign
            slot.lastScore = sCand; // eslint-disable-line no-param-reassign
            return false;
          }
          const step = nextSwitchWins(slot.wins, sCand, sCurFull, acousticCfg);
          slot.wins = step.wins; // eslint-disable-line no-param-reassign
          // Held decodes judged nothing — keep showing the last judged score.
          if (!step.held) slot.lastScore = sCand; // eslint-disable-line no-param-reassign
          return slot.wins >= SWITCH_CONFIRM;
        };
        const decaySlot = (slot) => {
          slot.wins = Math.max(0, slot.wins - 1); // eslint-disable-line no-param-reassign
          return slot.wins === 0;
        };

        // --- Slot 1: the vote detector's loudest DIFFERENT shabad. ---
        const contender = ranked.find(([sid, v]) => sid !== curId && v >= SWITCH_CAND_MIN_VOTES);
        if (!contender) {
          // Nothing else looks plausible — wind down any in-flight evaluation.
          const scNone = switchCandRef.current;
          if (scNone && decaySlot(scNone)) switchCandRef.current = null;
        } else {
          const contId = contender[0];
          const row = rowByShabad.get(contId);
          if (!row || !row.verse) {
            // Corrupt vote payload: slot 1 sits this decode out, the backstop
            // below still runs.
            const scSkip = switchCandRef.current;
            if (scSkip && decaySlot(scSkip)) switchCandRef.current = null;
          } else {
            let sc = switchCandRef.current;
            if (!sc || sc.shabadId !== contId) {
              // New contender: kick off an async load of its lines; score next decode.
              sc = {
                shabadId: contId,
                verseId: row.verseId,
                verse: row.verse,
                linesNorm: null,
                wins: 0,
              };
              switchCandRef.current = sc;
              loadShabadProfile(contId)
                .then((p) => {
                  if (switchCandRef.current === sc) sc.linesNorm = p.linesNorm;
                })
                .catch(() => {
                  if (switchCandRef.current === sc) switchCandRef.current = null;
                });
            } else if (sc.linesNorm) {
              const sCand = maxLineScore(hypFull, sc.linesNorm, SWITCH_CAND_MIN_LINE_CHARS);
              sc.committed = stepSlot(sc, sCand);
            }
          }
        }

        // --- Slot 2: rescore full-text survivors against canonical lines.
        let bs = backstopRef.current;
        {
          const screened = textCandidates
            .filter((row) => row.shabadId !== curId)
            .slice(0, BACKSTOP_TOP_N)
            .map((row) => ({ id: row.shabadId, overlap: row.score }));
          const inScreen = new Set(screened.map((e) => e.id));
          if (bs && !inScreen.has(bs.shabadId)) {
            // Incumbent left the field: bank its wins (screen membership
            // flaps decode-to-decode on sung audio) and release the slot.
            bsWinsRef.current.set(bs.shabadId, bs.wins);
            bs = null;
            backstopRef.current = null;
          }
          // Decay banked wins for shabads out of the field (mirrors the
          // vote tally's fade so a stale leader can't haunt us).
          bsWinsRef.current.forEach((w, id) => {
            if (id !== (bs && bs.shabadId) && !inScreen.has(id)) {
              if (w <= 1) bsWinsRef.current.delete(id);
              else bsWinsRef.current.set(id, w - 1);
            }
          });
          if (!bs) {
            // A free slot must reconsider newly loaded profiles even when
            // the first retrieved ID and candidate count have not changed.
            const screenKey = screened.length ? `${screened[0].id}:${screened.length}` : '';
            if (screenKey) {
              bsAdoptKeyRef.current = screenKey;
              let top = null;
              screened.forEach(({ id }) => {
                const prof = lineCacheRef.current.get(id);
                if (prof && prof.linesNorm) {
                  const m = bestLineMatch(hypFull, prof.linesNorm, SWITCH_CAND_MIN_LINE_CHARS);
                  if (m.index >= 0 && (!top || m.s > top.m.s)) top = { id, prof, m };
                }
              });
              if (top) {
                const v = top.prof.verses[top.m.index] || {};
                bs = {
                  shabadId: top.id,
                  verseId: v.verseId,
                  verse: null, // ascii verse fetched once, at commit
                  display: top.prof.displayLines[top.m.index] || '',
                  linesNorm: top.prof.linesNorm,
                  // Keep matching lines and their canonical identities together
                  // while the shared cache can evict/reload this profile.
                  profile: top.prof,
                  wins: bsWinsRef.current.get(top.id) || 0,
                };
                backstopRef.current = bs;
                if (v.verseId) {
                  banidb
                    .getVerse(top.id, v.verseId)
                    .then((gv) => {
                      if (backstopRef.current === bs) bs.verse = gv;
                    })
                    .catch(() => {});
                }
              }
            }
          }
          // Kick off line loads for the top uncached survivors (bounded), and
          // cap the cache (insertion-ordered Map: oldest first).
          screened
            .filter(({ id }) => !lineCacheRef.current.has(id))
            .slice(0, BACKSTOP_MAX_LOADS)
            .forEach(({ id }) => {
              if (lineCacheRef.current.size >= BACKSTOP_CACHE_MAX) {
                const oldest = lineCacheRef.current.keys().next();
                if (!oldest.done) lineCacheRef.current.delete(oldest.value);
              }
              const cache = lineCacheRef.current;
              const pendingProfile = {}; // identity survives eviction/reload races
              cache.set(id, pendingProfile);
              loadShabadProfile(id)
                .then((q) => {
                  if (
                    session === sessionRef.current &&
                    cache === lineCacheRef.current &&
                    cache.get(id) === pendingProfile
                  )
                    cache.set(id, q);
                })
                .catch(() => {
                  if (cache.get(id) === pendingProfile) cache.delete(id);
                });
            });
          if (bs && bs.linesNorm) {
            const m = bestLineMatch(hypFull, bs.linesNorm, SWITCH_CAND_MIN_LINE_CHARS);
            if (m.index >= 0) {
              const prof = bs.profile;
              const v = prof.verses[m.index] || {};
              if (v.verseId) {
                bs.verseId = v.verseId;
                bs.display = prof.displayLines[m.index] || '';
              }
              bs.committed = stepSlot(bs, m.s);
              bsWinsRef.current.set(bs.shabadId, bs.wins);
            } else if (decaySlot(bs)) {
              bsWinsRef.current.delete(bs.shabadId);
              backstopRef.current = null;
              bs = null;
            }
          }
        }

        // --- Return slot: the shabad we just left, judged in its own slot. ---
        {
          const prev = prevShabadRef.current;
          if (
            prev &&
            prev.id !== curId &&
            !knownSame(prev.id, curId) &&
            prev.profile &&
            prev.profile.linesNorm
          ) {
            prev.decodesSince += 1;
            if (prev.decodesSince > RETURN_WINDOW_DECODES) {
              prevShabadRef.current = null;
              returnSlotRef.current = null;
            } else {
              let rs = returnSlotRef.current;
              if (!rs || rs.shabadId !== prev.id) {
                rs = { shabadId: prev.id, wins: 0, index: -1, lastScore: null };
                returnSlotRef.current = rs;
              }
              const m = bestLineMatch(hypFull, prev.profile.linesNorm, SWITCH_CAND_MIN_LINE_CHARS);
              if (m.index >= 0) {
                const step = nextSwitchWins(rs.wins, m.s, sCurFull, acousticCfg);
                rs.wins = step.wins;
                if (!step.held) {
                  rs.lastScore = m.s;
                  rs.index = m.index;
                }
              } else rs.wins = Math.max(0, rs.wins - 1);
              if (rs.wins >= RETURN_CONFIRM && rs.index >= 0 && !lockingRef.current) {
                const v = prev.profile.verses[rs.index] || {};
                let verse = null;
                try {
                  if (baniIdOf(prev.id) != null) {
                    verse = (prev.profile.rawLines || [])[rs.index] || null;
                  } else {
                    verse = v.verseId ? await banidb.getVerse(prev.id, v.verseId) : null;
                  }
                } catch (_) {
                  verse = null;
                }
                if (!isCurrentTranscript() || lockingRef.current || returnSlotRef.current !== rs)
                  return;
                if (verse) {
                  returnSlotRef.current = null;
                  autopilotLock({ shabadId: prev.id, verseId: v.verseId, verse });
                  return;
                }
              }
            }
          } else if (returnSlotRef.current) returnSlotRef.current = null;
        }

        // --- Panel feed: every candidate the judge scored this decode. ---
        {
          if (vetoRef.current) {
            vetoRef.current.left -= 1;
            if (vetoRef.current.left <= 0) vetoRef.current = null;
          }
          const live = [];
          const sc = switchCandRef.current;
          const bsl = backstopRef.current;
          const rsl = returnSlotRef.current;
          const prevS = prevShabadRef.current;
          if (sc && sc.lastScore != null) {
            live.push({
              shabadId: sc.shabadId,
              verseId: sc.verseId,
              line: anvaad.unicode(sc.verse || ''),
              score: sc.lastScore,
              wins: sc.wins,
              needed: SWITCH_CONFIRM,
              kind: 'vote',
            });
          }
          if (bsl && bsl.lastScore != null && !live.some((x) => x.shabadId === bsl.shabadId)) {
            live.push({
              shabadId: bsl.shabadId,
              verseId: bsl.verseId,
              line: bsl.display || '',
              score: bsl.lastScore,
              wins: bsl.wins,
              needed: SWITCH_CONFIRM,
              kind: 'acoustic',
            });
          }
          if (
            rsl &&
            prevS &&
            rsl.shabadId === prevS.id &&
            rsl.lastScore != null &&
            !live.some((x) => x.shabadId === rsl.shabadId)
          ) {
            const lines = (prevS.profile && prevS.profile.displayLines) || [];
            live.push({
              shabadId: rsl.shabadId,
              verseId: ((prevS.profile && prevS.profile.verses[rsl.index]) || {}).verseId,
              line: lines[rsl.index] || '',
              score: rsl.lastScore,
              wins: rsl.wins,
              needed: RETURN_CONFIRM,
              kind: 'return',
            });
          }
          if (curBaniShabadsRef.current) {
            for (let i = live.length - 1; i >= 0; i -= 1) {
              if (curBaniShabadsRef.current.has(live[i].shabadId)) live.splice(i, 1);
            }
          }
          live.sort((a, b) => b.wins - a.wins || b.score - a.score);
          // Board: every decode, the current Shabad's score and every challenger's score.
          if (hypFull.length >= SWITCH_HYP_MIN) {
            boardRef.current.follow({
              now: Date.now(),
              cur: currentShabadIdRef.current,
              sCur: sCurFull,
              cands: live,
            });
          } else boardRef.current.hold(Date.now());
          publishBoard();
          // Gate for the panel: only candidates that clear the judge's own
          // minimum match (the bar a win needs), and nothing at all while the
          // heard fragment is too thin to judge (silence, a breath, a pause) —
          // so the list is empty when nobody is singing and never shows junk.
          const speaking = hypFull.length >= SWITCH_HYP_MIN;
          const next = speaking
            ? live.filter((x) => x.score >= SWITCH_ACOUSTIC_MIN).slice(0, 3)
            : [];
          // Publish only when the picture changed (ids or wins), and at most
          // ~3x/s: the recognizer shares this thread, so needless re-renders
          // of the panel cost decode latency.
          const sig = next.map((x) => `${x.shabadId}:${x.wins}`).join('|');
          const now = Date.now();
          if (sig !== liveSigRef.current || now - liveAtRef.current > 1500) {
            liveSigRef.current = sig;
            liveAtRef.current = now;
            setLiveCands({ sCur: sCurFull, items: next });
          }
        }

        // --- Finish: commits first, then one shared UI from the leader. ---
        const vote = switchCandRef.current;
        const bgp = backstopRef.current;
        if (vote && vote.committed && !lockingRef.current) {
          autopilotLock({ shabadId: vote.shabadId, verseId: vote.verseId, verse: vote.verse });
          return;
        }
        if (bgp && bgp.committed && !lockingRef.current) {
          let { verse } = bgp;
          try {
            verse = (await banidb.getVerse(bgp.shabadId, bgp.verseId)) || verse;
          } catch (_) {
            /* fall back to whatever verse payload we have */
          }
          if (!isCurrentTranscript() || lockingRef.current || backstopRef.current !== bgp) {
            return;
          }
          if (!verse) return; // verse still unfetchable: keep the won slot, retry next decode
          backstopRef.current = null;
          autopilotLock({ shabadId: bgp.shabadId, verseId: bgp.verseId, verse });
          return;
        }
        if (!vote && !bgp) {
          // No live evaluation on either slot — rest the switch UI.
          setSwitchView(null);
          setCands([]);
          setDetail('Following');
          // The evaluation died without committing: come back from seeking.
          if (seekingRef.current) {
            seekingRef.current = false;
            try {
              setIsMiscSlide(false);
            } catch (_) {
              // Store unavailable here; the seeking flag above already prevents leaks.
            }
          }
          return;
        }
        // Leader for display: most wins; the vote slot breaks ties (as before).
        const leadSlot = bgp && bgp.wins > (vote ? vote.wins : -1) ? bgp : vote;
        if (leadSlot.lastScore == null) return; // still loading its lines; keep prior UI
        if (
          seekingRef.current &&
          hypFull.length >= SWITCH_HYP_MIN &&
          leadSlot.wins === 0 &&
          sCurFull >= SWITCH_ACOUSTIC_MIN &&
          sCurFull - leadSlot.lastScore >= SWITCH_ACOUSTIC_MARGIN
        ) {
          seekingRef.current = false;
          try {
            setIsMiscSlide(false);
          } catch (_) {
            /* Closing store. */
          }
        }
        const leadDisplay = leadSlot.display || anvaad.unicode(leadSlot.verse || '');
        // Surface the live comparison so the presenter can see a new shabad being
        // considered (candidate line + how strongly it matches vs. the current one).
        setSwitchView({
          shabadId: leadSlot.shabadId,
          cand: leadDisplay,
          sCand: leadSlot.lastScore,
          sCur: sCurFull,
          wins: Math.min(leadSlot.wins, SWITCH_CONFIRM),
        });

        // The evaluation is live (candidate lines loaded), so keep the candidate
        // on screen even at 0 wins — a single non-winning decode mid-transition
        // must not wipe the words the user is watching. The entry only clears
        // when the evaluation itself winds down (slots cleared above).
        // The bar fills with confirmation progress — never a full bar before
        // any win, so an unconfirmed contender can't read as certain.
        if (leadSlot.verse) {
          setCands([
            {
              shabadId: leadSlot.shabadId,
              verseId: leadSlot.verseId,
              verse: leadSlot.verse,
              display: leadDisplay,
              share: leadSlot.wins / SWITCH_CONFIRM,
            },
          ]);
        }
        if (leadSlot.wins >= 1) {
          setDetail('Checking a new Shabad');
          // Genuinely torn between the current shabad and this contender: put
          // up the Waheguru seeking slide instead of a possibly-wrong shabad.
          // Gated on wins >= 2 (a single winning decode flickers too much to
          // flip the projector on), only when no misc slide is already showing
          // (never cover the user's own slide), and only once per evaluation.
          if (leadSlot.wins >= 2 && !seekingRef.current && !isMiscSlideRef.current) {
            seekingRef.current = true;
            sessionLog.logEvent('seeking', {
              session: sessionIdRef.current,
              visible: true,
              from: currentShabadIdRef.current,
            });
            try {
              setMiscSlideText(slideStrings.waheguru);
              setIsMiscSlide(true);
            } catch (_) {
              seekingRef.current = false;
            }
          }
        } else {
          setDetail('Listening');
        }
        return;
      }

      if (lead >= AUTO_LOCK_CONF && best >= DETECT_MIN_EVIDENCE && st.count >= DETECT_STABLE) {
        lockOnto(cand);
      }
    },
    [
      lockOnto,
      autopilotLock,
      loadShabadProfile,
      searchCanonicalText,
      setIsMiscSlide,
      setMiscSlideText,
    ],
  );

  // Start a blind-detect session: same mic pipeline as start(), but we run the
  // free-decode recognizer in-process and identify + open the shabad ourselves.
  const startDetect = useCallback(async () => {
    cleanup();
    const session = sessionRef.current;
    recognizingRef.current = true;
    contextEvidenceRef.current = null;
    detectVotesRef.current = new Map();
    detectRowsRef.current = new Map();
    detectStableRef.current = { id: null, count: 0 };
    emptyStreakRef.current = 0;
    lastVerseRef.current = null;
    setPos(null);
    setCands([]);
    setStatus('detecting');
    setDetail('Listening for the Shabad');

    // First run only: ensure the model is present + the ONNX session is loaded.
    if (!engine.isReady()) {
      setDetail('Downloading the voice model (184 MB, one time)');
      setDlProgress(0);
    }
    try {
      await engine.ready((p) => {
        if (session !== sessionRef.current) return;
        setDlProgress(p);
        setDetail(`downloading recognition model… ${Math.round(p * 100)}% (one time)`);
      });
    } catch (e) {
      if (session !== sessionRef.current) return;
      setStatus('error');
      setDetail(`could not prepare the recognition model: ${e?.message || e}`);
      setDlProgress(null);
      recognizingRef.current = false;
      return;
    }
    if (session !== sessionRef.current) return;
    setDlProgress(null);
    if (!recognizingRef.current) return; // stopped during the download

    let sampleRate;
    try {
      sampleRate = await startAudio(async (pcm) => {
        const r = recognizerRef.current;
        if (!r || !recognizingRef.current) return;
        const out = await r.push(pcm);
        if (session !== sessionRef.current || recognizerRef.current !== r) return;
        if (out && out.text) {
          noteHeard(out.text, out.confidence);
          handleTranscript(out.text);
        }
      });
    } catch (e) {
      if (session !== sessionRef.current) return;
      setStatus('error');
      setDetail(e?.message || 'audio setup failed');
      recognizingRef.current = false;
      cleanup();
      return;
    }

    if (session !== sessionRef.current) return;
    try {
      const recognizer = await engine.createRecognizer({ inputSr: sampleRate });
      if (session !== sessionRef.current) return;
      recognizerRef.current = recognizer;
    } catch (e) {
      if (session !== sessionRef.current) return;
      setStatus('error');
      setDetail(`engine init failed: ${e?.message || e}`);
      recognizingRef.current = false;
      cleanup();
      return;
    }
    setDetail('Listening');
  }, [cleanup, startAudio, handleTranscript]);

  // One-press hands-free mode. A single continuous mic session: detect a shabad,
  // follow it, and when the singer moves to a different shabad (the follower
  // releases), automatically find and project the next one — no clicks, no
  // confirmations, no person needed at the computer.
  const startAutopilot = useCallback(async () => {
    cleanup();
    const session = sessionRef.current;
    autopilotRef.current = true;
    recognizingRef.current = true;
    phaseRef.current = 'searching';
    lockingRef.current = false;
    currentShabadIdRef.current = null;
    curLinesNormRef.current = [];
    curWordsNormRef.current = [];
    curProfileRef.current = null;
    curBaniShabadsRef.current = null;
    setLiveCands({ sCur: 0, items: [] });
    boardRef.current.reset();
    setBoard([]);
    vetoRef.current = null;
    prevShabadRef.current = null;
    returnSlotRef.current = null;
    curCursorRef.current = null;
    switchCandRef.current = null;
    backstopRef.current = null;
    bsWinsRef.current.clear();
    bsAdoptKeyRef.current = '';
    setSwitchView(null);
    contextEvidenceRef.current = null;
    detectVotesRef.current = new Map();
    detectRowsRef.current = new Map();
    detectStableRef.current = { id: null, count: 0 };
    emptyStreakRef.current = 0;
    lastVerseRef.current = null;
    setPos(null);
    setCands([]);
    setStatus('detecting');
    setDetail('Starting');
    sessionIdRef.current = Date.now();
    sessionStartRef.current = Date.now();
    sessionLog.logEvent('session_start', {
      session: sessionIdRef.current,
      saveAudio: saveAudioRef.current,
    });

    if (!engine.isReady()) {
      setDetail('Downloading the voice model (184 MB, one time)');
      setDlProgress(0);
    }
    try {
      await engine.ready((p) => {
        if (session !== sessionRef.current) return;
        setDlProgress(p);
        setDetail(`downloading recognition model… ${Math.round(p * 100)}% (one time)`);
      });
    } catch (e) {
      if (session !== sessionRef.current) return;
      setStatus('error');
      setDetail(`could not prepare the recognition model: ${e?.message || e}`);
      setDlProgress(null);
      autopilotRef.current = false;
      recognizingRef.current = false;
      return;
    }
    if (session !== sessionRef.current) return;
    setDlProgress(null);
    if (!autopilotRef.current) return; // stopped during the download
    ensureFlIndex(); // prepare the corpus while capture starts; never block audio

    let sampleRate;
    try {
      sampleRate = await startAudio(async (pcm) => {
        if (!autopilotRef.current) return;
        {
          const sr = sampleRateRef.current || 48000;
          if (!ringRef.current || ringRef.current.sampleRate !== sr) {
            ringRef.current = sessionLog.createRing(CORRECTION_SECONDS, sr);
          }
          ringRef.current.push(pcm);
        }
        // Detection runs on EVERY chunk, in both phases. This is what makes
        // autopilot un-stuck: the moment a different shabad clearly takes over,
        // handleTranscript switches us — we no longer depend on the follower
        // releasing (it often won't, because Gurbani lines share words).
        const r = recognizerRef.current;
        if (r) {
          const rout = await r.push(pcm);
          if (session !== sessionRef.current || recognizerRef.current !== r) return;
          if (rout && rout.text) {
            noteHeard(rout.text, rout.confidence);
            handleTranscript(rout.text);
          }
        }
        // While following, also advance the follower for the live line/word cursor.
        if (phaseRef.current === 'following') {
          const f = followerRef.current;
          if (!f) return; // still building the follower after a lock/switch
          const out = await f.push(pcm);
          // A late result belongs to the follower that produced it, not a new
          // Shabad/session selected while inference was in flight.
          if (!out || followerRef.current !== f || !autopilotRef.current || lockingRef.current) {
            return;
          }
          // Follower released (singer paused, or moved on): hold on screen —
          // the acoustic switch test handles a real move to another shabad.
          if (out.lineIndex == null || out.verseIndex === -1) return;
          // Remember where we are so the switch test can score the current shabad
          // relative to the cursor (not as a global max over all its lines).
          curCursorRef.current = out.lineIndex;
          // Don't chase the highlight onto a similar-worded line of the OLD shabad:
          // hold position on low-confidence frames, and freeze entirely while a
          // switch is being evaluated (the current shabad is likely being left).
          const evaluatingSwitch = switchCandRef.current && switchCandRef.current.wins >= 1;
          if (evaluatingSwitch || out.confidence < UI_MOVE_CONF) return;
          setPos({
            lineIndex: out.lineIndex,
            wordIndex: out.wordIndex,
            confidence: out.confidence,
            shabadId: currentShabadIdRef.current,
          });
          if (out.verseId != null && out.verseId !== lastVerseRef.current) {
            lastVerseRef.current = out.verseId;
            setActiveVerseId(out.verseId);
            setLineNumber(out.lineIndex + 1);
          }
          // Straight-through reading of a Rehras or Sohila shabad: open the Bani.
          const sid = currentShabadIdRef.current;
          if (seqReadRef.current.id !== sid) {
            seqReadRef.current = {
              id: sid,
              last: -1,
              lines: new Set(),
              fired: false,
              aarti: false,
            };
          }
          const sr = seqReadRef.current;
          if (
            typeof sid === 'number' &&
            !PAATH_SKIP_SHABADS.has(sid) &&
            !sr.fired &&
            out.lineIndex !== sr.last
          ) {
            if (out.lineIndex < sr.last) {
              sr.lines = new Set();
              // Sung, not read (a line came back): a shabad that is a copy of an Aarti piece
              // (Sohila's Gagan mai thaal) is the Aarti being sung, so open the Aarti Bani at
              // this line; from inside the Bani the next pieces follow without a new search.
              if (!sr.aarti) {
                sr.aarti = true;
                const lineText = (curProfileRef.current?.rawLines || [])[out.lineIndex];
                getBaniIndex()
                  .then(async (index) => {
                    const own = (index.byShabad.get(sid) || []).map((x) => x.bani);
                    let copies = null;
                    if (!own.includes(AARTI_BANI))
                      copies = await paathCopies(sid, index).catch(() => null);
                    const inAarti = own.includes(AARTI_BANI) || (copies && copies.has(AARTI_BANI));
                    if (
                      !inAarti ||
                      !lineText ||
                      session !== sessionRef.current ||
                      !autopilotRef.current ||
                      lockingRef.current ||
                      currentShabadIdRef.current !== sid ||
                      !autopilotLockRef.current
                    ) {
                      return;
                    }
                    // The Aarti row with this line's text (the copy's own verse id differs).
                    const prof = await loadBaniProfile(AARTI_BANI);
                    const want = vfNorm(anvaad.unicode(lineText));
                    let at = prof.rawLines.findIndex((l) => vfNorm(anvaad.unicode(l)) === want);
                    if (at < 0)
                      at = prof.rawLines.findIndex(
                        (l) => partialRatio(vfNorm(anvaad.unicode(l)), want) >= 90,
                      );
                    if (at < 0 || currentShabadIdRef.current !== sid || lockingRef.current) return;
                    autopilotLockRef.current(
                      {
                        shabadId: `${BANI_KEY}${AARTI_BANI}`,
                        verseId: prof.verses[at].verseId,
                        verse: prof.rawLines[at],
                      },
                      { promote: true },
                    );
                  })
                  .catch(() => {});
              }
            }
            sr.lines.add(out.lineIndex);
            sr.last = out.lineIndex;
            if (sr.lines.size >= PAATH_READ_LINES) {
              sr.fired = true;
              const { verseId } = out;
              const verse = (curProfileRef.current?.rawLines || [])[out.lineIndex];
              getBaniIndex()
                .then(async (index) => {
                  const copies = await paathCopies(sid, index).catch(() => new Map());
                  const banis = [
                    ...new Set([
                      ...(index.byShabad.get(sid) || []).map((x) => x.bani),
                      ...copies.keys(),
                    ]),
                  ]
                    .filter((b) => PAATH_READ_BANIS.includes(b))
                    .filter(
                      (b) =>
                        b !== REHRAS_BANI ||
                        !index.rehrasUser ||
                        index.rehrasUser.has(sid) ||
                        REHRAS_READ_OPENING.has(sid),
                    );
                  if (
                    banis.length !== 1 ||
                    !verse ||
                    session !== sessionRef.current ||
                    !autopilotRef.current ||
                    lockingRef.current ||
                    currentShabadIdRef.current !== sid ||
                    !autopilotLockRef.current
                  ) {
                    return;
                  }
                  autopilotLockRef.current(
                    { shabadId: `${BANI_KEY}${banis[0]}`, verseId, verse },
                    { promote: true },
                  );
                })
                .catch(() => {});
            }
          }
        }
      });
    } catch (e) {
      if (session !== sessionRef.current) return;
      setStatus('error');
      setDetail(e?.message || 'audio setup failed');
      autopilotRef.current = false;
      recognizingRef.current = false;
      cleanup();
      return;
    }
    if (session !== sessionRef.current) return;
    sampleRateRef.current = sampleRate;

    try {
      const recognizer = await engine.createRecognizer({
        inputSr: sampleRate,
        windowS: AP_SEARCH_WIN_S, // starts in the searching phase
        hopS: AP_REC_HOP_S,
      });
      if (session !== sessionRef.current) return;
      recognizerRef.current = recognizer;
    } catch (e) {
      if (session !== sessionRef.current) return;
      setStatus('error');
      setDetail(`engine init failed: ${e?.message || e}`);
      autopilotRef.current = false;
      recognizingRef.current = false;
      cleanup();
      return;
    }
    setDetail('Listening for the Shabad');
  }, [
    cleanup,
    startAudio,
    handleTranscript,
    enterSearching,
    ensureFlIndex,
    setActiveVerseId,
    setLineNumber,
  ]);

  // While listening, if the presenter switches to a different shabad or bani (via
  // any menu — search, history, favorites, arrows, bani picker), re-attach to the
  // new content so we stop matching against the previous one's lines.
  useEffect(() => {
    // Autopilot owns its own content switching within one continuous session —
    // never let the manual re-attach path tear it down.
    if (autopilotRef.current) return;
    const active = status === 'listening' || status === 'connecting';
    if (!active) return;
    if (isCeremonyBani) {
      // Switched to an unsupported content type — stop cleanly.
      stop();
      setStatus('error');
      setDetail("Voice-Follow supports Shabads and Banis — ceremonies aren't supported yet.");
      return;
    }
    let key = null;
    if (isSundarGutkaBani && sundarGutkaBaniId) key = `bani:${sundarGutkaBaniId}`;
    else if (activeShabadId) key = `shabad:${activeShabadId}`;
    if (key && key !== followingKeyRef.current) {
      start();
    }
  }, [activeShabadId, sundarGutkaBaniId, isSundarGutkaBani, isCeremonyBani, status, start, stop]);

  const listening = status === 'listening' || status === 'connecting';
  const detecting = status === 'detecting';
  const active = listening || detecting; // a session (follow or detect) is running
  // The floating widget is present whenever the tool is opened OR a session is
  // running (like Zoom's share bar, which persists independently of any menu).
  const present = isOpen || active;
  const panelVisible = present && !collapsed;

  // Opening from the toolbar mic (or the pill) always expands the panel.
  useEffect(() => {
    if (isOpen) setCollapsed(false);
  }, [isOpen]);

  // Dismiss the panel the easy ways: Esc or a click outside it. While a session
  // is running we collapse to the pill (never kill the live session); otherwise
  // we close the tool. Toolbar mic + pill are excluded so their own toggles
  // aren't double-fired.
  useEffect(() => {
    if (!panelVisible) return undefined;
    const dismiss = () => (active ? setCollapsed(true) : onScreenClose());
    const onKey = (e) => {
      if (e.key === 'Escape') dismiss();
    };
    const onDown = (e) => {
      const t = e.target;
      if (panelRef.current && panelRef.current.contains(t)) return;
      if (t && t.closest && t.closest('#toolbar, #toolbar-nav, #tool-voice-follow, #vf-pill'))
        return;
      dismiss();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [panelVisible, active, onScreenClose]);

  // Drag handle: mousedown on a widget's grip moves the whole widget. Records a
  // moved flag so a drag on the pill doesn't also fire its expand-on-click.
  const startDrag = useCallback((e) => {
    if (e.button !== 0) return;
    const el = e.currentTarget.closest('[data-vf-widget]');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    movedRef.current = false;
    // Coalesce moves to one state update per animation frame. Native mousemove
    // listeners don't batch, so an unthrottled setState-per-event is janky;
    // rAF caps it to ~60fps while keeping React the source of truth (so live
    // position re-renders during a session can't clobber the drag position).
    let pending = null;
    let raf = 0;
    const apply = () => {
      raf = 0;
      if (pending) setWidgetPos(pending);
    };
    const onMove = (m) => {
      movedRef.current = true;
      const maxLeft = window.innerWidth - w;
      const maxTop = window.innerHeight - h;
      pending = {
        left: Math.min(Math.max(0, m.clientX - offX), Math.max(0, maxLeft)),
        top: Math.min(Math.max(0, m.clientY - offY), Math.max(0, maxTop)),
      };
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onUp = () => {
      if (raf) cancelAnimationFrame(raf);
      if (pending) setWidgetPos(pending);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  }, []);

  // Once dragged, both widgets use the free position (and the caret that points
  // back at the mic no longer makes sense, so it's hidden).
  const posOverride = widgetPos
    ? { top: widgetPos.top, left: widgetPos.left, right: 'auto', bottom: 'auto' }
    : null;

  const posLine = pos && typeof pos.lineIndex === 'number' ? pos.lineIndex + 1 : null;
  const dot = (
    <span
      className={`vf-dot${active ? ' is-live' : ''}`}
      style={{ background: DOT[status] || '#888' }}
    />
  );

  // Human-readable status line (avoids surfacing internal states like "idle").
  const statusText =
    status === 'idle'
      ? 'Press Start for Gurbani Voice Follow'
      : `${STATUS_LABEL[status] || status}${detail ? ` · ${detail}` : ''}`;
  // Short label for the collapsed pill.
  let pillText = STATUS_LABEL[status] || 'Voice-Follow';
  if (status === 'listening') pillText = `Line ${posLine == null ? '—' : posLine}`;

  // Live stats (shown while listening). Word is 1-based like the line; confidence
  // reads as a friendly percentage.

  // Main button: Stop while a session runs, else Start. Autopilot is the default
  // hands-free experience; manual follow / one-shot detect are the fallbacks.
  let onMainClick = start;
  if (active) onMainClick = stop;
  else if (autopilot) onMainClick = startAutopilot;
  else if (autoDetect) onMainClick = startDetect;
  let mainLabel = 'Start';
  if (active) mainLabel = 'Stop';
  else if (autopilot) mainLabel = 'Start';
  else if (autoDetect) mainLabel = 'Start';

  let microphoneLabel = 'Ready';
  if (active) microphoneLabel = audioView.device ? 'Listening' : 'Preparing…';
  const currentLabel = isMiscSlide ? 'Slide held' : 'Following';
  // The line the follower is on right now (the follower indexes the same line
  // list as the profile), falling back to the lock line until the first fix.
  const profLines = (curProfileRef.current && curProfileRef.current.displayLines) || null;
  const posIsCurrent =
    pos && currentView && pos.shabadId === currentView.id && typeof pos.lineIndex === 'number';
  const liveLine =
    (posIsCurrent && profLines && profLines[pos.lineIndex]) ||
    (currentView && currentView.line) ||
    null;
  const lineNo = posIsCurrent ? pos.lineIndex + 1 : null;
  // Option: preview the next lines once the app is sure of the Shabad (>= 95%).
  let showNext = false;
  try {
    showNext = window.localStorage.getItem('vf-next-lines') === '1';
  } catch (e) {
    showNext = false;
  }
  const liveItems = currentView ? liveCands.items : [];
  // Lead for display = the candidate furthest along in confirmation (ties by score).
  const liveLead = liveItems.reduce((best, c) => (!best || c.wins > best.wins ? c : best), null);
  let changeLabel = 'Might be changing to';
  if (liveLead && liveLead.wins >= 2) changeLabel = 'Changing to';
  let judgeWord = 'Following';
  if (!currentView) judgeWord = 'Listening';
  else if (liveLead && liveLead.wins >= 2) judgeWord = 'Confirming a change';
  else if (liveLead && liveLead.wins >= 1) judgeWord = 'Checking';
  if (isMiscSlide) judgeWord = 'Holding a separate slide';
  // Live board: the current Shabad's calibrated % and the others in contention.
  const boardCur = currentView ? board.find((b) => b.role === 'current') : null;
  let cardStyle = 'wash';
  try {
    cardStyle = window.localStorage.getItem('vf-card-style') || 'wash';
  } catch (e) {
    cardStyle = 'wash';
  }
  const boardPct = (id) => {
    const b = board.find((x) => x.shabadId === id);
    return b ? b.pct : null;
  };
  const boardOthers = board
    .filter((b) => b.role !== 'current' && !(currentView && b.shabadId === currentView.id))
    .filter(
      (b) => !(currentView && liveLead && liveLead.wins >= 1 && b.shabadId === liveLead.shabadId),
    )
    .slice(0, 3)
    .map((b) => ({ ...b, line: (b.line || (b.verse ? anvaad.unicode(b.verse) : '')).trim() }));

  return (
    <>
      {/* Non-modal, draggable floating panel. No backdrop, so the Gurbani stays
          fully visible while you set up and sing. Drag it by the header. */}
      {panelVisible && (
        <div
          ref={panelRef}
          data-vf-widget
          data-vf-cards={cardStyle}
          className="vf-panel"
          style={posOverride || undefined}
        >
          {!widgetPos && <span className="vf-caret" />}
          <div className="vf-header" onMouseDown={startDrag} title="Drag to move">
            <span className="vf-title">
              <span className="vf-grip">⠿</span>
              <span className="vf-heading-copy">
                <span>Voice Follow</span>
                {!(active && currentView && judgeWord === 'Following') && (
                  <span className="vf-listening-label">
                    {active && currentView ? judgeWord : microphoneLabel}
                  </span>
                )}
              </span>
              {active && (
                <span
                  className="vf-mic-bars"
                  role="meter"
                  aria-label="Microphone sound level"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(audioView.level * 100)}
                  title={audioView.device || 'Microphone'}
                >
                  {[0.4, 0.7, 1, 0.8, 0.5].map((scale, index) => (
                    <span key={index} style={{ height: `${3 + 17 * scale * audioView.level}px` }} />
                  ))}
                </span>
              )}
            </span>
            <span className="vf-hdr-btns">
              <button
                type="button"
                className={`vf-hdr-btn vf-heard-toggle${showHeard ? ' is-on' : ''}`}
                title={showHeard ? 'Hide what Voice-Follow hears' : 'Show what Voice-Follow hears'}
                aria-label={showHeard ? 'Hide transcript' : 'Show transcript'}
                aria-pressed={showHeard}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={toggleHeard}
              >
                <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                  <path
                    d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                  <circle cx="8" cy="8" r="2" fill="currentColor" />
                  {!showHeard && (
                    <path d="M2.5 13.5 13.5 2.5" stroke="currentColor" strokeWidth="1.4" />
                  )}
                </svg>
              </button>
              <button
                type="button"
                className="vf-hdr-btn"
                title="Collapse to pill"
                aria-label="Collapse"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setCollapsed(true)}
              >
                –
              </button>
              <button
                type="button"
                className="vf-hdr-btn"
                title="Close (Esc)"
                aria-label="Close"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => (active ? setCollapsed(true) : onScreenClose())}
              >
                ×
              </button>
            </span>
          </div>

          {!autopilot && (
            <>
              <div className="vf-modes">
                {Object.keys(MODES).map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={active}
                    onClick={() => setMode(k)}
                    className={`vf-mode${mode === k ? ' is-active' : ''}`}
                  >
                    {MODES[k].label}
                  </button>
                ))}
              </div>

              <label
                className="vf-toggle"
                title="Identify the shabad from your voice, then follow it"
              >
                <input
                  type="checkbox"
                  checked={autoDetect}
                  disabled={active}
                  onChange={(e) => setAutoDetect(e.target.checked)}
                />
                <span>Auto&#8288;-detect the shabad from my voice</span>
              </label>
            </>
          )}

          {dlProgress != null && (
            <div className="vf-dl" title="Downloading the recognition model (one time)">
              <span className="vf-dl-bar" style={{ width: `${Math.round(dlProgress * 100)}%` }} />
            </div>
          )}

          {active && (
            <div className="vf2-body">
              {showHeard && (
                <div className="vf2-heard" title="The words Voice-Follow is hearing right now">
                  <span className="vf2-heard-label">Hearing</span>
                  <span className="vf2-heard-text" lang="pa">
                    {heard ? heard.split('\u0001')[0] : '…'}
                    {heard && heard.split('\u0001')[1] && (
                      <span className="vf2-heard-tentative"> {heard.split('\u0001')[1]}</span>
                    )}
                  </span>
                </div>
              )}
              <section
                className={`vf2-now${currentView ? ' is-following' : ' is-searching'}${
                  boardCur ? ` lvl-${pctLevel(boardCur.pct)}` : ''
                }`}
                style={boardCur ? pctVars(boardCur.pct) : undefined}
              >
                <div className="vf2-label" aria-live="polite">
                  <span className={`vf2-dot ${currentView ? 'is-on' : 'is-seeking'}`} />
                  <span className="vf2-label-text">{currentView ? currentLabel : 'Finding'}</span>
                  {currentView && lineNo != null && (
                    <span className="vf2-lineno">Line {lineNo}</span>
                  )}
                  {boardCur && <LivePct value={boardCur.pct} />}
                  {currentView && (
                    <button
                      type="button"
                      className="vf2-fold"
                      title={lineExpanded ? 'Show on one line' : 'Show the full line'}
                      aria-label={lineExpanded ? 'Collapse the line' : 'Expand the line'}
                      aria-expanded={lineExpanded}
                      onClick={() => setLineExpanded((v) => !v)}
                    >
                      {lineExpanded ? '−' : '+'}
                    </button>
                  )}
                </div>
                <div
                  className={`vf2-line${lineExpanded ? ' is-expanded' : ''}`}
                  lang="pa"
                  key={liveLine || 'none'}
                  role="button"
                  tabIndex={0}
                  title={lineExpanded ? 'Click to show on one line' : 'Click to show the full line'}
                  onClick={() => setLineExpanded((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setLineExpanded((v) => !v);
                  }}
                >
                  {liveLine || 'Listening…'}
                </div>
                {showNext &&
                  posIsCurrent &&
                  profLines &&
                  boardCur &&
                  boardCur.pct >= 0.95 &&
                  profLines.slice(pos.lineIndex + 1, pos.lineIndex + 3).map((l, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <div key={i} className="vf2-next-line" lang="pa">
                      {l}
                    </div>
                  ))}
                {boardCur && <LiveBar value={boardCur.pct} />}
              </section>

              {currentView && liveLead && liveLead.wins >= 1 && (
                <section
                  className={`vf2-change${liveLead.wins >= 2 ? ' is-confirming' : ''} is-tappable${
                    boardPct(liveLead.shabadId) != null
                      ? ` lvl-${pctLevel(boardPct(liveLead.shabadId))}`
                      : ''
                  }`}
                  aria-live="polite"
                  role="button"
                  tabIndex={0}
                  title="Tap to change to this Shabad now"
                  style={
                    boardPct(liveLead.shabadId) != null
                      ? pctVars(boardPct(liveLead.shabadId))
                      : undefined
                  }
                  onClick={() => pickCandidate(liveLead)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') pickCandidate(liveLead);
                  }}
                >
                  <div className="vf2-label">
                    <span className="vf2-dot is-seeking" />
                    {changeLabel}
                    {boardPct(liveLead.shabadId) != null ? (
                      <LivePct value={boardPct(liveLead.shabadId)} />
                    ) : (
                      <span className="vf2-cand-pct">
                        {Math.round((liveLead.score || 0) * 100)}% match
                      </span>
                    )}
                  </div>
                  <div className="vf2-cand-line" lang="pa">
                    {liveLead.line || '…'}
                  </div>
                  {boardPct(liveLead.shabadId) != null && (
                    <LiveBar value={boardPct(liveLead.shabadId)} />
                  )}
                </section>
              )}
              <details className="vf2-matches" open>
                <summary>
                  <svg
                    className="vf2-chevron"
                    viewBox="0 0 10 10"
                    width="10"
                    height="10"
                    aria-hidden="true"
                  >
                    <path
                      d="M3.5 2 6.5 5 3.5 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="vf2-summary-title">
                    {currentView ? 'Possible New Shabad' : 'Possible Shabad'}
                  </span>
                  {boardOthers.length > 0 && (
                    <span className="vf2-summary-count">{boardOthers.length}</span>
                  )}
                </summary>
                <div className="vf2-next" aria-live="polite">
                  {boardOthers.length === 0 && <div className="vf2-empty">None right now.</div>}
                  {boardOthers.length > 0 && (
                    <div className="vf2-next-hint">
                      {currentView
                        ? 'Tap a Shabad to switch to it'
                        : 'Fills as the match builds · tap to open'}
                    </div>
                  )}
                  {boardOthers.map((c) => (
                    <button
                      type="button"
                      className={`vf2-cand is-tappable lvl-${pctLevel(c.pct)}`}
                      key={c.shabadId}
                      style={pctVars(c.pct)}
                      onClick={() => pickCandidate(c)}
                      title={
                        currentView ? 'Tap to change to this Shabad now' : 'Tap to open this Shabad'
                      }
                    >
                      <div className="vf2-cand-row">
                        <span className="vf2-cand-line" lang="pa">
                          {c.line || '…'}
                        </span>
                        <LivePct value={c.pct} />
                      </div>
                      <LiveBar value={c.pct} />
                    </button>
                  ))}
                </div>
              </details>
            </div>
          )}
          <div className={`vf-compact-footer${active ? '' : ' is-idle'}`}>
            <button
              type="button"
              onClick={onMainClick}
              className={`vf-main ${active ? 'is-stop' : 'is-start'}`}
            >
              {mainLabel}
            </button>
          </div>
          {status !== 'listening' && !detecting && <div className="vf-status">{statusText}</div>}
        </div>
      )}

      {/* Collapsed state: a compact, draggable status pill. Click expands back
          to the panel; drag to reposition (a drag doesn't trigger the expand). */}
      {present && collapsed && (
        <button
          id="vf-pill"
          data-vf-widget
          type="button"
          className="vf-pill"
          style={posOverride || undefined}
          title="Voice-Follow — click to expand, drag to move"
          onMouseDown={startDrag}
          onClick={() => {
            if (movedRef.current) {
              movedRef.current = false;
              return;
            }
            setCollapsed(false);
            if (!isOpen) setOverlayScreen('voice-follow');
          }}
        >
          {dot}
          {pillText}
        </button>
      )}
    </>
  );
};

VoiceFollow.propTypes = {
  isOpen: PropTypes.bool,
  onScreenClose: PropTypes.func,
};

export default VoiceFollow;
