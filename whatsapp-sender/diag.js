'use strict';
// בדיקה בלבד: מחפש מספר בוואטסאפ בלי לשלוח הודעה. שימוש: node diag.js 972501234567
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const phone = process.argv[2];
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
  puppeteer: { headless: true, args: ['--no-sandbox'] }
});
const t0 = Date.now();
const log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(1) + 's]', ...a);
const withTimeout = (p, ms, name) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(name + ' timed out after ' + ms + 'ms')), ms))]);
client.on('qr', () => { log('needs QR — session not saved'); process.exit(2); });
client.on('ready', async () => {
  log('ready, version', await client.getWWebVersion());
  try {
    const id = await withTimeout(client.getNumberId(phone), 20000, 'getNumberId');
    log('getNumberId ->', JSON.stringify(id));
    if (id) {
      const chat = await withTimeout(client.getChatById(id._serialized), 20000, 'getChatById').catch((e) => 'ERR ' + e.message);
      log('getChatById ->', typeof chat === 'string' ? chat : 'ok, isGroup=' + chat.isGroup);
    }
  } catch (e) { log('ERROR', e.message); }
  await client.destroy();
  process.exit(0);
});
client.initialize();
