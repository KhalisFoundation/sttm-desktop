/* gab-review.js — the yes/no ear-check app over ANY review queue (generalised from linecheck-fremont).
 *
 *   gab review [--queue <dir>] [--port 8771]
 *
 * A queue dir holds items.json (list of { id, set, recording, t0, seconds, marker, duration, clip, beforeLine, appLine,
 * sevadaarLine, appVerse, sevadaarVerse, ... }), clips/<id>.wav and answers.json (written here). gab harvest writes
 * such queues; the Fremont who-is-right check (linecheck-fremont/) is one too. Items without audio are not shown.
 * Local only (127.0.0.1). The page is gab-review.html (a copy of the Fremont check page; keys A/S/F/N/I/U, R replay).
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

function main(args) {
  const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
  const Q = path.resolve(arg('queue', path.join(os.homedir(), 'personal/live-darbar-venues/gab-harvest/queue')));
  const PORT = Number(arg('port', 8771));
  const ANS = path.join(Q, 'answers.json');
  const PAGE = path.join(__dirname, 'gab-review.html');
  const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wav': 'audio/wav' };
  const send = (res, type, body) => { res.setHeader('Content-Type', type); res.setHeader('Cache-Control', 'no-store'); res.end(body); };
  http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/answers') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 5e6) req.destroy(); });
      req.on('end', () => {
        try { const all = JSON.parse(body); fs.writeFileSync(`${ANS}.part`, JSON.stringify(all, null, 1)); fs.renameSync(`${ANS}.part`, ANS); res.end('ok'); } catch (e) { res.statusCode = 400; res.end('bad json'); }
      });
      return;
    }
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/' || url === '/index.html') return send(res, TYPES['.html'], fs.readFileSync(PAGE));
    if (url === '/items.json') {
      const items = JSON.parse(fs.readFileSync(path.join(Q, 'items.json'), 'utf8')).filter((it) => it.clip && fs.existsSync(path.join(Q, it.clip)));
      return send(res, TYPES['.json'], JSON.stringify(items));
    }
    if (url === '/answers.json') return send(res, TYPES['.json'], fs.existsSync(ANS) ? fs.readFileSync(ANS) : '{}');
    const file = path.join(Q, url);
    if (!url.startsWith('/clips/') || !file.startsWith(Q) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Content-Length', fs.statSync(file).size);
    fs.createReadStream(file).pipe(res);
  }).listen(PORT, '127.0.0.1', () => console.log(`gab review: ${Q} on http://localhost:${PORT}`));
}
module.exports = { main };
if (require.main === module) main(process.argv.slice(2));
