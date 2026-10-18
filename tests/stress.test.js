// Stress tests: hostile input fuzzing, boundary dates, and a 60-day randomised simulation with invariants.
// Runs the real Code nodes through the same harness as the other suites. Seeded, so every run is identical.
const { load, run } = require('./harness');
const RULES = load('d0-clinic-rules.js'), TPL = load('d0-clinic-templates.js');
const D1 = load('d1-finish.js'), D2 = load('d2-finish.js'), STAMP = load('d3-stamp.js'), CHECK3 = load('d3-check-sends.js'), CHECK4 = load('d4-check-sends.js'), E0 = load('e0-build-alert.js');
const pkt = s => new Date(s.replace(' ', 'T') + ':00+05:00').toISOString();
let pass = 0, fail = 0; const fails = [];
const t = (name, ok, got) => { if (ok) pass++; else { fail++; if (fails.length < 40) fails.push(`FAIL ${name}\n     ${typeof got === 'string' ? got : JSON.stringify(got).slice(0, 400)}`); } };

// seeded RNG so failures are reproducible
let seed = 20261018; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = a => a[Math.floor(rnd() * a.length)];
const DOCS = ['Dr. Ayesha Khan', 'Dr. Usman Ali'], VISITS = ['Check-up', 'Follow-up', 'Consultation'];
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

function core(rows, closures, action, data, now) {
  const rd = a => a.length ? a.map((r, i) => ({ row_number: i + 2, ...r })) : [{}];
  const ans = run(RULES, { nowUTC: pkt(now), nodes: { Start: { action, data }, 'Read Appointments': rd(rows), 'Read Closures': rd(closures) } });
  return ans.length ? run(TPL, { input: ans }) : [];
}
// every HTML string anywhere in an answer
function htmls(o, out = [], k = '') {
  if (typeof o === 'string') { if (/html/i.test(k) || /<(div|p|table|li|ol|h3|style)\b/.test(o)) out.push([k, o]); }
  else if (o && typeof o === 'object') for (const [kk, v] of Object.entries(o)) htmls(v, out, kk);
  return out;
}
const MARK = '<x9 onmouseover="pwn()">';
const leaks = ans => htmls(ans).filter(([, h]) => h.includes('<x9') || h.includes('"pwn()"'));
const DESIGNED = /not in CLINIC\.(doctors|visitTypes)|unreadable date or time, so it can't be cancelled online|test_now must look like/;

// ===================== A. hostile form input (slots + check) =====================
const HOSTILE = [MARK, `Sara ${MARK}`, '', ' ', null, undefined, 0, 12345678901, true, 'a'.repeat(5000), '😀😀', 'سارہ احمد', 'O\'Brien-Smith', '=HYPERLINK("http://x","y")',
  '0300 1234567', '+92 300 1234567', '0092-300-1234567', '3001234567', '٠٣٠٠١٢٣٤٥٦٧', '02134567890', 'sara@example.com', 'SARA@EXAMPLE.COM', 'a@b', `x@y.com${MARK}`, 'x@y.com\nBcc: z@q.com',
  '2026-10-20', '2026-02-30', '1900-01-01', '2099-12-31', '10/20/2026', '20/10/2026', 'tomorrow', '2026-10-20T00:00:00Z', 46315];
for (let i = 0; i < 4000; i++) {
  const f = { 'Patient name': pick(HOSTILE), Phone: pick(HOSTILE), Email: pick(HOSTILE), Doctor: rnd() < .97 ? pick(DOCS) : pick(HOSTILE), 'Visit type': rnd() < .97 ? pick(VISITS) : pick(HOSTILE), 'Preferred date': pick(HOSTILE) };
  const now = `2026-10-${String(18 + Math.floor(rnd() * 10)).padStart(2, '0')} ${String(Math.floor(rnd() * 24)).padStart(2, '0')}:${pick(['00', '07', '59'])}`;
  try {
    const s = core([], [], 'slots', f, now)[0];
    t('A slots: no HTML leak', !leaks(s).length, leaks(s));
    t('A slots: known status', ['choose', 'refused'].includes(s.status), s.status);
    if (s.status === 'refused') t('A refused has a page', typeof s.page_html === 'string' && s.page_html.length > 100, s.outcome);
    if (s.status === 'choose') {
      t('A choose: valid email only', /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[A-Za-z]{2,}$/.test(s.patient.email), s.patient.email);
      t('A choose: phone normalised', /^03\d{9}$/.test(s.patient.phone), s.patient.phone);
      const chosen = pick([...s.form.fields.at(-1).fieldOptions.values.map(v => v.option), MARK, '', '99:99 PM', '10:10 AM']);
      const c = core([], [], 'check', { request: s, chosen, cancel_token: 'tok' }, now)[0];
      t('A check: no HTML leak', !leaks(c).length, leaks(c));
      if (c.status === 'book') {
        t('A book: email subject has no newline', !/[\r\n]/.test(c.email.subject) && !/[\r\n,;]/.test(c.email.to), c.email);
        t('A book: time is a real slot on an open day', /^\d\d:\d\d$/.test(c.row.time) && c.row.date >= now.slice(0, 10), c.row);
      }
    }
  } catch (e) { t('A no unexpected throw', DESIGNED.test(e.message), e.message + ' | ' + JSON.stringify(f).slice(0, 200)); }
}

// ===================== B. garbage sheet rows (every action) =====================
const CELL = [MARK, '', null, undefined, 0, 1.5, -3, true, '2026-10-20', '2026-10-19', '10/20/2026', 46315, 46314, 0.7222, '17:20', '5:20 PM', '25:00', 'Confirmed', 'cancelled', 'CANCELED',
  'Dr. Usman Ali', 'dr usman ali', 'Dr. Nobody', 'BK-AAAAAA', 'bk-aaaaaa', 'sara@example.com', 'bad-email', 'Sent 2026-10-18 08:00 PKT', 'Failed x', '2026-10-18 12:00 PKT', 'tok', '0300 1234567', 'x'.repeat(3000)];
const COLS = ['booking_id', 'booked_at', 'status', 'doctor', 'date', 'day', 'time', 'patient_name', 'phone', 'email', 'visit_type', 'reminder', 'cancel_token', 'cancelled_at'];
for (let i = 0; i < 1500; i++) {
  const rows = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => Object.fromEntries(COLS.map(c => [c, pick(CELL)])));
  const closures = Array.from({ length: Math.floor(rnd() * 3) }, () => ({ date: pick(CELL), doctor: pick([...CELL, 'All doctors', '']), reason: pick(CELL) }));
  const now = pick(['2026-10-19 08:00', '2026-10-20 08:00', '2026-10-18 08:00', '2026-10-19 23:59', '2026-10-20 00:00']);
  for (const [action, data] of [['reminders', {}], ['schedule', {}], ['booking', { id: pick(CELL), token: pick(CELL) }], ['booking', { id: 'BK-AAAAAA', token: 'tok' }],
    ['slots', { 'Patient name': 'Sara Ahmed', Phone: '03001234567', Email: 'sara@example.com', Doctor: 'Dr. Usman Ali', 'Visit type': 'Check-up', 'Preferred date': '2026-10-20' }]]) {
    try {
      const out = core(rows, closures, action, data, now);
      t(`B ${action}: no HTML leak`, !leaks(out).length, leaks(out).map(l => l[0]));
      for (const o of out) if (o.email) t(`B ${action}: email has to/subject/html/text`, o.email.to && o.email.subject && o.email.html && typeof o.email.text === 'string' && !/[\r\n]/.test(o.email.subject), o.email);
      for (const o of out.filter(o => o.kind === 'due')) t('B due: only valid emails get reminders', /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[A-Za-z]{2,}$/.test(o.patient_email), o.patient_email);
    } catch (e) { t(`B ${action}: no unexpected throw`, DESIGNED.test(e.message), e.message + ' | ' + e.stack.split('\n')[1]); }
  }
}

// ===================== C. boundaries =====================
const F = (x = {}) => ({ 'Patient name': 'Sara Ahmed', Phone: '03001234567', Email: 'sara@example.com', Doctor: 'Dr. Usman Ali', 'Visit type': 'Check-up', 'Preferred date': '2026-10-20', ...x });
const slots = (now, x, rows = [], cl = []) => core(rows, cl, 'slots', F(x), now)[0];
let s;
s = slots('2026-12-31 15:00', { 'Preferred date': '2027-01-01' }); t('C year rollover: 1 Jan offered', s.status === 'choose' && s.date === '2027-01-01', [s.status, s.date, s.reason]);
s = slots('2026-10-18 10:00', { 'Preferred date': '2026-11-17' }); t('C 30 days ahead allowed', s.status === 'choose' && s.date === '2026-11-17', [s.status, s.date]);
s = slots('2026-10-18 10:00', { 'Preferred date': '2026-11-18' }); t('C 31 days ahead refused', s.status === 'refused' && s.outcome === 'Too far ahead', [s.status, s.outcome]);
s = slots('2028-02-28 10:00', { 'Preferred date': '2028-02-29' }); t('C leap day valid', s.status === 'choose' && s.date === '2028-02-29', [s.status, s.date]);
s = slots('2026-10-18 10:00', { 'Preferred date': '2026-02-29' }); t('C 29 Feb in non-leap year refused as invalid', s.status === 'refused' && s.outcome === 'Invalid details', s.outcome);
s = slots('2026-10-19 19:41', { 'Preferred date': '2026-10-19' }); t('C 19:41: 20:40 is 59 min away -> today closed', s.date !== '2026-10-19', [s.date, s.reason]);
s = slots('2026-10-19 19:40', { 'Preferred date': '2026-10-19' }); t('C 19:40: 20:40 exactly 60 min away -> offered', s.date === '2026-10-19' && s.times.join() === '20:40', s.times);
s = slots('2026-10-19 09:00', { 'Preferred date': '2026-10-19' }); t('C no 14:00 or 21:00 slot (session ends)', !s.times.includes('14:00') && !s.times.includes('21:00') && s.times.includes('13:40') && s.times.includes('20:40'), s.times);
s = slots('2026-10-24 23:59', { 'Preferred date': '2026-10-25' }); t('C Sunday asked at 23:59 Sat -> Monday', s.date === '2026-10-26', s.date);
// fully booked doctor for 30 days -> refused with reason
{ const rows = []; for (let d = 0; d <= 31; d++) for (const tm of slots('2026-10-19 09:00', { 'Preferred date': '2026-10-20' }).times) rows.push({ booking_id: 'BK-' + d + tm, status: 'Confirmed', doctor: 'Dr. Usman Ali', date: addDays('2026-10-19', d), time: tm });
  s = slots('2026-10-19 09:00', { 'Preferred date': '2026-10-20' }, rows); t('C doctor fully booked for 30 days -> refused, says so', s.status === 'refused' && /no free times in the next 30 days/.test(s.reason), [s.status, s.reason]); }
// cancel cutoff edges
const bk = { booking_id: 'BK-EDGE11', status: 'Confirmed', doctor: 'Dr. Usman Ali', date: '2026-10-19', time: '17:00', patient_name: 'Sara', email: 'sara@example.com', cancel_token: 'tk' };
const cancelAt = now => core([bk], [], 'booking', { id: 'bk-edge11', token: 'tk' }, now)[0].status;
t('C cancel exactly 120 min before -> allowed', cancelAt('2026-10-19 15:00') === 'cancellable', cancelAt('2026-10-19 15:00'));
t('C cancel 119 min before -> too late', cancelAt('2026-10-19 15:01') === 'too_late', cancelAt('2026-10-19 15:01'));
t('C cancel at start -> passed', cancelAt('2026-10-19 17:00') === 'passed', cancelAt('2026-10-19 17:00'));
t('C cancel the day before across midnight', cancelAt('2026-10-18 23:59') === 'cancellable', cancelAt('2026-10-18 23:59'));
t('C wrong token -> not_found, nothing leaked', (() => { const o = core([bk], [], 'booking', { id: 'BK-EDGE11', token: 'TK' }, '2026-10-19 08:00')[0]; return o.status === 'not_found' && !JSON.stringify(o).includes('Sara'); })(), '');
t('C empty token never matches a row with empty token', core([{ ...bk, cancel_token: '' }], [], 'booking', { id: 'BK-EDGE11', token: '' }, '2026-10-19 08:00')[0].status === 'not_found', '');

// ===================== D. 60-day randomised simulation with invariants =====================
const sheet = { Appointments: [], Closures: [], Log: [] };
const read = tab => sheet[tab].length ? sheet[tab].map((r, i) => ({ row_number: i + 2, ...r })) : [{}];
const coreS = (action, data, now) => { const a = run(RULES, { nowUTC: pkt(now), nodes: { Start: { action, data }, 'Read Appointments': read('Appointments'), 'Read Closures': read('Closures') } }); return a.length ? run(TPL, { input: a }) : []; };
const sent = []; const promises = {}; let tokenNo = 0, bookings = 0, cancels = 0, refusedCancels = 0;
const SESS = [];
for (let m = 600; m + 20 <= 840; m += 20) SESS.push(m); for (let m = 1020; m + 20 <= 1260; m += 20) SESS.push(m);
const toMin = x => +x.slice(0, 2) * 60 + +x.slice(3, 5);
for (let day = 0; day < 60; day++) {
  const date = addDays('2026-10-18', day);
  // 08:00: d3 and d4
  const now8 = date + ' 08:00';
  const rem = coreS('reminders', {}, now8);
  for (const o of rem.filter(o => o.kind === 'due')) {
    const failNow = rnd() < 0.05;
    sent.push({ id: o.booking_id, on: date, ok: !failNow });
    const r = sheet.Appointments.find(x => x.booking_id === o.booking_id); r.reminder = failNow ? `Failed ${o.now}: 550` : `Sent ${o.now}`;
  }
  const sch = coreS('schedule', {}, now8);
  t('D schedule: one item per doctor', sch.filter(o => o.kind === 'doctor').length === 2, sch.length);
  // staff sometimes add a closure for a random day in the next 10 days
  if (rnd() < 0.08) sheet.Closures.push({ date: addDays(date, 1 + Math.floor(rnd() * 10)), doctor: pick([...DOCS, 'All doctors']), reason: 'Leave' });
  // patients during the day
  for (let k = 0; k < 6; k++) {
    const hh = 8 + Math.floor(rnd() * 15), mm = pick(['00', '15', '30', '45']); const now = `${date} ${String(hh).padStart(2, '0')}:${mm}`;
    if (rnd() < 0.75) {
      const ask = addDays(date, Math.floor(rnd() * 12));
      const s1 = coreS('slots', F({ Doctor: pick(DOCS), 'Preferred date': ask, 'Patient name': 'Patient ' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[bookings % 26] }), now)[0];
      if (s1.status !== 'choose') continue;
      t('D offered times are free and bookable', s1.times.every(tm => !sheet.Appointments.some(r => r.status === 'Confirmed' && r.doctor === s1.doctor && r.date === s1.date && r.time === tm)) && s1.times.every(tm => s1.date > date || toMin(tm) >= hh * 60 + +mm + 60) && s1.times.every(tm => SESS.includes(toMin(tm))), s1.times);
      t('D offered day not closed', !sheet.Closures.some(c => c.date === s1.date && (c.doctor === s1.doctor || c.doctor === 'All doctors')) && new Date(s1.date + 'T00:00Z').getUTCDay() !== 0, s1.date);
      // sometimes a rival books the same time while this patient chooses
      const choice = pick(s1.times).replace(/^(\d\d):(\d\d)$/, (_, h, m) => `${(+h % 12) || 12}:${m} ${+h >= 12 ? 'PM' : 'AM'}`);
      if (rnd() < 0.15) sheet.Appointments.push({ booking_id: 'BK-RIVAL' + k + day, booked_at: now, status: 'Confirmed', doctor: s1.doctor, date: s1.date, day: '', time: s1.times[0], patient_name: 'Rival', phone: '03001234567', email: 'r@example.com', visit_type: 'Check-up', reminder: '', cancel_token: 'r' + k + day, cancelled_at: '' });
      const c = coreS('check', { request: s1, chosen: choice, cancel_token: 'tok' + (++tokenNo) }, now)[0];
      if (c.status === 'book') {
        sheet.Appointments.push({ ...c.row }); bookings++;
        promises[c.row.booking_id] = c.reminder_plan;
      }
    } else {
      const live = sheet.Appointments.filter(r => r.status === 'Confirmed' && r.cancel_token.startsWith('tok'));
      if (!live.length) continue;
      const r = pick(live);
      const b = coreS('booking', { id: r.booking_id, token: r.cancel_token }, now)[0];
      if (b.status === 'cancellable') { Object.assign(r, b.update); cancels++; delete promises[r.booking_id]; }
      else { refusedCancels++; t('D cancel refused only when within 2 h or passed', ['too_late', 'passed'].includes(b.status), b.status); }
    }
  }
}
// invariants
const confirmed = sheet.Appointments.filter(r => r.status === 'Confirmed');
const keys = confirmed.map(r => r.doctor + r.date + r.time);
t('D INVARIANT no double booking', new Set(keys).size === keys.length, keys.length - new Set(keys).size + ' duplicates');
const byId = {}; for (const s2 of sent) (byId[s2.id] ||= []).push(s2);
t('D INVARIANT nobody gets two successful reminders', Object.values(byId).every(l => l.filter(x => x.ok).length <= 1), Object.entries(byId).filter(([, l]) => l.filter(x => x.ok).length > 1));
t('D INVARIANT no reminder after cancellation', sheet.Appointments.filter(r => r.status === 'Cancelled').every(r => !(byId[r.booking_id] || []).some(x => x.on + ' 08:00 PKT' > r.cancelled_at)), '');
let checkedPromises = 0, broken = [];
for (const r of confirmed.filter(r => r.cancel_token.startsWith('tok') && r.date < addDays('2026-10-18', 58))) {
  const plan = promises[r.booking_id]; if (!plan) continue;
  const clash = sheet.Closures.some(c => c.date === r.date && (c.doctor === r.doctor || c.doctor === 'All doctors'));
  const ok = (byId[r.booking_id] || []).find(x => x.ok);
  const firstTry = (byId[r.booking_id] || [])[0];
  checkedPromises++;
  if (clash) { if (ok && ok.on >= r.date) broken.push(['clash but reminded', r.booking_id]); continue; }
  const expect = plan === 'none' ? null : plan === 'visit_morning' ? r.date : addDays(r.date, -1);
  if ((firstTry ? firstTry.on : null) !== expect) broken.push([r.booking_id, plan, firstTry && firstTry.on, r.date, r.booked_at]);
}
t(`D INVARIANT booked-page reminder promise kept (${checkedPromises} bookings)`, !broken.length, broken.slice(0, 5));
if (process.env.VERBOSE) console.log(`simulation: ${bookings} bookings, ${cancels} cancels, ${refusedCancels} refused cancels, ${sent.length} reminder sends, ${sheet.Closures.length} closures`);

// ===================== F. e0 with odd error payloads =====================
for (const d of [{}, { workflow: {} }, { execution: {} }, { trigger: { error: { message: MARK }, mode: 'trigger' } }, { workflow: { name: MARK }, execution: { error: { message: MARK, node: { name: MARK } } } },
  { workflow: { name: 'd3. clinic-reminders' }, execution: { error: { description: 'x' } } }]) {
  try { const o = run(E0, { nodes: { 'Error Trigger': d } })[0]; t('F e0: no leak', !o.html.includes('<x9') && !o.subject.includes('\n'), o.html.slice(0, 100)); }
  catch (e) { t('F e0 no throw', false, e.message); }
}
console.log(`Stress (fuzz + 60-day simulation): ${pass} pass, ${fail} fail`); for (const f of fails) console.log(f);
process.exitCode = fail ? 1 : 0;
