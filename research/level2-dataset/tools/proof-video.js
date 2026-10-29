#!/usr/bin/env node
/* proof-video.js — side-by-side "Today" vs "With the update" video from two screen-event runs
 * (sim-slowpc.js / renton-stress.js output), with the answer key's pangti on top and a live
 * "seconds behind" under each side. HTML frames rendered by headless Chrome (puppeteer-core),
 * assembled by ffmpeg with the clip's real audio.
 *
 *   node proof-video.js spec.json out.mp4 [--keep-frames]
 * spec = { fps: 2, sections: [
 *   { type: 'card', dur: 5, title: '...', lines: ['...'] },
 *   { type: 'compare', title: '...', caption: '...', left: 'a.json', right: 'b.json',
 *     key: 'lines.csv' | null, audio: 'clip.wav', from: 120, to: 240 } ] }
 * Seconds behind at time t (key needed): 0 when the shown pangti is the one being read (last key
 * line started <= t); otherwise t minus the start of the line that followed its last reading.
 * Green when <= 1 s, amber otherwise.
 *   node proof-video.js --pick a.json b.json lines.csv --len 120 [--min 60 --max 600]
 *     prints the window where (left lag - right lag) summed per second is largest.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.env.VF_TEXT_ROOT || path.join(os.homedir(), 'personal/sttm-er-bench');
const APP = path.join(os.homedir(), 'Library/Application Support/SikhiToTheMax');
const FFMPEG = process.env.FFMPEG || path.join(os.homedir(), '.local/bin/ffmpeg');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let realm;
let anvaad;
const texts = new Map();
function textOf(id) {
  if (id == null) return null;
  if (texts.has(id)) return texts.get(id);
  if (!realm) {
    const Realm = require(path.join(ROOT, 'node_modules/realm'));
    anvaad = require(path.join(ROOT, 'node_modules/anvaad-js'));
    const sch = JSON.parse(fs.readFileSync(path.join(APP, 'realm-schema-evergreen.json'), 'utf8'));
    realm = new Realm({ path: path.join(APP, 'sttmdesktop-evergreen-v2.realm'), schema: sch.schemas, schemaVersion: sch.schemaVersion, readOnly: true });
  }
  const v = realm.objectForPrimaryKey('Verse', Number(id)) || realm.objectForPrimaryKey('Banis_Custom', Number(id));
  const u = v && v.Gurmukhi ? anvaad.unicode(v.Gurmukhi) : null;
  texts.set(id, u);
  return u;
}

function readKey(file) {
  if (!file) return null;
  const rows = fs.readFileSync(file, 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  return rows.map((r) => ({ verseId: Number(r[0]), start: Number(r[1]), end: Number(r[2]) })).sort((a, b) => a.start - b.start);
}

// events -> function(t) giving the shown verse (null = nothing / searching)
function screen(run) {
  const ev = run.events.filter((e) => ['shabad', 'verse', 'seeking'].includes(e.type)).map((e, i) => ({ ...e, i })).sort((a, b) => a.t - b.t || a.i - b.i);
  return (t) => {
    let v = null;
    let seeking = false;
    for (const e of ev) {
      if (e.t > t) break;
      if (e.type === 'seeking') seeking = e.visible;
      else if (e.verseId != null) v = e.verseId;
    }
    return seeking ? null : v;
  };
}

function lagAt(key, v, t) {
  if (!key || v == null) return null;
  let cur = -1;
  for (let i = 0; i < key.length && key[i].start <= t; i++) cur = i;
  if (cur < 0) return null;
  if (key[cur].verseId === v) return 0;
  for (let j = cur - 1; j >= 0; j--) if (key[j].verseId === v) return t - key[j + 1].start;
  return key.some((k) => k.verseId === v) ? 'ahead' : 'other';
}

function pick(a, b, keyFile, len, min, max) {
  const key = readKey(keyFile);
  const sa = screen(JSON.parse(fs.readFileSync(a)));
  const sb = screen(JSON.parse(fs.readFileSync(b)));
  // seconds where either side is ahead of / off the key make a window ineligible (reader repeats)
  const num = (x) => (typeof x === 'number' ? x : NaN);
  const diff = [];
  for (let t = 0; t < max; t += 0.5) diff.push(num(lagAt(key, sa(t), t)) - num(lagAt(key, sb(t), t)));
  let best = null;
  for (let s = min; s + len <= max; s += 5) {
    let sum = 0;
    for (let k = s * 2; k < (s + len) * 2; k++) sum += diff[k] / 2;
    if (Number.isNaN(sum)) continue;
    if (!best || sum > best.sum) best = { from: s, to: s + len, sum: +sum.toFixed(1) };
  }
  console.log(JSON.stringify(best));
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{width:1280px;height:720px;background:#111;color:#f2f2f2;font-family:-apple-system,Helvetica,Arial,sans-serif;overflow:hidden}
.g{font-family:'Noto Sans Gurmukhi','Gurmukhi MN',sans-serif}
.card{display:flex;flex-direction:column;justify-content:center;align-items:center;height:720px;text-align:center;padding:60px}
.card h1{font-size:52px;font-weight:600;margin-bottom:36px}
.card p{font-size:28px;color:#ccc;margin:10px 0;line-height:1.4}
.card table{font-size:28px;border-collapse:collapse;margin:10px 0 30px}
.card td,.card th{padding:10px 28px;border-bottom:1px solid #444}
.card th{color:#aaa;font-weight:500}
.top{position:absolute;top:0;left:0;right:0;text-align:center;padding:18px 40px 0}
.title{font-size:24px;color:#fff;font-weight:600}
.cap{font-size:20px;color:#bbb;margin-top:4px}
.now{margin-top:14px;font-size:17px;color:#999}
.nowt{font-size:28px;color:#ddd;margin-top:4px;line-height:1.5;min-height:42px}
.side{position:absolute;top:220px;width:640px;height:500px;padding:0 36px;text-align:center}
.l{left:0;border-right:1px solid #333}.r{left:640px}
.lab{font-size:26px;color:#aaa;margin-bottom:28px;font-weight:600}
.p{font-size:44px;line-height:1.55;min-height:210px;display:flex;align-items:center;justify-content:center}
.p.none{font-size:26px;color:#888;font-family:inherit}
.lag{font-size:32px;font-weight:600;margin-top:26px}
.ok{color:#3ecf6a}.warn{color:#f0a830}.dim{color:#888}
.so{font-size:19px;color:#aaa;margin-top:18px}
.t{position:absolute;bottom:10px;right:16px;font-size:15px;color:#666}`;

function sideHtml(label, v, lag, cls, pct) {
  const tx = v == null ? null : textOf(v);
  const p = tx ? `<div class="p g">${esc(tx)}</div>` : '<div class="p none">(searching)</div>';
  let l = '';
  if (lag === 0 || (typeof lag === 'number' && lag <= 1)) l = `<div class="lag ok">${lag === 0 ? 'On the right pangti' : `${lag.toFixed(1)} s behind`}</div>`;
  else if (typeof lag === 'number') l = `<div class="lag warn">${lag.toFixed(1)} s behind</div>`;
  else if (lag === 'ahead') l = '<div class="lag warn">ahead of the reading</div>';
  else if (lag === 'other') l = '<div class="lag warn">not the pangti being read</div>';
  else if (lag === 'same') l = '';
  const so = pct == null ? '' : `<div class="so">On the right pangti so far in this stretch: ${pct}%</div>`;
  return `<div class="side ${cls}"><div class="lab">${label}</div>${p}${l}${so}</div>`;
}

function fmt(t) { const m = Math.floor(t / 60); const s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }

async function render(spec, outFile, keepFrames) {
  const puppeteer = require(path.join(os.homedir(), 'personal/sttm-desktop/node_modules/puppeteer-core'));
  const fps = spec.fps || 2;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-video-'));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Gurmukhi:wght@500&display=block" rel="stylesheet"><style>${CSS}</style></head><body><span class="g" style="opacity:0">ੴ ਸਤਿ</span><div id="b"></div></body></html>`, { waitUntil: 'load', timeout: 60000 }).catch((e) => console.log(`font page load: ${e.message} (falling back to Gurmukhi MN if needed)`));
  await page.evaluate(() => document.fonts.ready);
  const fontOk = await page.evaluate(() => document.fonts.check("44px 'Noto Sans Gurmukhi'", 'ਸਤਿ'));
  console.log(`Noto Sans Gurmukhi loaded: ${fontOk}`);
  const shot = async (html, file) => { await page.evaluate((h) => { document.getElementById('b').innerHTML = h; }, html); await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1280, height: 720 } }); };
  const segs = [];
  for (const [si, s] of spec.sections.entries()) {
    const dir = path.join(tmp, `s${si}`);
    fs.mkdirSync(dir);
    const seg = path.join(tmp, `seg${si}.mp4`);
    const venc = ['-vf', 'scale=1280:720,setsar=1', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-r', '25'];
    const aenc = ['-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2'];
    if (s.type === 'card') {
      const rows = s.table ? `<table><tr>${s.table[0].map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${s.table.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>` : '';
      await shot(`<div class="card"><h1>${esc(s.title)}</h1>${rows}${(s.lines || []).map((l) => `<p>${esc(l)}</p>`).join('')}</div>`, path.join(dir, 'card.png'));
      execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', String(fps), '-t', String(s.dur), '-i', path.join(dir, 'card.png'),
        '-f', 'lavfi', '-t', String(s.dur), '-i', 'anullsrc=r=48000:cl=stereo', ...venc, ...aenc, '-shortest', seg]);
    } else {
      const key = readKey(s.key);
      const L = screen(JSON.parse(fs.readFileSync(s.left)));
      const R = screen(JSON.parse(fs.readFileSync(s.right)));
      const n = Math.round((s.to - s.from) * fps);
      for (let k = 0; k < n; k++) {
        const t = s.from + k / fps;
        let nowHtml = '';
        if (key) {
          let cur = null;
          for (const x of key) { if (x.start <= t) cur = x; else break; }
          nowHtml = `<div class="now">Being read now:</div><div class="nowt g">${esc(cur ? textOf(cur.verseId) : '')}</div>`;
        }
        const lv = L(t);
        const rv = R(t);
        const ll = key ? lagAt(key, lv, t) : 'same';
        const rl = key ? lagAt(key, rv, t) : 'same';
        const pct = (side) => {
          if (!key || t <= s.from) return key ? '-' : null;
          let on = 0; let all = 0;
          for (let u = s.from; u <= t; u += 0.1) { all++; if (lagAt(key, side(u), u) === 0) on++; }
          return Math.round((100 * on) / all);
        };
        const html = `<div class="top"><div class="title">${esc(s.title)}</div>${s.caption ? `<div class="cap">${esc(s.caption)}</div>` : ''}${nowHtml}</div>`
          + sideHtml(s.leftLabel || 'Today', lv, ll, 'l', pct(L)) + sideHtml(s.rightLabel || 'With the update', rv, rl, 'r', pct(R))
          + `<div class="t">recording time ${fmt(t)}</div>`;
        await shot(html, path.join(dir, `f${String(k).padStart(5, '0')}.png`));
      }
      const dur = s.to - s.from;
      execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, 'f%05d.png'),
        '-ss', String(s.from), '-t', String(dur), '-i', s.audio, ...venc, ...aenc, '-t', String(dur), seg]);
    }
    console.log(`section ${si} (${s.type}) done`);
    segs.push(seg);
  }
  await browser.close();
  const list = path.join(tmp, 'list.txt');
  fs.writeFileSync(list, segs.map((f) => `file '${f}'`).join('\n'));
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', outFile]);
  if (keepFrames) console.log(`frames kept in ${tmp}`); else fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`wrote ${outFile}`);
}

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
if (argv[0] === '--pick') {
  pick(argv[1], argv[2], argv[3], Number(arg('len', 120)), Number(arg('min', 60)), Number(arg('max', 600)));
  process.exit(0);
} else {
  render(JSON.parse(fs.readFileSync(argv[0], 'utf8')), path.resolve(argv[1]), argv.includes('--keep-frames'))
    .then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
}
