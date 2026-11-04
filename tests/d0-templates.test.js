// d0 · Clinic Templates tests: Rules answer -> Templates, for every outcome. Writes previews to ../previews.
const fs = require('fs');
const path = require('path');
const { load, run, t, report } = require('./harness');
const RULES = load('d0-clinic-rules.js'), TPL = load('d0-clinic-templates.js');
const UA = 'Dr. Usman Ali';
const pkt = s => new Date(s.replace(' ', 'T') + ':00+05:00').toISOString();
// Previews (HTML files of every page and email) are written only when n8n's page shell is present (private build kit).
const SHELL = path.join(__dirname, 'n8n-completion-head.html');
const PREV = fs.existsSync(SHELL) ? path.join(__dirname, '..', 'previews') : null;
if (PREV) fs.mkdirSync(PREV, { recursive: true });

const appt = (date, time, x = {}) => ({ row_number: 5, booking_id: 'BK-7KQ4M2', booked_at: '2026-10-17 12:00 PKT', status: 'Confirmed', doctor: UA, date, time,
  patient_name: 'Sara Ahmed', phone: '03001234567', email: 'sara@example.com', visit_type: 'Follow-up', reminder: '', cancel_token: 'secret', ...x });
function both(action, data, { rows = [], closures = [], now = '2026-10-19 09:00' } = {}) {
  const ans = run(RULES, { nowUTC: pkt(now), nodes: { Start: { action, data }, 'Read Appointments': rows.length ? rows : [{}], 'Read Closures': closures.length ? closures : [{}] } });
  return run(TPL, { input: ans });
}
// n8n's completion page shell (head styles copied from form-trigger-completion.handlebars) around our HTML
const shell = PREV ? fs.readFileSync(SHELL, 'utf8') : '';
const save = (name, html, isPage) => { if (PREV) fs.writeFileSync(path.join(PREV, name + '.html'), isPage ? shell.replace('{{BODY}}', html) : html); };

const EVIL = '<img src=x onerror=alert(1)>';
const form = (x = {}) => ({ 'Patient name': 'Sara Ahmed', Phone: '0300 1234567', Email: 'sara@example.com', Doctor: UA, 'Visit type': 'Follow-up', 'Preferred date': '2026-10-20', ...x });
const noRaw = (name, s) => t(`${name}: no raw HTML from input`, !/<img src=x|<script/.test(s), s.slice(0, 200));

// Booked
const req = both('slots', form({ 'Patient name': 'sara ahmed' }))[0];
const booked = both('check', { request: req, chosen: '5:20 PM', cancel_token: 'f3b0c442-98fc-4c1c-8a3e-5a0b7f1d2e9a' })[0];
t('booked: page, email-failed page and email all built', booked.page_html && booked.page_html_email_failed && booked.email.html && booked.email.text, Object.keys(booked));
t('booked: email to patient, from clinic', booked.email.to === 'sara@example.com' && /Demo Family Clinic <you@example.com>/.test(booked.email.from), booked.email);
t('booked: subject', booked.email.subject === `Booked: Tuesday 20 Oct, 5:20 PM with ${UA}`, booked.email.subject);
t('booked: page shows time large + token + cancel link', /dc-time">5:20 PM/.test(booked.page_html) && /BK-[A-Z2-9]{6}/.test(booked.page_html) && /clinic-cancel\?id=/.test(booked.page_html), '');
t('booked: name title-cased in email greeting', /You&#39;re booked, Sara/.test(booked.email.html), booked.email.html.match(/booked, [^<]+/));
t('booked: text version has the cancel link', /Cancel online up to 2 hours before: http/.test(booked.email.text), booked.email.text);
save('page-booked', booked.page_html, true); save('page-booked-email-failed', booked.page_html_email_failed, true); save('email-confirmation', booked.email.html);

// Injection through every patient field that reaches HTML
{
  const r2 = both('slots', form({ 'Patient name': `Sara ${EVIL}` }))[0];
  const b2 = both('check', { request: r2, chosen: '5:20 PM', cancel_token: 'x' })[0];
  noRaw('booked page (name)', b2.page_html); noRaw('confirmation email (name)', b2.email.html);
  const bad = both('slots', form({ Phone: EVIL, Email: `${EVIL}@x.com` }))[0];
  noRaw('check-your-details page', bad.page_html);
  t('details page lists both errors', (bad.page_html.match(/<li>/g) || []).length === 2, bad.errors);
  save('page-invalid-details', bad.page_html, true);
  t('details page: back link pre-fills what they typed', /clinic-booking\?Patient%20name=Sara%20Ahmed&amp;Phone=%3Cimg/.test(bad.page_html), bad.page_html.match(/href="[^"]+"/g));
  const sch = both('schedule', {}, { rows: [appt('2026-10-19', '10:00', { patient_name: EVIL, visit_type: EVIL, phone: EVIL })], now: '2026-10-19 08:00' });
  noRaw("doctor's list", sch.map(s => s.email.html).join(''));
  const att = both('schedule', {}, { rows: [appt(EVIL, '10:00')], now: '2026-10-19 08:00' }).find(s => s.kind === 'attention');
  noRaw('attention email (bad date text)', att.email.html);
}

// Not-booked outcomes
for (const [chosen, rows, now, file, title] of [
  ['5:20 PM', [appt('2026-10-20', '17:20', { booking_id: 'BK-OTHER1' })], '2026-10-19 09:00', 'page-taken', 'That time was just taken'],
  ['None of these times suit me', [], '2026-10-19 09:00', 'page-declined', 'No appointment booked'],
  ['', [], '2026-10-19 09:00', 'page-abandoned', 'This page has expired'],
]) {
  const r = both('check', { request: req, chosen, cancel_token: 'x' }, { rows, now })[0];
  t(`${file}: title`, r.page_html.includes(`<h1>${title.replace(/'/g, '&#39;')}</h1>`), r.page_html.match(/<h1>.*<\/h1>/));
  t(`${file}: offers a way back`, /Choose another time/.test(r.page_html), '');
  save(file, r.page_html, true);
}
const far = both('slots', form({ 'Preferred date': '2026-12-20' }))[0];
t('too far page', /Choose an earlier date/.test(far.page_html) && /Wednesday 18 Nov/.test(far.page_html), far.reason);
save('page-too-far', far.page_html, true);

// Reminder
const rem = both('reminders', {}, { rows: [appt('2026-10-20', '17:20')], now: '2026-10-19 08:00' })[0];
t('reminder: subject + to', rem.email.subject === `Reminder: tomorrow at 5:20 PM with ${UA}` && rem.email.to === 'sara@example.com', rem.email);
t('reminder: cancel button', /Cancel this appointment/.test(rem.email.html), '');
save('email-reminder', rem.email.html);

// Doctor's list + attention
{
  const rows = [appt('2026-10-19', '17:20', { patient_name: 'Bilal Raza', visit_type: 'Check-up', phone: '03211234567', booking_id: 'BK-A' }),
    appt('2026-10-19', '10:00', { booking_id: 'BK-B' }), appt('2026-10-19', '11:40', { patient_name: 'Hina Shah', visit_type: 'Consultation', phone: '03334567890', booking_id: 'BK-C' }),
    appt('next tuesday', '10:00', { row_number: 9, booking_id: 'BK-D' })];
  const out = both('schedule', {}, { rows, now: '2026-10-19 08:00' });
  const ua = out.find(o => o.doctor === UA), ak = out.find(o => o.doctor === 'Dr. Ayesha Khan'), att = out.find(o => o.kind === 'attention');
  t("doctor's list: subject", ua.email.subject === 'Today: 3 appointments, Monday 19 Oct', ua.email.subject);
  t("doctor's list: phone formatted", /0321-1234567/.test(ua.email.html), '');
  t("doctor's list: empty day", /No appointments are booked for today/.test(ak.email.html) && ak.email.subject === 'Today: 0 appointments, Monday 19 Oct', ak.email.subject);
  t('attention: plain time, no workflow name', /Found at 8:00 AM, Monday 19 Oct\./.test(att.email.html) && /^Found at 8:00 AM, Monday 19 Oct\./.test(att.email.text) && !/Found by/.test(att.email.html), att.email.text.slice(0, 60));
  t('doctor list: phone is a tel: link in 0300-1234567 form', /<a href="tel:\+923001234567"[^>]*>0300-1234567<\/a>/.test(ua.email.html), '');
  t('attention: to admin, counts issues', att.email.to === 'you@example.com' && att.email.subject === 'Clinic sheet needs attention: 1 issue', att.email);
  save('email-doctor-list', ua.email.html); save('email-doctor-list-empty', ak.email.html); save('email-attention', att.email.html);
}

// Cancel flow pages
{
  const row = appt('2026-10-20', '17:20');
  const c = both('booking', { id: 'BK-7KQ4M2', token: 'secret' }, { rows: [row] })[0];
  const radio = c.confirm.fields.find(f => f.fieldType === 'radio');
  t('cancel: confirm page has the doctor card then a Yes/No radio', c.confirm.fields[0].fieldType === 'html' && /<h3>UA<\/h3>/.test(c.confirm.fields[0].html) && radio.fieldOptions.values.length === 2, c.confirm);
  t('cancel: confirm description has no HTML', !/[<>]/.test(c.confirm.description), c.confirm.description);
  t('cancel: email', c.email.subject === `Cancelled: Tuesday 20 Oct, 5:20 PM with ${UA}` && c.email.to === 'sara@example.com', c.email);
  save('page-cancelled', c.page_html, true); save('page-kept', c.page_html_kept, true); save('email-cancellation', c.email.html);
  for (const [status, data, rows, now] of [
    ['not_found', { id: 'BK-7KQ4M2', token: 'nope' }, [row], '2026-10-19 09:00'],
    ['already_cancelled', { id: 'BK-7KQ4M2', token: 'secret' }, [{ ...row, status: 'Cancelled' }], '2026-10-19 09:00'],
    ['too_late', { id: 'BK-7KQ4M2', token: 'secret' }, [row], '2026-10-20 16:30'],
    ['passed', { id: 'BK-7KQ4M2', token: 'secret' }, [row], '2026-10-20 18:00'],
  ]) {
    const x = both('booking', data, { rows, now })[0];
    t(`cancel ${status}: page built`, x.status === status && /<h1>/.test(x.page_html), x.status);
    save('page-cancel-' + status.replace('_', '-'), x.page_html, true);
  }
}

// ---------- new design pieces ----------
{
  const sanitize = require('sanitize-html');
  const n8nSanitize = text => sanitize(text, { allowedTags: ['b','div','i','iframe','img','video','source','em','strong','a','h1','h2','h3','h4','h5','h6','u','sub','sup','code','pre','span','br','ul','ol','li','p','table','thead','tbody','tfoot','td','tr','th','br'],
    allowedAttributes: { a: ['href','target','rel'], img: ['src','alt','width','height'] }, allowedSchemes: ['https','http'] });
  const ch = both('slots', form({ 'Preferred date': '2026-10-20', Doctor: 'Dr. Ayesha Khan', 'Patient name': 'Sara Ahmed' }))[0];
  const [steps, card, dd] = ch.form.fields;
  t('choose page: steps block, step 1 done, step 2 current', steps.fieldType === 'html' && steps.html === '<ol><li><i>Your details</i></li><li><b>Choose a time</b></li><li>Confirmed</li></ol>', steps);
  t('choose page: doctor card with initials + specialty + date', card.html === '<div><h3>AK</h3><p><b>Dr. Ayesha Khan</b><br>Family physician<br>Tuesday 20 Oct · Follow-up</p></div>', card.html);
  t('choose page: blocks survive n8n sanitising unchanged (no class/style needed)', n8nSanitize(steps.html) === steps.html && n8nSanitize(card.html).replace(/<br \/>/g, '<br>') === card.html, n8nSanitize(card.html));
  t('choose page: time dropdown still there', dd.fieldType === 'dropdown' && dd.fieldLabel === 'Time', dd);
  t('choose page: description no longer repeats the doctor', !/Dr\./.test(ch.form.description), ch.form.description);

  const cal = (booked.page_html.match(/href="(https:\/\/calendar\.google\.com[^"]+)"/) || [])[1];
  const u = cal && cal.replace(/&amp;/g, '&');
  t('booked: Add to Google Calendar link present', !!u, booked.page_html.slice(0, 100));
  t('calendar: 5:20–5:40 PM on 20 Oct, Karachi time', u && u.includes('&dates=20261020T172000/20261020T174000') && u.includes('&ctz=Asia%2FKarachi'), u);
  t('calendar: title + details', u && decodeURIComponent(u).includes('text=Follow-up with Dr. Usman Ali') && decodeURIComponent(u).includes('Token BK-'), u);
  t('booked: calendar button in the email too', /calendar\.google\.com/.test(booked.email.html) && /Add to Google Calendar: https:\/\/calendar/.test(booked.email.text), '');
  t('booked: two-column layout + all three steps ticked', /<main class="dc-card">/.test(booked.page_html) && /<aside class="dc-side"><h2>What happens next/.test(booked.page_html) && /class="done">Confirmed/.test(booked.page_html) && !/class="now"/.test(booked.page_html), '');
  t('booked: calendar button is teal in page and email (same as the chat)', /<a class="dc-btn" href="https:\/\/calendar/.test(booked.page_html) && /background:#0F766E[^>]*><a href="https:\/\/calendar/.test(booked.email.html), '');
  const thuReq = both('slots', form({ 'Preferred date': '2026-10-22' }), { now: '2026-10-19 09:00' })[0];
  const thuBooked = both('check', { request: thuReq, chosen: '10:00 AM', cancel_token: 'x' }, { now: '2026-10-19 09:00' })[0];
  t('booked for a later day: reminder the day before', /<li>A reminder email arrives at 8\u00a0AM the day before your visit\.<\/li>/.test(thuBooked.page_html), (thuBooked.page_html.match(/<li>A reminder[^<]*/) || [''])[0]);
  t('booked Mon 09:00 for Tue (sample page): no false "day before" promise', /arrives tomorrow at 8\u00a0AM, the morning of your visit/.test(booked.page_html), (booked.page_html.match(/<li>A reminder[^<]*/) || [''])[0]);
  const lateReq = both('slots', form({ 'Preferred date': '2026-10-20' }), { now: '2026-10-19 14:00' })[0];
  const lateBooked = both('check', { request: lateReq, chosen: '10:00 AM', cancel_token: 'x' }, { now: '2026-10-19 14:00' })[0];
  t('booked tomorrow after the 8 AM run: reminder comes the visit morning', /<li>A reminder email arrives tomorrow at 8\u00a0AM, the morning of your visit\.<\/li>/.test(lateBooked.page_html), (lateBooked.page_html.match(/<li>A reminder[^<]*/) || [''])[0]);
  const todayReq = both('slots', form({ 'Preferred date': '2026-10-19' }), { now: '2026-10-19 09:00' })[0];
  const todayBooked = both('check', { request: todayReq, chosen: '5:20 PM', cancel_token: 'x' }, { now: '2026-10-19 09:00' })[0];
  t('booked same day: no promise of a reminder', !/A reminder email arrives/.test(todayBooked.page_html), '');
  t('logo + clinic name in page header', /<header class="dc-top"><svg/.test(booked.page_html), '');
  t('background shapes + grain in page CSS', /body::before\{top:0;right:0/.test(booked.page_html) && /feTurbulence/.test(decodeURIComponent(booked.page_html.match(/url\("(data:image\/svg\+xml,[^"]+)"\) repeat/)[1].slice(19))), '');
  t('Figtree font, not Atkinson', /family=Figtree/.test(booked.page_html) && !/Atkinson/.test(booked.page_html), '');
  t('palette: teal headings, token is an outlined label (not a button)', /color:#0F766E;margin:0 0 8px/.test(booked.page_html) && /dc-token\{border:1\.5px solid #0F766E;color:#0F172A/.test(booked.page_html) && !/dc-token\{background/.test(booked.page_html), '');
  t('cancelled page: book-again side panel', /Need another time\?/.test(both('booking', { id: 'BK-7KQ4M2', token: 'secret' }, { rows: [appt('2026-10-20', '17:20')] })[0].page_html), '');
  save('page-booked', booked.page_html, true);
}

process.exitCode = report('d0 Clinic Templates');
