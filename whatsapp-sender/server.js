'use strict';
/*
 * תוכנת השליחה של Smart Kitchen: שולחת הודעות וואטסאפ מהמספר שמחובר (whatsapp-web.js).
 * רצה במחשב בלבד (127.0.0.1:3001). האתר שולח אליה בקשה, והיא שולחת את ההודעה.
 * חיבור ראשון: פותחים http://127.0.0.1:3001 וסורקים את הקוד מהטלפון (וואטסאפ > מכשירים מקושרים).
 */
const http = require('http');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const qrTerminal = require('qrcode-terminal');

const PORT = 3001;
const HOST = '127.0.0.1';
// רק האתר הזה (והדמו המקומי) רשאים לשלוח דרך התוכנה
const ALLOWED_ORIGINS = ['https://smart-kitchen-demo.vercel.app'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
// הפסקה בין הודעות, כדי לא להיראות כמו ספאם
const GAP_MS = 4000, JITTER_MS = 3000;

let status = 'starting'; // starting | qr | ready | disconnected
let qrDataUrl = '';
let me = '';

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
  puppeteer: { headless: true, args: ['--no-sandbox'] }
});

client.on('qr', async (qr) => {
  status = 'qr';
  qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 280 });
  console.log('\nסורקים את הקוד מהטלפון: וואטסאפ > הגדרות > מכשירים מקושרים > קישור מכשיר');
  console.log('או פותחים בדפדפן: http://' + HOST + ':' + PORT + '\n');
  qrTerminal.generate(qr, { small: true });
});
client.on('ready', () => {
  status = 'ready';
  qrDataUrl = '';
  me = client.info && client.info.wid ? client.info.wid.user : '';
  console.log('מחובר לוואטסאפ' + (me ? ' (' + me + ')' : '') + '. אפשר לשלוח מהאתר.');
});
client.on('auth_failure', (m) => { status = 'disconnected'; console.error('ההתחברות נכשלה:', m); });
client.on('disconnected', (r) => {
  status = 'disconnected';
  console.error('נותק מוואטסאפ:', r, '— מנסה להתחבר מחדש');
  client.initialize().catch((e) => console.error(e));
});

// תור שליחה: הודעה אחת בכל פעם, עם הפסקה ביניהן
let chain = Promise.resolve();
let lastSent = 0;
function enqueue(job) {
  const run = chain.then(async () => {
    const wait = lastSent + GAP_MS + Math.random() * JITTER_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try { return await job(); } finally { lastSent = Date.now(); }
  });
  chain = run.catch(() => {});
  return run;
}

async function send(phone, message) {
  const id = await client.getNumberId(phone);
  if (!id) { const e = new Error('המספר לא רשום בוואטסאפ'); e.code = 'not_on_whatsapp'; throw e; }
  await client.sendMessage(id._serialized, message);
}

function cors(req, res) {
  const o = req.headers.origin;
  if (!o) return true; // בקשה מהמחשב עצמו (לא מדפדפן)
  if (ALLOWED_ORIGINS.indexOf(o) < 0 && !LOCAL_ORIGIN.test(o)) return false;
  res.setHeader('Access-Control-Allow-Origin', o);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  return true;
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 20000) { reject(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { reject(e); } });
  });
}

const STATUS_TEXT = { starting: 'מתחבר לוואטסאפ…', qr: 'צריך לסרוק את הקוד', ready: 'מחובר ומוכן לשליחה', disconnected: 'מנותק. מנסה להתחבר מחדש…' };
function page() {
  return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    (status === 'ready' ? '' : '<meta http-equiv="refresh" content="3">') +
    '<title>תוכנת השליחה</title><style>body{font-family:system-ui,sans-serif;background:#F3F4F8;color:#22253A;display:flex;justify-content:center;padding:40px 16px;margin:0}' +
    '.c{background:#FFF;border:1px solid #E3E5EC;border-radius:12px;padding:24px;max-width:420px;width:100%;text-align:center}h1{font-size:20px;margin:0 0 8px}' +
    '.s{font-weight:700;color:' + (status === 'ready' ? '#037F4C' : '#B4541A') + '}p{color:#5A607A;line-height:1.6}img{margin:12px auto;display:block}</style></head><body><div class="c">' +
    '<h1>תוכנת השליחה של Smart Kitchen</h1><div class="s">' + STATUS_TEXT[status] + (status === 'ready' && me ? ' · ' + me : '') + '</div>' +
    (qrDataUrl ? '<img src="' + qrDataUrl + '" width="280" height="280" alt="קוד QR לחיבור וואטסאפ"><p>בטלפון: וואטסאפ ← הגדרות ← מכשירים מקושרים ← קישור מכשיר, וסורקים את הקוד.</p>' : '') +
    (status === 'ready' ? '<p>אפשר לחזור לאתר ולשלוח סקרים. החלון הזה לא צריך להישאר פתוח, אבל התוכנה כן.</p>' : '') +
    '</div></body></html>';
}

// נגד DNS rebinding: אתר זר שמצביע על 127.0.0.1 מגיע עם Host של הדומיין שלו, ולא יוכל לקרוא את הקוד או את המספר
const ALLOWED_HOSTS = [HOST + ':' + PORT, 'localhost:' + PORT];

http.createServer(async (req, res) => {
  if (ALLOWED_HOSTS.indexOf(String(req.headers.host || '').toLowerCase()) < 0) return json(res, 403, { error: 'forbidden_host' });
  if (!cors(req, res)) return json(res, 403, { error: 'forbidden_origin' });
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = req.url.split('?')[0];

  if (req.method === 'GET' && url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(page());
  }
  if (req.method === 'GET' && url === '/status') return json(res, 200, { status, me });

  if (req.method === 'POST' && url === '/send') {
    let body;
    try { body = await readBody(req); } catch (e) { return json(res, 400, { error: 'bad_request' }); }
    const phone = String(body.phone || '').replace(/\D/g, '');
    const message = String(body.message || '');
    if (phone.length < 11 || phone.length > 15) return json(res, 400, { error: 'bad_phone' });
    if (!message.trim() || message.length > 4000) return json(res, 400, { error: 'bad_message' });
    if (status !== 'ready') return json(res, 503, { error: 'not_ready', status });
    try {
      await enqueue(() => send(phone, message));
      console.log('נשלח ל־' + phone);
      return json(res, 200, { ok: true });
    } catch (e) {
      console.error('שליחה ל־' + phone + ' נכשלה:', e.message);
      return json(res, e.code === 'not_on_whatsapp' ? 404 : 500, { error: e.code || 'send_failed', message: e.message });
    }
  }
  json(res, 404, { error: 'not_found' });
}).listen(PORT, HOST, () => {
  console.log('תוכנת השליחה פועלת: http://' + HOST + ':' + PORT);
  client.initialize().catch((e) => { status = 'disconnected'; console.error('לא הצלחתי להפעיל את וואטסאפ:', e.message); });
});
