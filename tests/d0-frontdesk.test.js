// d0 · the two front-desk actions: info and availability. Calendar: Sun 18 Oct 2026, Mon 19, Tue 20 ... Sun 25.
const { load, run, t, report } = require('./harness');
const RULES = load('d0-clinic-rules.js');
const UA = 'Dr. Usman Ali', AK = 'Dr. Ayesha Khan';
const pkt = s => new Date(s.replace(' ', 'T') + ':00+05:00').toISOString();
let rowNo = 1;
const appt = (doctor, date, time, x = {}) => ({
  row_number: ++rowNo, booking_id: 'BK-T' + rowNo, booked_at: '2026-10-17 12:00 PKT', status: 'Confirmed', doctor, date, day: '', time,
  patient_name: 'Sara Ahmed', phone: '03001234567', email: 'sara@example.com', visit_type: 'Check-up', reminder: '', cancel_token: 'tok' + rowNo, cancelled_at: '', ...x,
});
const core = (action, data, { rows = [], closures = [], now = '2026-10-19 09:00' } = {}) =>
  run(RULES, { nowUTC: pkt(now), nodes: { Start: { action, data }, 'Read Appointments': rows.length ? rows : [{}], 'Read Closures': closures.length ? closures : [{}] } })[0];
const avail = (data, o) => core('availability', data, o);
const info = o => core('info', {}, o);
const ALL_SLOTS = ['10:00','10:20','10:40','11:00','11:20','11:40','12:00','12:20','12:40','13:00','13:20','13:40','17:00','17:20','17:40','18:00','18:20','18:40','19:00','19:20','19:40','20:00','20:20','20:40'];

// ---------- info ----------
let r = info({ now: '2026-10-19 09:00' });
t('info: before opening -> closed, opens today at 10', r.open_now === false && r.opens_next === 'today at 10:00 AM', r);
r = info({ now: '2026-10-19 11:00' });
t('info: morning session -> open, closes 2 PM', r.open_now === true && r.closes_at === '2:00 PM' && r.opens_next === '', r);
r = info({ now: '2026-10-19 15:00' });
t('info: lunch gap -> closed, opens today at 5', r.open_now === false && r.opens_next === 'today at 5:00 PM', r);
r = info({ now: '2026-10-19 21:00' });
t('info: exactly closing time counts as closed', r.open_now === false && r.opens_next === 'tomorrow at 10:00 AM', r);
r = info({ now: '2026-10-24 22:00' });
t('info: Saturday night -> Monday, not Sunday', r.opens_next === 'Monday 26 Oct at 10:00 AM', r.opens_next);
r = info({ now: '2026-10-25 12:00' });
t('info: Sunday midday -> closed', r.open_now === false && r.opens_next === 'tomorrow at 10:00 AM', r);
r = info({ now: '2026-10-19 21:30', closures: [{ row_number: 2, date: '2026-10-20', doctor: 'All doctors', reason: 'Holiday' }] });
t('info: whole-clinic closure tomorrow is skipped', r.opens_next === 'Wednesday 21 Oct at 10:00 AM', r.opens_next);
r = info({ now: '2026-10-19 11:00', closures: [{ row_number: 2, date: '2026-10-19', doctor: 'All doctors', reason: 'Holiday' }] });
t('info: whole-clinic closure today -> closed even in hours', r.open_now === false, r);
r = info({ closures: [{ row_number: 2, date: '2026-10-20', doctor: UA, reason: 'Leave' }] });
t('info: one doctor away keeps the clinic open', r.days[1].note === 'Dr. Usman Ali away' && r.days[1].label === 'Tuesday 20 Oct (tomorrow)', r.days[1]);
t('info: 14 days, today first, Sunday marked closed', r.days.length === 14 && r.days[0].date === '2026-10-19' && r.days[0].label === 'Monday 19 Oct (today)' && r.days[6].note === 'clinic closed', r.days.slice(0, 7));
t('info: doctors, visit types, hours come from CLINIC', r.doctors.length === 2 && r.doctors[0].name === AK && r.visit_types.join() === 'Check-up,Follow-up,Consultation' && r.clinic.hours === '10 AM–2 PM and 5–9 PM, Monday to Saturday', r);
t('info: staff closure reason is never shown', !JSON.stringify(info({ closures: [{ row_number: 2, date: '2026-10-20', doctor: UA, reason: 'Wedding' }] })).includes('Wedding'), 'leaked');
t('info: now label', info({ now: '2026-10-19 17:20' }).now_label === 'Monday 19 Oct, 5:20 PM', info({ now: '2026-10-19 17:20' }).now_label);

// ---------- availability: doctors ----------
r = avail({ doctor: UA, date: '2026-10-20' });
t('avail: one doctor, free day -> 24 times, 12-hour labels', r.status === 'ok' && r.results.length === 1 && r.results[0].times.length === 24 && r.results[0].times[0] === '10:00 AM' && !r.results[0].moved, r);
r = avail({ doctor: 'any', date: '2026-10-20' });
t('avail: "any" -> both doctors', r.results.map(x => x.doctor).join() === `${AK},${UA}`, r.results);
r = avail({ doctor: '', date: '2026-10-20' });
t('avail: blank doctor -> both doctors', r.results.length === 2, r);
for (const typed of ['dr usman ali', 'Dr Usman Ali', 'DR. USMAN ALI', 'usman', 'Usman Ali', 'doctor usman', 'Dr. Ali']) {
  r = avail({ doctor: typed, date: '2026-10-20' });
  t(`avail: "${typed}" -> Dr. Usman Ali`, r.status === 'ok' && r.results.length === 1 && r.results[0].doctor === UA, r);
}
for (const typed of ['Dr. Khan', 'ayesha']) {
  r = avail({ doctor: typed, date: '2026-10-20' });
  t(`avail: "${typed}" -> Dr. Ayesha Khan`, r.status === 'ok' && r.results[0].doctor === AK, r);
}
r = avail({ doctor: 'Dr. Strange', date: '2026-10-20' });
t('avail: unknown doctor -> status with the real names, no throw', r.status === 'unknown_doctor' && r.doctors.join() === `${AK},${UA}`, r);
r = avail({ doctor: 'a', date: '2026-10-20' });
t('avail: ambiguous fragment matching both -> unknown_doctor', r.status === 'unknown_doctor', r);

// ---------- availability: dates ----------
r = avail({ doctor: UA, date: 'next tuesday' });
t('avail: words instead of a date -> bad_date', r.status === 'bad_date', r);
r = avail({ doctor: UA, date: '2026-02-30' });
t('avail: impossible date -> bad_date', r.status === 'bad_date', r);
r = avail({ doctor: UA, date: '2026-11-19' });
t('avail: beyond 30 days -> too_far with the last day', r.status === 'too_far' && r.last_day_label === 'Wednesday 18 Nov', r);
r = avail({ doctor: UA, date: '2026-10-25' });
t('avail: Sunday -> Monday with reason', r.results[0].date === '2026-10-26' && r.results[0].moved && /closed on Sundays\. Next day with free times: Monday 26 Oct/.test(r.results[0].note), r.results[0]);
r = avail({ doctor: UA, date: '2026-10-16' });
t('avail: past date -> today, told why', r.results[0].date === '2026-10-19' && /has already passed/.test(r.results[0].note), r.results[0]);
r = avail({ doctor: UA, date: '2026-10-19' }, { now: '2026-10-19 17:05' });
t('avail: today only shows times 60+ minutes away', r.results[0].times_24[0] === '18:20' && !r.results[0].moved, r.results[0].times_24);
r = avail({ doctor: UA, date: '2026-10-20' }, { closures: [{ row_number: 2, date: '2026-10-20', doctor: UA, reason: 'Leave' }] });
t('avail: doctor away -> next day, staff reason hidden', r.results[0].date === '2026-10-21' && /not available on Tuesday 20 Oct/.test(r.results[0].note) && !/Leave/.test(JSON.stringify(r)), r.results[0]);
r = avail({ doctor: 'any', date: '2026-10-20' }, { closures: [{ row_number: 2, date: '2026-10-20', doctor: UA, reason: 'Leave' }] });
t('avail: any doctor with one away -> one moved, one not', r.results[0].date === '2026-10-20' && r.results[1].date === '2026-10-21', r.results.map(x => x.date));
r = avail({ doctor: UA, date: '2026-10-20' }, { rows: [appt(UA, '2026-10-20', '17:20'), appt(UA, '2026-10-20', '17:40', { status: 'Cancelled' }), appt(AK, '2026-10-20', '18:00')] });
t('avail: taken time hidden, cancelled and other doctor not', !r.results[0].times_24.includes('17:20') && r.results[0].times_24.includes('17:40') && r.results[0].times_24.includes('18:00'), r.results[0].times_24);
r = avail({ doctor: UA, date: '2026-10-20' }, { rows: ALL_SLOTS.map(s => appt(UA, '2026-10-20', s)) });
t('avail: full day -> next day, "fully booked"', r.results[0].date === '2026-10-21' && /fully booked/.test(r.results[0].note), r.results[0]);
const busy = [];
for (let d = 20; d <= 31; d++) for (const s of ALL_SLOTS) busy.push(appt(UA, `2026-10-${d}`, s));
for (let d = 1; d <= 18; d++) for (const s of ALL_SLOTS) busy.push(appt(UA, `2026-11-${String(d).padStart(2, '0')}`, s));
r = avail({ doctor: UA, date: '2026-10-20' }, { rows: busy, now: '2026-10-19 21:00' });
t('avail: nothing free for 30 days -> empty times, no throw', r.status === 'ok' && r.results[0].times.length === 0 && r.results[0].date === '' && /No free times in the next 30 days/.test(r.results[0].note), r.results[0]);

// ---------- the old actions still behave ----------
r = core('slots', { 'Patient name': 'Sara Ahmed', Phone: '0300 1234567', Email: 'sara@example.com', Doctor: UA, 'Visit type': 'Check-up', 'Preferred date': '2026-10-20' });
t('slots unchanged by the new actions', r.status === 'choose' && r.times.length === 24, r);

// ---------- fuzz: whatever the chat sends, d0 answers with a status and never offers a taken time ----------
let seed = 7;
const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const junk = ['', ' ', 'null', 'undefined', '<script>', "'; DROP TABLE", '2026-10-20T99:99', '20/10/2026', '10/20/2026', '2026-13-01', '2026-10-20', '2026-10-25', '2026-11-18', '2027-01-01', '1999-12-31', 42, null, { a: 1 }, ['x'], '٢٠٢٦-١٠-٢٠', 'kal', 'parson'];
const docs = ['any', '', UA, AK, 'usman', 'khan', 'Dr. Who', '🙂', null, 7, 'dr', 'ali khan', 'USMAN'];
const taken = [appt(UA, '2026-10-20', '10:00'), appt(AK, '2026-10-20', '10:00'), appt(UA, '2026-10-21', '17:20')];
let fuzzOK = 0, fuzzBad = [];
for (let i = 0; i < 2000; i++) {
  const data = { doctor: docs[rnd(docs.length)], date: junk[rnd(junk.length)] };
  try {
    const x = avail(data, { rows: taken });
    const okStatus = ['ok', 'bad_date', 'too_far', 'unknown_doctor'].includes(x.status);
    const leak = x.status === 'ok' && x.results.some(res => taken.some(a => a.doctor === res.doctor && a.date === res.date && res.times_24.includes(a.time)));
    if (okStatus && !leak) fuzzOK++; else fuzzBad.push(data);
  } catch (e) { fuzzBad.push({ data, error: e.message }); }
}
t('fuzz: 2,000 random availability requests, no throw, no taken time offered', fuzzOK === 2000, fuzzBad.slice(0, 3));
for (let i = 0; i < 300; i++) {
  const now = `2026-${['10', '11', '12'][rnd(3)]}-${String(1 + rnd(28)).padStart(2, '0')} ${String(rnd(24)).padStart(2, '0')}:${String(rnd(60)).padStart(2, '0')}`;
  try {
    const x = info({ now });
    t(`fuzz info ${now}`, typeof x.open_now === 'boolean' && (x.open_now ? x.closes_at : x.opens_next) && x.days.length === 14, x);
  } catch (e) { t(`fuzz info ${now}`, false, e.message); }
}

process.exitCode = report('d0 front-desk actions') ? 1 : 0;
