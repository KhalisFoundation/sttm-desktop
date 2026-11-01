// Is the room silent, no instrument and no voice (no app state; unit-tested in quietRoom.test.js)? Used
// by the not-Gurbani slide in VoiceFollow.jsx: Waheguru goes up after QUIET_MS of silence with no
// Gurbani heard (QUIET_SOHILA_MS after Sohila Sahib, the end of the day).
//
// Silent = within QUIET_FLOOR x the room's own background noise, never above a quarter of the
// Gurbani's loudness; at most QUIET_LOUD_S of sound in the window (a cough, a door). Background
// noise = the 10th percentile of FLOOR_BUCKET_MS buckets (each its quiet 25th percentile) over
// the last FLOOR_MS. On 16 h of Gurdwara Sahib recordings this went up 1 to 2.5 min after the
// diwan ended, and mid-diwan almost only in gaps after a Shabad or Bani was done.
/* eslint-disable no-param-reassign */ // q: the slide's own state, updated in place
const QUIET_MS = 45000;
const QUIET_SOHILA_MS = 30000;
const QUIET_LOUD_S = 2;
const QUIET_FLOOR = 3;
const FLOOR_MS = 600000;
const FLOOR_BUCKET_MS = 5000;
const FLOOR_WARM = 60000 / FLOOR_BUCKET_MS; // a minute of background noise before any bar
const GAP_MS = 10000; // no audio this long: a gap, not silence (slow PCs can lag a few s)
const SILENT_RMS = 0.0005; // the lowest bar (VOL_SILENT_RMS: a mic that hears nothing)

// floor and floorNow outlive a Shabad lock (the room is the same room); loud and loudFrom do not.
const createQuietRoom = () => ({ floor: [], floorNow: null, loud: [], loudFrom: 0, lastAt: 0 });

// One audio chunk: rms its level, s its length in seconds, gurbaniLevel how loud Gurbani has
// been (0: not known yet).
const noteChunk = (q, now, rms, s, gurbaniLevel) => {
  if (q.floorNow && now - q.floorNow.t >= FLOOR_BUCKET_MS) {
    const v = q.floorNow.v.sort((a, b) => a - b);
    q.floor.push({ t: q.floorNow.t, q: v[Math.floor(v.length * 0.25)] });
    q.floorNow = null;
  }
  if (!q.floorNow) q.floorNow = { t: now, v: [] };
  q.floorNow.v.push(rms);
  while (q.floor.length && now - q.floor[0].t > FLOOR_MS) q.floor.shift();
  if (q.floor.length < FLOOR_WARM) {
    q.loudFrom = 0;
    return;
  }
  // Sound is counted from here; after a gap in the audio (the mic or the app stalled) afresh,
  // since what was not heard is not silence.
  if (!q.loudFrom || now - q.lastAt > GAP_MS) q.loudFrom = now;
  q.lastAt = now;
  const qs = q.floor.map((x) => x.q).sort((a, b) => a - b);
  let bar = Math.max(qs[Math.floor(qs.length * 0.1)] * QUIET_FLOOR, SILENT_RMS);
  if (gurbaniLevel) bar = Math.min(bar, gurbaniLevel * 0.25);
  if (rms >= bar) q.loud.push({ t: now, s });
  while (q.loud.length && now - q.loud[0].t > QUIET_MS) q.loud.shift();
};

// Has the room been silent for the last quietMs?
const silentFor = (q, now, quietMs) =>
  !!q.loudFrom &&
  now - q.loudFrom >= quietMs &&
  q.loud.reduce((a, x) => (now - x.t <= quietMs ? a + x.s : a), 0) <= QUIET_LOUD_S;

module.exports = { QUIET_MS, QUIET_SOHILA_MS, createQuietRoom, noteChunk, silentFor };
