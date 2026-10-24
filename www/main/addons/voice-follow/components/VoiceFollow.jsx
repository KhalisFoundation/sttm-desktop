import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { useStoreState, useStoreActions } from 'easy-peasy';

import { filterRequiredVerseItems } from '../../../navigator/shabad/utils/filter-verse-items';
import { loadBani as loadBaniRows } from '../../../navigator/utils/load-bani';
import { useNewShabad } from '../../../navigator/search/hooks/use-new-shabad';
import updateMultipane from '../../../navigator/search/utils/update-multipane';
import { VoiceWave } from '../../../common/sttm-ui';
import { i18n } from '../../../common/i18n';
import { useAutopilotSlot } from './autopilotSlot';
import HwCheck from './HwCheck';

const anvaad = require('anvaad-js');
const { ipcRenderer, shell } = require('electron');
const banidb = require('../../../banidb');
const { slideStrings } = require('../../../common/constants/slidedb');
// In-process native engine (onnxruntime-node): no Python sidecar, no websocket.
const engine = require('../engine');
const { Follower: AcousticFollower } = require('../engine/follower');
const { SP: AcousticSP } = require('../engine/sentencepiece');
const { createRendererRetrieval } = require('../engine/retrieval/renderer-client');
const { createWarmIndex } = require('./warmIndex');
const sessionLog = require('../engine/session-log');
const { createBoard, mergeTranscript } = require('./liveBoard');
const { createShelf } = require('./candidateShelf');
const { installDemoAudio } = require('./devAudio');
const { vfAnalytics, createRunStats } = require('./vfAnalytics');

installDemoAudio(); // developer demos only (VF_DEMO_WAV); a no-op otherwise
const shadowBus = require('../shadow/bus');
const { diag } = require('../shadow/diag');
const { SHADOW_BUILD, SHADOW_CPU_PAUSE, SHADOW_CPU_RESUME } = require('../shadow/config');
const os = require('os'); // eslint-disable-line import/order
const fs = require('fs'); // eslint-disable-line import/order
const path = require('path'); // eslint-disable-line import/order

// Shadow mode (tester builds): Voice-Follow runs with no panel and never touches the
// screen; each thing it would show goes to the shadow bus, which scores it live against
// what the sevadaar shows by hand. These stand in for the screen actions.
const shadowSetVerse = (verseId) => shadowBus.system({ verseId });
const shadowNoop = () => {};
const shadowOpen = (shabadId, verseId) => shadowBus.system({ shabadId, verseId });
// Stands in for updatePane('bani', id, verseId): the Bani Voice-Follow would open.
const shadowOpenBani = (kind, baniId, verseId) =>
  shadowBus.system({ bani: baniId, shabadId: null, verseId: verseId ?? null, slide: null });
// Busy fraction of all cores between two os.cpus() samples (works on Windows too,
// where os.loadavg() is always 0).
const cpuSample = () =>
  os.cpus().reduce(
    (a, c) => {
      const t = c.times;
      const total = t.user + t.nice + t.sys + t.idle + t.irq;
      return { idle: a.idle + t.idle, total: a.total + total };
    },
    { idle: 0, total: 0 },
  );

// Warm model: load the speech model (ONNX session + the ~1-2 s performance self-test) in
// the background once per window, after the index is up or when the Autopilot tab is first
// shown, so Start never pays it. Idle priority, and not while the computer is busy (same
// bar as the hidden run's CPU guard). Only a model that is already on disk is loaded: the
// 184 MB download stays with the first Start (tester builds bundle the file).
const WARM_MODEL_DELAY_MS = 2000;
// A busy computer gets up to a minute of grace, then the model loads anyway (a Start would
// load it in the foreground otherwise). os.cpus() can read as fully busy inside a sandboxed
// renderer, so the guard delays the load; it never cancels it.
const WARM_MODEL_BUSY_RETRY_MS = 30000;
const WARM_MODEL_BUSY_RETRIES = 2;
let modelWarm = 'idle'; // 'idle' | 'scheduled' | 'done'
const atIdle = (fn) => {
  if (typeof window !== 'undefined' && window.requestIdleCallback) {
    window.requestIdleCallback(fn, { timeout: 5000 });
  } else {
    setTimeout(fn, 0);
  }
};
const warmModel = (delayMs = WARM_MODEL_DELAY_MS) => {
  if (modelWarm !== 'idle') return;
  if (!engine.isReady() || (engine.isLoaded && engine.isLoaded())) return;
  modelWarm = 'scheduled';
  const attempt = (tries) => {
    const a = cpuSample();
    setTimeout(() => {
      const b = cpuSample();
      const dt = b.total - a.total;
      const busy = dt > 0 ? 1 - (b.idle - a.idle) / dt : 0;
      if (busy > SHADOW_CPU_PAUSE && tries < WARM_MODEL_BUSY_RETRIES) {
        setTimeout(() => attempt(tries + 1), WARM_MODEL_BUSY_RETRY_MS);
        return;
      }
      atIdle(() => {
        const t0 = Date.now();
        engine.ready().then(
          () => {
            modelWarm = 'done';
            diag(`vf model warm in ${Date.now() - t0} ms (cpu busy ${Math.round(busy * 100)}%)`);
          },
          (e) => {
            modelWarm = 'idle'; // Start will try again and show the error itself
            diag(`vf model warm failed: ${(e && e.message) || e}`);
          },
        );
      });
    }, 1000);
  };
  setTimeout(() => attempt(0), delayMs);
};

// One warm retrieval index per window (warmIndex.js): built once the Gurbani database is
// ready, kept across Start/Stop, rebuilt only when the database changes or a build failed.
// The build time goes to errors.log so a slow machine shows in a tester's data.
const warmIndex = createWarmIndex({
  create: () => createRendererRetrieval(ipcRenderer),
  onReady: ({ ms, rows }) => {
    diag(`vf retrieval index ready in ${ms} ms (${rows} pangtis)`);
    if (SHADOW_BUILD && shadowBus.active()) shadowBus.note({ type: 'vf_retrieval_ready', ms });
    warmModel();
  },
  onError: (error, { ms }) => {
    const message = (error && error.message) || String(error);
    diag(`vf retrieval prepare failed after ${ms} ms: ${message}`);
    vfAnalytics.error('retrieval_prepare_failed');
    if (SHADOW_BUILD && shadowBus.active()) {
      shadowBus.note({ type: 'vf_retrieval_failed', stage: 'prepare', error: message });
    }
    warmModel();
  },
});
// The index worker reads these two files (engine/retrieval/read-corpus.js). Until the first
// database download has put them in place there is nothing to build; the download's
// 'sttm-database-updated' event (desktop_scripts.js) starts the build then.
const DATABASE_FILES = ['sttmdesktop-evergreen-v2.realm', 'realm-schema-evergreen.json'];
const databaseFilesPresent = () => {
  try {
    // eslint-disable-next-line global-require
    const dir = require('@electron/remote').app.getPath('userData');
    return DATABASE_FILES.every((f) => fs.existsSync(path.join(dir, f)));
  } catch (_) {
    return true; // outside Electron (tests): let the build itself decide
  }
};
const WARM_INDEX_DELAY_MS = 1500; // after the window's first paint

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
const { screenTakenByCeremony } = require('./autopilotScreen');
// Respecting the sevadaar's line moves (tag / adopt / hold), unit-tested in lineRespect.test.js.
const { createLineRespect, lineOfVerse } = require('./lineRespect');

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
// First-lock line evidence: two different verses of the Shabad, or one decisive decode
// (anchor). The panel's progress uses the same gate, so it only reaches 100% when a lock can
// fire (without it the bar stops at 70%). A one-verse route was tried for kirtan that dwells on
// one pangti (Fremont first locks 105 -> 40 s) but wrong-locked a Sep 27 Aarti clip (3732 for
// 8875) that no text-only check separated; it needs an independent (acoustic) check first.
const lineEvidenceOk = (c) => c.anchor || c.verses.size >= 2;
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
// Audio the engines have not consumed yet is a backlog: recognised text (and the screen)
// is that far behind the room. On a computer that decodes slower than real time it
// would grow without limit (5-10 s per minute at a Gurdwara PC, 50-84 s by the end of a
// Bani) and only a Stop/Start cleared it. Past this bound every chunk still waiting is
// handed to the engines in ONE push: their sliding windows stay contiguous (no audio is
// dropped, so no spliced window can match a wrong page) and each decodes once, on the
// newest window, instead of once per hop over audio that is already stale.
const AUDIO_BACKLOG_S = 1.0;
const AUDIO_BACKLOG_NOTE_MS = 10000; // backlog events at most this often

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
// Akhand Paath (Sri Guru Granth Sahib Ji read Ang after Ang, Akhand or Sehaj Paath): a
// plain Shabad of no Bani read straight through, line after line, at a reading pace. From
// then on the paath follower carries a reading window: this Shabad and the next ones of
// Sri Guru Granth Sahib Ji (consecutive ids), listens on engine/pace's Akhand Paath schedule
// (twice as often, same model work), and crossing into the next Shabad opens it on the spot
// (no search, no judge, no new follower: the window moves on underneath).
// No button. Ends on a judge switch outside the window, on lines coming back (sung, not
// read), and on Stop. Nothing else changes: Banis, kirtan and sung Bani never enter it.
const PAATH_SEQ_LINES = 6; // distinct lines read in order before Akhand Paath following starts
const PAATH_SEQ_WPS = 1.2; // ...at this many words per second at least (kirtan sung straight through: 0.6-1.0)
const PAATH_SEQ_PACE_LINES = 2; // lines the pace is measured over at least
// A slow reader (a Gatha, Saloks read with care): this many distinct lines in order, none
// ever coming back, is a reading at any pace (kirtan returns to its rahao long before).
const PAATH_SEQ_LINES_SLOW = 12;
const PAATH_SEQ_AHEAD = 2; // Shabads ahead of the current one in the reading window
const PAATH_SEQ_CROSS = 2; // fixes inside the next Shabad before it opens (unless stepped into)...
const PAATH_SEQ_CROSS_MS = 1500; // ...spread over at least this long (one look-alike line is not a crossing)
const PAATH_SEQ_SKIP = 4; // a Shabad skipped over (not the very next one) needs more fixes...
const PAATH_SEQ_SKIP_MS = 8000; // ...over at least this long
// STTM's Banis that are whole sections of Sri Guru Granth Sahib Ji (the Bhagat Bani of each
// Raag, the Vaars; not Asa di Vaar, which is sung): two of their Shabads READ in order (the
// first at a reading pace) are Akhand Paath going through that section, so the reading
// window follows them instead of the Bani.
const AKHAND_SECTION_BANIS = new Set([
  ...Array.from({ length: 22 }, (_, i) => 55 + i), // 55-76: Raag Banis
  86,
  87,
  88,
  89,
  ...Array.from({ length: 17 }, (_, i) => 91 + i), // 91-107: Vaars
]);
const PAATH_SEQ_BACKS = 2; // moves back of 2+ pangtis that end it (kirtan returns; a reader rarely does)
const PAATH_SEQ_OFF = { on: false, streak: 0, backs: 0, cross: { sid: null, n: 0 }, back: null };
const PAATH_SEQ_BACK_FIXES = 4; // confident fixes in the Shabad just left...
const PAATH_SEQ_BACK_MS = 3000; // ...over at least this long: go back to it
// A move back of two pangtis or more from `prev` (the last line followed) to `line`.
const prev2Back = (prev, line) => prev != null && line < prev - 1;
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
// Rehras is followed at the extra-long length by default: it contains every shorter
// Rehras (the long readers' opening "Har jug jug bhagat upaya" and its salok, the extra
// Dasam shabads) plus the Chaupai pauris and dohras some gurdwaras (Renton) read; a
// reader of any length is then followed from the first line, and the paath follower
// steps over the lines a shorter reader leaves out. (The Taksal list's only lines the
// extra-long one lacks are three headers and a repeated dohra.) While Rehras is open the
// Bani length is raised to this (never lowered) and restored when it ends.
const REHRAS_BANI = 21;
const REHRAS_LENGTH = 'extralong';
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
// Stop never moves the screen: the length Voice-Follow raised for a Bani (Rehras long,
// Aarti extra-long) stays while that Bani is still up, because putting the user's length
// back reloads the Bani and the pane jumps to its first line (Renton, Oct 2026: a
// sevadaar pressed Stop mid-Rehras and had to scroll back down to the line). The user's
// length comes back once the screen has moved on. pending = { prev, to, baniId }.
//   'keep'    the raised Bani is still on screen at the raised length: leave it.
//   'restore' the screen shows something else now: put the user's length back.
//   'drop'    the length was changed by hand since: the user's choice stands.
const PENDING_LENGTH_KEY = 'vf-length-restore';
export const pendingLengthAction = (pending, nav) => {
  if (!pending) return 'keep';
  if (nav.baniLength && pending.to && nav.baniLength !== pending.to) return 'drop';
  const sameBani =
    nav.isSundarGutkaBani && !nav.isCeremonyBani && nav.sundarGutkaBaniId === pending.baniId;
  return sameBani ? 'keep' : 'restore';
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
// True when the full-text search (the entries the context lock tallies) recently put a
// shabad of `bani` among its leaders with a real score.
function poolTextAgrees(bani, index, memory) {
  const entries = (memory && memory.entries) || [];
  return entries.some((e) =>
    e.candidates.some(
      (c) =>
        c.score >= PAATH_POOL_TEXT_MIN &&
        (index.byShabad.get(c.shabadId) || []).some((x) => x.bani === bani),
    ),
  );
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
// Volume label lines (mic loudness as rms of the raw signal, 0..1; no gain control is applied):
// below SILENT = no sound, below GOOD = low, below GREAT = good, above = great.
// The label reads the louder moments (80th percentile of 250 ms windows over the last 4 s),
// so pauses between lines don't pull it down. Set from bench recordings while singing: the
// home laptop test that followed well ~0.009 (good), Fremont laptop mic 0.03-0.19, Renton
// hall feed 0.06-0.5 (good to great).
const VOL_SILENT_RMS = 0.0005; // about -66 dBFS: nothing reaches the app (needs 8 s of it)
const VOL_GOOD_RMS = 0.004; // about -48 dBFS: below this the mic is too quiet
const VOL_GREAT_RMS = 0.1; // about -20 dBFS: a strong, clear feed
const VOL_LEVEL_WINDOWS = 16; // 4 s of 250 ms windows for low / good / great
const VOL_SILENT_WINDOWS = 32; // 8 s of silence before "No sound" (a pause is not a dead mic)
const VOL_ORDER = ['none', 'low', 'good', 'great'];
const HEARD_MIN_CONF = 0.88; // what-it-hears strip: below this the text is letters, not words
const HEARD_KEYS_KEEP = 14; // recent heard words kept for marking matches in candidate lines
// Recognizer spellings are loose: ignore a final short vowel, fold ਣ/ਨ and the nukta, and
// count a word as matched when most of it agrees with a word of the line.
const wordKey = (w) =>
  engine
    .norm(w)
    .replace(/[\u0a3f\u0a41]$/, '')
    .replace(/\u0a23/g, '\u0a28')
    .replace(/\u0a3c/g, '');
const commonPrefix = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
};
const wordMatches = (k, l) =>
  k.length >= 2 &&
  (l === k || commonPrefix(k, l) >= Math.max(4, Math.ceil(0.7 * Math.min(k.length, l.length))));
const lineWordsOf = (line) =>
  (line || '')
    .replace(/[।॥|0-9੦-੯.,;:!?-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
// Gurbani is shown in the app's Gurmukhi font (the .gurmukhi class), which is ASCII-encoded.
// The engine works in Unicode, so text is converted only for display.
const toAkhar = (uni) => (uni ? anvaad.unicode(uni, true) : '');
// Gurbani in the app's Gurmukhi font.
const Gurmukhi = ({ text }) => <span className="gurmukhi">{toAkhar(text)}</span>;
Gurmukhi.propTypes = { text: PropTypes.string };
// A line with the heard words in bold, so a candidate shows why it is there.
const MarkedLine = ({ line, keys }) => {
  const words = lineWordsOf(line);
  if (!keys.length || !words.length) return <Gurmukhi text={line} />;
  return (
    <span className="gurmukhi">
      {words.map((w, i) => {
        const hit = keys.some((k) => wordMatches(k, wordKey(w)));
        return (
          // eslint-disable-next-line react/no-array-index-key
          <span key={i} className={hit ? 'vf2-hl' : ''}>
            {i ? ' ' : ''}
            {toAkhar(w)}
          </span>
        );
      })}
    </span>
  );
};
MarkedLine.propTypes = { line: PropTypes.string, keys: PropTypes.arrayOf(PropTypes.string) };
MarkedLine.defaultProps = { line: '', keys: [] };
const HEARD_CLEAR_MS = 5000; // strip empties after this long without a confident word
const BOARD_LOG_MS = 1000; // session log: the candidate list at most once a second, on change
// The pangti a candidate card shows: the line it was heard on, else its first verse.
const cardLine = (b) => (b.line || (b.verse ? anvaad.unicode(b.verse) : '')).trim();
const HEARD_TENTATIVE_WORDS = 2; // the tail of a decode is still being sung: not merged until it settles
const HEARD_SHOW_WORDS = 10; // the strip shows this many settled words, newest always in view
const RATING_ASK_MS = 20000; // after Stop, the one-tap rating stays for this long
const HEARTBEAT = false; // the slow breath of the current card: off (not an agreed design)
const HEARTBEAT_MIN_SCORE = 0.5; // current-line match score that counts as a beat
const HEARTBEAT_MIN_MS = 2400; // slow pulse: one breath at most this often // follower confidence required to move the on-screen line

// Two modes carried over from the web lab: Path (spoken paatth) and Kirtan
// (sung). Both map to the karansea CTC + line decoder with the same tuned
// params (the JS engine DEFAULTS), so the label is the only difference for now.
const MODES = {
  kirtan: { label: 'Kirtan (sung)', profile: 'kirtan' },
  path: { label: 'Path (recitation)', profile: 'karansea' },
};

// The microphone chosen on the start screen (a deviceId; empty = the system default).
// Per-computer convenience, so browser storage is enough.
const MIC_PREF_KEY = 'vf-mic-device';
const readMicPref = () => {
  try {
    return window.localStorage.getItem(MIC_PREF_KEY) || '';
  } catch (e) {
    return '';
  }
};
// Where "Open Settings" goes when the system has blocked the microphone, per platform.
const MIC_SETTINGS_URL = {
  darwin: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  win32: 'ms-settings:privacy-microphone',
};
const MIC_DENIED_DESC = {
  darwin: 'VOICE_FOLLOW.MIC_DENIED_DESC_MAC',
  win32: 'VOICE_FOLLOW.MIC_DENIED_DESC_WIN',
};
// A capture error that means the microphone is blocked (not missing or busy).
const isMicBlocked = (e) => !!e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
const saveMicPref = (deviceId) => {
  try {
    if (deviceId) window.localStorage.setItem(MIC_PREF_KEY, deviceId);
    else window.localStorage.removeItem(MIC_PREF_KEY);
  } catch (e) {
    // Storage unavailable: the choice lasts for this run only.
  }
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
// Rows a Bani is FOLLOWED with. Usually the rows on screen; but the extra-long Rehras puts
// the "Sri Vaheguru ji ki fateh / Patshahi 10" header before Chaupai some 40 lines later
// (after its extra pauris) than the long list does, and Renton reads it in the long
// position, right after "Saran pare ki rakhahu sarma". Missing there, the header pulled the
// app onto Bhai Nand Lal's Ganj Nama (which opens with it). So the extra-long Rehras is
// followed with the long list's own rows merged in (each placed before the next row both
// lists share; matched in order, since header rows repeat and share ids). Those rows are
// followed and judged but never shown: the screen holds its line while they are read.
// screenLine = the row's 0-based line among on-screen rows.
async function loadFollowRows(baniId, col) {
  const rows = ((await loadBaniRows(baniId, col)) || []).filter(
    (r) => r && r.ID != null && r.Gurmukhi,
  );
  // Rows are Realm objects (fields are getters, not own properties): keep them whole.
  let merged = rows.map((row) => ({ row, off: false }));
  if (Number(baniId) === REHRAS_BANI && col === BANI_LENGTH_COLS.extralong) {
    const long = ((await loadBaniRows(baniId, BANI_LENGTH_COLS.long).catch(() => [])) || []).filter(
      (r) => r && r.ID != null && r.Gurmukhi,
    );
    // Longest common subsequence of the two lists by row id: the shared rows, in order.
    const n = rows.length;
    const m = long.length;
    const L = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let j = m - 1; j >= 0; j -= 1) {
      for (let i = n - 1; i >= 0; i -= 1) {
        L[j][i] =
          long[j].ID === rows[i].ID ? L[j + 1][i + 1] + 1 : Math.max(L[j + 1][i], L[j][i + 1]);
      }
    }
    const before = new Map(); // index in rows -> long-only rows read just before it
    let pending = [];
    let i = 0;
    let j = 0;
    while (j < m) {
      if (i < n && long[j].ID === rows[i].ID && L[j][i] === L[j + 1][i + 1] + 1) {
        if (pending.length) before.set(i, pending);
        pending = [];
        i += 1;
        j += 1;
      } else if (i < n && L[j][i + 1] >= L[j + 1][i]) i += 1;
      else {
        pending.push({ row: long[j], off: true });
        j += 1;
      }
    }
    merged = [];
    rows.forEach((row, k) => {
      merged.push(...(before.get(k) || []), { row, off: false });
    });
    merged.push(...pending);
  }
  let k = -1;
  return merged.map(({ row, off }) => {
    if (!off) k += 1;
    return { row, offScreen: off, screenLine: Math.max(0, k) };
  });
}

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

const VoiceFollow = () => {
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
  const navActions = useStoreActions((actions) => actions.navigator);
  // Visible mode: the sevadaar pressed Start in the panel, so Voice-Follow drives the real
  // screen. Until then a tester build follows in the shadow (nothing on screen). In visible
  // mode each screen change is also sent to the shadow bus, so the session's system
  // timeline continues and the sevadaar's own changes can be told apart as overrides.
  const visibleRef = useRef(false);
  const shadowing = () => SHADOW_BUILD && !visibleRef.current;
  // Anonymous usage counts for a run the sevadaar started with Start (vfAnalytics.js), and
  // what is on screen: the app's own last write vs. what the store shows, so the sevadaar's
  // own Shabad and pangti changes can be told apart from Autopilot's.
  const vfRunRef = useRef(null); // createRunStats() while a visible run lasts
  const vfScreenRef = useRef({
    appKey: null,
    appVerse: null,
    appAt: 0,
    prevKey: null,
    tapUntil: 0,
  });
  // The app wrote to the screen (mirror below): an Autopilot change, unless a card was just tapped.
  const vfAppWrote = (update) => {
    const sc = vfScreenRef.current;
    const t = Date.now();
    let key = sc.appKey;
    if (update.bani != null) key = `${BANI_KEY}${update.bani}`;
    else if (update.shabadId != null) key = String(update.shabadId);
    const verse = update.verseId != null ? update.verseId : null;
    if (key === sc.appKey && (verse == null || verse === sc.appVerse)) return; // a slide, a repeat
    const change = key !== sc.appKey ? 'shabad' : 'pangti';
    if (key !== sc.appKey) sc.prevKey = sc.appKey;
    sc.appKey = key;
    if (verse != null) sc.appVerse = verse;
    sc.appAt = t;
    const r = vfRunRef.current;
    if (r && !shadowing() && t >= sc.tapUntil) r.auto(change);
  };
  // Every line the app itself puts on screen passes through mirror(), so it is tagged here:
  // any other change of the screen line is the sevadaar's (see lineRespect.js).
  const lineRespectRef = useRef(null);
  if (!lineRespectRef.current) lineRespectRef.current = createLineRespect();
  const mirror = (update) => {
    if (update.verseId != null) lineRespectRef.current.appWrote(update.verseId, Date.now());
    try {
      vfAppWrote(update);
    } catch (_) {
      /* usage counts never get in the way of the screen */
    }
    if (SHADOW_BUILD) shadowBus.system(update);
  };
  // Stable identities (useCallback): these feed other hooks' dependency lists, and a new
  // function each render would re-run those effects (cleanup included) every render.
  const setActiveVerseId = useCallback(
    (verseId) => {
      if (shadowing()) return shadowSetVerse(verseId);
      mirror({ verseId });
      return navActions.setActiveVerseId(verseId);
    },
    [navActions],
  );
  const setLineNumber = useCallback(
    (...a) => (shadowing() ? shadowNoop() : navActions.setLineNumber(...a)),
    [navActions],
  );
  const setMiscSlideText = useCallback(
    (...a) => (shadowing() ? shadowNoop() : navActions.setMiscSlideText(...a)),
    [navActions],
  );
  // Rehras is followed at the long length: the user's Sundar Gutka length is raised while
  // Voice-Follow shows it and restored after. In shadow mode the real setting is never
  // touched (the Bani column hidden Voice-Follow loads comes from baniLengthFor(userLength())
  // and so still raises for Rehras on its own).
  const setBaniLength = useStoreActions((actions) => actions.userSettings.setBaniLength);
  const setBaniLengthRef = useRef(null);
  setBaniLengthRef.current = (...a) => (shadowing() ? shadowNoop() : setBaniLength(...a));
  // { prev, to, baniId, real }: the user's own Bani length while Voice-Follow has raised it
  // for Rehras (real: raised on the real screen, not only in the hidden shadow run).
  const lengthOverrideRef = useRef(null);
  // A raised length left in place by Stop (see pendingLengthAction), kept across restarts.
  const pendingLengthRef = useRef(undefined);
  if (pendingLengthRef.current === undefined) {
    pendingLengthRef.current = null;
    try {
      const saved = JSON.parse(window.localStorage.getItem(PENDING_LENGTH_KEY) || 'null');
      if (saved && saved.prev) pendingLengthRef.current = saved;
    } catch (_) {
      /* No storage: the pending length lives for this run only. */
    }
  }
  const setPendingLength = (p) => {
    pendingLengthRef.current = p;
    try {
      if (p) window.localStorage.setItem(PENDING_LENGTH_KEY, JSON.stringify(p));
      else window.localStorage.removeItem(PENDING_LENGTH_KEY);
    } catch (_) {
      /* No storage. */
    }
  };
  // Opening a Bani is the same four navigator actions the Sundar Gutka screen uses; in
  // shadow mode they become one system update ("bani:<id>" at a line), nothing on screen.
  const setIsSundarGutkaBani = useCallback(
    (...a) => (shadowing() ? shadowNoop() : navActions.setIsSundarGutkaBani(...a)),
    [navActions],
  );
  const setSundarGutkaBaniId = useCallback(
    (...a) => (shadowing() ? shadowNoop() : navActions.setSundarGutkaBaniId(...a)),
    [navActions],
  );
  const setIsCeremonyBani = useCallback(
    (...a) => (shadowing() ? shadowNoop() : navActions.setIsCeremonyBani(...a)),
    [navActions],
  );
  const setSingleDisplayActiveTab = useCallback(
    (...a) => (shadowing() ? shadowNoop() : navActions.setSingleDisplayActiveTab(...a)),
    [navActions],
  );
  // In shadow mode the slide Voice-Follow would put up is its own, never the sevadaar's.
  const shadowSlideRef = useRef(null);
  if (!shadowSlideRef.current) {
    shadowSlideRef.current = (visible) => {
      // eslint-disable-next-line no-use-before-define
      isMiscSlideRef.current = !!visible;
      shadowBus.system({ slide: visible ? true : null });
    };
  }
  const setIsMiscSlide = useCallback(
    (visible) => {
      if (shadowing()) return shadowSlideRef.current(visible);
      mirror({ slide: visible ? true : null });
      return navActions.setIsMiscSlide(visible);
    },
    [navActions],
  );
  const isMiscSlide = useStoreState((state) => state.navigator.isMiscSlide);
  // Proper "open this shabad" action (drives viewer/projector/history/socket).
  // Kept in a ref so the async detect->lock path always calls the latest one.
  const changeActiveShabad = useNewShabad();
  const openShabadRef = useRef(changeActiveShabad);
  openShabadRef.current = (...a) => {
    if (shadowing()) return shadowOpen(a[0], a[1]);
    mirror({ shabadId: a[0], verseId: a[1] });
    return changeActiveShabad(...a);
  };
  // The navigator pane (bottom-left in Presentation) shows whatever its pane
  // attributes name; opening a Bani must update them too, exactly as the Sundar
  // Gutka screen does, or the pane keeps the old content and never highlights.
  // In shadow mode the pane is the sevadaar's: the Bani goes to the shadow bus instead.
  const updatePane = updateMultipane();
  const updatePaneRef = useRef(null);
  updatePaneRef.current = (...a) => {
    if (shadowing()) return shadowOpenBani(...a);
    mirror({ bani: a[1], shabadId: null, verseId: a[2] ?? null, slide: null });
    return updatePane(...a);
  };

  const [status, setStatus] = useState('idle'); // idle|connecting|listening|detecting|error|stopped
  const [autopilot] = useState(true); // hands-free: detect + follow + auto-switch, one press
  const vetoRef = useRef(null); // { id, left }: shabad a tap just left, and judged decodes remaining
  const baniLengthRef = useRef('short');
  baniLengthRef.current = baniLength;
  // The user's own length (what they chose), even while Rehras has it raised (by this run,
  // or by an earlier one that Stop left on screen).
  const userLength = () =>
    (lengthOverrideRef.current && lengthOverrideRef.current.prev) ||
    (pendingLengthRef.current && pendingLengthRef.current.prev) ||
    baniLengthRef.current;
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
  // Stop: the raised length stays on screen (pending); only a hidden run's own bookkeeping
  // (never applied to the real setting) is simply dropped.
  const parkBaniLength = () => {
    const o = lengthOverrideRef.current;
    lengthOverrideRef.current = null;
    if (o && o.real) setPendingLength({ prev: o.prev, to: o.to, baniId: o.baniId });
  };
  // Once the screen has moved on from the Bani Stop left raised (the sevadaar opened a
  // shabad or another Bani), put the user's own length back; if they changed the length by
  // hand meanwhile, theirs stands.
  const settlePendingLength = () => {
    const action = pendingLengthAction(pendingLengthRef.current, {
      baniLength,
      isSundarGutkaBani,
      isCeremonyBani,
      sundarGutkaBaniId,
    });
    if (action === 'keep') return action;
    const { prev } = pendingLengthRef.current;
    setPendingLength(null);
    if (action === 'restore') {
      try {
        setBaniLength(prev);
      } catch (_) {
        /* Closing store. */
      }
    }
    return action;
  };
  useEffect(() => {
    settlePendingLength();
  }, [baniLength, isSundarGutkaBani, isCeremonyBani, sundarGutkaBaniId, activeShabadId]);
  const baniIndexRef = useRef(null); // { col, promise } shabad<->Bani index, built once per length
  const curBaniShabadsRef = useRef(null); // Set of shabads inside the Bani being followed
  const seqReadRef = useRef({ id: null, last: -1, lines: new Set(), fired: false }); // PAATH_READ_LINES
  // Akhand Paath following (PAATH_SEQ_*): on, Shabads carried over, moves back seen, and the
  // fixes seen inside the next Shabad so far. curCursorPrevRef = the follower's previous
  // confident line inside the current Shabad; seqNextRef = the reading window of the next
  // position, built in the background after a crossing ({ sid, profile, follower }).
  const paathSeqRef = useRef({ ...PAATH_SEQ_OFF });
  const curCursorPrevRef = useRef(null);
  const seqNextRef = useRef(null);
  // Akhand Paath detection per plain Shabad (see seqDetectRef), and the Shabad before it.
  const seqPaceRef = useRef({ id: null });
  // Was Shabad `sid` (just followed) read in order at a measured reading pace (at least
  // PAATH_SEQ_PACE_LINES pangtis, nothing coming back)? (seqPaceRef record)
  const readAtPaceRef = useRef(null);
  readAtPaceRef.current = (sid) => {
    const cur = seqPaceRef.current;
    let sq = null;
    if (cur && cur.id === sid) sq = cur;
    else if (cur && cur.prev && cur.prev.id === sid) sq = cur.prev;
    if (!sq || sq.sung || !sq.seen || !sq.seen.length) return false;
    // Too little heard to tell a reading from a Shabad being sung: not a reading.
    if (sq.seen.length < PAATH_SEQ_PACE_LINES) return false;
    const span = (sq.seen[sq.seen.length - 1].t - sq.seen[0].t) / 1000;
    const words = sq.seen.slice(0, -1).reduce((m, x) => m + x.words, 0);
    return span > 0 && words / span >= PAATH_SEQ_WPS;
  };
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
  // Anonymous usage events (vfAnalytics.js) for a run the sevadaar started with Start (never
  // the hidden run): start, first Shabad/Bani on screen, stop, a summary (and a heartbeat
  // every 15 min). STTM's "Collect statistics" setting turns them off.
  const collectStatistics = useStoreState((state) => state.userSettings.statistics);
  vfAnalytics.setAllowed(collectStatistics);
  const vfPressesRef = useRef(0); // Start/Stop presses since launch
  const vfRunReady = () => {
    const r = vfRunRef.current;
    if (!r || r.state.started) return;
    r.state.started = true;
    vfAnalytics.track('vf_autopilot_start', {
      label: r.state.how,
      value: Date.now() - r.state.at,
    });
  };
  const vfRunLock = (id, kind) => {
    const r = vfRunRef.current;
    if (!r || id == null) return;
    const isBani = String(id).startsWith(BANI_KEY);
    if (kind === 'override') r.tap(); // a tapped card (the sevadaar's choice)
    const first = r.lock(id, kind, isBani);
    if (first != null) {
      vfAnalytics.track('vf_first_lock', {
        label: `${r.state.how};kind=${isBani ? 'bani' : 'shabad'}`,
        value: first,
      });
    }
  };
  // reason: user (Stop), window_close, error, other.
  const vfRunEnd = (reason = 'other') => {
    const r = vfRunRef.current;
    if (!r) return;
    vfRunRef.current = null;
    const mins = r.minutes();
    vfAnalytics.track('vf_autopilot_stop', {
      label: ['user', 'window_close', 'error'].includes(reason) ? reason : 'other',
      value: mins,
    });
    if (!r.state.started) {
      vfAnalytics.track('vf_autopilot_start', { label: `${r.state.how};ready=none` });
    }
    if (r.state.lockAt == null) {
      vfAnalytics.track('vf_first_lock', {
        label: 'none',
        value: Math.round((Date.now() - r.state.at) / 100) / 10,
      });
    }
    vfAnalytics.track('vf_session_summary', { label: r.label(vfPressesRef.current), value: mins });
  };
  const vfRunBegin = (how) => {
    vfRunEnd(); // a run that ended in an error and was never stopped
    vfRunRef.current = createRunStats({ how });
  };
  const vfRunEndRef = useRef(vfRunEnd);
  vfRunEndRef.current = vfRunEnd;
  // Window close (or reload) mid-run still sends the summary.
  useEffect(() => {
    const onUnload = () => vfRunEndRef.current('window_close');
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      vfRunEndRef.current('other');
    };
  }, []);
  // A run that ends in an error (no microphone, no model) ends here, not at the next Start.
  useEffect(() => {
    if (status === 'error') vfRunEndRef.current('error');
  }, [status]);
  // Error kinds once per app run, hidden run or not (a computer where Autopilot cannot run).
  const vfError = (kind) => vfAnalytics.error(kind, shadowing() ? 'hidden' : 'visible');
  const [autoDetect] = useState(false); // blind: identify the shabad from audio, then follow (one-shot)
  // Acoustic text stays inside matching; only canonical BaniDB text is rendered.
  const [, setCands] = useState([]); // [{shabadId, verseId, verse, display, share}] shortlist
  const [, setAudioView] = useState({ seconds: 0, level: 0, rms: 0, peak: 0, device: '' });
  const volumeRef = useRef({ hist: [], state: 'good' }); // the last ~2 s of mic levels for the volume label
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

  const [mode] = useState('kirtan');
  const [detail, setDetail] = useState('');
  const [pos, setPos] = useState(null); // { lineIndex, wordIndex, confidence }
  const [dlProgress, setDlProgress] = useState(null); // 0..1 during first-run model download, else null
  // The search pane's Autopilot tab hands us a node to render the live view into; the
  // session itself keeps running here whichever tab is showing.
  const autopilotSlot = useAutopilotSlot();
  // The Autopilot tab is on screen: the sevadaar may press Start soon, so warm the model now
  // (a no-op once it is loaded; the index build at launch usually got here first).
  useEffect(() => {
    if (autopilotSlot) warmModel(0);
  }, [autopilotSlot]);
  const setAutopilotLive = useStoreActions((actions) => actions.app.setAutopilotLive);

  const followerRef = useRef(null); // Follower (track a known shabad/bani)
  const recognizerRef = useRef(null); // Recognizer (blind auto-detect)
  const chainRef = useRef(Promise.resolve()); // serialize async inference per chunk
  // Audio captured but not yet handed to the engines (see AUDIO_BACKLOG_S).
  const backlogRef = useRef({ chunks: [], samples: 0, seconds: 0, peak: 0, merges: 0, notedAt: 0 });
  const paceOffRef = useRef(null); // unsubscribes this session's tier-step listener
  const sessionRef = useRef(0); // invalidates asynchronous work after cleanup/restart
  const transcriptSeqRef = useRef(0);
  const transcriptAbortRef = useRef(null);
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
  // Possible new Shabads as listed (candidateShelf.js): cards stay long enough to be read
  // and tapped, keep their places, and fade before they go. Display only.
  const shelfRef = useRef(null);
  if (!shelfRef.current) shelfRef.current = createShelf();
  const [shelf, setShelf] = useState([]);
  const heardLastRef = useRef(0); // when a word was last heard confidently (ms)
  const liveLeadRef = useRef(null); // the Shabad in the change card (its own card, not listed)
  const boardLogRef = useRef({ at: 0, sig: '' });
  const resetShelf = useCallback(() => {
    shelfRef.current.reset();
    liveLeadRef.current = null;
    setShelf([]);
  }, []);
  const publishBoard = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - boardAtRef.current < 180) return;
    boardAtRef.current = now;
    const snap = boardRef.current.snapshot();
    setBoard(snap);
    const cur = phaseRef.current === 'following' ? currentShabadIdRef.current : null;
    const bani = curBaniShabadsRef.current;
    // Listed: any Shabad in contention other than the one on screen (under any id) or a
    // member of the Bani on screen; while following, never the judge's scratch work under
    // 1%; and only with a pangti to show (never an empty row).
    const hide = [cur, liveLeadRef.current].filter((x) => x != null);
    const items = snap.filter(
      (b) =>
        b.role !== 'current' &&
        b.shabadId !== cur &&
        !(cur != null && bani && bani.has(b.shabadId)) &&
        (cur == null || b.pct >= 0.01) &&
        !!cardLine(b),
    );
    const listed = shelfRef.current.update({
      now,
      items,
      current: cur,
      heardAt: heardLastRef.current,
      hide,
    });
    setShelf(listed);
    // Session log (shadow sessions): the cards as listed, about once a second and only when
    // they changed, so how long a candidate stayed readable can be measured.
    if (SHADOW_BUILD && shadowBus.active() && now - boardLogRef.current.at >= BOARD_LOG_MS) {
      const r2 = (x) => Math.round(x * 100) / 100;
      const curCard = snap.find((b) => b.role === 'current');
      const cards = [
        ...(curCard
          ? [{ id: curCard.shabadId, pct: r2(curCard.pct), role: 'current', vis: 1 }]
          : []),
        ...(liveLeadRef.current != null
          ? [{ id: liveLeadRef.current, role: 'change', vis: 1 }]
          : []),
        ...listed.map((c, i) => ({
          id: c.shabadId,
          pct: r2(c.pct),
          role: 'candidate',
          vis: visibleRef.current ? 1 : 0,
          pos: i,
          ...(c.fading ? { fading: 1 } : {}),
        })),
        ...shelfRef.current
          .waiting()
          .map((w) => ({ id: w.shabadId, pct: r2(w.pct), role: 'candidate', vis: 0 })),
      ];
      const sig = JSON.stringify(cards);
      if (sig !== boardLogRef.current.sig) {
        boardLogRef.current = { at: now, sig };
        shadowBus.note({ type: 'board', cards });
      }
    }
  }, []);
  const heardRef = useRef('');
  const [heard, setHeard] = useState('');
  const heardAtRef = useRef(0);
  // The strip shows words, not noise: between lines the recognizer still emits lone letters
  // from tabla, harmonium and room sound at low confidence (sung lines score ~0.93-0.99),
  // so a hypothesis has to be confident and contain at least one real word to be shown,
  // and the strip clears after a few seconds without one.
  const heardClearRef = useRef(0);
  // Heartbeat: the current card breathes once, slowly, on a decode that matched it well,
  // at most every HEARTBEAT_MIN_MS so it reads as a pulse rather than a flicker.
  const [beat, setBeat] = useState(0);
  const beatAtRef = useRef(0);
  const noteBeat = useCallback((score) => {
    const now = Date.now();
    if (!HEARTBEAT || score < HEARTBEAT_MIN_SCORE || now - beatAtRef.current < HEARTBEAT_MIN_MS)
      return;
    beatAtRef.current = now;
    setBeat(now);
  }, []);
  // Each decode covers the last few seconds of audio, so its final word or two is usually
  // cut mid-word and gets re-spelt on the next decode. Those are shown lighter as "still
  // hearing"; only words that were fully sung join the settled text.
  const tentativeRef = useRef('');
  const heardBoxRef = useRef(null); // the hearing strip: scrolled to its end when it overflows
  const [askRating, setAskRating] = useState(false); // one-tap rating offered after Stop
  const [, setVisTick] = useState(0); // re-render when Start adopts the hidden run
  const ratingTimerRef = useRef(null);
  const heardKeysRef = useRef([]); // recent heard words (keys) for marking candidate lines
  const [heardKeys, setHeardKeys] = useState([]);
  useEffect(() => {
    const el = heardBoxRef.current;
    if (!el) return;
    const over = el.scrollWidth > el.clientWidth + 1;
    el.scrollLeft = over ? el.scrollWidth : 0;
    el.classList.toggle('is-overflowing', over);
  }, [heard]);
  const noteHeard = useCallback((text, confidence = 1) => {
    const all = (text || '').split(/\s+/).filter(Boolean);
    const words = all.filter((w) => w.length >= 3);
    if (confidence < HEARD_MIN_CONF || !words.length) return;
    {
      const keys = [...heardKeysRef.current];
      all.map(wordKey).forEach((k) => {
        if (k.length >= 2 && !keys.includes(k)) keys.push(k);
      });
      heardKeysRef.current = keys.slice(-HEARD_KEYS_KEEP);
      setHeardKeys(heardKeysRef.current);
    }
    const settled = all.slice(0, -HEARD_TENTATIVE_WORDS).join(' ');
    tentativeRef.current = all.slice(-HEARD_TENTATIVE_WORDS).join(' ');
    if (settled) heardRef.current = mergeTranscript(heardRef.current, settled);
    const now = Date.now();
    if (now - heardAtRef.current >= 200) {
      heardAtRef.current = now;
      setHeard(`${heardRef.current}\u0001${tentativeRef.current}`);
    }
    heardLastRef.current = now;
    clearTimeout(heardClearRef.current);
    heardClearRef.current = setTimeout(() => {
      heardRef.current = '';
      tentativeRef.current = '';
      heardKeysRef.current = [];
      setHeard('');
      setHeardKeys([]);
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
  // Read-only canonical retrieval service, isolated from the renderer process (warmIndex).
  const runStartedAtRef = useRef(Date.now()); // when the current run began (retry gate)
  const startInFlightRef = useRef(null); // the Start being set up right now, if any
  const lineCacheRef = useRef(new Map()); // shabadId -> { linesNorm, verses } | null (loading)
  const bsWinsRef = useRef(new Map()); // backstop wins banked per shabadId (survives screen flap)
  const sameGurbaniRef = useRef(new Map()); // 'a:b' -> Promise<boolean> (DUP_AWARE_LOCK)
  const bsAdoptKeyRef = useRef(''); // last screened field we ran adoption against
  // Seeking slide: while a switch evaluation is genuinely live (a contender is
  // beating the current shabad), the projector shows the Waheguru slide instead
  // of a possibly-wrong shabad. seekingRef tracks whether WE put it up, so we
  // never clear a misc slide the user opened themselves.
  const seekingRef = useRef(false);
  const isMiscSlideRef = useRef(false);
  if (!shadowing()) isMiscSlideRef.current = isMiscSlide;
  const ctxRef = useRef(null);
  const streamRef = useRef(null);
  // Microphones for the start screen's "Listening through" picker. 'default' and
  // 'communications' are aliases of real devices, so they are not listed; the alias
  // still tells which real device is the system default.
  const [mics, setMics] = useState({ list: [], defaultGroup: null });
  const [micId, setMicId] = useState(readMicPref);
  const micIdRef = useRef(micId);
  micIdRef.current = micId;
  // The system has blocked the microphone: the start screen asks for access instead.
  const [micDenied, setMicDenied] = useState(false);
  // The live microphone stream as state, so the hearing meter draws from the first second
  // of a run (a ref alone would wait for the next unrelated re-render).
  const [micStream, setMicStream] = useState(null);
  // Read the system permission. Returns true when it is blocked. An unknown answer
  // (Linux, or no IPC) leaves the current state alone: a capture error decides then.
  const checkMicAccess = useCallback(async () => {
    if (!ipcRenderer || !ipcRenderer.invoke) return false;
    try {
      const access = await ipcRenderer.invoke('voice-follow:mic-access');
      if (access === 'denied' || access === 'restricted') {
        setMicDenied(true);
        return true;
      }
      if (access === 'granted' || access === 'not-determined') setMicDenied(false);
    } catch (e) {
      // Unknown: keep whatever the last capture attempt showed.
    }
    return false;
  }, []);
  // Check when the panel opens, and again whenever the app comes back to the front
  // (the sevadaar may have just allowed it in System Settings).
  useEffect(() => {
    checkMicAccess();
    if (!window.addEventListener) return undefined;
    window.addEventListener('focus', checkMicAccess);
    return () => window.removeEventListener('focus', checkMicAccess);
  }, [checkMicAccess]);
  const nodeRef = useRef(null);
  const srcRef = useRef(null);
  const linesRef = useRef([]); // [{ verseId }] indexed by aligner lineIndex
  const lastVerseRef = useRef(null);
  // The sevadaar moved the line on the main screen (the Shabad pane, arrow keys, a
  // controller): follow on from their pangti. `onScreen` names the content on screen
  // (shabad id, or 'bani:<id>'). The app's own line writes are tagged in mirror().
  const sevadaarLineRef = useRef(null);
  sevadaarLineRef.current = (verseId, onScreen) => {
    const lr = lineRespectRef.current;
    const now = Date.now();
    const f = followerRef.current;
    const cur = currentShabadIdRef.current;
    const following =
      autopilotRef.current &&
      phaseRef.current === 'following' &&
      !lockingRef.current &&
      !shadowing() &&
      !!f &&
      typeof f.seek === 'function';
    const line = f ? lineOfVerse(f.verseIds, verseId, curCursorRef.current) : -1;
    const kind = lr.classify(verseId, {
      now,
      following,
      sameShabad: cur != null && onScreen != null && String(cur) === String(onScreen),
      known: line >= 0,
    });
    if (kind !== 'sevadaar' || verseId === lastVerseRef.current) return;
    const from = lastVerseRef.current;
    const fromLine = lineOfVerse(f.verseIds, from, curCursorRef.current);
    if (!f.seek(line)) return;
    lastVerseRef.current = verseId;
    curCursorRef.current = line;
    if (seqReadRef.current.id === cur) seqReadRef.current.last = line;
    lr.adopt(verseId, line, now, f, fromLine);
    setPos({ lineIndex: line, wordIndex: -1, confidence: 1, shabadId: cur });
    const fields = { session: sessionIdRef.current, shabadId: cur, from, to: verseId };
    sessionLog.logEvent('sevadaar_line', fields);
    if (SHADOW_BUILD && shadowBus.active()) shadowBus.note({ type: 'sevadaar_line', ...fields });
  };
  const activeVerseId = useStoreState((state) => state.navigator.activeVerseId);
  useEffect(() => {
    const onScreen = isSundarGutkaBani ? `${BANI_KEY}${sundarGutkaBaniId}` : activeShabadId;
    sevadaarLineRef.current(activeVerseId, onScreen);
  }, [activeVerseId]);
  const lockedVerseRef = useRef(null); // { verseId, verse } the current Shabad was locked at
  // A ceremony took the screen while following (see screenTakenByCeremony): the next pangti
  // heard puts the followed Shabad back (projectCurrentRef, set below projectCurrent).
  const screenLostRef = useRef(false);
  const projectCurrentRef = useRef(null);
  const followingKeyRef = useRef(null); // session key: `shabad:<id>` or `bani:<id>`
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
    // The retrieval index is per window (warmIndex), never torn down with a run: a new run
    // only resets the retry gate so a build that failed earlier is tried again at once.
    runStartedAtRef.current = Date.now();
    startInFlightRef.current = null;
    lineCacheRef.current = new Map();
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
    setMicStream(null);
    nodeRef.current = null;
    srcRef.current = null;
    followerRef.current = null;
    recognizerRef.current = null;
    chainRef.current = Promise.resolve();
    backlogRef.current = { chunks: [], samples: 0, seconds: 0, peak: 0, merges: 0, notedAt: 0 };
    paceOffRef.current?.();
    paceOffRef.current = null;
    if (engine.pace) {
      engine.pace.setScoped(false);
      if (engine.pace.setAkhand) engine.pace.setAkhand(false);
    }
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
    const audio = { channelCount: 1, echoCancellation: false, noiseSuppression: false };
    const wanted = micIdRef.current;
    let stream;
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: wanted ? { ...audio, deviceId: { exact: wanted } } : audio,
        });
      } catch (e) {
        // The chosen microphone was unplugged: listen through the system default instead.
        const gone = e && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError');
        if (!wanted || !gone || session !== sessionRef.current) throw e;
        stream = await navigator.mediaDevices.getUserMedia({ audio });
      }
    } catch (e) {
      if (isMicBlocked(e) && session === sessionRef.current) setMicDenied(true);
      throw e;
    }
    setMicDenied(false);
    if (session !== sessionRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return null;
    }
    streamRef.current = stream;
    setMicStream(stream);
    audioViewRef.current = { samples: 0, published: 0, energy: 0, n: 0, peak: 0 };
    rankedViewRef.current = 0;
    setRankedView([]);
    setCurrentView(null);
    const device = stream.getAudioTracks?.()[0]?.label || 'Microphone';
    setAudioView({ seconds: 0, level: 0, rms: 0, peak: 0, device });
    volumeRef.current = { hist: [], state: 'good' };
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
    const backlog = { chunks: [], samples: 0, seconds: 0, peak: 0, merges: 0, notedAt: 0 };
    backlogRef.current = backlog;
    let draining = false;
    // Performance tier (engine/pace): the session log carries the tier the self-test chose
    // and every live step, so the fleet report shows what each computer runs at.
    const pace = engine.pace || null;
    const notePace = (fields) => {
      sessionLog.logEvent('perf_tier', fields);
      if (SHADOW_BUILD && shadowBus.active()) shadowBus.note({ type: 'perf_tier', ...fields });
    };
    if (pace) {
      notePace({ reason: 'start', ...pace.describe() });
      paceOffRef.current?.();
      paceOffRef.current = pace.onStep((ev) => {
        if (session !== sessionRef.current) return;
        notePace(ev);
      });
    }
    // Past the bound (1 s; the lowest tier halves it) every chunk still waiting goes in
    // one push (see AUDIO_BACKLOG_S).
    const backlogBoundS = () => (pace ? pace.backlogBoundS() : AUDIO_BACKLOG_S);
    // Chunks wait here until the engines are free; one loop feeds them in order. Under
    // the bound each chunk is pushed on its own, exactly as the microphone delivered it;
    // past it everything waiting goes in one push (see AUDIO_BACKLOG_S).
    const drain = async () => {
      draining = true;
      try {
        while (backlog.chunks.length && session === sessionRef.current) {
          let pcm;
          if (backlog.samples > backlogBoundS() * ctx.sampleRate) {
            const seconds = backlog.samples / ctx.sampleRate;
            pcm = new Float32Array(backlog.samples);
            let at = 0;
            backlog.chunks.forEach((c) => {
              pcm.set(c, at);
              at += c.length;
            });
            backlog.chunks = [];
            backlog.merges += 1;
            backlog.peak = Math.max(backlog.peak, seconds);
            const nowMs = Date.now();
            if (nowMs - backlog.notedAt >= AUDIO_BACKLOG_NOTE_MS) {
              backlog.notedAt = nowMs;
              const fields = {
                seconds: Math.round(seconds * 100) / 100,
                peak: Math.round(backlog.peak * 100) / 100,
                merges: backlog.merges,
              };
              sessionLog.logEvent('audio_backlog', fields);
              if (SHADOW_BUILD && shadowBus.active())
                shadowBus.note({ type: 'audio_backlog', ...fields });
            }
          } else {
            pcm = backlog.chunks.shift();
          }
          backlog.samples -= pcm.length;
          backlog.seconds = backlog.samples / ctx.sampleRate;
          try {
            // eslint-disable-next-line no-await-in-loop
            await onChunk(pcm);
          } catch (_) {
            /* one bad chunk must not stop the microphone */
          }
          // Still behind after the push: step the tier down; clear headroom: back up.
          if (pace) pace.observe(backlog.samples / ctx.sampleRate);
        }
      } finally {
        draining = false;
      }
    };
    node.port.onmessage = (ev) => {
      if (session !== sessionRef.current) return;
      const pcm = new Float32Array(ev.data);
      const capture = audioViewRef.current;
      capture.samples += pcm.length;
      const now = Date.now();
      // The volume label measures the whole 250 ms window: loudness (rms) and the peak.
      for (let i = 0; i < pcm.length; i += 1) {
        const v = pcm[i];
        capture.energy = (capture.energy || 0) + v * v;
        const a = v < 0 ? -v : v;
        if (a > (capture.peak || 0)) capture.peak = a;
      }
      capture.n = (capture.n || 0) + pcm.length;
      if (now - capture.published >= 250) {
        const rms = Math.sqrt((capture.energy || 0) / (capture.n || 1));
        const peak = capture.peak || 0;
        capture.energy = 0;
        capture.n = 0;
        capture.peak = 0;
        capture.published = now;
        const volHist = volumeRef.current.hist;
        volHist.push(rms);
        if (volHist.length > VOL_SILENT_WINDOWS) volHist.shift();
        setAudioView({
          seconds: Math.floor(capture.samples / ctx.sampleRate),
          level: Math.min(1, rms * 8),
          rms,
          peak,
          device,
        });
      }
      backlog.chunks.push(pcm);
      backlog.samples += pcm.length;
      backlog.seconds = backlog.samples / ctx.sampleRate;
      if (!draining) chainRef.current = drain();
    };
    const src = ctx.createMediaStreamSource(stream);
    nodeRef.current = node;
    srcRef.current = src;
    src.connect(node);
    // Deliberately not connected to destination — no playback.
    return ctx.sampleRate;
  }, []);

  const stop = useCallback(() => {
    // Never move the screen on Stop: same Bani, same length, same line (see
    // pendingLengthAction). The user's own length comes back once the screen moves on.
    parkBaniLength();
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
    paathSeqRef.current = { ...PAATH_SEQ_OFF };
    seqNextRef.current = null;
    setLiveCands({ sCur: 0, items: [] });
    boardRef.current.reset();
    setBoard([]);
    resetShelf();
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
      setDetail("Voice Autopilot supports Shabads and Banis — ceremonies aren't supported yet.");
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
        const follow = await loadFollowRows(sundarGutkaBaniId, col);
        if (session !== sessionRef.current) return;
        const filtered = follow.map((f) => f.row);
        linesRef.current = follow.map((f) => ({
          verseId: f.row.ID,
          offScreen: f.offScreen,
          screenLine: f.screenLine,
        }));
        verses = filtered.map((r) => ({
          verseId: r.ID,
          words: tokenize(anvaad.unicode(r.Gurmukhi)),
          text: anvaad.unicode(r.Gurmukhi),
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
      vfError('model_load_failed');
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
        // A followed row that is not on screen (see loadFollowRows): hold the line.
        if (typeof out.lineIndex === 'number' && linesRef.current[out.lineIndex]?.offScreen) return;
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
            setLineNumber((line.screenLine ?? out.lineIndex) + 1);
          }
        }
      });
    } catch (e) {
      if (session !== sessionRef.current) return;
      setStatus('error');
      setDetail(e?.message || 'audio setup failed');
      vfError(isMicBlocked(e) ? 'mic_blocked' : 'mic_failed');
      cleanup();
      return;
    }

    if (session !== sessionRef.current) return;
    try {
      // Paath (a Bani) uses the position follower; Shabads (kirtan) the line follower.
      const follower = isBani
        ? await engine.createPaathFollower(verses, {
            inputSr: sampleRate,
            baniId: sundarGutkaBaniId,
          })
        : await engine.createFollower(verses, { inputSr: sampleRate });
      if (session !== sessionRef.current) return;
      followerRef.current = follower;
    } catch (e) {
      if (session !== sessionRef.current) return;
      setStatus('error');
      setDetail(`engine init failed: ${e?.message || e}`);
      vfError('engine_init_failed');
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
    paathSeqRef.current = { ...PAATH_SEQ_OFF };
    seqNextRef.current = null;
    setLiveCands({ sCur: 0, items: [] });
    boardRef.current.reset();
    setBoard([]);
    resetShelf();
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
    const follow = await loadFollowRows(baniId, col);
    const filtered = follow.map((f) => f.row);
    // Rows followed but not shown (indexes; none except the extra-long Rehras), and each
    // row's line number on screen.
    const offScreen = new Set(follow.flatMap((f, k) => (f.offScreen ? [k] : [])));
    const screenLines = follow.map((f) => f.screenLine);
    const verses = filtered.map((r) => ({
      verseId: r.ID,
      words: tokenize(anvaad.unicode(r.Gurmukhi)),
      text: anvaad.unicode(r.Gurmukhi),
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
    return { verses, linesNorm, displayLines, rawLines, shabadIds, offScreen, screenLines };
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

  // Akhand Paath reading window: Shabad `shabadId` and the next PAATH_SEQ_AHEAD of Sri Guru
  // Granth Sahib Ji (consecutive ids, as STTM's own next-Shabad arrow), as one paath follower
  // profile. verseShabad = the Shabad of each verse, screenLines = each row's line in its
  // own Shabad, shabadIds = the window (kept from the switch judge as a Bani's Shabads are).
  const loadWindowProfile = useCallback(
    async (shabadId, back = 0) => {
      // banidb.loadShabad never answers for an id that does not exist: give it a moment.
      const rowsOf = (sid) =>
        Promise.race([
          banidb.loadShabad(sid),
          new Promise((resolve) => {
            setTimeout(() => resolve(null), 4000);
          }),
        ]).catch(() => null);
      const sourceOf = (rows) => {
        try {
          return rows && rows[0] && rows[0].Source ? rows[0].Source.SourceID : null;
        } catch (_) {
          return null;
        }
      };
      // The window never leaves Sri Guru Granth Sahib Ji (the id after its last Shabad is
      // another source). `back` Shabads before this one ride along (just left: their last
      // pangti may still be heard), followed but never shown.
      const source = sourceOf(await rowsOf(shabadId));
      const parts = [];
      for (let k = -back; k <= PAATH_SEQ_AHEAD; k += 1) {
        const sid = shabadId + k;
        let p = null;
        try {
          // eslint-disable-next-line no-await-in-loop
          const rows = await rowsOf(sid);
          const src = sourceOf(rows);
          // eslint-disable-next-line no-await-in-loop
          if (rows && (src == null || src === source)) p = await loadShabadProfile(sid);
        } catch (_) {
          p = null;
        }
        if (!p || !p.verses.length) {
          if (k === 0) throw new Error(`shabad ${sid} not found`);
          if (k > 0) break; // the end of Sri Guru Granth Sahib Ji: follow what there is
        } else parts.push({ sid, p });
      }
      const verseShabad = new Map();
      const shabadIds = new Set();
      const screenLines = [];
      parts.forEach(({ sid, p }) => {
        shabadIds.add(sid);
        p.verses.forEach((v, i) => {
          verseShabad.set(v.verseId, sid);
          screenLines.push(i);
        });
      });
      const cat = (key) => parts.flatMap(({ p }) => p[key]);
      const rawLines = cat('rawLines');
      return {
        // the paath follower aligns letters: each row's text as BaniDB writes it
        verses: cat('verses').map((v, i) => ({ ...v, text: anvaad.unicode(rawLines[i] || '') })),
        linesNorm: cat('linesNorm'),
        displayLines: cat('displayLines'),
        rawLines,
        shabadIds,
        verseShabad,
        screenLines,
        window: shabadId,
      };
    },
    [loadShabadProfile],
  );

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

  // The warm per-window index (usually ready long before Start). A build that failed
  // during this run is retried a minute later; a new Start retries it at once.
  const ensureFlIndex = useCallback(() => {
    const warm = warmIndex.get();
    if (warm) return Promise.resolve(warm);
    const failedAt = warmIndex.failedAt();
    if (failedAt > runStartedAtRef.current && Date.now() - failedAt < 60000) {
      return Promise.resolve(null);
    }
    return warmIndex.ensure();
  }, []);

  const searchCanonicalText = useCallback(
    async (text, cap, signal) => {
      const client = await ensureFlIndex();
      if (!client || signal.aborted) return null;
      try {
        return await client.search(text, cap, { signal });
      } catch (error) {
        if (error.name !== 'AbortError') {
          // The worker is gone (timeout, crash): let it go so the next call rebuilds.
          warmIndex.fail(client);
          vfError('retrieval_search_failed');
          diag(`vf retrieval search failed: ${error.message}`);
          if (SHADOW_BUILD && shadowBus.active()) {
            shadowBus.note({ type: 'vf_retrieval_failed', stage: 'search', error: error.message });
          }
        }
        return null;
      }
    },
    [ensureFlIndex],
  );

  // Build the index as soon as the window is up and the database is there (long before the
  // first Start), rebuild it after a database update, release it when the window goes.
  useEffect(() => {
    if (!ipcRenderer || !ipcRenderer.invoke || typeof window === 'undefined') return undefined;
    let timer = null;
    const warm = () => {
      if (databaseFilesPresent()) warmIndex.ensure();
    };
    const onDatabase = () => {
      warmIndex.reset();
      clearTimeout(timer);
      timer = setTimeout(warm, 1000);
    };
    const onUnload = () => warmIndex.reset();
    timer = setTimeout(warm, WARM_INDEX_DELAY_MS);
    window.addEventListener('sttm-database-updated', onDatabase);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('sttm-database-updated', onDatabase);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);

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
        // Akhand Paath: any lock that is not the reading window itself (a judge switch, a
        // tap, a Bani) ends Akhand Paath following.
        const seqWindow = !!opts.window && baniId == null && typeof cand.shabadId === 'number';
        if (paathSeqRef.current.on && !seqWindow) {
          paathSeqRef.current = { ...PAATH_SEQ_OFF };
          seqNextRef.current = null;
        }
        try {
          if (baniId != null) profile = await loadBaniProfile(baniId);
          else if (seqWindow) profile = await loadWindowProfile(cand.shabadId);
          else profile = await loadShabadProfile(cand.shabadId);
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
          // Paath (a Bani) uses the position follower; Shabads (kirtan) the line follower.
          if (seqWindow) {
            // Akhand Paath: the position follower over the reading window, from the line
            // being read, on the Akhand Paath listening schedule; it carries on with the audio the
            // follower before it already holds (no second of listening lost).
            const at = profile.verses.findIndex((v) => v.verseId === cand.verseId);
            follower = await engine.createPaathFollower(profile.verses, {
              inputSr: sampleRateRef.current,
              startLine: at,
              startAt: true,
              // The paath follower at its usual step and dwells until the reading crosses into
              // a next Shabad (then seqCrossRef's follower listens on the Akhand schedule).
              akhand: true,
            });
            if (followerRef.current && at >= 0) follower.adopt(followerRef.current, at);
          } else
            follower =
              baniId != null
                ? await engine.createPaathFollower(profile.verses, {
                    inputSr: sampleRateRef.current,
                    baniId,
                    startLine: profile.verses.findIndex((v) => v.verseId === cand.verseId),
                    // A Bani opened from the Shabad line just locked starts there (opts.startAt:
                    // the paath-line and two-shabads-in-order rules).
                    startAt: !!opts.startAt,
                  })
                : await engine.createFollower(profile.verses, {
                    inputSr: sampleRateRef.current,
                  });
        } catch (e) {
          if (session !== sessionRef.current) return;
          setDetail(`engine init failed: ${e?.message || e}`);
          vfError('engine_init_failed');
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
        // The panel shows the new Shabad's standing at once (a lock is strong evidence);
        // the first following decode replaces this a moment later.
        boardRef.current.follow({ now: Date.now(), cur: cand.shabadId, sCur: 0.5, cands: [] });
        setBoard(boardRef.current.snapshot());
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
        curBaniShabadsRef.current = baniId != null || seqWindow ? profile.shabadIds : null;
        if (seqWindow) {
          paathSeqRef.current = { ...PAATH_SEQ_OFF, on: true, cross: { sid: null, n: 0 } };
          seqNextRef.current = null;
        }
        curCursorPrevRef.current = null;
        returnSlotRef.current = null;
        curProfileRef.current = profile;
        curLinesNormRef.current = profile.linesNorm;
        curWordsNormRef.current = profile.verses.map((v) =>
          (v.words || []).map(vfNorm).filter(Boolean),
        );
        setCurrentView({ id: cand.shabadId, line: anvaad.unicode(cand.verse) });
        lockedVerseRef.current = { verseId: cand.verseId, verse: cand.verse };
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
          if (seqWindow) kind = 'paath_seq';
          else if (opts.promote) kind = 'bani_follow';
          else if (opts.manual) kind = 'override';
          else if (isSwitch && prevBefore && prevBefore.id === cand.shabadId) kind = 'return';
          else if (isSwitch) kind = 'switch';
          if (!shadowing()) vfRunLock(cand.shabadId, kind);
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
          // A visible run takes over a length an earlier Stop left raised on screen.
          if (!shadowing() && pendingLengthRef.current) {
            if (!lengthOverrideRef.current)
              lengthOverrideRef.current = { ...pendingLengthRef.current, real: true };
            setPendingLength(null);
          }
          const wantLength = baniId != null ? baniLengthFor(baniId, userLength()) : null;
          if (wantLength && wantLength !== baniLengthRef.current) {
            if (!lengthOverrideRef.current) lengthOverrideRef.current = { prev: userLength() };
            Object.assign(lengthOverrideRef.current, {
              to: wantLength,
              baniId,
              real: !shadowing(),
            });
            setBaniLengthRef.current(wantLength);
          } else if (!wantLength || wantLength === userLength()) {
            restoreBaniLength();
          } else if (lengthOverrideRef.current) {
            lengthOverrideRef.current.baniId = baniId;
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
          // (Akhand Paath: the window opens on the Shabad already followed; nothing to clear.)
          if (sampleRateRef.current && !seqWindow) {
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
            { promote: true, startAt: true },
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
          // Akhand Paath through a section of Sri Guru Granth Sahib Ji (a Raag's Bhagat
          // Bani, a Vaar): the next Shabad, the one before read at a reading pace.
          if (
            bani != null &&
            AKHAND_SECTION_BANIS.has(bani) &&
            cand.shabadId === fromId + 1 &&
            readAtPaceRef.current(fromId) &&
            autopilotLockRef.current
          ) {
            sessionLog.logEvent('paath_seq_on', {
              session: sessionIdRef.current,
              shabadId: cand.shabadId,
              section: bani,
            });
            autopilotLockRef.current(
              { shabadId: cand.shabadId, verseId: cand.verseId, verse: cand.verse },
              { promote: true, window: true },
            );
          } else if (bani != null && autopilotLockRef.current) {
            autopilotLockRef.current(
              { shabadId: `${BANI_KEY}${bani}`, verseId: cand.verseId, verse: cand.verse },
              { promote: true, startAt: true },
            );
          }
        }
      }
    },
    [
      enterSearching,
      loadShabadProfile,
      loadBaniProfile,
      loadWindowProfile,
      getBaniIndex,
      getPaathLines,
    ],
  );
  autopilotLockRef.current = autopilotLock;

  // Akhand Paath: the reading crossed into Shabad `sid` of the window (follower output
  // `out`, a pangti of it). Open it on the screen at that pangti, the way a lock does, but
  // keep the follower: it already holds this Shabad and the next. The window for the new
  // position is built in the background and takes over at the next audio chunk.
  const seqCrossRef = useRef(null);
  seqCrossRef.current = (sid, out) => {
    const prof = curProfileRef.current;
    const from = currentShabadIdRef.current;
    const verse = (prof.rawLines || [])[out.lineIndex];
    const ps = paathSeqRef.current;
    ps.streak += 1;
    ps.cross = { sid: null, n: 0 };
    ps.backs = 0;
    currentShabadIdRef.current = sid;
    recentShabadsRef.current = [...recentShabadsRef.current.filter((x) => x !== sid), sid].slice(
      -RECENT_SHABADS,
    );
    curCursorPrevRef.current = out.lineIndex;
    lockedVerseRef.current = { verseId: out.verseId, verse };
    lastVerseRef.current = out.verseId;
    prevShabadRef.current = null;
    returnSlotRef.current = null;
    switchCandRef.current = null;
    setSwitchView(null);
    contextEvidenceRef.current = null;
    detectVotesRef.current = new Map();
    detectRowsRef.current = new Map();
    detectStableRef.current = { id: null, count: 0 };
    boardRef.current.follow({ now: Date.now(), cur: sid, sCur: 0.9, cands: [] });
    setBoard(boardRef.current.snapshot());
    setCurrentView({ id: sid, line: (prof.displayLines || [])[out.lineIndex] || '' });
    openShabadRef.current(sid, out.verseId, verse);
    lastAutoDecisionRef.current = Date.now();
    sessionLog.logEvent('paath_next', {
      session: sessionIdRef.current,
      from,
      to: sid,
      verseId: out.verseId,
      streak: ps.streak,
    });
    const session = sessionRef.current;
    const f = followerRef.current;
    loadWindowProfile(sid, 1)
      .then(async (profile) => {
        if (
          session !== sessionRef.current ||
          currentShabadIdRef.current !== sid ||
          followerRef.current !== f ||
          !paathSeqRef.current.on
        ) {
          return;
        }
        // (The Shabad just left rides along at the front of the window: its last pangti is
        // still in the recognizer's window and must neither read as a new Shabad to the
        // switch judge nor leave the follower lost.)
        const follower = await engine.createPaathFollower(profile.verses, {
          inputSr: sampleRateRef.current,
          akhand: true,
          hopS: 0.125,
        });
        if (currentShabadIdRef.current === sid && followerRef.current === f) {
          seqNextRef.current = { sid, profile, follower, from: f };
        }
      })
      .catch(() => {});
  };

  // Akhand Paath following ends (lines came back: sung, not read): the Shabad on screen
  // goes back to the Shabad follower, from the pangti being sung.
  const seqOffRef = useRef(null);
  seqOffRef.current = (out, why) => {
    const sid = currentShabadIdRef.current;
    const verse = ((curProfileRef.current && curProfileRef.current.rawLines) || [])[out.lineIndex];
    paathSeqRef.current = { ...PAATH_SEQ_OFF };
    seqNextRef.current = null;
    sessionLog.logEvent('paath_seq_off', { session: sessionIdRef.current, shabadId: sid, why });
    if (typeof sid === 'number' && verse && autopilotLockRef.current && !lockingRef.current) {
      autopilotLockRef.current({ shabadId: sid, verseId: out.verseId, verse }, { promote: true });
    }
  };

  // Akhand Paath detection, per follower output `out` of plain Shabad `sid`.
  const seqDetectRef = useRef(null);
  seqDetectRef.current = (sid, out) => {
    if (typeof sid !== 'number' || paathSeqRef.current.on) return;
    const prof = curProfileRef.current;
    if (!prof || prof.window || !followerRef.current || lockingRef.current) return;
    if (seqPaceRef.current.id !== sid) {
      // eligible: null = not checked yet, then true / false; prev = the Shabad before
      const prev = seqPaceRef.current.id != null ? { ...seqPaceRef.current, prev: null } : null;
      seqPaceRef.current = {
        prev,
        id: sid,
        last: -1,
        lines: new Set(),
        seen: [],
        sung: false,
        eligible: null,
      };
    }
    const sq = seqPaceRef.current;
    if (sq.sung || sq.eligible === false || out.lineIndex === sq.last) return;
    if (out.lineIndex < sq.last) {
      sq.sung = true; // a line came back: sung, not read (kirtan); never for this Shabad
      return;
    }
    if (!sq.lines.has(out.lineIndex)) {
      sq.seen.push({ t: Date.now(), words: (curWordsNormRef.current[out.lineIndex] || []).length });
    }
    sq.lines.add(out.lineIndex);
    sq.last = out.lineIndex;
    if (sq.eligible == null && sq.lines.size >= PAATH_READ_LINES) {
      // Only a Shabad of Sri Guru Granth Sahib Ji that no Bani has (a Bani's own routes
      // follow its Shabads, e.g. Asa di Vaar, Rehras, Sohila).
      sq.eligible = 'checking';
      const session = sessionRef.current;
      Promise.all([
        getBaniIndex(),
        Promise.race([
          banidb.loadShabad(sid),
          new Promise((resolve) => {
            setTimeout(() => resolve(null), 4000);
          }),
        ]),
      ])
        .then(async ([index, rows]) => {
          const copies = await paathCopies(sid, index).catch(() => null);
          let src = null;
          try {
            src = rows && rows[0] && rows[0].Source ? rows[0].Source.SourceID : null;
          } catch (_) {
            src = null;
          }
          if (session !== sessionRef.current || seqPaceRef.current !== sq) return;
          sq.eligible =
            !!copies &&
            copies.size === 0 &&
            (index.byShabad.get(sid) || []).length === 0 &&
            src === 'G';
        })
        .catch(() => {
          if (seqPaceRef.current === sq) sq.eligible = false;
        });
      return;
    }
    if (sq.eligible !== true) return;
    const n = (prof.verses || []).length;
    // (Never on a short Shabad's last row alone: a short Shabad sung straight through once.)
    if (sq.lines.size < PAATH_SEQ_LINES || !n) return;
    // Reading pace: words of the lines finished per second (kirtan sung straight through
    // is slower), or simply a long run of lines in order.
    const { seen } = sq;
    if (seen.length < PAATH_SEQ_PACE_LINES) return;
    const span = (seen[seen.length - 1].t - seen[0].t) / 1000;
    const words = seen.slice(0, -1).reduce((m, x) => m + x.words, 0);
    if (!(span > 0 && words / span >= PAATH_SEQ_WPS) && sq.lines.size < PAATH_SEQ_LINES_SLOW)
      return;
    const verse = (prof.rawLines || [])[out.lineIndex];
    if (!verse || !autopilotLockRef.current) return;
    sq.eligible = false; // once per Shabad
    sessionLog.logEvent('paath_seq_on', {
      session: sessionIdRef.current,
      shabadId: sid,
      lines: sq.lines.size,
      wps: Math.round((words / span) * 100) / 100,
    });
    autopilotLockRef.current(
      { shabadId: sid, verseId: out.verseId, verse },
      { promote: true, window: true },
    );
  };

  // A sevadaar tap: adopt this shabad NOW through the same path every automatic
  // lock and switch uses, so following, the return slot and every rule behave
  // exactly as after an automatic switch. Nothing is remembered about the tap.
  const pickCandidate = useCallback(
    async (c) => {
      if (!c || c.shabadId == null || lockingRef.current) return;
      // Which card was tapped (place in the list, its % then), for the board timeline.
      if (SHADOW_BUILD && visibleRef.current)
        shadowBus.note({
          type: 'vf_pick',
          shabadId: c.shabadId,
          ...(c.pos != null ? { pos: c.pos } : { from: 'change' }),
          ...(c.pct != null ? { pct: Math.round(c.pct * 100) / 100 } : {}),
        });
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
      // The screen change this tap makes (after the follower is built) is the sevadaar's.
      vfScreenRef.current.tapUntil = Date.now() + 10000;
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
      // Shadow activity log: words are being heard (singing or speech) right now.
      if (SHADOW_BUILD) shadowBus.heard(text || '');
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
                // Same gates as the lock below, so a full bar means a lock is due.
                const p = Math.min(c.count / 6, c.wins / 4) * (lineEvidenceOk(c) ? 1 : 0.7);
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
              lineEvidenceOk(winner) &&
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
            let pooled = index && poolPaathVotes(ranked, index);
            // First-letter grams of ordinary speech can pool onto a Bani (tonight's Fareed talk
            // pooled onto the Aarti and opened it): the full-text route must have seen a member
            // of that Bani recently, as it always does when the Bani is really being recited.
            if (pooled && !poolTextAgrees(pooled.bani, index, contextEvidenceRef.current))
              pooled = null;
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
          const tied = textCandidates.filter(
            (candidate) => Math.abs(candidate.score - textCandidates[0].score) < 1e-9,
          );
          // The same Gurbani stored twice (Aarti's "Gagan mai thaal" in Dhanasari and in
          // Sohila, Rehras's "So dar" and its Asa original) ties exactly on EVERY decode, and
          // a tie is never confirmed: the switch judge zeroed both copies' wins each decode,
          // so a sangat singing the Aarti after a Shabad (or the Rehras after a Shabad) was
          // never followed, however well it matched (Oct 13 user test: 75-95% for 20 s, no
          // switch). Copies are one candidate, not an ambiguity: judged like any other.
          // Only a tie between DIFFERENT shabads (a shared line) still vetoes them all.
          const copies = tied.every(
            (candidate) => candidate === tied[0] || knownSame(tied[0].shabadId, candidate.shabadId),
          );
          if (!copies) {
            tied.forEach((candidate) => {
              tiedLeaderIds.add(candidate.shabadId);
              bsWinsRef.current.delete(candidate.shabadId);
            });
          }
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
            noteBeat(sCurFull);
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
          // The Shabad in the change card is listed there, not among the candidates.
          {
            const top = next
              .filter((x) => x.shabadId !== currentShabadIdRef.current)
              .reduce((m, c) => (!m || c.wins > m.wins ? c : m), null);
            liveLeadRef.current = top && top.wins >= 1 ? top.shabadId : null;
          }
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
          // (Akhand Paath following: the reading is being followed pangti by pangti; a real
          // move away still switches at SWITCH_CONFIRM, without the slide in between.)
          // (Only once the reading has crossed into a next Shabad: a single Shabad read
          // straight through, such as a Hukamnama, keeps the slide and freeze as before.)
          const seqFollowing =
            paathSeqRef.current.on &&
            paathSeqRef.current.streak >= 1 &&
            !!curProfileRef.current?.window;
          if (
            leadSlot.wins >= 2 &&
            !seekingRef.current &&
            !isMiscSlideRef.current &&
            !seqFollowing
          ) {
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
      vfError('model_load_failed');
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
      vfError(isMicBlocked(e) ? 'mic_blocked' : 'mic_failed');
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
      vfError('engine_init_failed');
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
  const runAutopilot = useCallback(async () => {
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
    paathSeqRef.current = { ...PAATH_SEQ_OFF };
    seqNextRef.current = null;
    setLiveCands({ sCur: 0, items: [] });
    boardRef.current.reset();
    setBoard([]);
    resetShelf();
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
      vfError('model_load_failed');
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
        // Performance tiers only while the paath follower follows a read Bani (engine/pace).
        if (engine.pace) {
          // (A single Shabad read straight through, not yet crossed: untiered, as before.)
          engine.pace.setScoped(
            phaseRef.current === 'following' &&
              !!(followerRef.current && followerRef.current.readBani) &&
              !(paathSeqRef.current.on && paathSeqRef.current.streak === 0),
          );
          // Akhand Paath being followed (the reading window): its listening schedule.
          if (engine.pace.setAkhand) {
            engine.pace.setAkhand(
              phaseRef.current === 'following' &&
                paathSeqRef.current.on &&
                paathSeqRef.current.streak >= 1 &&
                !!(curProfileRef.current && curProfileRef.current.window),
            );
          }
        }
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
          let f = followerRef.current;
          if (!f) return; // still building the follower after a lock/switch
          // Akhand Paath: the reading window built after a crossing takes over from here,
          // with the same audio and position (seqNextRef; see seqCrossRef).
          const nx = seqNextRef.current;
          if (nx && nx.follower && nx.from === f && !lockingRef.current) {
            if (nx.sid !== currentShabadIdRef.current || !paathSeqRef.current.on) {
              seqNextRef.current = null;
            } else {
              const idxOf = (line) =>
                Number.isInteger(line) && line >= 0
                  ? nx.profile.verses.findIndex((v) => v.verseId === f.verseIds[line])
                  : -1;
              const line = idxOf(f.cur);
              if (line >= 0 && nx.follower.adopt(f, line)) {
                seqNextRef.current = null;
                followerRef.current = nx.follower;
                curProfileRef.current = nx.profile;
                curLinesNormRef.current = nx.profile.linesNorm;
                curWordsNormRef.current = nx.profile.verses.map((v) =>
                  (v.words || []).map(vfNorm).filter(Boolean),
                );
                curBaniShabadsRef.current = nx.profile.shabadIds;
                curCursorRef.current = line;
                curCursorPrevRef.current = curCursorPrevRef.current == null ? null : line;
                f = nx.follower;
              }
            }
          }
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
          // Akhand Paath: a fix inside the next Shabad of the reading window. Judged before
          // the switch-evaluation freeze below: crossing is this mode's own decision.
          {
            const prof = curProfileRef.current;
            const ps = paathSeqRef.current;
            if (prof && prof.window && ps.on && out.verseId != null) {
              const curSid = currentShabadIdRef.current;
              const vs = prof.verseShabad.get(out.verseId);
              if (vs != null && vs !== curSid) {
                if (out.confidence < UI_MOVE_CONF) return;
                if (vs < curSid) {
                  // The previous Shabad's last pangti still heard: hold. If it keeps being
                  // heard (the reading went back, or the crossing was wrong), go back to it.
                  const nowB = Date.now();
                  ps.back =
                    ps.back && ps.back.sid === vs
                      ? { sid: vs, n: ps.back.n + 1, since: ps.back.since }
                      : { sid: vs, n: 1, since: nowB };
                  if (
                    ps.back.n >= PAATH_SEQ_BACK_FIXES &&
                    nowB - ps.back.since >= PAATH_SEQ_BACK_MS
                  ) {
                    const verse = (prof.rawLines || [])[out.lineIndex];
                    paathSeqRef.current = { ...PAATH_SEQ_OFF };
                    seqNextRef.current = null;
                    sessionLog.logEvent('paath_seq_off', {
                      session: sessionIdRef.current,
                      shabadId: curSid,
                      why: 'previous',
                      to: vs,
                    });
                    if (verse && autopilotLockRef.current && !lockingRef.current) {
                      autopilotLockRef.current(
                        { shabadId: vs, verseId: out.verseId, verse },
                        { promote: true },
                      );
                    }
                  }
                  return;
                }
                ps.back = null;
                const prev = curCursorPrevRef.current;
                const stepped =
                  prev != null &&
                  prof.verseShabad.get((prof.verses[prev] || {}).verseId) === curSid &&
                  out.lineIndex > prev &&
                  out.lineIndex - prev <= 2;
                const nowMs = Date.now();
                ps.cross =
                  ps.cross.sid === vs
                    ? { sid: vs, n: ps.cross.n + 1, since: ps.cross.since }
                    : { sid: vs, n: 1, since: nowMs };
                const held = nowMs - ps.cross.since;
                const isNext = vs === curSid + 1;
                const stayed = isNext
                  ? ps.cross.n >= PAATH_SEQ_CROSS && held >= PAATH_SEQ_CROSS_MS
                  : ps.cross.n >= PAATH_SEQ_SKIP && held >= PAATH_SEQ_SKIP_MS;
                // Open it on a plain step over the boundary, or once the fix has stayed
                // there; one stray fix on a look-alike pangti opens nothing.
                // The first crossing of a reading must stay (a Hukamnama or read-through that
                // simply ends never opens the next Shabad on one look-alike fix).
                if (!((stepped && isNext && ps.streak >= 1) || stayed)) return;
                seqCrossRef.current(vs, out);
              } else if (vs === curSid && out.confidence >= UI_MOVE_CONF) {
                ps.cross = { sid: null, n: 0 };
                ps.back = null; // the reading is in the current Shabad: no going back
                // Lines coming back (sung, not read): back to the Shabad follower.
                if (prev2Back(curCursorPrevRef.current, out.lineIndex)) {
                  ps.backs += 1;
                  if (ps.backs >= PAATH_SEQ_BACKS) {
                    seqOffRef.current(out, 'back');
                    return;
                  }
                }
                curCursorPrevRef.current = out.lineIndex;
              }
            }
          }
          // A followed row that is not on screen (see loadFollowRows): the switch test
          // already scores from it; the screen holds its line.
          const curProf = curProfileRef.current;
          if (curProf && curProf.offScreen && curProf.offScreen.has(out.lineIndex)) return;
          // Don't chase the highlight onto a similar-worded line of the OLD shabad:
          // hold position on low-confidence frames, and freeze entirely while a
          // switch is being evaluated (the current shabad is likely being left).
          // (Akhand Paath following keeps moving with the reader while the judge evaluates.)
          const evaluatingSwitch =
            switchCandRef.current &&
            switchCandRef.current.wins >= 1 &&
            !(
              paathSeqRef.current.on &&
              paathSeqRef.current.streak >= 1 &&
              curProfileRef.current?.window
            );
          if (evaluatingSwitch || out.confidence < UI_MOVE_CONF) return;
          // Just after a sevadaar line move, their pangti stands unless the follower moves
          // on to the next one or clearly insists on another (lineRespect.js). No hold:
          // always written, as before.
          const lr = lineRespectRef.current;
          const nowMs = Date.now();
          const gate = lr.gate(out, nowMs, f);
          if (gate.write) {
            setPos({
              lineIndex: out.lineIndex,
              wordIndex: out.wordIndex,
              confidence: out.confidence,
              shabadId: currentShabadIdRef.current,
            });
          }
          if (gate.write && out.verseId != null && out.verseId !== lastVerseRef.current) {
            lastVerseRef.current = out.verseId;
            if (screenLostRef.current && projectCurrentRef.current) {
              // The kirtan moved on in the followed Shabad while a ceremony was on screen:
              // put the Shabad (or Bani) back, at this pangti.
              screenLostRef.current = false;
              projectCurrentRef.current();
            } else setActiveVerseId(out.verseId);
            setLineNumber(
              ((curProf && curProf.screenLines && curProf.screenLines[out.lineIndex]) ??
                out.lineIndex) + 1,
            );
            const moved = lr.afterWrite(out.verseId, out.lineIndex, nowMs, f);
            if (moved) {
              const fields = {
                session: sessionIdRef.current,
                shabadId: currentShabadIdRef.current,
                ...moved,
                why: gate.reason,
              };
              const type = moved.kind === 'next' ? 'sevadaar_line_next' : 'sevadaar_line_override';
              sessionLog.logEvent(type, fields);
              if (SHADOW_BUILD && shadowBus.active()) shadowBus.note({ type, ...fields });
            }
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
          // Akhand Paath detection (PAATH_SEQ_*): this plain Shabad read straight through
          // at a reading pace, and no Bani has it: follow the reading window from here.
          seqDetectRef.current(sid, out);
        }
      });
    } catch (e) {
      if (session !== sessionRef.current) return;
      setStatus('error');
      setDetail(e?.message || 'audio setup failed');
      vfError(isMicBlocked(e) ? 'mic_blocked' : 'mic_failed');
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
      if (!shadowing()) vfRunReady();
    } catch (e) {
      if (session !== sessionRef.current) return;
      setStatus('error');
      setDetail(`engine init failed: ${e?.message || e}`);
      vfError('engine_init_failed');
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
  // One start in flight at a time: a Start that arrives while a run (hidden or from the
  // panel) is still initialising joins it instead of racing it. Stop clears it (cleanup).
  const startAutopilot = useCallback(() => {
    if (startInFlightRef.current) return startInFlightRef.current;
    const p = runAutopilot().finally(() => {
      if (startInFlightRef.current === p) startInFlightRef.current = null;
    });
    startInFlightRef.current = p;
    return p;
  }, [runAutopilot]);

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
      setDetail("Voice Autopilot supports Shabads and Banis — ceremonies aren't supported yet.");
      return;
    }
    let key = null;
    if (isSundarGutkaBani && sundarGutkaBaniId) key = `bani:${sundarGutkaBaniId}`;
    else if (activeShabadId) key = `shabad:${activeShabadId}`;
    if (key && key !== followingKeyRef.current) {
      start();
    }
  }, [activeShabadId, sundarGutkaBaniId, isSundarGutkaBani, isCeremonyBani, status, start, stop]);

  // Shadow mode: follow silently whenever a shadow recording session is running, and
  // step aside while the computer is busy (resuming once it has calmed down).
  const shadowStateRef = useRef({ running: false, paused: false, since: 0, cpu: null, up: null });
  const shadowStatusRef = useRef('');
  shadowStatusRef.current = `${status}: ${detail}`;
  useEffect(() => {
    if (!SHADOW_BUILD) return undefined;
    const check = () => {
      const st = shadowStateRef.current;
      const nowMs = Date.now();
      // Once a minute while Voice-Follow listens (hidden or from the panel): how long a
      // model pass takes, how many it finishes per second and how far the audio backlog
      // is, so the data shows how close this computer is to falling behind.
      if (shadowBus.active() && autopilotRef.current && nowMs - (st.lastPerfLog || 0) >= 60000) {
        st.lastPerfLog = nowMs;
        const perf = engine.perfStats ? engine.perfStats() : null;
        if (perf) {
          const b = backlogRef.current;
          shadowBus.note({
            type: 'perf',
            ...perf,
            ...(engine.pace ? engine.pace.describe() : {}),
            backlogSec: Math.round(b.seconds * 100) / 100,
            backlogPeak: Math.round(b.peak * 100) / 100,
            merges: b.merges,
          });
        }
      }
      // The sevadaar is driving Voice-Follow from the panel: no hidden run until they stop.
      if (visibleRef.current) {
        st.running = false;
        return;
      }
      // CPU load over the last 30 s (the check itself runs every 5 s so a session that
      // just started is followed quickly).
      let busy = null;
      if (!st.cpu || nowMs - st.cpuAt >= 30000) {
        const sample = cpuSample();
        if (st.cpu) {
          const dt = sample.total - st.cpu.total;
          busy = dt > 0 ? 1 - (sample.idle - st.cpu.idle) / dt : null;
        }
        st.cpu = sample;
        st.cpuAt = nowMs;
      }
      // CPU load once a minute, so a slow result can later be traced to a busy computer.
      if (busy != null && shadowBus.active() && nowMs - (st.lastCpuLog || 0) >= 60000) {
        st.lastCpuLog = nowMs;
        shadowBus.note({ type: 'cpu', busy: Math.round(busy * 100) / 100 });
      }
      // Busy means two readings in a row (a minute): one spike is not a busy computer.
      if (busy != null) st.busyRuns = busy > SHADOW_CPU_PAUSE ? (st.busyRuns || 0) + 1 : 0;
      if (st.running && st.busyRuns >= 2 && nowMs - st.since > 60000) {
        st.paused = true;
        st.since = nowMs;
        shadowBus.setPaused(true);
        shadowBus.system({ bani: null, shabadId: null, verseId: null, slide: null });
        stop();
        st.running = false;
        return;
      }
      if (st.paused && busy != null && busy < SHADOW_CPU_RESUME && nowMs - st.since > 300000) {
        st.paused = false;
        shadowBus.setPaused(false);
      }
      // Voice-Follow stopped itself (its mic ended, an error): start it again.
      if (st.running && !autopilotRef.current) st.running = false;
      // Record whether hidden Voice-Follow is actually listening (model and mic up), so
      // a machine where it cannot run (missing system files, no model) shows in the data.
      const up = !!(autopilotRef.current && recognizerRef.current);
      if (shadowBus.active() && !st.paused && st.running && up !== st.up) {
        if (up || nowMs - st.since > 60000) {
          st.up = up;
          shadowBus.note({ type: up ? 'vf_up' : 'vf_down', status: shadowStatusRef.current });
        }
      }
      if (shadowBus.active() && !st.running && !st.paused) {
        st.running = true;
        st.since = nowMs;
        startAutopilot();
      } else if (!shadowBus.active() && st.running) {
        st.running = false;
        stop();
      }
    };
    const timer = setInterval(check, 5000);
    const first = setTimeout(check, 2000);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
    };
  }, [startAutopilot, stop]);

  const listening = status === 'listening' || status === 'connecting';
  const detecting = status === 'detecting';
  const running = listening || detecting; // a session (follow or detect) is running
  // In a tester build a run that the sevadaar did not start is the hidden shadow run: the
  // panel shows it as idle, and Start hands the screen to Voice-Follow.
  const hiddenRun = SHADOW_BUILD && running && !visibleRef.current;
  const active = running && !hiddenRun;
  // The Autopilot tab shows a live dot while a session runs behind the Search tab.
  useEffect(() => {
    setAutopilotLive(active);
  }, [active, setAutopilotLive]);
  // A held card fades and goes on time even when no decode arrives (a pause in the singing).
  const shelfShown = shelf.length > 0;
  useEffect(() => {
    if (!active || !shelfShown) return undefined;
    const timer = setInterval(() => publishBoard(true), 1000);
    return () => clearInterval(timer);
  }, [active, shelfShown, publishBoard]);
  // Keep the microphone list current: devices come and go, and their names only
  // appear once the microphone has been allowed (so read it again after a session).
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md || !md.enumerateDevices) return undefined;
    let live = true;
    const refresh = () =>
      md
        .enumerateDevices()
        .then((devices) => {
          if (!live) return;
          const inputs = devices.filter((d) => d.kind === 'audioinput');
          const alias = inputs.find((d) => d.deviceId === 'default');
          setMics({
            list: inputs.filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications'),
            defaultGroup: alias ? alias.groupId : null,
          });
        })
        .catch(() => {});
    refresh();
    if (md.addEventListener) md.addEventListener('devicechange', refresh);
    return () => {
      live = false;
      if (md.removeEventListener) md.removeEventListener('devicechange', refresh);
    };
  }, [active]);
  const chooseMic = (deviceId) => {
    setMicId(deviceId);
    saveMicPref(deviceId);
  };
  // The picker shows the saved microphone, else the system default, else the first one.
  const shownMic =
    mics.list.find((d) => d.deviceId === micId) ||
    mics.list.find((d) => mics.defaultGroup && d.groupId === mics.defaultGroup) ||
    mics.list[0] ||
    null;
  // Human-readable status line (avoids surfacing internal states like "idle").
  let statusText =
    status === 'idle'
      ? 'Press Start for Voice Autopilot'
      : `${STATUS_LABEL[status] || status}${detail ? ` · ${detail}` : ''}`;
  if (hiddenRun || (SHADOW_BUILD && !active)) statusText = 'Press Start for Voice Autopilot';

  // Live stats (shown while listening). Word is 1-based like the line; confidence
  // reads as a friendly percentage.

  // Main button: Stop while a session runs, else Start. Autopilot is the default
  // hands-free experience; manual follow / one-shot detect are the fallbacks.
  // Visible mode in a tester build: stop the hidden run, mark the session, and start for
  // real; Stop hands the shadow back (the shadow state machine restarts the hidden run).
  // Start adopting a hidden run that is following: put its Shabad (or Bani) and line on the
  // real screen with the same actions a lock uses (in shadow mode they only went to the bus).
  const projectCurrent = () => {
    const id = currentShabadIdRef.current;
    const locked = lockedVerseRef.current || {};
    const verseId = lastVerseRef.current ?? locked.verseId ?? null;
    const baniId = baniIdOf(id);
    if (baniId != null) {
      // Same length bookkeeping as a visible lock, so Stop parks this raise (stop branch)
      // and the user's own length comes back once the screen moves on.
      if (pendingLengthRef.current) {
        if (!lengthOverrideRef.current)
          lengthOverrideRef.current = { ...pendingLengthRef.current, real: true };
        setPendingLength(null);
      }
      const wantLength = baniLengthFor(baniId, userLength());
      if (wantLength && wantLength !== baniLengthRef.current) {
        if (!lengthOverrideRef.current) lengthOverrideRef.current = { prev: userLength() };
        Object.assign(lengthOverrideRef.current, { to: wantLength, baniId, real: true });
        setBaniLengthRef.current(wantLength);
      }
      updatePaneRef.current('bani', baniId, verseId);
      setIsCeremonyBani(false);
      setSingleDisplayActiveTab('shabad');
      setIsSundarGutkaBani(true);
      setSundarGutkaBaniId(baniId);
      if (verseId != null) setActiveVerseId(verseId);
    } else {
      openShabadRef.current(id, verseId, verseId === locked.verseId ? locked.verse : undefined);
    }
  };
  projectCurrentRef.current = projectCurrent;
  // A theme tile on the Ceremonies screen (e.g. Anand Karaj in the Floral theme) opens that
  // ceremony on screen by design (CeremonyPane onThemeClick). Autopilot keeps listening;
  // once it hears the next pangti of the Shabad it is following, it puts that Shabad back.
  // A real move to another Shabad still goes through the normal switch.
  useEffect(() => {
    screenLostRef.current = screenTakenByCeremony({
      following:
        autopilotRef.current &&
        phaseRef.current === 'following' &&
        currentShabadIdRef.current != null,
      visible: !shadowing(),
      isCeremonyBani,
    });
  }, [isCeremonyBani]);
  // What the store shows: a change the app did not just write is the sevadaar's (a pangti
  // click, arrow keys, a controller, or opening another Shabad / Bani). Counted only.
  useEffect(() => {
    try {
      const sc = vfScreenRef.current;
      let key = null;
      if (isSundarGutkaBani && sundarGutkaBaniId) key = `${BANI_KEY}${sundarGutkaBaniId}`;
      else if (activeShabadId != null) key = String(activeShabadId);
      const verse = activeVerseId != null ? activeVerseId : null;
      const prevKey = sc.screenKey;
      const prevVerse = sc.screenVerse;
      sc.screenKey = key;
      sc.screenVerse = verse;
      const r = vfRunRef.current;
      if (!r || shadowing() || key == null || (key === prevKey && verse === prevVerse)) return;
      const t = Date.now();
      const recent = t - sc.appAt <= 1500; // the app's own change still settling in the store
      const appOwned =
        (key === sc.appKey && (verse == null || verse === sc.appVerse || recent)) ||
        (recent && key === sc.prevKey);
      if (appOwned || t < sc.tapUntil) return;
      vfAnalytics.correction(r.manual(key !== prevKey ? 'shabad' : 'pangti'));
    } catch (_) {
      /* usage counts never get in the way */
    }
  }, [activeShabadId, sundarGutkaBaniId, isSundarGutkaBani, activeVerseId]);
  // Every 30 s while a visible run lasts: the mode it follows in, the performance tier and
  // audio backlog, and a heartbeat summary every 15 min (long diwans, crashes).
  useEffect(() => {
    let last = Date.now();
    const timer = setInterval(() => {
      try {
        const t = Date.now();
        const r = vfRunRef.current;
        const ms = t - last;
        last = t;
        if (!r || shadowing()) return;
        const id = currentShabadIdRef.current;
        if (autopilotRef.current && phaseRef.current === 'following' && id != null) {
          let how = 'kirtan';
          if (String(id).startsWith(BANI_KEY)) {
            how = followerRef.current && followerRef.current.readBani ? 'paath' : 'bani';
          }
          r.mode(how, ms);
        }
        const pace = engine.pace ? engine.pace.describe() : {};
        r.perf({
          tier: pace.tier,
          passMs: pace.passMs != null ? pace.passMs : pace.selfTestMs,
          backlogPeak: backlogRef.current ? backlogRef.current.peak : null,
        });
        if (r.beatDue()) {
          vfAnalytics.track('vf_session_heartbeat', {
            label: r.label(vfPressesRef.current),
            value: r.minutes(),
          });
        }
      } catch (_) {
        /* usage counts never get in the way */
      }
    }, 30000);
    return () => clearInterval(timer);
  }, []);
  const takeOver = async () => {
    vfPressesRef.current += 1;
    clearTimeout(ratingTimerRef.current);
    setAskRating(false);
    shadowStateRef.current.running = false;
    // A hidden run exists (starting, searching, locking or following): adopt it in every
    // phase and keep its evidence, recognizer and index. Never restart the pipeline: the
    // restart threw away a lock made seconds earlier, cancelled the first run's index
    // build and sent every Start back to a cold search. A lock still committing simply
    // finishes on the real screen now that the run is visible.
    // Read the refs, not the rendered `hiddenRun`: a hidden run that began since the last
    // render (the shadow check runs every 5 s) must be adopted too, not raced.
    const live =
      SHADOW_BUILD && !visibleRef.current && (autopilotRef.current || recognizerRef.current);
    if (live) {
      const following = phaseRef.current === 'following' && currentShabadIdRef.current != null;
      vfRunBegin('adopted');
      visibleRef.current = true;
      if (recognizerRef.current) vfRunReady(); // the hidden run is already listening
      if (following) vfRunLock(currentShabadIdRef.current, 'adopt');
      window.dispatchEvent(new CustomEvent('vf-shadow-start'));
      shadowBus.setVisible(true);
      if (following) projectCurrent();
      setVisTick((n) => n + 1);
      return;
    }
    if (running || autopilotRef.current || recognizingRef.current) stop();
    // Clear what the hidden run left in the panel before it becomes visible: otherwise the
    // panel showed the hidden run's Shabad and candidates for a moment (a tall card that then
    // shrank to "Finding") until the new run's microphone start cleared them.
    setCurrentView(null);
    setPos(null);
    rankedViewRef.current = 0;
    setRankedView([]);
    setLiveCands({ sCur: 0, items: [] });
    setBoard([]);
    resetShelf();
    vfRunBegin('cold');
    visibleRef.current = true;
    // A shadow session starts now if none is running, so this whole run is recorded.
    window.dispatchEvent(new CustomEvent('vf-shadow-start'));
    shadowBus.setVisible(true);
    await startAutopilot();
  };
  const release = () => {
    vfPressesRef.current += 1;
    vfRunEnd('user');
    stop();
    visibleRef.current = false;
    shadowStateRef.current.up = null; // so the hidden run's vf_up is logged again
    shadowBus.setVisible(false);
    // One tap of feedback, offered briefly after Stop.
    setAskRating(true);
    clearTimeout(ratingTimerRef.current);
    ratingTimerRef.current = setTimeout(() => setAskRating(false), RATING_ASK_MS);
  };
  const rate = (value) => {
    shadowBus.note({ type: 'rating', value });
    // Anonymous thumbs up/down for everyone (the session note above only reaches testers who share recordings).
    vfAnalytics.track('vf_rating', { label: value === 'up' ? 'up' : 'down' });
    clearTimeout(ratingTimerRef.current);
    setAskRating(false);
  };
  let onMainClick = start;
  if (SHADOW_BUILD) onMainClick = active ? release : takeOver;
  else if (active)
    onMainClick = () => {
      vfPressesRef.current += 1;
      vfRunEnd('user');
      stop();
    };
  else if (autopilot)
    onMainClick = () => {
      vfPressesRef.current += 1;
      vfRunBegin('cold');
      startAutopilot();
    };
  else if (autoDetect) onMainClick = startDetect;

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
  // Option: preview the next lines once the app is sure of the Shabad (>= 95%).
  let showNext = true; // one faint next line under the current line, once sure (>= 95%)
  try {
    showNext = window.localStorage.getItem('vf-next-lines') !== '0';
  } catch (e) {
    showNext = true;
  }
  // The next pangti: from the follower's position, else the line after the one on screen.
  let nextLine = null;
  if (showNext && currentView && profLines) {
    let at = posIsCurrent ? pos.lineIndex : -1;
    if (at < 0 && liveLine) at = profLines.findIndex((l) => l === liveLine);
    if (at >= 0 && at + 1 < profLines.length) nextLine = profLines[at + 1] || null;
  }
  // Volume label: no sound (red), low (amber), good (green), great (dark green), with a
  // little hysteresis so it doesn't flicker (see VOL_* above).
  const vol = volumeRef.current;
  const p80 = (xs) => {
    const sorted = [...xs].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(0.8 * (sorted.length - 1))] : 0;
  };
  const rmsMid = p80(vol.hist.slice(-VOL_LEVEL_WINDOWS));
  const deadMic = vol.hist.length >= VOL_SILENT_WINDOWS && p80(vol.hist) < VOL_SILENT_RMS;
  // Hysteresis: to move up a level the loudness must clear the line by 25%.
  const over = (line, level) => {
    const climbing = VOL_ORDER.indexOf(vol.state) < VOL_ORDER.indexOf(level);
    return rmsMid >= (climbing ? line * 1.25 : line);
  };
  // Dropping from good needs the whole last 8 s to be quiet, so a pause doesn't flash amber.
  const wasGood = vol.state === 'good' || vol.state === 'great';
  let volState = vol.state;
  if (vol.hist.length >= 4) {
    if (over(VOL_GREAT_RMS, 'great')) volState = 'great';
    else if (over(VOL_GOOD_RMS, 'good') || (wasGood && p80(vol.hist) >= VOL_GOOD_RMS)) {
      volState = 'good';
    } else if (deadMic) volState = 'none';
    else if (rmsMid >= VOL_SILENT_RMS || vol.state !== 'none') volState = 'low';
  }
  vol.state = volState;
  const volBars = VOL_ORDER.indexOf(volState);
  const volumeLabel = (
    <span
      className={`vf-ap-vol is-${volState}`}
      role="status"
      title={i18n.t('VOICE_FOLLOW.VOL_TIP')}
    >
      <span className="vf-ap-vol-bars" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <i key={i} className={i < volBars ? 'is-on' : ''} />
        ))}
      </span>
      {i18n.t(`VOICE_FOLLOW.VOL_${volState.toUpperCase()}`)}
    </span>
  );
  const stopButton = (
    <button
      type="button"
      className="vf2-stop"
      onClick={onMainClick}
      title={i18n.t('VOICE_FOLLOW.STOP')}
      aria-label={i18n.t('VOICE_FOLLOW.STOP')}
    >
      <i className="fa fa-stop" aria-hidden="true" />
      {i18n.t('VOICE_FOLLOW.STOP_SHORT')}
    </button>
  );
  // Challengers to display: never the Shabad on screen itself (under any id) nor a
  // member of the Bani on screen.
  const liveItems = currentView
    ? liveCands.items.filter(
        (c) =>
          c.shabadId !== currentView.id &&
          c.shabadId !== currentShabadIdRef.current &&
          !(curBaniShabadsRef.current && curBaniShabadsRef.current.has(c.shabadId)),
      )
    : [];
  // Lead for display = the candidate furthest along in confirmation (ties by score).
  const liveLead = liveItems.reduce((best, c) => (!best || c.wins > best.wins ? c : best), null);
  const changeLabel = 'Changing to';
  // Live board: the current Shabad's calibrated % and the others in contention.
  const boardCur = currentView ? board.find((b) => b.role === 'current') : null;
  let cardStyle = 'rail';
  try {
    cardStyle = window.localStorage.getItem('vf-card-style') || 'rail';
  } catch (e) {
    cardStyle = 'rail';
  }
  const boardPct = (id) => {
    const b = board.find((x) => x.shabadId === id);
    return b ? b.pct : null;
  };
  // A candidate row shows the pangti the engine heard being sung, wherever it falls in
  // the Shabad, so the sevadaar can recognise it at once (as the 8.6 panel did).
  // Nothing heard for a few seconds (the hearing strip has cleared): no change card. The
  // candidate list has its own, longer hold (candidateShelf.js).
  const hearingNow = heardKeys.length > 0;
  const nameLine = cardLine;
  const curFirst =
    (curProfileRef.current && curProfileRef.current.displayLines
      ? curProfileRef.current.displayLines[0]
      : '') || '';
  const sameAsCurrent = (line) =>
    !!line &&
    ((liveLine && engine.norm(line) === engine.norm(liveLine)) ||
      (curFirst && engine.norm(line) === engine.norm(curFirst)));
  // The listed cards come from the shelf (publishBoard): held, steady and fading there.
  // They are not tied to the hearing strip: a pause in the singing does not empty the list.
  const boardOthers = shelf
    .filter((b) => !(currentView && b.shabadId === currentView.id))
    .filter(
      (b) => !(currentView && liveLead && liveLead.wins >= 1 && b.shabadId === liveLead.shabadId),
    )
    .map((b) => ({ ...b, line: nameLine(b) }))
    .filter((b) => !!b.line)
    // The same Gurbani under another id (a Bani copy of a Shabad) is not a different Shabad.
    .filter((b) => !(currentView && sameAsCurrent(b.line)))
    .slice(0, 5);
  const leadLine = liveLead ? nameLine(liveLead) : '';
  // The change card's percentage: the live board's, else the judge's own match score.
  let leadPct = 0;
  if (liveLead) {
    const onBoard = boardPct(liveLead.shabadId);
    leadPct = onBoard != null ? onBoard : liveLead.score || 0;
  }
  // A change in progress is the one thing to look at: the candidate list hides under it.
  // The same Gurbani under another id is not a change.
  const changing = !!(
    currentView &&
    liveLead &&
    liveLead.wins >= 1 &&
    hearingNow &&
    leadLine &&
    !sameAsCurrent(leadLine)
  );

  const heardStrip = (() => {
    // A rolling window: only the last few settled words, newest kept in view.
    const [settled, tentative] = heard ? heard.split('\u0001') : ['', ''];
    // One run of text beside the waveform: the newest words at full strength, the oldest
    // faded (see .vf-ap-heard in _voice-follow.scss).
    const words = [...settled.split(/\s+/).filter(Boolean).slice(-HEARD_SHOW_WORDS), tentative]
      .filter(Boolean)
      .join(' ');
    return words ? (
      <Gurmukhi text={words} />
    ) : (
      <span className="vf2-heard-placeholder">{i18n.t('VOICE_FOLLOW.LISTENING')}</span>
    );
  })();

  const dlBar = dlProgress != null && (
    <div className="vf-dl" title="Downloading the recognition model (one time)">
      <span className="vf-dl-bar" style={{ width: `${Math.round(dlProgress * 100)}%` }} />
    </div>
  );

  const ratingAsk = SHADOW_BUILD && !active && askRating && (
    <div className="vf-rate" role="group" aria-label="How did Voice Autopilot do?">
      <span>How did Voice Autopilot do?</span>
      <button type="button" onClick={() => rate('up')} title="Good" aria-label="Good">
        👍
      </button>
      <button type="button" onClick={() => rate('down')} title="Not good" aria-label="Not good">
        👎
      </button>
    </div>
  );

  // Idle: one large mic to start, what Autopilot does, and the microphone it listens
  // through. Running: the Shabad being followed with its confidence, the other possible
  // Shabads, and at the bottom what it hears (beside a small waveform) with Stop.
  const startTitle = i18n.t('VOICE_FOLLOW.START_TITLE');
  // Microphone blocked by the system: send the sevadaar to its setting, then retry.
  const micSettingsUrl = MIC_SETTINGS_URL[os.platform()];
  const openMicSettings = () => {
    if (micSettingsUrl && shell) shell.openExternal(micSettingsUrl);
  };
  const retryMic = async () => {
    if (await checkMicAccess()) return; // still blocked: stay on this screen
    onMainClick();
  };
  const autopilotView = (
    <div className={`vf-autopilot${active ? ' is-active' : ' is-idle'}`} data-vf-cards={cardStyle}>
      {!active && micDenied && (
        <div className="vf-ap-start is-denied">
          <div className="vf-ap-mic-off" aria-hidden="true">
            <i className="fa fa-microphone" />
          </div>
          <div className="vf-ap-start-text">
            <div className="vf-ap-start-title">{i18n.t('VOICE_FOLLOW.MIC_DENIED_TITLE')}</div>
            <div className="vf-ap-start-desc">
              {i18n.t(MIC_DENIED_DESC[os.platform()] || 'VOICE_FOLLOW.MIC_DENIED_DESC')}
            </div>
          </div>
          <div className="vf-ap-actions">
            {micSettingsUrl && (
              <button type="button" className="vf2-switch is-primary" onClick={openMicSettings}>
                {i18n.t('VOICE_FOLLOW.OPEN_SETTINGS')}
              </button>
            )}
            <button type="button" className="vf2-switch" onClick={retryMic}>
              {i18n.t('VOICE_FOLLOW.TRY_AGAIN')}
            </button>
          </div>
          {ratingAsk}
        </div>
      )}
      {!active && !micDenied && (
        <div className="vf-ap-start">
          <button
            type="button"
            className="vf-ap-mic"
            onClick={onMainClick}
            title={startTitle}
            aria-label={startTitle}
          >
            <i className="fa fa-microphone" aria-hidden="true" />
          </button>
          <div className="vf-ap-start-text">
            <div className="vf-ap-start-title">{startTitle}</div>
            <div className="vf-ap-start-desc">{i18n.t('VOICE_FOLLOW.START_DESC')}</div>
          </div>
          <label className="vf-ap-source">
            <span className="vf-ap-source-label">{i18n.t('VOICE_FOLLOW.LISTENING_THROUGH')}</span>
            <span className="vf-ap-source-pick">
              <i className="fa fa-microphone" aria-hidden="true" />
              <select
                value={shownMic ? shownMic.deviceId : ''}
                disabled={mics.list.length < 2}
                title={i18n.t('VOICE_FOLLOW.CHOOSE_MIC')}
                onChange={(e) => chooseMic(e.target.value)}
              >
                {!shownMic && <option value="">{i18n.t('VOICE_FOLLOW.DEFAULT_MIC')}</option>}
                {mics.list.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || i18n.t('VOICE_FOLLOW.DEFAULT_MIC')}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <HwCheck />
          {dlBar}
          {status === 'error' && <div className="vf-status">{statusText}</div>}
          {ratingAsk}
        </div>
      )}

      {active && (
        <div className="vf2-body">
          {dlBar}

          <section
            key={beat}
            className={`vf2-now${currentView ? ' is-following' : ' is-searching'}${
              boardCur ? ` lvl-${pctLevel(boardCur.pct)}` : ''
            }${beat ? ' is-beat' : ''}`}
            style={boardCur ? pctVars(boardCur.pct) : undefined}
          >
            <div className="vf2-label" aria-live="polite">
              <span className={`vf2-dot ${currentView ? 'is-on' : 'is-seeking'}`} />
              <span className="vf2-label-text">{currentView ? currentLabel : 'Finding'}</span>
              {boardCur && <LivePct value={boardCur.pct} />}
            </div>
            <div
              className={`vf2-line${lineExpanded ? ' is-expanded' : ''}`}
              key={liveLine || 'none'}
              role="button"
              tabIndex={0}
              title={lineExpanded ? 'Click to show on one line' : 'Click to show the full line'}
              onClick={() => setLineExpanded((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setLineExpanded((v) => !v);
              }}
            >
              {liveLine ? <Gurmukhi text={liveLine} /> : i18n.t('VOICE_FOLLOW.LISTENING')}
            </div>
            {/* The next pangti (marked by a thin grey bar) and Stop share one row, so Stop
                sits near the top of the panel without adding a line. */}
            <div className="vf2-next-row">
              {nextLine ? (
                <div className="vf2-next-line" title={i18n.t('VOICE_FOLLOW.NEXT')}>
                  <span className="vf2-next-mark" aria-hidden="true" />
                  <Gurmukhi text={nextLine} />
                </div>
              ) : (
                <span className="vf2-next-line is-empty" />
              )}
              {stopButton}
            </div>
            {boardCur && <LiveBar value={boardCur.pct} />}
          </section>

          {changing && (
            <section
              className={`vf2-change${
                liveLead.wins >= 2 ? ' is-confirming' : ''
              } is-tappable lvl-${pctLevel(leadPct)}`}
              aria-live="polite"
              role="button"
              tabIndex={0}
              title="Tap to change to this Shabad now"
              style={pctVars(leadPct)}
              onClick={() => pickCandidate(liveLead)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') pickCandidate(liveLead);
              }}
            >
              <div className="vf2-label">
                <span className="vf2-dot is-seeking" />
                {changeLabel}
                <LivePct value={leadPct} />
              </div>
              <div className="vf2-cand-line">
                <MarkedLine line={leadLine} keys={heardKeys} />
              </div>
              <LiveBar value={leadPct} />
            </section>
          )}

          <section className="vf2-shabads" aria-live="polite">
            <div className="vf2-shabads-head">
              <span className="vf2-shabads-title">
                {i18n.t(currentView ? 'VOICE_FOLLOW.POSSIBLE_NEW' : 'VOICE_FOLLOW.POSSIBLE')}
              </span>
              {boardOthers.length > 0 && (
                <span className="vf2-shabads-count">{boardOthers.length}</span>
              )}
            </div>
            {boardOthers.length === 0 && (
              <div className="vf2-empty">
                {i18n.t(currentView ? 'VOICE_FOLLOW.NONE_NOW' : 'VOICE_FOLLOW.LISTENING_HINT')}
              </div>
            )}
            {boardOthers.map((c, i) => (
              <div className={`vf2-shabad-row${c.fading ? ' is-fading' : ''}`} key={c.shabadId}>
                <span className="vf2-cand-line">
                  <MarkedLine line={c.line} keys={heardKeys} />
                </span>
                <LiveBar value={c.pct} />
                <LivePct value={c.pct} />
                <button
                  type="button"
                  className={`vf2-switch${i === 0 ? ' is-primary' : ''}`}
                  onClick={() => pickCandidate({ ...c, pos: i })}
                  title={i18n.t(currentView ? 'VOICE_FOLLOW.SWITCH_TIP' : 'VOICE_FOLLOW.OPEN_TIP')}
                >
                  {i18n.t(currentView ? 'VOICE_FOLLOW.SWITCH' : 'VOICE_FOLLOW.OPEN')}
                </button>
              </div>
            ))}
          </section>
          {(hiddenRun || (status !== 'listening' && !detecting)) && (
            <div className="vf-status">{statusText}</div>
          )}
        </div>
      )}

      {active && (
        <div className="vf-ap-bar">
          <div className="vf-ap-heard" title={i18n.t('VOICE_FOLLOW.HEARING_TIP')}>
            <VoiceWave
              stream={micStream}
              isRecording={active}
              autoStopSeconds={null}
              showDuration={false}
              placeholder={null}
              fill
              width={120}
              height={20}
              barWidth={3}
              barGap={4}
              barColor="currentColor"
              className="vf-ap-wave"
            />
            <span className="vf2-heard-text" ref={heardBoxRef}>
              {heardStrip}
            </span>
          </div>
          {volumeLabel}
        </div>
      )}
    </div>
  );

  return autopilotSlot ? createPortal(autopilotView, autopilotSlot) : null;
};

export default VoiceFollow;
