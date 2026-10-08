// Uploads shadow sessions to the Voice-Follow training-data container on Khalis's Azure
// Blob storage. Each file is PUT straight to the container with a SAS that allows only
// create, write and list, under raw/<gurdwara>/<tester name>/<date>/<session>/<file>, so
// the folders can be browsed by people. Each session folder keeps uploaded.json
// (file -> size uploaded), so a restart, a sleep or Gurdwara Wi-Fi dropping out just resumes
// later. Live files (score, timelines) are re-sent every LIVE_EVERY_MS while the service is
// running, so the container is never more than a couple of minutes behind the laptop.
const fs = require('fs');
const path = require('path');
const { UPLOAD_URL, UPLOAD_SAS } = require('./config');

// The renderer has fetch; the main process (quit-time flush) may not.
// eslint-disable-next-line global-require
const fetch = global.fetch || require('node-fetch');

const TICK_MS = 60 * 1000;
const LIVE_EVERY_MS = 2 * 60 * 1000;
const LIVE_FILES = [
  'session.json',
  'score.json',
  'human.jsonl',
  'system.jsonl',
  'activity.jsonl',
  'events.jsonl',
];
const TYPES = {
  '.webm': 'audio/webm',
  '.json': 'application/json',
  '.jsonl': 'application/x-ndjson',
};

let root = null;
let rootTester = null; // the registered tester, for files that live outside a session (errors.log)
let timer = null;
let busy = false;
let lastLive = 0;
const queue = []; // [{ dir, file }]

const readJson = (f, d) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (_) {
    return d;
  }
};

// Uploads are off in a build that never had the SAS injected (a plain dev build).
const uploadsOn = () => Boolean(UPLOAD_URL && UPLOAD_SAS && !UPLOAD_SAS.startsWith('__'));

async function putFile(dir, file) {
  const full = path.join(dir, file);
  if (!fs.existsSync(full) || !uploadsOn()) return false;
  const session = readJson(path.join(dir, 'session.json'), {});
  const t = session.tester || (dir === root ? rootTester : null) || {};
  const testerId = t.id || 'unknown';
  // Container folders people can browse: raw/<gurdwara>/<tester name>/<date>/<session>/
  const slug = (x, d) =>
    String(x || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || d;
  const gurdwara = slug(t.gurdwara, 'unknown-gurdwara');
  const name = slug(t.name, testerId);
  const sessionId = dir === root ? 'errors' : path.basename(dir);
  const date = sessionId === 'errors' ? 'undated' : sessionId.slice(0, 10);
  const key = ['raw', gurdwara, name, date, sessionId, file].map(encodeURIComponent).join('/');
  const body = fs.readFileSync(full);
  const contentType = TYPES[path.extname(file)] || 'application/octet-stream';
  const put = await fetch(`${UPLOAD_URL}/${key}?${UPLOAD_SAS}`, {
    method: 'PUT',
    headers: {
      'content-type': contentType,
      'content-length': String(body.length),
      'x-ms-blob-type': 'BlockBlob',
    },
    body,
  });
  if (!put.ok) throw new Error(`upload ${put.status}`);
  const doneFile = path.join(dir, 'uploaded.json');
  const done = readJson(doneFile, {});
  done[file] = body.length;
  fs.writeFileSync(doneFile, JSON.stringify(done, null, 1));
  return true;
}

function enqueue(dir, file) {
  if (!queue.some((q) => q.dir === dir && q.file === file)) queue.push({ dir, file });
}

// Every file of every finished session that is not uploaded at its current size.
function scanPending() {
  if (!root || !fs.existsSync(root)) return;
  // The diagnostics log at the root, whenever it has grown.
  try {
    const f = path.join(root, 'errors.log');
    if (fs.existsSync(f)) {
      const done = readJson(path.join(root, 'uploaded.json'), {});
      if (done['errors.log'] !== fs.statSync(f).size) enqueue(root, 'errors.log');
    }
  } catch (_) {
    /* ignore */
  }
  fs.readdirSync(root).forEach((id) => {
    const dir = path.join(root, id);
    if (!fs.statSync(dir).isDirectory()) return;
    const done = readJson(path.join(dir, 'uploaded.json'), {});
    fs.readdirSync(dir).forEach((file) => {
      if (file === 'uploaded.json') return;
      const { size } = fs.statSync(path.join(dir, file));
      const live = require('./bus').sessionDir() === dir; // eslint-disable-line global-require
      // The live session's current audio segment is still being written: skip it.
      if (live && file.endsWith('.webm')) return;
      if (live && LIVE_FILES.includes(file)) return;
      if (done[file] !== size) enqueue(dir, file);
    });
  });
}

async function drain() {
  if (busy) return;
  busy = true;
  try {
    const bus = require('./bus'); // eslint-disable-line global-require
    if (bus.sessionDir() && Date.now() - lastLive > LIVE_EVERY_MS) {
      lastLive = Date.now();
      LIVE_FILES.forEach((f) => enqueue(bus.sessionDir(), f));
    }
    while (queue.length) {
      const { dir, file } = queue[0];
      // eslint-disable-next-line no-await-in-loop
      await putFile(dir, file);
      queue.shift();
    }
  } catch (_) {
    /* offline or storage unreachable: keep the queue, try next tick */
  } finally {
    busy = false;
  }
}

// A session just ended: queue everything in it.
function enqueueSession(dir) {
  try {
    fs.readdirSync(dir).forEach((f) => f !== 'uploaded.json' && enqueue(dir, f));
  } catch (_) {
    /* ignore */
  }
  drain();
}

function start(shadowRoot, tester) {
  root = shadowRoot;
  rootTester = tester || rootTester;
  if (timer) return;
  scanPending();
  drain();
  timer = setInterval(() => {
    scanPending();
    drain();
  }, TICK_MS);
}

// The app is quitting (main process): upload whatever is still pending, for at most ms,
// so a tester's last service reaches the bucket now and not at their next launch.
async function flush(shadowRoot, ms) {
  root = shadowRoot;
  scanPending();
  await Promise.race([
    drain(),
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
  ]);
}

module.exports = { start, enqueue, enqueueSession, flush };
