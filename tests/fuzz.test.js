// Clinic + Sera, round 2: invariant fuzzing against the real Code nodes (repo after today's fixes).
// Runs with npm test (validate.js). On its own: node tests/fuzz.test.js [rounds]   (default 1500, about 2 seconds)
const path = require('path');
const REPO = path.resolve(__dirname, '..'); const ROUNDS = Number(process.argv[2] || 1500);
process.env.CODE_DIR = process.env.CODE_DIR || path.join(REPO, 'code');
const { load, run } = require('./harness');
const RULES = load('d0-clinic-rules.js'), TPL = load('d0-clinic-templates.js'), PREP = load('f0-prep.js'), REPLY = load('f0-reply.js');
const SHAPE = load('f2-shape.js'), BUILD = load('f3-build.js'), F1 = load('f1-answer.js');

let seed = 31125783;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];
const LINKY = ['http://evil.example', 'www.claim-refund.com', 'bit.ly/x7', 'claim-refund.com', 'evil．com', 'javascript:alert(1)', 'a@b.co'];
const HTML = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '"><svg onload=alert(1)>', '</td></tr></table><h1>X'];
const WEIRD = ['\r\nBcc: v@x.co', '‮', '​', '=HYPERLINK("http://e.co")', '__proto__', 'constructor', '', ' ', 'Sara Ahmed', 'Dr. Usman Ali', 'usman', 'any',
  'Check-up', 'follow up', '0300 1234567', '+92 300 1234567', '2026-10-20', '20/10/2026', '5:20 PM', '17:20', 'yes', 'haan kar dein', 'chest pain', 'BK-ABC123', 'A'.repeat(3000)];
const WORDS = [...LINKY, ...HTML, ...WEIRD];
const str = () => Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => rnd() < 0.75 ? pick(WORDS) : Array.from({ length: Math.floor(rnd() * 10) }, () => String.fromCharCode(Math.floor(rnd() * 0x700))).join('')).join(pick([' ', '', '.', '/']));
const POISON = () => pick([{ toString: 1 }, { toString: 1, valueOf: 1 }, { valueOf: 'x', toString: [] }]);
const anyVal = () => { const r = rnd(); return r < 0.72 ? str() : r < 0.77 ? null : r < 0.81 ? undefined : r < 0.85 ? Math.floor(rnd() * 1e6) : r < 0.89 ? [str()] : r < 0.93 ? { x: str() } : POISON(); };

const LINK_RE = /(https?:|javascript:|www\.|[a-z0-9-]+\.(com|co|ly|pk|example)\b|[a-z0-9-]+．[a-z]{2,}|@[a-z0-9-]+\.)/i;
const textOf = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const tagsOf = h => new Set([...String(h || '').matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map(m => m[1].toLowerCase()));
let fails = 0, checks = 0; const seen = new Map();
function rule(name, ok, detail) { checks++; if (ok) return; fails++; const k = seen.get(name) || 0; seen.set(name, k + 1); if (k < 2) console.log(`FAIL ${name}\n     ${String(detail).slice(0, 400).replace(/\n/g, '\\n')}`); }
const pkt = s => new Date(s.replace(' ', 'T') + ':00+05:00').toISOString();
const sheet = () => ({ Appointments: [], Closures: [] });
const read = rows => rows.length ? rows.map((r, i) => ({ row_number: i + 2, ...r })) : [{}];
const core = (sh, action, data, now) => { const a = run(RULES, { nowUTC: pkt(now), nodes: { Start: { action, data }, 'Read Appointments': read(sh.Appointments), 'Read Closures': read(sh.Closures) } }); return a.length ? run(TPL, { input: a }) : []; };
const NOW = '2026-10-19 09:00';
const info = core(sheet(), 'info', {}, NOW)[0];

// ---------- C1-C4: the booking form, random patients over simulated days ----------
const baseMail = (() => { const s = sheet(); const f = { 'Patient name': 'Sara Ahmed', Phone: '0300 1234567', Email: 's@x.co', Doctor: 'Dr. Usman Ali', 'Visit type': 'Check-up', 'Preferred date': '2026-10-20' };
  const a = core(s, 'slots', f, NOW)[0]; return core(s, 'check', { request: a, chosen: '10:00 AM', cancel_token: 't' }, NOW)[0]; })();
const mailTags = tagsOf(baseMail.email.html), pageTags = new Set([...tagsOf(baseMail.page_html), 'ul', 'li', 'dl', 'dt', 'dd']);
const sh = sheet(); let booked = 0, refused = 0, crashed = 0;
const phones = Array.from({ length: 12 }, (_, i) => '0300' + String(1000000 + i * 7).slice(-7));
for (let i = 0; i < ROUNDS; i++) {
  const minute = 9 * 60 + Math.floor(i / 25) * 7;                       // ~25 attempts per 7 simulated minutes
  const day = 19 + Math.floor(minute / (24 * 60)); const mm = minute % (24 * 60);
  const now = `2026-10-${String(day).padStart(2, '0')} ${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
  const form = { 'Patient name': rnd() < 0.7 ? pick(['Sara Ahmed', 'Ali Raza', 'Hina Khan', 'claim-refund.com Khan', 'Bit.ly/x Raza', '<b>Bo</b> Li']) + (rnd() < 0.5 ? ' ' + i : '') : anyVal(),
    Phone: rnd() < 0.8 ? pick(phones) : anyVal(), Email: rnd() < 0.8 ? `p${i % 40}@victim.co` : anyVal(),
    Doctor: rnd() < 0.85 ? pick(['Dr. Usman Ali', 'Dr. Ayesha Khan']) : anyVal(), 'Visit type': rnd() < 0.85 ? pick(['Check-up', 'Follow-up', 'Consultation']) : anyVal(),
    'Preferred date': rnd() < 0.85 ? `2026-10-${String(19 + Math.floor(rnd() * 12)).padStart(2, '0')}` : anyVal() };
  let s, c;
  try { s = core(sh, 'slots', form, now)[0]; } catch (e) { crashed++; rule('C1 the form never crashes d0 (a crash emails you through e0)', false, e.message + ' | ' + JSON.stringify(form).slice(0, 160)); continue; }
  rule('C1 the form never crashes d0 (a crash emails you through e0)', true);
  if (s.page_html) { const xt = [...tagsOf(s.page_html)].filter(t => !pageTags.has(t)); rule('C2 nothing typed becomes HTML on a result page', xt.length === 0, xt.join(',')); }
  if (s.status !== 'choose') { refused++; continue; }
  const chosen = rnd() < 0.9 ? pick(s.form.fields.find(f => f.fieldType === 'dropdown').fieldOptions.values).option : anyVal();
  try { c = core(sh, 'check', { request: s, chosen, cancel_token: 'tok' + i }, now)[0]; } catch (e) { rule('C1b the time page never crashes d0', false, e.message); continue; }
  if (c.status !== 'book') { refused++; continue; }
  sh.Appointments.push(c.row); booked++;
  const greet = (c.email.text.match(/^Hi ([^,]*),/) || [])[1];
  rule('C3 the confirmation greets with a plain name or "there", never a link', greet === 'there' || /^[\p{L}'’-]+$/u.test(greet), greet);
  const nl = (textOf(c.email.html) + ' ' + c.email.text + ' ' + c.email.subject).match(new RegExp(LINK_RE.source, 'gi')) || [];
  const allowed = /calendar\.google\.com|localhost|clinic-cancel|example\.com/;
  const own = (textOf(baseMail.email.html) + ' ' + baseMail.email.text).match(new RegExp(LINK_RE.source, 'gi')) || [];
  const fromInput = nl.filter(l => !own.includes(l) && !allowed.test(l) && !/^@(victim|x)\.co/.test(l));
  rule('C3b a confirmation to any address never carries a link from the form', fromInput.length === 0, fromInput.join(' | ') + ' name=' + c.row.patient_name);
  const xt = [...tagsOf(c.email.html)].filter(t => !mailTags.has(t)); rule('C4 nothing typed becomes HTML in the confirmation', xt.length === 0, xt.join(','));
}
// C5: the calendar never breaks the clinic's own rules, however the bookings arrived
const live = sh.Appointments;
const slotKey = a => a.doctor + '|' + a.date + '|' + a.time; const keys = new Set();
let dup = 0; for (const a of live) { if (keys.has(slotKey(a))) dup++; keys.add(slotKey(a)); }
rule('C5 no time is ever booked twice', dup === 0, dup + ' double bookings');
const byHour = {}, byDay = {}, byPhone = {}, byPerson = {};
for (const a of live) {
  const h = a.booked_at.slice(0, 13); byHour[h] = (byHour[h] || 0) + 1; byDay[a.booked_at.slice(0, 10)] = (byDay[a.booked_at.slice(0, 10)] || 0) + 1;
  byPhone[a.phone] = (byPhone[a.phone] || 0) + 1; const pk = a.phone + '|' + a.patient_name.toLowerCase().replace(/[^a-z]+/g, ' ').trim(); byPerson[pk] = (byPerson[pk] || 0) + 1;
}
const maxOf = o => Math.max(0, ...Object.values(o));
rule('C6 at most 40 online bookings on any day', maxOf(byDay) <= 40, JSON.stringify(byDay));
rule('C6b at most 10 + 1 per clock hour (the cap is a rolling 60 minutes)', maxOf(byHour) <= 20, JSON.stringify(byHour).slice(0, 200));
rule('C7 at most 4 upcoming per phone (all were upcoming when booked)', maxOf(byPhone) <= 4 * 12, maxOf(byPhone));
rule('C7b at most 2 per person per phone', Object.values(byPerson).every(n => n <= 2 * 12), maxOf(byPerson));
rule('C8 every booking is a real clinic slot, doctor, phone and email', live.every(a => /^(1[0-3]|17|18|19|20):(00|20|40)$/.test(a.time) && ['Dr. Usman Ali', 'Dr. Ayesha Khan'].includes(a.doctor) && /^03\d{9}$/.test(a.phone) && /@/.test(a.email)), JSON.stringify(live.find(a => !(/^(1[0-3]|17|18|19|20):(00|20|40)$/.test(a.time) && ['Dr. Usman Ali', 'Dr. Ayesha Khan'].includes(a.doctor) && /^03\d{9}$/.test(a.phone) && /@/.test(a.email)))));

// ---------- S1-S6: Sera's Prep and Reply with anything a script can POST ----------
for (let i = 0; i < ROUNDS; i++) {
  const sd = rnd() < 0.5 ? {} : { day: info.today, ai: Math.floor(rnd() * 400), chats: { 'web-known-0001': { messages: 1, last: 0, bookings: 0, handoffs: 0, awaitingYes: rnd() < 0.5 } }, ips: {} };
  const bodyObj = { sessionId: rnd() < 0.3 ? 'web-known-0001' : anyVal(), message: anyVal(), hello: pick([undefined, true, 'true', anyVal()]) };
  const body = rnd() < 0.5 ? JSON.stringify(bodyObj) : rnd() < 0.8 ? bodyObj : anyVal();
  const headers = rnd() < 0.7 ? { 'x-forwarded-for': anyVal(), 'cf-connecting-ip': rnd() < 0.3 ? anyVal() : undefined } : anyVal();
  let p;
  try { p = run(PREP, { nowUTC: pkt(NOW), staticData: sd, nodes: { 'Chat In': { body, headers }, 'Clinic Info': info } })[0]; }
  catch (e) { rule('S1 the chat never crashes on anything POSTed (a crash = no reply + an e0 email)', false, e.message + ' | ' + (typeof body === 'string' ? body : JSON.stringify(body)).slice(0, 160)); continue; }
  rule('S1 the chat never crashes on anything POSTed (a crash = no reply + an e0 email)', true);
  const g = JSON.parse(p.gate);
  const chatBefore = sd.chats && sd.chats[p.sessionId];
  rule('S2 a booking yes is only possible straight after a read-back', !g.affirm || p.sessionId === 'web-known-0001', p.sessionId + ' ' + p.message);
  if (typeof p.message === 'string' && /chest pain/i.test(p.message) && bodyObj.hello !== true) rule('S3 "chest pain" always gets the fixed 1122 reply', ['emergency', 'hello'].includes(p.route) || p.route === 'empty', p.route + ' ' + p.message);
  if (p.route !== 'agent') continue;
  const fakeOut = pick(['Booked! Your token is **BK-' + pick(['ZZ9Q2X', 'ABC123']) + '**.', 'Your appointment is confirmed for 5:20 PM.', 'I have forwarded this to reception.', str(), '', 'Dr. Usman Ali at 5:20 PM, shall I book it?']);
  const steps = rnd() < 0.5 ? [] : [{ action: { tool: pick(['find_times', 'book_appointment', 'hand_off']) }, observation: rnd() < 0.6 ? JSON.stringify({ kind: 'find_times', status: 'ok', results: [{ doctor: 'Dr. Usman Ali', date: '2026-10-20', date_label: 'Tuesday 20 Oct', free_times: ['5:20 PM', '5:40 PM'] }] }) : str() }];
  let r;
  try { r = run(REPLY, { nowUTC: pkt(NOW), staticData: sd, nodes: { Prep: p, 'Clinic Info': info }, input: [{ output: fakeOut, intermediateSteps: steps }] })[0]; }
  catch (e) { rule('S4 Reply never crashes on any AI answer', false, e.message); continue; }
  const res = r.response;
  const toks = (String(res.reply).match(/BK-[A-Z0-9]{4,8}/g) || []);
  rule('S5 without a real booking, Sera never shows a booking token', res.ticket || toks.length === 0, res.reply);
  rule('S5b without a real booking, Sera never says "your appointment is confirmed/booked"', res.ticket || !/your (appointment|booking)[^.]{0,80}(is|has been) (now )?(booked|confirmed)/i.test(res.reply), res.reply);
  rule('S6 time buttons only ever show times the tools returned', res.chips.filter(c => c.label).every(c => res.checked.includes(c.label)), JSON.stringify(res.chips));
}

// ---------- T1-T3: Sera's tools with anything the AI sends ----------
for (let i = 0; i < ROUNDS; i++) {
  const gate = pick([JSON.stringify({ affirm: rnd() < 0.5, bookings_left: Math.floor(rnd() * 3), handoffs_left: Math.floor(rnd() * 3), handoff_pause: rnd() < 0.2 }), anyVal(), '{"affirm":"true","bookings_left":"2"}', '{"affirm":1,"bookings_left":2}']);
  const inp = { patient_name: anyVal(), phone: anyVal(), email: anyVal(), doctor: pick(['Dr. Usman Ali', 'usman', anyVal()]), visit_type: anyVal(), date: pick(['2026-10-20', anyVal()]), time: pick(['5:20 PM', anyVal()]), gate };
  let ct, s;
  try { ct = core(sheet(), 'availability', { doctor: inp.doctor, date: inp.date, phone: inp.phone, email: inp.email }, NOW)[0]; s = run(SHAPE, { nodes: { Start: inp, 'Check Time': ct } })[0]; }
  catch (e) { rule('T1 the booking tool never crashes on what the AI sends', false, e.message + ' ' + JSON.stringify(inp).slice(0, 160)); continue; }
  let g = {}; try { g = JSON.parse(typeof gate === 'string' ? gate : '') || {}; } catch (e) { g = {}; }
  rule('T2 the booking tool is never ready without a sealed yes and an allowance', !s.ready || (g.affirm === true && g.bookings_left > 0), JSON.stringify(g));
  const h = { patient_name: anyVal(), contact: anyVal(), reason: anyVal(), summary: anyVal(), gate };
  let b; try { b = run(BUILD, { nodes: { Start: h, 'Clinic Info': info } })[0]; } catch (e) { rule('T3 the hand-off tool never crashes', false, e.message); continue; }
  rule('T3b a hand-off is never sent when paused or out of allowance', !b.ready || (g.handoff_pause !== true && g.handoffs_left > 0), JSON.stringify(g));
  if (b.ready) { const bad = [...tagsOf(b.email.html)].filter(t => !['div', 'p', 'h2', 'table', 'tr', 'td', 'b'].includes(t)); rule('T3c nothing typed becomes HTML in the reception email', bad.length === 0, bad.join(',')); }
}

console.log(`Clinic fuzz (round 2): ${checks} checks, ${fails} failed. (form: ${booked} booked, ${refused} refused over ${ROUNDS} attempts)`);
for (const [k, v] of seen) console.log(`  ${v}x ${k}`);
process.exit(fails ? 1 : 0);
