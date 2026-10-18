// d0 · Clinic Rules tests. Calendar: Sun 18 Oct 2026, Mon 19, Tue 20, Wed 21 ... Sun 25.
const { load, run, t, throws, report } = require('./harness');
const RULES = load('d0-clinic-rules.js');
const UA = 'Dr. Usman Ali', AK = 'Dr. Ayesha Khan';
const pkt = s => new Date(s.replace(' ', 'T') + ':00+05:00').toISOString();   // Pakistan time -> UTC instant

let rowNo = 1;
const appt = (doctor, date, time, x = {}) => ({
  row_number: ++rowNo, booking_id: 'BK-T' + rowNo, booked_at: '2026-10-17 12:00 PKT', status: 'Confirmed', doctor, date, day: '', time,
  patient_name: 'Sara Ahmed', phone: '03001234567', email: 'sara@example.com', visit_type: 'Check-up', reminder: '', cancel_token: 'tok' + rowNo, cancelled_at: '', ...x,
});
const core = (action, data, { rows = [], closures = [], now = '2026-10-19 09:00' } = {}) =>
  run(RULES, { nowUTC: pkt(now), nodes: { Start: { action, data }, 'Read Appointments': rows.length ? rows : [{}], 'Read Closures': closures.length ? closures : [{}] } });
const form = (x = {}) => ({ 'Patient name': 'Sara Ahmed', Phone: '0300 1234567', Email: 'sara@example.com', Doctor: UA, 'Visit type': 'Check-up', 'Preferred date': '2026-10-20', ...x });
const slots = (x, o) => core('slots', form(x), o)[0];

// ---------- slots ----------
let r = slots({});
t('slots: free day lists all 24 times', r.status === 'choose' && r.times.length === 24 && r.date === '2026-10-20' && !r.moved, r);
t('slots: dropdown has times + decline option', r.form.fields[0].fieldOptions.values.length === 25 && r.form.fields[0].fieldOptions.values[0].option === '10:00 AM', r.form.fields[0]);
t('slots: booking ID format, no look-alike characters', /^BK-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(r.booking_id), r.booking_id);
t('slots: requested_at ends in PKT', r.requested_at === '2026-10-19 09:00 PKT', r.requested_at);
t('slots: hours text derived from sessions', r.clinic.hours === '10 AM–2 PM and 5–9 PM, Monday to Saturday', r.clinic.hours);

r = slots({}, { rows: [appt(UA, '2026-10-20', '17:20'), appt(AK, '2026-10-20', '17:40'), appt(UA, '2026-10-20', '18:00', { status: 'Cancelled' })] });
t('slots: taken time hidden; other doctor and cancelled ignored', !r.times.includes('17:20') && r.times.includes('17:40') && r.times.includes('18:00') && r.times.length === 23, r.times);

r = slots({}, { rows: [appt(UA, '2026-10-20', '17:20', { booking_id: '' })] });
t('slots: hand-added row without booking_id still blocks its time', !r.times.includes('17:20'), r.times);
r = slots({}, { rows: [appt(UA, '10/20/2026', '5:20 PM')] });
t('slots: row stored as US date + 12h time still blocks', !r.times.includes('17:20'), r.times);
r = slots({}, { rows: [appt(UA, 46315, 0.7222222222)] });
t('slots: row stored as Sheets serial date + fraction still blocks', !r.times.includes('17:20'), r.times);
r = slots({}, { rows: [appt(UA, '2026-10-20', '17:20', { status: 'canceled' })] });
t('slots: US spelling "canceled" frees the slot', r.times.includes('17:20'), r.times);

r = slots({ 'Preferred date': '2026-10-19' }, { now: '2026-10-19 17:05' });
t('slots: today only shows times at least 60 min ahead', r.times[0] === '18:20' && r.date === '2026-10-19', r.times);
r = slots({ 'Preferred date': '2026-10-19' }, { now: '2026-10-19 20:00' });
t('slots: today closed for booking -> next day offered with reason', r.status === 'choose' && r.date === '2026-10-20' && /online booking for today has closed/i.test(r.reason), r.reason);
r = slots({ 'Preferred date': '2026-10-16' });
t('slots: past date -> today offered, patient told', r.date === '2026-10-19' && /Friday 16 Oct has already passed\. The soonest day with free times is Monday 19 Oct/.test(r.reason), r.reason);
r = slots({ 'Preferred date': '2026-10-25' });
t('slots: Sunday -> Monday offered with reason', r.date === '2026-10-26' && /closed on Sundays/.test(r.reason), r.reason);

const full = [];
for (const s of ['10:00','10:20','10:40','11:00','11:20','11:40','12:00','12:20','12:40','13:00','13:20','13:40','17:00','17:20','17:40','18:00','18:20','18:40','19:00','19:20','19:40','20:00','20:20','20:40']) full.push(appt(UA, '2026-10-20', s));
r = slots({}, { rows: full });
t('slots: fully booked day -> next day with reason', r.date === '2026-10-21' && /fully booked on Tuesday 20 Oct/.test(r.reason), r.reason);

r = slots({}, { closures: [{ row_number: 2, date: '2026-10-20', doctor: UA, reason: 'Leave' }] });
t('slots: doctor on leave -> next day, staff reason not shown', r.date === '2026-10-21' && /Dr\. Usman Ali is not available on Tuesday 20 Oct/.test(r.reason) && !/Leave/.test(r.reason), r.reason);
r = slots({}, { closures: [{ row_number: 2, date: '2026-10-20', doctor: 'All doctors', reason: 'Holiday' }] });
t('slots: whole-clinic closure', r.date === '2026-10-21' && /clinic is closed on Tuesday 20 Oct/.test(r.reason), r.reason);
r = slots({}, { closures: [{ row_number: 2, date: '2026-10-20', doctor: AK, reason: 'Leave' }] });
t("slots: another doctor's leave doesn't affect this one", r.date === '2026-10-20', r.date);

r = slots({ 'Preferred date': '2026-11-18' });
t('slots: 30 days ahead is allowed', r.status === 'choose' && r.date === '2026-11-18', r);
r = slots({ 'Preferred date': '2026-11-19' });
t('slots: 31 days ahead refused with the last allowed date', r.status === 'refused' && r.outcome === 'Too far ahead' && /Wednesday 18 Nov/.test(r.reason), r.reason);
{
  const rows = [];
  for (let i = 0; i <= 31; i++) {
    const d = new Date(Date.UTC(2026, 9, 19 + i)).toISOString().slice(0, 10);
    for (const s of full) rows.push(appt(UA, d, s.time));
  }
  const t0 = Date.now();
  r = slots({ 'Preferred date': '2026-11-10' }, { rows });
  t('slots: no free time in window -> refused, fast', r.status === 'refused' && r.outcome === 'No free time' && Date.now() - t0 < 1000, `${r.outcome} ${Date.now() - t0}ms`);
}

// input checks
for (const [phone, want] of [['0300-1234567', '03001234567'], ['+92 300 1234567', '03001234567'], ['92 300 1234567', '03001234567'], ['0092 300 1234567', '03001234567'], ['3001234567', '03001234567']]) {
  r = slots({ Phone: phone });
  t(`slots: phone "${phone}" stored as ${want}`, r.patient.phone === want && r.status === 'choose', r.patient.phone);
}
for (const phone of ['abc', '0300 123456', '12', '042 35761234', '0300 12345678']) {
  r = slots({ Phone: phone });
  t(`slots: phone "${phone}" refused`, r.status === 'refused' && r.outcome === 'Invalid details' && /mobile number/.test(r.reason), r);
}
for (const email of ['not-an-email', 'a@b', 'a b@c.com', '<x>@y.com']) {
  r = slots({ Email: email });
  t(`slots: email "${email}" refused`, r.status === 'refused' && /email/.test(r.reason), r.reason);
}
r = slots({ Email: '  Sara@Example.COM ' });
t('slots: email trimmed + lower-cased', r.patient.email === 'sara@example.com', r.patient.email);
for (const name of ['   ', 'a', '123', '<>']) {
  r = slots({ 'Patient name': name });
  t(`slots: name "${name}" refused`, r.status === 'refused' && /full name/.test(r.reason), r.reason);
}
for (const [name, want] of [['sara ahmed', 'Sara Ahmed'], ['SARA AHMED', 'Sara Ahmed'], ["o'brien", "O'Brien"], ['émile  ahmed', 'Émile Ahmed'], ['McDonald', 'McDonald'], ['عائشہ خان', 'عائشہ خان']]) {
  r = slots({ 'Patient name': name });
  t(`slots: name "${name}" -> "${want}"`, r.patient.name === want, r.patient.name);
}
r = slots({ 'Patient name': '', Phone: 'x', Email: 'y' });
t('slots: all errors listed together', r.errors.length === 3, r.errors);
for (const d of ['20/10/2026', '2026-02-30', 'tomorrow', '']) {
  r = slots({ 'Preferred date': d });
  t(`slots: date "${d}" refused`, r.status === 'refused' && /Choose a date/.test(r.reason), r.reason);
}
r = slots({ 'Preferred date': '10/20/2026' });
t('slots: US date from a direct link still works', r.date === '2026-10-20', r.date);
r = slots({ Doctor: '  dr. usman ALI ' });
t('slots: doctor matched ignoring case/spaces', r.doctor === UA, r.doctor);
throws('slots: unknown doctor is a setup error (e0 alert)', () => slots({ Doctor: 'Dr. Nobody' }), /not in CLINIC\.doctors/);
throws('slots: unknown visit type is a setup error', () => slots({ 'Visit type': 'Surgery' }), /not in CLINIC\.visitTypes/);
{
  const ids = new Set();
  const rows = [];
  for (let i = 0; i < 2000; i++) ids.add(slots({}, { rows }).booking_id);
  t('slots: 2,000 IDs, no repeats', ids.size === 2000, ids.size);
}
// Server time zone must not matter
for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
  process.env.TZ = tz;
  r = slots({ 'Preferred date': '2026-10-19' }, { now: '2026-10-20 00:30' });
  t(`slots: server TZ ${tz}, just after midnight PKT`, r.requested_at === '2026-10-20 00:30 PKT' && r.date === '2026-10-20' && /Monday 19 Oct has already passed/.test(r.reason), r.reason);
}
delete process.env.TZ;

// ---------- check ----------
const request = slots({});
const check = (chosen, o, token = 'uuid-1') => core('check', { request, chosen, cancel_token: token }, o)[0];
r = check('5:20 PM');
t('check: free time -> book, row has every column', r.status === 'book' && r.time === '17:20' && r.row.time === '17:20' && r.row.status === 'Confirmed' && r.row.cancel_token === 'uuid-1' && Object.keys(r.row).length === 14, r.row);
t('check: booked_at in PKT', r.row.booked_at === '2026-10-19 09:00 PKT', r.row.booked_at);
t('check: same booking ID as the request (log rows link up)', r.booking_id === request.booking_id, r.booking_id);
t('check: cancel link carries id + token', r.cancel_link === `http://localhost:5678/form/clinic-cancel?id=${request.booking_id}&t=uuid-1`, r.cancel_link);
t('check: when label', r.when === 'Tuesday 20 Oct, 5:20 PM', r.when);
r = check('5:20 PM', { rows: [appt(UA, '2026-10-20', '17:20')] });
t('check: taken while choosing -> Taken before submit', r.status === 'stop' && r.outcome === 'Taken before submit' && /Someone else booked Tuesday 20 Oct, 5:20 PM/.test(r.reason), r);
r = check('10:00 AM', {}, 'u');
t('check: other free time fine', r.status === 'book', r.outcome);
{
  const todayReq = slots({ 'Preferred date': '2026-10-19' }, { now: '2026-10-19 17:00' });
  const late = core('check', { request: todayReq, chosen: '6:00 PM', cancel_token: 'u' }, { now: '2026-10-19 17:30' })[0];
  t('check: page left open until too close -> Too late (not "someone booked")', late.outcome === 'Too late' && /less than 60 minutes away/.test(late.reason), late);
}
r = check('5:20 PM', { closures: [{ row_number: 2, date: '2026-10-20', doctor: 'All doctors', reason: 'x' }] });
t('check: closure added while choosing -> No free time', r.outcome === 'No free time' && /closed on Tuesday 20 Oct/.test(r.reason), r);
r = check('');
t('check: nothing chosen (page expired) -> Abandoned', r.outcome === 'Abandoned', r.outcome);
r = check('None of these times suit me');
t('check: decline -> Declined (and logged)', r.outcome === 'Declined', r.outcome);
for (const bad of ['10:10 AM', '9:00 PM', '<b>5</b>', '25:00']) {
  r = check(bad);
  t(`check: tampered time "${bad}" refused`, r.status === 'stop' && r.outcome === 'Invalid details', r);
}
throws('check: missing cancel token is a setup error', () => check('5:20 PM', {}, ''), /cancel token/);

// ---------- reminders (8 AM Monday 19 Oct) ----------
const rem = (rows, now = '2026-10-19 08:00') => core('reminders', {}, { rows, now });
{
  const rows = [
    appt(UA, '2026-10-19', '17:00', { patient_name: 'Today Later' }),
    appt(UA, '2026-10-20', '10:00', { patient_name: 'Tomorrow' }),
    appt(UA, '2026-10-21', '10:00', { patient_name: 'Day After' }),
    appt(UA, '2026-10-20', '10:20', { patient_name: 'Already Sent', reminder: 'Sent 2026-10-18 08:00 PKT' }),
    appt(UA, '2026-10-20', '10:40', { patient_name: 'Cancelled', status: 'Cancelled' }),
    appt(AK, '2026-10-19', '10:00', { patient_name: 'Earlier Than Now?', booked_at: '2026-10-18 09:00 PKT' }),
    appt(AK, '2026-10-19', '18:00', { patient_name: 'Booked Same Day', booked_at: '2026-10-19 07:30 PKT' }),
    appt(AK, '2026-10-20', '11:00', { patient_name: 'Failed Before', reminder: 'Failed 2026-10-18 08:00 PKT: timeout' }),
  ];
  const out = rem(rows);
  const names = out.filter(o => o.kind === 'due').map(o => o.patient_name).join(', ');
  t('reminders: today-later + tomorrow + retry failed; skips sent, cancelled, day-after, same-day bookings', names === 'Earlier Than Now?, Today Later, Tomorrow, Failed Before', names);
  t('reminders: nothing wrong -> no attention item', !out.some(o => o.kind === 'attention'), out.map(o => o.kind));
  const tom = out.find(o => o.patient_name === 'Tomorrow');
  t('reminders: due item has wording + cancel link', tom.day_word === 'tomorrow' && tom.when === 'Tuesday 20 Oct, 10:00 AM' && /clinic-cancel\?id=BK-T\d+&t=tok\d+/.test(tom.cancel_link), tom);
  t('reminders: retry flagged', out.find(o => o.patient_name === 'Failed Before').retry === true, out);
}
{
  const out = rem([
    appt(UA, '2026-10-20', '10:00', { email: '' }),
    appt(UA, '2026-10-20', '10:20', { booking_id: '' }),
    appt(UA, '2026-10-20', 'half five'),
    appt('Dr Usman Ali', '2026-10-20', '10:40'),
    appt(UA, '2026-10-20', '11:00', { booking_id: 'BK-DUP' }),
    appt(UA, '2026-10-20', '11:00', { booking_id: 'BK-DUP' }),
  ]);
  const att = out.find(o => o.kind === 'attention');
  const due = out.filter(o => o.kind === 'due');
  t('reminders: each unusable row reported with its row number, never skipped silently', att && att.problems.length === 4 && att.problems.every(p => /^Row \d+/.test(p)), att && att.problems);
  t('reminders: "Dr Usman Ali" (no dot) still matches the doctor', due.length === 2, due.map(d => d.doctor));
  t('reminders: duplicate row reminded once', due.filter(d => d.booking_id === 'BK-DUP').length === 1, due);
}
{
  const out = core('reminders', {}, { rows: [appt(UA, '2026-10-20', '10:00')], closures: [{ row_number: 2, date: '2026-10-20', doctor: UA, reason: 'Leave' }], now: '2026-10-19 08:00' });
  t('reminders: booking on a day the doctor is away -> not reminded, staff told to call', !out.some(o => o.kind === 'due') && /not available.*contact the patient on 03001234567/.test(out[0].problems[0]), out);
}
t('reminders: Sunday run reminds Monday', rem([appt(UA, '2026-10-19', '10:00')], '2026-10-18 08:00').filter(o => o.kind === 'due').length === 1, '');
t('reminders: empty sheet -> nothing', rem([]).length === 0, rem([]));
{
  const out = rem([appt(UA, '10/20/2026', '5:20 PM'), appt(UA, 46315, 0.4166666667)]);
  t('reminders: dates/times stored as real dates or 12h text still work', out.filter(o => o.kind === 'due').length === 2, out);
}

// ---------- schedule (8 AM Monday 19 Oct) ----------
const sch = (rows, closures = []) => core('schedule', {}, { rows, closures, now: '2026-10-19 08:00' });
{
  const out = sch([
    appt(UA, '2026-10-19', '17:20', { patient_name: 'Bilal Raza' }),
    appt(UA, '2026-10-19', '10:00'),
    appt(UA, '2026-10-19', '10:20', { status: 'Cancelled' }),
    appt(UA, '2026-10-20', '10:00'),
    appt(UA, '2026-10-19', '5:00 PM', { patient_name: 'Hand Typed' }),
  ]);
  const ua = out.find(o => o.doctor === UA), ak = out.find(o => o.doctor === AK);
  t('schedule: sorted, cancelled + other days excluded, 12h text sorted correctly', ua.appointments.map(a => a.time_label).join(' ') === '10:00 AM 5:00 PM 5:20 PM', ua.appointments.map(a => a.time_label));
  t('schedule: doctor with none still gets an item', ak.appointments.length === 0 && ak.to === 'you+ayesha@example.com', ak);
  t('schedule: clean sheet -> no attention item', !out.some(o => o.kind === 'attention'), out.map(o => o.kind));
}
{
  const out = sch([
    appt('Dr. Sana Malik', '2026-10-19', '10:00'),
    appt(UA, 'next tuesday', '10:00'),
    appt(UA, '2026-10-19', 'later'),
    appt(UA, '2026-10-19', '11:00', { booking_id: 'BK-X' }),
    appt(UA, '2026-10-19', '11:00', { booking_id: 'BK-X' }),
  ], [{ row_number: 2, date: '25 Dec', doctor: 'All doctors', reason: '' }, { row_number: 3, date: '2026-10-21', doctor: 'Dr. Nobody', reason: '' }]);
  const att = out.find(o => o.kind === 'attention');
  const ua = out.find(o => o.doctor === UA);
  t('schedule: unknown doctor, bad date, bad time, duplicate, 2 bad closures all reported', att && att.problems.length === 6, att && att.problems);
  t('schedule: unreadable time still listed (as "Time?"), duplicate listed once', ua.appointments.length === 2 && ua.appointments.some(a => a.time_label === 'Time?'), ua.appointments);
}
{
  const out = sch([appt(UA, '2026-10-19', '10:00')], [{ row_number: 2, date: '2026-10-19', doctor: UA, reason: 'Leave' }]);
  t('schedule: doctor away with bookings -> warned in their own list', /Dr\. Usman Ali is not available/.test(out.find(o => o.doctor === UA).closed), out);
  t('schedule: that clash is NOT repeated in a second attention email (d3 already lists it)', !out.some(o => o.kind === 'attention'), out.map(o => o.kind));
}

// ---------- clashes (option A): listed by d3 every morning until fixed ----------
{
  const leave = [{ row_number: 2, date: '2026-10-23', doctor: UA, reason: 'Leave' }];
  const rows = () => [appt(UA, '2026-10-23', '17:20', { patient_name: 'Late One' }), appt(UA, '2026-10-23', '10:00', { patient_name: 'Early One' }),
    appt(AK, '2026-10-23', '10:00', { patient_name: 'Other Doctor' }), appt(UA, '2026-10-23', '11:00', { patient_name: 'Cancelled One', status: 'Cancelled' })];
  for (const day of ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']) {
    const att = core('reminders', {}, { rows: rows(), closures: leave, now: `${day} 08:00` }).find(o => o.kind === 'attention');
    t(`clash: closure on Fri 23 Oct reported on the morning of ${day}`, att && att.problems.length === 2, att && att.problems);
  }
  const att = core('reminders', {}, { rows: rows(), closures: leave, now: '2026-10-20 08:00' }).find(o => o.kind === 'attention');
  t('clash: soonest first, names the row, doctor, time, reason and phone', /^Row \d+ \(BK-T\d+\), Early One: booked with Dr\. Usman Ali for Friday 23 Oct, 10:00 AM, but Dr\. Usman Ali is not available on Friday 23 Oct\. No reminder goes out while this stands\. Please contact the patient on 03001234567 to move or cancel it\.$/.test(att.problems[0]) && /Late One/.test(att.problems[1]), att.problems);
  t('clash: cancelled booking and the other doctor are not reported', !att.problems.some(p => /Cancelled One|Other Doctor/.test(p)), att.problems);
  const sent = core('reminders', {}, { rows: [appt(UA, '2026-10-23', '10:00', { reminder: 'Sent 2026-10-22 08:00 PKT' })], closures: leave, now: '2026-10-23 08:00' }).find(o => o.kind === 'attention');
  t('clash: closure added after the reminder went out -> says so', sent && /A reminder already went out, so please contact/.test(sent.problems[0]), sent);
  const over = core('reminders', {}, { rows: [appt(UA, '2026-10-23', '10:00')], closures: leave, now: '2026-10-23 12:00' });
  t('clash: an appointment that is already over is not reported', !over.some(o => o.kind === 'attention'), over);
  const past = core('reminders', {}, { rows: [appt(UA, '2026-10-23', '10:00')], closures: leave, now: '2026-10-24 08:00' });
  t('clash: a past day is not reported', !past.some(o => o.kind === 'attention'), past);
  const fixed = core('reminders', {}, { rows: [appt(UA, '2026-10-23', '10:00', { status: 'Cancelled' })], closures: leave, now: '2026-10-22 08:00' });
  t('clash: once cancelled, it stops', fixed.length === 0, fixed);
  const dayOff = core('reminders', {}, { rows: [appt(UA, '2026-10-25', '10:00')], now: '2026-10-20 08:00' }).find(o => o.kind === 'attention');
  t('clash: hand-typed booking on a Sunday is reported too', dayOff && /closed on Sundays/.test(dayOff.problems[0]), dayOff);
  const both = core('reminders', {}, { rows: [appt(UA, '2026-10-20', '10:00')], closures: [{ row_number: 2, date: '2026-10-20', doctor: UA, reason: '' }], now: '2026-10-19 08:00' });
  t('clash: tomorrow\'s clash reported once (not also as a reminder problem), no reminder sent', !both.some(o => o.kind === 'due') && both.find(o => o.kind === 'attention').problems.length === 1, both);
}

// ---------- reminder plan on the booked page (d3 runs at 8 AM) ----------
{
  const plan = (now, date, chosen = '10:00 AM') => {
    const req = core('slots', form({ 'Preferred date': date }), { now })[0];
    return core('check', { request: req, chosen, cancel_token: 'x' }, { now })[0].reminder_plan;
  };
  t('reminder plan: booked Mon 07:30 for Tue -> day before (today\'s 8 AM run sends it)', plan('2026-10-19 07:30', '2026-10-20') === 'day_before', plan('2026-10-19 07:30', '2026-10-20'));
  t('reminder plan: booked Mon 14:00 for Tue -> visit morning', plan('2026-10-19 14:00', '2026-10-20') === 'visit_morning', plan('2026-10-19 14:00', '2026-10-20'));
  t('reminder plan: booked Mon 14:00 for Thu -> day before', plan('2026-10-19 14:00', '2026-10-22') === 'day_before', plan('2026-10-19 14:00', '2026-10-22'));
  t('reminder plan: booked for today -> none', plan('2026-10-19 09:00', '2026-10-19', '5:20 PM') === 'none', plan('2026-10-19 09:00', '2026-10-19', '5:20 PM'));
  t('reminder plan: Sat 14:00 for Mon -> day before (Sunday\'s run sends it)', plan('2026-10-24 14:00', '2026-10-26') === 'day_before', plan('2026-10-24 14:00', '2026-10-26'));
  t('reminder time label for pages', core('slots', form(), {})[0].clinic.reminder_time === '8\u00a0AM', core('slots', form(), {})[0].clinic);
  // the plan must match what d3 actually does
  for (const [now, date] of [['2026-10-19 07:30', '2026-10-20'], ['2026-10-19 14:00', '2026-10-20'], ['2026-10-19 14:00', '2026-10-22'], ['2026-10-19 09:00', '2026-10-19']]) {
    const req = core('slots', form({ 'Preferred date': date }), { now })[0];
    const c = core('check', { request: req, chosen: date === '2026-10-19' ? '5:20 PM' : '10:00 AM', cancel_token: 'x' }, { now })[0];
    const row = { row_number: 2, ...c.row };
    let sentOn = '';
    for (let d = now.slice(0, 10); d <= date && !sentOn; d = new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10)) {
      if (`${d} 08:00` < now) continue;
      if (core('reminders', {}, { rows: [row], now: `${d} 08:00` }).some(o => o.kind === 'due')) sentOn = d;
    }
    const expect = { day_before: new Date(Date.parse(date) - 864e5).toISOString().slice(0, 10), visit_morning: date, none: '' }[c.reminder_plan];
    t(`reminder plan matches d3: booked ${now} for ${date} (${c.reminder_plan})`, sentOn === expect, { plan: c.reminder_plan, sentOn });
  }
}

// ---------- booking lookup (cancel) ----------
const bk = (data, rows, now = '2026-10-19 09:00') => core('booking', data, { rows, now })[0];
{
  const row = appt(UA, '2026-10-20', '17:20', { booking_id: 'BK-ABC234', cancel_token: 'secret' });
  r = bk({ id: 'bk-abc234', token: 'secret' }, [row]);
  t('booking: valid link -> cancellable + update fields', r.status === 'cancellable' && r.update.status === 'Cancelled' && r.update.cancelled_at === '2026-10-19 09:00 PKT' && r.when === 'Tuesday 20 Oct, 5:20 PM', r);
  t('booking: wrong token -> not_found (does not reveal the booking)', bk({ id: 'BK-ABC234', token: 'guess' }, [row]).status === 'not_found' && !bk({ id: 'BK-ABC234', token: 'guess' }, [row]).doctor, '');
  t('booking: missing token -> not_found', bk({ id: 'BK-ABC234', token: '' }, [row]).status === 'not_found', '');
  t('booking: already cancelled', bk({ id: 'BK-ABC234', token: 'secret' }, [{ ...row, status: 'Cancelled' }]).status === 'already_cancelled', '');
  t('booking: 1h before -> too_late (2h cutoff)', bk({ id: 'BK-ABC234', token: 'secret' }, [row], '2026-10-20 16:20').status === 'too_late', '');
  t('booking: exactly 2h before -> still cancellable', bk({ id: 'BK-ABC234', token: 'secret' }, [row], '2026-10-20 15:20').status === 'cancellable', '');
  t('booking: after the slot -> passed', bk({ id: 'BK-ABC234', token: 'secret' }, [row], '2026-10-20 17:30').status === 'passed', '');
}
throws('unknown action is a setup error', () => core('dance', {}), /Unknown action/);
throws('bad test_now is a setup error', () => core('slots', { ...form(), test_now: 'Monday' }), /test_now/);
r = core('slots', { ...form(), test_now: '2026-10-24 21:00' })[0];
t('test_now overrides the clock', r.requested_at === '2026-10-24 21:00 PKT' && r.date === '2026-10-26', r);

process.exitCode = report('d0 Clinic Rules');
