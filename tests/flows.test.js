// End-to-end flow simulations: every Code node runs unchanged; Sheets and SMTP are in-memory fakes.
// This is a model of how n8n runs the nodes in order, not n8n itself. The live runs in n8n verify the real thing.
const { load, run, t, throws, report } = require('./harness');
const RULES = load('d0-clinic-rules.js'), TPL = load('d0-clinic-templates.js');
const D1 = load('d1-finish.js'), D2 = load('d2-finish.js'), STAMP = load('d3-stamp.js'), CHECK3 = load('d3-check-sends.js'), CHECK4 = load('d4-check-sends.js');
const pkt = s => new Date(s.replace(' ', 'T') + ':00+05:00').toISOString();
const UA = 'Dr. Usman Ali';

// ---------- fakes ----------
function makeSheet() {
  const tabs = { Appointments: [], 'Request Log': [], Closures: [] };
  return {
    tabs,
    read: tab => tabs[tab].length ? tabs[tab].map((r, i) => ({ row_number: i + 2, ...r })) : [{}],
    // Google Sheets "Append or Update" matching on one column, values written RAW (as strings)
    upsert(tab, match, row) {
      const raw = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v ?? '')]));
      const i = tabs[tab].findIndex(r => r[match] === raw[match]);
      if (i >= 0) tabs[tab][i] = { ...tabs[tab][i], ...raw }; else tabs[tab].push(raw);
    },
    update(tab, match, row) {                                  // "Update Row": only changes rows that exist
      const i = tabs[tab].findIndex(r => r[match] === String(row[match]));
      if (i < 0) throw new Error(`No row with ${match} = ${row[match]}`);
      tabs[tab][i] = { ...tabs[tab][i], ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v)])) };
    },
  };
}
function makeSmtp(failFor = []) {
  const sent = [];
  return { sent, send: e => {
    if (failFor.some(f => e.to.includes(f))) return { error: { message: `550 Mailbox unavailable: ${e.to}` } };
    sent.push(e); return { accepted: [e.to], rejected: [], messageId: '<x@y>' };
  } };
}
function core(sheet, action, data, now) {
  const ans = run(RULES, { nowUTC: pkt(now), nodes: { Start: { action, data }, 'Read Appointments': sheet.read('Appointments'), 'Read Closures': sheet.read('Closures') } });
  return ans.length ? run(TPL, { input: ans }) : [];
}

// ---------- d1 · clinic-booking ----------
const form = (x = {}) => ({ 'Patient name': 'Sara Ahmed', Phone: '0300 1234567', Email: 'sara@example.com', Doctor: UA, 'Visit type': 'Check-up', 'Preferred date': '2026-10-20', ...x });
let tokenNo = 0;
function d1(sheet, smtp, f, pick, { now = '2026-10-19 09:00', pickNow = now, beforeCheck = () => {}, saveTwice = false } = {}) {
  const nodes = {};
  nodes['Find Times'] = core(sheet, 'slots', f, now)[0];
  if (nodes['Find Times'].status === 'choose') {                                   // Can Choose? -> true
    const chosen = typeof pick === 'function' ? pick(nodes['Find Times']) : pick;  // Choose Time (form page 2)
    const token = 'uuid-' + (++tokenNo);                                           // Make Cancel Token
    beforeCheck();
    nodes['Final Check'] = core(sheet, 'check', { request: nodes['Find Times'], chosen, cancel_token: token }, pickNow)[0];
    if (nodes['Final Check'].status === 'book') {                                  // Book It? -> true
      sheet.upsert('Appointments', 'booking_id', nodes['Final Check'].row);        // Save Appointment
      if (saveTwice) sheet.upsert('Appointments', 'booking_id', nodes['Final Check'].row);
      nodes['Send Confirmation'] = smtp.send(nodes['Final Check'].email);
    }
  }
  const fin = run(D1, { nodes })[0];                                               // Finish
  sheet.upsert('Request Log', 'booking_id', fin.log);                              // Log Request
  return { ...fin, nodes };                                                        // Done shows fin.html
}
{
  const sheet = makeSheet(), smtp = makeSmtp();
  const r = d1(sheet, smtp, form(), '5:20 PM');
  const row = sheet.tabs.Appointments[0];
  t('d1 booked: one row, all 14 columns', sheet.tabs.Appointments.length === 1 && Object.keys(row).length === 14, row);
  t('d1 booked: phone keeps its leading 0 (RAW)', row.phone === '03001234567', row.phone);
  t('d1 booked: times stored in PKT', row.booked_at === '2026-10-19 09:00 PKT', row.booked_at);
  t('d1 booked: email sent to patient', smtp.sent.length === 1 && smtp.sent[0].to === 'sara@example.com', smtp.sent);
  t('d1 booked: log row Booked + Sent, same ID as the appointment', sheet.tabs['Request Log'][0].outcome === 'Booked' && sheet.tabs['Request Log'][0].confirmation_email === 'Sent' && sheet.tabs['Request Log'][0].booking_id === row.booking_id, sheet.tabs['Request Log'][0]);
  t('d1 booked: page is the booked page', /You&#39;re booked|You're booked/.test(r.html) && /5:20 PM/.test(r.html), r.html.slice(0, 80));

  // second patient wants the same time: it isn't offered any more
  const r2 = d1(sheet, smtp, form({ 'Patient name': 'Bilal Raza', Email: 'bilal@example.com' }), a => a.form.fields.find(f => f.fieldType === 'dropdown').fieldOptions.values.map(v => v.option).includes('5:20 PM') ? '5:20 PM' : 'not offered');
  t('d1: a booked time is no longer on the list', r2.nodes['Final Check'].outcome === 'Invalid details' && /not offered/.test(r2.nodes['Final Check'].reason), r2.nodes['Final Check']);
}
{
  const sheet = makeSheet(), smtp = makeSmtp();
  d1(sheet, smtp, form(), '5:20 PM', { saveTwice: true });
  t('d1 retry: saving twice still leaves one row (append-or-update)', sheet.tabs.Appointments.length === 1, sheet.tabs.Appointments.length);
}
{
  const sheet = makeSheet(), smtp = makeSmtp(['sara@']);
  const r = d1(sheet, smtp, form(), '5:20 PM');
  t('d1 email fails: booking kept', sheet.tabs.Appointments.length === 1, '');
  t('d1 email fails: patient still sees "You\'re booked" + a note', /couldn't send the confirmation email/.test(r.html), r.html.match(/dc-note">[^<]+/));
  t('d1 email fails: logged with the reason', /^Failed: 550 Mailbox unavailable/.test(sheet.tabs['Request Log'][0].confirmation_email), sheet.tabs['Request Log'][0].confirmation_email);
}
{
  // Two patients both see 5:20 PM free; Bilal books it while Sara is still choosing.
  const sheet = makeSheet(), smtp = makeSmtp();
  const r = d1(sheet, smtp, form(), '5:20 PM', { beforeCheck: () => d1(sheet, smtp, form({ 'Patient name': 'Bilal Raza', Email: 'bilal@example.com' }), '5:20 PM') });
  t('d1 race: second patient told the time was just taken, nothing saved for her', r.nodes['Final Check'].outcome === 'Taken before submit' && sheet.tabs.Appointments.length === 1 && sheet.tabs.Appointments[0].patient_name === 'Bilal Raza', sheet.tabs.Appointments);
  t('d1 race: both requests logged', sheet.tabs['Request Log'].map(l => l.outcome).sort().join() === 'Booked,Taken before submit', sheet.tabs['Request Log']);
  t('d1 race: page offers a way back with details filled in', /That time was just taken/.test(r.html) && /Patient%20name=Sara%20Ahmed/.test(r.html), '');
}
for (const [label, pick, outcome] of [['declined', 'None of these times suit me', 'Declined'], ['abandoned', '', 'Abandoned']]) {
  const sheet = makeSheet(), smtp = makeSmtp();
  d1(sheet, smtp, form(), pick);
  t(`d1 ${label}: logged as ${outcome}, nothing booked, no email`, sheet.tabs['Request Log'][0].outcome === outcome && !sheet.tabs.Appointments.length && !smtp.sent.length, sheet.tabs['Request Log'][0]);
}
{
  const sheet = makeSheet(), smtp = makeSmtp();
  const r = d1(sheet, smtp, form({ Phone: '12345' }), 'unused');
  const log = sheet.tabs['Request Log'][0];
  t('d1 invalid: logged with what they typed', log.outcome === 'Invalid details' && log.phone === '12345' && /mobile number/.test(log.reason), log);
  t('d1 invalid: no page 2, no booking', !r.nodes['Final Check'] && !sheet.tabs.Appointments.length, '');
}
{
  const sheet = makeSheet(), smtp = makeSmtp();
  sheet.tabs.Appointments.push({ booking_id: '', status: 'Confirmed', doctor: UA, date: '2026-10-20', time: '5:20 PM', patient_name: 'Walk-in' });
  const r = d1(sheet, smtp, form(), a => a.times.includes('17:20') ? '5:20 PM' : 'hidden');
  t('d1: a booking staff typed by hand (12h time, no ID) blocks its time', r.nodes['Final Check'].reason.includes('hidden'), r.nodes['Final Check'].reason);
}
{
  const sheet = makeSheet(), smtp = makeSmtp();
  sheet.tabs.Closures.push({ date: '2026-10-20', doctor: 'All doctors', reason: 'Public holiday' });
  const r = d1(sheet, smtp, form(), a => a.date === '2026-10-21' ? '10:00 AM' : 'wrong day');
  t('d1: closed day -> next open day offered and booked', sheet.tabs.Appointments[0] && sheet.tabs.Appointments[0].date === '2026-10-21' && sheet.tabs['Request Log'][0].offered_date === '2026-10-21', sheet.tabs['Request Log'][0]);
}

// ---------- d2 · clinic-cancel ----------
// open(): Cancel Form -> Find Booking -> Confirm Cancel shown. confirm(): the patient answers, possibly later.
function d2open(sheet, query, now = '2026-10-19 10:00') {
  return { query, nodes: { 'Find Booking': core(sheet, 'booking', { id: query.id, token: query.t }, now)[0] } };
}
function d2confirm(sheet, smtp, { query, nodes }, answer, now = '2026-10-19 10:00') {
  if (nodes['Find Booking'].status === 'cancellable' && answer === 'Yes, cancel it') {       // Cancel It? -> true
    nodes['Check Again'] = core(sheet, 'booking', { id: nodes['Find Booking'].booking_id, token: query.t }, now)[0];
    if (nodes['Check Again'].status === 'cancellable') {                                      // Still Cancellable? -> true
      sheet.update('Appointments', 'booking_id', nodes['Check Again'].update);                 // Mark Cancelled
      nodes['Mark Cancelled'] = {};
      nodes['Send Cancellation'] = smtp.send(nodes['Check Again'].email);
    }
  }
  return run(D2, { nodes })[0].html;
}
const d2 = (sheet, smtp, query, answer, now) => d2confirm(sheet, smtp, d2open(sheet, query, now), answer, now);
{
  const sheet = makeSheet(), smtp = makeSmtp();
  d1(sheet, smtp, form(), '5:20 PM');
  const row = sheet.tabs.Appointments[0];
  const link = new URL(smtp.sent[0].html.match(/href="([^"]*\/form\/clinic-cancel\?[^"]*)"/)[1].replace(/&amp;/g, '&'));
  const q = { id: link.searchParams.get('id'), t: link.searchParams.get('t') };
  t('d2: link from the confirmation email carries id + token', q.id === row.booking_id && q.t === row.cancel_token, q);

  let html = d2(sheet, smtp, q, 'No, keep it');
  t('d2 keep: nothing changes', row.status === 'Confirmed' && /Your appointment is kept/.test(html), row.status);
  html = d2(sheet, smtp, { id: q.id, t: 'guessed' }, 'Yes, cancel it');
  t('d2 wrong token: not found, nothing changes', sheet.tabs.Appointments[0].status === 'Confirmed' && /cancel link doesn/.test(html), '');
  html = d2(sheet, smtp, q, 'Yes, cancel it');
  t('d2 cancel: row Cancelled with PKT time', sheet.tabs.Appointments[0].status === 'Cancelled' && sheet.tabs.Appointments[0].cancelled_at === '2026-10-19 10:00 PKT', sheet.tabs.Appointments[0]);
  t('d2 cancel: cancellation email + page', smtp.sent[1].subject.startsWith('Cancelled:') && /Appointment cancelled/.test(html), smtp.sent.map(s => s.subject));
  const again = core(sheet, 'slots', form(), '2026-10-19 10:05')[0];
  t('d2 cancel: the time is free again', again.times.includes('17:20'), again.times.slice(10, 16));
  html = d2(sheet, smtp, q, 'Yes, cancel it');
  t('d2 second click: already cancelled', /Already cancelled/.test(html), '');
}
{
  const sheet = makeSheet(), smtp = makeSmtp();
  d1(sheet, smtp, form(), '5:20 PM');
  const row = sheet.tabs.Appointments[0];
  const smtp2 = makeSmtp(['sara@']);
  const html = d2(sheet, smtp2, { id: row.booking_id, t: row.cancel_token }, 'Yes, cancel it');
  t('d2 email fails: still cancelled, page says the email failed', sheet.tabs.Appointments[0].status === 'Cancelled' && /couldn't send the cancellation email/.test(html), '');
  const late = d2(sheet, smtp, { id: row.booking_id, t: row.cancel_token }, 'Yes, cancel it', '2026-10-20 16:00');
  t('d2: after cancelling, a late click still says already cancelled', /Already cancelled/.test(late), '');
}
{ // two tabs: both open the link, both press "Yes, cancel it"
  const sheet = makeSheet(), smtp = makeSmtp();
  d1(sheet, smtp, form(), '5:20 PM');
  const row = sheet.tabs.Appointments[0], q = { id: row.booking_id, t: row.cancel_token };
  const tabA = d2open(sheet, q, '2026-10-19 10:00'), tabB = d2open(sheet, q, '2026-10-19 10:00');
  const a = d2confirm(sheet, smtp, tabA, 'Yes, cancel it', '2026-10-19 10:01');
  const b = d2confirm(sheet, smtp, tabB, 'Yes, cancel it', '2026-10-19 10:03');
  t('d2 two tabs: one cancellation, one email, cancelled_at kept', /Appointment cancelled/.test(a) && /Already cancelled/.test(b) && smtp.sent.filter(s => s.subject.startsWith('Cancelled:')).length === 1 && sheet.tabs.Appointments[0].cancelled_at === '2026-10-19 10:01 PKT', smtp.sent.map(s => s.subject));
}
{ // page left open across the 2-hour cutoff (appointment 20 Oct 5:20 PM)
  const sheet = makeSheet(), smtp = makeSmtp();
  d1(sheet, smtp, form(), '5:20 PM');
  const row = sheet.tabs.Appointments[0];
  const tab = d2open(sheet, { id: row.booking_id, t: row.cancel_token }, '2026-10-20 15:15');
  const html = d2confirm(sheet, smtp, tab, 'Yes, cancel it', '2026-10-20 15:25');
  t('d2 confirmed after the cutoff: not cancelled, "too late" page', row.status === 'Confirmed' && /Too late to cancel online/.test(html) && smtp.sent.length === 1, [row.status, html.match(/<h1>[^<]*/)[0]]);
}

// ---------- d3 · clinic-reminders ----------
function d3(sheet, smtp, now) {
  const answers = core(sheet, 'reminders', {}, now);                                 // Due Reminders
  if (!answers.length) return { answers, error: null };
  const sends = answers.map(a => smtp.send(a.email));                                 // Send Emails
  const stamps = run(STAMP, { input: sends, nodes: { 'Due Reminders': answers } });   // Stamp (top branch)
  for (const s of stamps) sheet.update('Appointments', 'booking_id', s);              // Save Stamp
  try { run(CHECK3, { nodes: { 'Due Reminders': answers, 'Send Emails': sends } }); return { answers, error: null }; }  // Check Sends (bottom branch)
  catch (e) { return { answers, error: e.message }; }                                  // -> e0 alert
}
const book = (sheet, x) => sheet.tabs.Appointments.push({ booking_id: x.id, booked_at: '2026-10-17 12:00 PKT', status: 'Confirmed', doctor: UA, date: x.date, day: '', time: x.time,
  patient_name: x.name, phone: '03001234567', email: x.email, visit_type: 'Check-up', reminder: '', cancel_token: 'tok-' + x.id, cancelled_at: '' });
{
  const sheet = makeSheet(), smtp = makeSmtp(['bilal@']);
  book(sheet, { id: 'BK-AAAAAA', date: '2026-10-20', time: '17:00', name: 'Aisha Malik', email: 'aisha@example.com' });
  book(sheet, { id: 'BK-BBBBBB', date: '2026-10-20', time: '17:20', name: 'Bilal Raza', email: 'bilal@example.com' });
  book(sheet, { id: 'BK-HHHHHH', date: '2026-10-20', time: '17:40', name: 'Hina Shah', email: 'hina@example.com' });
  const mon = d3(sheet, smtp, '2026-10-19 08:00');
  t('d3 Mon: Aisha and Hina reminded a day ahead even though Bilal fails', smtp.sent.map(s => s.to).join() === 'aisha@example.com,hina@example.com', smtp.sent.map(s => s.to));
  t('d3 Mon: every row stamped Sent/Failed', sheet.tabs.Appointments.map(r => r.reminder.split(' ')[0]).join() === 'Sent,Failed,Sent', sheet.tabs.Appointments.map(r => r.reminder));
  t('d3 Mon: Check Sends fails loudly, naming Bilal (-> e0 alert)', /1 of 3 emails failed.*Bilal Raza \(BK-BBBBBB\): 550/.test(mon.error), mon.error);
  const smtpTue = makeSmtp();
  const tue = d3(sheet, smtpTue, '2026-10-20 08:00');
  t('d3 Tue: only Bilal retried; Aisha and Hina not reminded twice', smtpTue.sent.map(s => s.to).join() === 'bilal@example.com' && !tue.error, smtpTue.sent.map(s => s.to));
  const again = d3(sheet, makeSmtp(), '2026-10-20 08:00');
  t('d3: running twice the same morning sends nothing new', again.answers.length === 0, again.answers.length);
}
{
  const sheet = makeSheet(), smtp = makeSmtp();
  book(sheet, { id: 'BK-DUPDUP', date: '2026-10-20', time: '17:00', name: 'Aisha Malik', email: 'aisha@example.com' });
  book(sheet, { id: 'BK-DUPDUP', date: '2026-10-20', time: '17:00', name: 'Aisha Malik', email: 'aisha@example.com' });
  book(sheet, { id: 'BK-NOMAIL', date: '2026-10-20', time: '17:40', name: 'Hina Shah', email: '' });
  const r = d3(sheet, smtp, '2026-10-19 08:00');
  t('d3: duplicate row reminded once; problems emailed to you', smtp.sent.filter(s => s.to === 'aisha@example.com').length === 1 && smtp.sent.some(s => s.to === 'you@example.com' && /2 issues/.test(s.subject)) && !r.error, smtp.sent.map(s => s.subject));
  const smtpBad = makeSmtp(['you@']);
  const sheet2 = makeSheet();
  book(sheet2, { id: 'BK-NOMAIL', date: '2026-10-20', time: '17:40', name: 'Hina Shah', email: '' });
  const r2 = d3(sheet2, smtpBad, '2026-10-19 08:00');
  t('d3: if the "Needs attention" email itself fails, that is reported too', /the "Needs attention" email: 550/.test(r2.error), r2.error);
}
{
  const sheet = makeSheet();
  t('d3: nothing due + nothing wrong -> nothing runs after Due Reminders', d3(sheet, makeSmtp(), '2026-10-19 08:00').answers.length === 0, '');
}

// ---------- d4 · clinic-doctor-list ----------
{
  const sheet = makeSheet(), smtp = makeSmtp(['you+usman@']);
  book(sheet, { id: 'BK-AAAAAA', date: '2026-10-19', time: '17:00', name: 'Aisha Malik', email: 'aisha@example.com' });
  const answers = core(sheet, 'schedule', {}, '2026-10-19 08:00');
  const sends = answers.map(a => smtp.send(a.email));
  t("d4: Dr. Ayesha's list still goes out when Dr. Usman's fails", smtp.sent.length === 1 && smtp.sent[0].to === 'you+ayesha@example.com', smtp.sent.map(s => s.to));
  throws("d4: failure names the doctor (-> e0 alert)", () => run(CHECK4, { nodes: { 'Doctor Lists': answers, 'Send Emails': sends } }), /Dr\. Usman Ali's list: 550/);
}

process.exitCode = report('Flows');
