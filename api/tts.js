// הקול של העוזר האישי: ElevenLabs, מודל eleven_v3 בעברית.
// הטוקן נשמר במשתנה הסביבה ELEVEN_LABS ב-Vercel ולא מגיע לדפדפן.
// אותו טקסט חוזר מה-CDN של Vercel, כך שמשלמים על כל טקסט פעם אחת בלבד.
const VOICE = 'k77ZRVqAFg9Hd0ltAuON'; // Omer: קול גברי עברי, עמוק, בטוח ואנרגטי
const MOOD = { sad: '[sad] ', happy: '[excited] ' };
const MAX = 900;
// רק הדמו עצמו (ותצוגות מקדימות שלו, או הרצה מקומית) יכול לבקש קול, כדי שאחרים לא ישרפו את הקרדיטים
const HOST = /^(smart-kitchen-demo(-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/;

module.exports = async (req, res) => {
  const key = process.env.ELEVEN_LABS;
  const q = req.query || {};
  const text = String(q.t || '').trim();
  let host = '';
  try { host = new URL(req.headers.referer || req.headers.origin || '').hostname; } catch (e) { /* בלי מקור: נדחה */ }
  if (!key) { res.status(503).end(); return; }
  if (!text || text.length > MAX || !HOST.test(host)) { res.status(400).end(); return; }

  const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + VOICE + '/stream?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: (MOOD[q.m] || '') + text, model_id: 'eleven_v3', language_code: 'he' })
  });
  if (!r.ok || !r.body) { res.status(502).end(); return; }

  // השמעה מתחילה עוד לפני שכל הקובץ מוכן
  res.status(200);
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
  for await (const chunk of r.body) res.write(chunk);
  res.end();
};
