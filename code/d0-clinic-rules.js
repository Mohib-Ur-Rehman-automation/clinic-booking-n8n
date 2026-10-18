// d0 · Clinic Rules: the ONLY place the clinic's rules live.
// d1–d4 call this workflow with { action, data }. It reads Appointments and Closures and writes nothing.
// Actions: slots · check · reminders · schedule · booking  (each one is section 5x below)

// ============ 1. CLINIC SETUP: change the clinic here, nowhere else ============
const CLINIC = {
  name: 'Demo Family Clinic',
  phone: '(042) 000-0000',
  timezone: 'Asia/Karachi',
  slotMinutes: 20,
  sessions: [['10:00', '14:00'], ['17:00', '21:00']],   // start, end (end itself not bookable)
  daysOff: [0],                  // 0 = Sunday ... 6 = Saturday
  maxDaysAhead: 30,              // online booking window
  minNoticeMinutes: 60,          // online booking closes this long before a slot
  cancelCutoffMinutes: 120,      // online cancelling closes this long before a slot
  reminderHour: 8,               // d3 sends reminders at this hour; keep it the same as d3's "Every Morning 8 AM" trigger
  bookingFormUrl: 'http://localhost:5678/form/clinic-booking',
  cancelFormUrl: 'http://localhost:5678/form/clinic-cancel',
  fromEmail: 'Demo Family Clinic <you@example.com>',
  adminEmail: 'you@example.com', // gets "Needs attention" emails
  doctors: {                     // must match the Doctor dropdown on the booking form exactly
    'Dr. Ayesha Khan': { email: 'you+ayesha@example.com', specialty: 'Family physician' },
    'Dr. Usman Ali': { email: 'you+usman@example.com', specialty: 'General physician' },
  },
  visitTypes: ['Check-up', 'Follow-up', 'Consultation'],  // must match the Visit type dropdown
};
const DECLINE = 'None of these times suit me';
const ID_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  // no 0/O, 1/I/L

// ============ 2. HELPERS ============
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const clean = v => String(v ?? '').trim();
const pad = n => String(n).padStart(2, '0');
const toMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const dateObj = d => new Date(d + 'T00:00:00Z');                 // plain-date maths, no time zone surprises
const addDays = (d, n) => { const x = dateObj(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const weekday = d => dateObj(d).getUTCDay();
const daysBetween = (a, b) => Math.round((dateObj(b) - dateObj(a)) / 86400000);
const timeLabel = t => { const h = Number(t.slice(0, 2)); return (h % 12 || 12) + ':' + t.slice(3, 5) + (h >= 12 ? ' PM' : ' AM'); };
const dateLabel = d => DAY_NAMES[weekday(d)] + ' ' + Number(d.slice(8, 10)) + ' ' + MONTHS[Number(d.slice(5, 7)) - 1];
const whenLabel = (d, t) => dateLabel(d) + ', ' + timeLabel(t);
const hourWord = t => { const h = Number(t.slice(0, 2)), m = t.slice(3, 5); return (h % 12 || 12) + (m === '00' ? '' : ':' + m); };
const ampm = t => (Number(t.slice(0, 2)) >= 12 ? 'PM' : 'AM');

function isRealDate(y, m, d) {
  const x = new Date(Date.UTC(y, m - 1, d));
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
}
// Sheet or form date -> 'YYYY-MM-DD', or '' if it isn't a real date.
// Accepts 2026-10-20, 2026-10-20T00:00:00Z, 10/20/2026 (US, month first) and Sheets serial numbers.
function normDate(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
  }
  const s = clean(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (m && isRealDate(+m[1], +m[2], +m[3])) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m && isRealDate(+m[3], +m[1], +m[2])) return m[3] + '-' + pad(m[1]) + '-' + pad(m[2]);
  return '';
}
// Sheet time -> 'HH:MM', or ''. Accepts 17:20, 5:20 PM, 17:20:00 and Sheets day fractions (0.7222).
function normTime(v) {
  if (typeof v === 'number' && v >= 0 && v < 1) return toTime(Math.round(v * 1440));
  const s = clean(v).toLowerCase().replace(/\s+/g, '').replace(/\./g, '');
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(am|pm)?$/);
  if (!m) return '';
  let h = +m[1];
  const min = +m[2];
  if (min > 59 || h > 23 || (m[3] && (h < 1 || h > 12))) return '';
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  return pad(h) + ':' + pad(min);
}
// Pakistani mobile -> '03001234567', or '' if it isn't one. Accepts spaces, dashes, +92, 0092.
function normPhone(v) {
  let d = clean(v).replace(/\D/g, '');
  if (/^0092\d{10}$/.test(d)) d = '0' + d.slice(4);
  else if (/^92\d{10}$/.test(d)) d = '0' + d.slice(2);
  else if (/^3\d{9}$/.test(d)) d = '0' + d;
  return /^03\d{9}$/.test(d) ? d : '';
}
const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[A-Za-z]{2,}$/;
// "sara ahmed" / "SARA AHMED" -> "Sara Ahmed"; mixed case ("McDonald") is kept as typed.
function normName(v) {
  let s = clean(v).replace(/[\u0000-\u001F]/g, '').replace(/\s+/g, ' ').slice(0, 80);
  if (s && (s === s.toLowerCase() || s === s.toUpperCase())) {
    s = s.toLowerCase().replace(/(^|[\s'’.-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
  }
  return s;
}
const key = v => clean(v).toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');   // "dr usman  ali" = "Dr. Usman Ali"
const DOCTOR_BY_KEY = Object.fromEntries(Object.keys(CLINIC.doctors).map(n => [key(n), n]));
const VISIT_BY_KEY = Object.fromEntries(CLINIC.visitTypes.map(n => [key(n), n]));
const isCancelled = s => ['cancelled', 'canceled'].includes(key(s));

// Every bookable start time in a day: 10:00, 10:20 ... 13:40, 17:00 ... 20:40
const SLOTS = [];
for (const [a, b] of CLINIC.sessions) for (let m = toMin(a); m + CLINIC.slotMinutes <= toMin(b); m += CLINIC.slotMinutes) SLOTS.push(toTime(m));
const daysText = (() => {
  const open = [1, 2, 3, 4, 5, 6, 0].filter(d => !CLINIC.daysOff.includes(d));
  return open.length === 6 && CLINIC.daysOff[0] === 0 ? 'Monday to Saturday' : open.map(d => DAY_NAMES[d]).join(', ');
})();
const HOURS_TEXT = CLINIC.sessions.map(([a, b]) => ampm(a) === ampm(b) ? `${hourWord(a)}–${hourWord(b)} ${ampm(b)}` : `${hourWord(a)} ${ampm(a)}–${hourWord(b)} ${ampm(b)}`).join(' and ') + ', ' + daysText;

// ============ 3. NOW, REQUEST, SHEET ============
const req = $('Start').first().json;
const action = clean(req.action);
const data = req.data || {};
const nowStr = clean(data.test_now) || $now.setZone(CLINIC.timezone).toFormat('yyyy-MM-dd HH:mm');
if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(nowStr)) throw new Error(`test_now must look like "2026-10-19 08:00", got "${nowStr}"`);
const TODAY = nowStr.slice(0, 10);
const NOW_MIN = toMin(nowStr.slice(11, 16));
const STAMP = nowStr + ' PKT';
const LAST_DAY = addDays(TODAY, CLINIC.maxDaysAhead);

const where = r => `Row ${r.row}${r.booking_id ? ' (' + r.booking_id + ')' : ''}`;
const appts = [];      // every Appointments row that has anything in it, read once
for (const it of $('Read Appointments').all()) {
  const j = it.json;
  if (![j.booking_id, j.doctor, j.date, j.time, j.patient_name].some(v => clean(v))) continue;   // blank row
  appts.push({
    row: j.row_number ?? '?',
    booking_id: clean(j.booking_id).toUpperCase(),
    cancelled: isCancelled(j.status),
    doctor: DOCTOR_BY_KEY[key(j.doctor)] || '',
    doctor_raw: clean(j.doctor),
    date: normDate(j.date), date_raw: clean(j.date),
    time: normTime(j.time), time_raw: clean(j.time),
    patient_name: clean(j.patient_name),
    phone: clean(j.phone),
    email: clean(j.email).toLowerCase(),
    visit_type: clean(j.visit_type),
    booked_at: clean(j.booked_at),
    reminder: clean(j.reminder),
    cancel_token: clean(j.cancel_token),
  });
}
const closures = [], closureProblems = [];
for (const it of $('Read Closures').all()) {
  const j = it.json;
  if (![j.date, j.doctor, j.reason].some(v => clean(v))) continue;
  const date = normDate(j.date);
  const all = !clean(j.doctor) || key(j.doctor) === 'all doctors';
  const doctor = all ? '*' : DOCTOR_BY_KEY[key(j.doctor)];
  if (!date) closureProblems.push(`Closures row ${j.row_number}: the date "${clean(j.date)}" can't be read, so that closure is ignored. Use YYYY-MM-DD.`);
  else if (!doctor) closureProblems.push(`Closures row ${j.row_number}: "${clean(j.doctor)}" isn't one of the clinic's doctors, so that closure is ignored. Use a name from the dropdown or "All doctors".`);
  else closures.push({ date, doctor, reason: clean(j.reason) });
}

// ============ 4. SLOT RULES ============
const taken = new Set();
for (const a of appts) if (!a.cancelled && a.doctor && a.date && a.time) taken.add(a.doctor + '|' + a.date + '|' + a.time);

// Why this doctor can't work this day, in words for the patient. '' = open.
function closedWhy(doctor, date) {
  if (CLINIC.daysOff.includes(weekday(date))) return `the clinic is closed on ${DAY_NAMES[weekday(date)]}s`;
  if (closures.some(c => c.date === date && c.doctor === '*')) return `the clinic is closed on ${dateLabel(date)}`;
  if (closures.some(c => c.date === date && c.doctor === doctor)) return `${doctor} is not available on ${dateLabel(date)}`;
  return '';
}
const bookableNow = (date, t) => date > TODAY || toMin(t) >= NOW_MIN + CLINIC.minNoticeMinutes;
function freeTimes(doctor, date) {
  if (date < TODAY || date > LAST_DAY || closedWhy(doctor, date)) return [];
  return SLOTS.filter(t => bookableNow(date, t) && !taken.has(doctor + '|' + date + '|' + t));
}
// Why a day the patient asked for has no times, in words.
function noTimesWhy(doctor, date) {
  if (date < TODAY) return `${dateLabel(date)} has already passed`;
  const closed = closedWhy(doctor, date);
  if (closed) return closed;
  if (date === TODAY && !SLOTS.some(t => bookableNow(date, t))) return `online booking for today has closed (it closes ${CLINIC.minNoticeMinutes} minutes before each time)`;
  return `${doctor} is fully booked on ${dateLabel(date)}`;
}
function newBookingId() {
  const used = new Set(appts.map(a => a.booking_id));
  for (;;) {
    let id = 'BK-';
    for (let i = 0; i < 6; i++) id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    if (!used.has(id)) return id;
  }
}
const publicClinic = { name: CLINIC.name, phone: CLINIC.phone, hours: HOURS_TEXT, booking_form_url: CLINIC.bookingFormUrl, from: CLINIC.fromEmail, admin: CLINIC.adminEmail,
  timezone: CLINIC.timezone, slot_minutes: CLINIC.slotMinutes, max_days: CLINIC.maxDaysAhead, min_notice_minutes: CLINIC.minNoticeMinutes, cancel_cutoff_hours: CLINIC.cancelCutoffMinutes / 60,
  reminder_time: timeLabel(toTime(CLINIC.reminderHour * 60)).replace(':00 ', '\u00a0') };   // "8 AM" with a no-break space, so it never splits across lines
const specialty = d => (CLINIC.doctors[d] && CLINIC.doctors[d].specialty) || '';
const cancelLink = (id, token) => `${CLINIC.cancelFormUrl}?id=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`;
const out = j => ({ json: { action, now: STAMP, clinic: publicClinic, ...j } });

// ============ 5a. SLOTS: patient sent page 1 -> which times can they pick? ============
if (action === 'slots') {
  const f = data;
  const doctor = DOCTOR_BY_KEY[key(f['Doctor'])];
  const visit = VISIT_BY_KEY[key(f['Visit type'])];
  if (!doctor) throw new Error(`Doctor "${clean(f['Doctor'])}" is not in CLINIC.doctors. The form dropdown and d0 must match exactly.`);
  if (!visit) throw new Error(`Visit type "${clean(f['Visit type'])}" is not in CLINIC.visitTypes. The form dropdown and d0 must match exactly.`);
  const patient = { name: normName(f['Patient name']), phone: normPhone(f['Phone']), email: clean(f['Email']).toLowerCase() };
  const asked = normDate(f['Preferred date']);
  const errors = [];
  if (patient.name.replace(/[^\p{L}]/gu, '').length < 2) errors.push("Enter the patient's full name.");
  if (!patient.phone) errors.push('Enter a Pakistani mobile number, like 0300 1234567.');
  if (!EMAIL_RE.test(patient.email)) errors.push('Enter a valid email address. Your confirmation goes there.');
  if (!asked) errors.push('Choose a date.');
  const base = {
    booking_id: newBookingId(), requested_at: STAMP, doctor, doctor_specialty: specialty(doctor), visit_type: visit, patient,
    typed: { name: clean(f['Patient name']), phone: clean(f['Phone']), email: clean(f['Email']), date: clean(f['Preferred date']) },
    requested_date: asked,
  };
  if (errors.length) return [out({ ...base, status: 'refused', outcome: 'Invalid details', reason: errors.join(' '), errors })];
  if (asked > LAST_DAY) {
    return [out({ ...base, status: 'refused', outcome: 'Too far ahead',
      reason: `Online booking is open up to ${CLINIC.maxDaysAhead} days ahead, so the latest date you can choose is ${dateLabel(LAST_DAY)}.` })];
  }
  let date = asked < TODAY ? TODAY : asked;
  let times = freeTimes(doctor, date);
  let note = '';
  if (!times.length || asked < TODAY) {
    const why = noTimesWhy(doctor, asked);
    if (!times.length) {
      date = '';
      for (let d = addDays(asked < TODAY ? TODAY : asked, 1); d <= LAST_DAY; d = addDays(d, 1)) {
        if (freeTimes(doctor, d).length) { date = d; break; }
      }
      if (!date) {
        return [out({ ...base, status: 'refused', outcome: 'No free time',
          reason: `${why[0].toUpperCase() + why.slice(1)}, and ${doctor} has no free times in the next ${CLINIC.maxDaysAhead} days.` })];
      }
      times = freeTimes(doctor, date);
    }
    note = `${why[0].toUpperCase() + why.slice(1)}. The ${date === TODAY ? 'soonest' : 'next'} day with free times is ${dateLabel(date)}.`;
  }
  const labels = times.map(timeLabel);
  const description = (note ? note + '\n' : '') + `Pick a time below. Each appointment is ${CLINIC.slotMinutes} minutes.`;
  return [out({
    ...base, status: 'choose', outcome: 'Choosing time', reason: note, date, date_label: dateLabel(date), moved: date !== asked,
    times, form: {
      title: 'Choose a time',
      description,
      fields: [{ fieldLabel: 'Time', fieldType: 'dropdown', requiredField: true, fieldOptions: { values: [...labels, DECLINE].map(option => ({ option })) } }],
    },
  })];
}

// ============ 5b. CHECK: patient picked a time -> can we book it right now? ============
if (action === 'check') {
  const r = data.request || {};                 // the "slots" answer from earlier in this booking
  const chosen = clean(data.chosen);
  const base = { booking_id: r.booking_id, doctor: r.doctor, doctor_specialty: specialty(r.doctor), date: r.date, visit_type: r.visit_type, patient: r.patient, typed: r.typed, requested_date: r.requested_date, requested_at: r.requested_at, chosen };
  if (!chosen) return [out({ ...base, status: 'stop', outcome: 'Abandoned', reason: 'No time was chosen before the page expired.' })];
  if (chosen === DECLINE) return [out({ ...base, status: 'stop', outcome: 'Declined', reason: 'None of the offered times suited the patient.' })];
  const time = normTime(chosen);
  if (!time || !SLOTS.includes(time)) return [out({ ...base, status: 'stop', outcome: 'Invalid details', reason: `"${chosen}" is not one of the clinic's times.` })];
  const when = whenLabel(r.date, time);
  if (!freeTimes(r.doctor, r.date).includes(time)) {
    let outcome = 'Taken before submit', reason = `Someone else booked ${when} while you were choosing.`;
    if (closedWhy(r.doctor, r.date)) { outcome = 'No free time'; reason = closedWhy(r.doctor, r.date)[0].toUpperCase() + closedWhy(r.doctor, r.date).slice(1) + '.'; }
    else if (!bookableNow(r.date, time) || r.date < TODAY) { outcome = 'Too late'; reason = `${when} is now less than ${CLINIC.minNoticeMinutes} minutes away, so it can't be booked online.`; }
    return [out({ ...base, status: 'stop', outcome, reason, time, when })];
  }
  const token = clean(data.cancel_token);
  if (!token) throw new Error('No cancel token was passed to the check. Is the "Make Cancel Token" node connected?');
  const row = {
    booking_id: r.booking_id, booked_at: STAMP, status: 'Confirmed', doctor: r.doctor, date: r.date,
    day: DAY_NAMES[weekday(r.date)], time, patient_name: r.patient.name, phone: r.patient.phone, email: r.patient.email,
    visit_type: r.visit_type, reminder: '', cancel_token: token, cancelled_at: '',
  };
  // When will d3 remind them? It runs once a day at reminderHour (see 5c). The booked page tells the patient.
  const reminderAt = CLINIC.reminderHour * 60;
  const reminder_plan = r.date === TODAY ? 'none'                                   // booked on the day: no reminder
    : r.date !== addDays(TODAY, 1) || NOW_MIN < reminderAt ? 'day_before'           // today's run hasn't happened yet, or the visit is later
    : toMin(time) > reminderAt ? 'visit_morning' : 'none';                          // missed today's run: it goes out on the visit morning
  return [out({ ...base, status: 'book', outcome: 'Booked', reason: '', time, when, row, cancel_link: cancelLink(r.booking_id, token), reminder_plan })];
}

// ============ 5c. REMINDERS: who gets a reminder this morning? + every upcoming clash ============
// One reminder per booking, the morning before (or the same morning if booked after yesterday's run).
// Bookings made on the day of the appointment get none: the confirmation was minutes or hours ago.
// Clashes: every booking from now on that falls on a day its doctor is away is listed for reception
// every morning until someone moves, cancels or un-closes it. Patients are never emailed about it
// automatically, because one typo in Closures would send real patients a wrong message.
if (action === 'reminders') {
  const TOMORROW = addDays(TODAY, 1);
  const clashes = [];
  for (const a of appts) {
    if (a.cancelled || !a.doctor || !a.date || a.date < TODAY) continue;   // unknown doctor / unreadable date: d4 reports those
    if (a.date === TODAY && a.time && toMin(a.time) <= NOW_MIN) continue;   // already over
    const closed = closedWhy(a.doctor, a.date);
    if (!closed) continue;
    const reminded = /^sent/i.test(a.reminder);
    clashes.push({ sort: a.date + (a.time || '99'), text: `${where(a)}, ${a.patient_name || 'no name'}: booked with ${a.doctor} for ${a.time ? whenLabel(a.date, a.time) : dateLabel(a.date)}, but ${closed}. ` +
      (reminded ? 'A reminder already went out, so please' : 'No reminder goes out while this stands. Please') + ` contact the patient on ${a.phone || a.email || 'the number they gave'} to move or cancel it.` });
  }
  clashes.sort((x, y) => x.sort.localeCompare(y.sort));
  const problems = clashes.map(c => c.text), due = [], seen = new Set();
  for (const a of appts) {
    if (a.cancelled) continue;
    if (!a.date || (a.date !== TODAY && a.date !== TOMORROW)) continue;     // unreadable dates are d4's report
    if (/^sent/i.test(a.reminder)) continue;
    const label = `${where(a)}, ${a.patient_name || 'no name'}, ${dateLabel(a.date)}`;
    if (!a.time) { problems.push(`${label}: the time "${a.time_raw}" can't be read, so no reminder was sent.`); continue; }
    if (a.date === TODAY && toMin(a.time) <= NOW_MIN) continue;             // already over
    if (normDate(a.booked_at.slice(0, 10)) === a.date) continue;            // booked on the day itself
    if (!a.booking_id) { problems.push(`${label}: no booking_id, so the reminder can't be recorded. Add one (e.g. BK-STAFF1) and it goes out next morning.`); continue; }
    if (seen.has(a.booking_id)) { problems.push(`${label}: booking_id ${a.booking_id} appears on more than one row. Only the first got a reminder; delete the duplicate.`); continue; }
    seen.add(a.booking_id);
    if (!a.doctor) { problems.push(`${label}: doctor "${a.doctor_raw}" isn't one of the clinic's doctors, so no reminder was sent.`); continue; }
    if (!EMAIL_RE.test(a.email)) { problems.push(`${label}: no valid email ("${a.email}"), so no reminder was sent. Phone ${a.phone || 'missing'}.`); continue; }
    if (closedWhy(a.doctor, a.date)) continue;                               // a clash: already listed above
    due.push({ kind: 'due', booking_id: a.booking_id, patient_name: a.patient_name, patient_email: a.email, doctor: a.doctor, date: a.date, time: a.time,
      when: whenLabel(a.date, a.time), day_word: a.date === TODAY ? 'today' : 'tomorrow', visit_type: a.visit_type,
      cancel_link: a.cancel_token ? cancelLink(a.booking_id, a.cancel_token) : '', retry: /^failed/i.test(a.reminder) });
  }
  due.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
  const items = due.map(d => out(d));
  if (problems.length) items.push(out({ kind: 'attention', source: 'Morning reminders', problems }));
  return items;                                    // empty = nothing to send, nothing wrong
}

// ============ 5d. SCHEDULE: each doctor's list for today + sheet health check ============
if (action === 'schedule') {
  const problems = [...closureProblems], ids = new Map(), byDoctor = {};
  for (const n of Object.keys(CLINIC.doctors)) byDoctor[n] = [];
  for (const a of appts) {
    if (a.booking_id) {
      if (ids.has(a.booking_id)) problems.push(`Rows ${ids.get(a.booking_id)} and ${a.row} share booking_id ${a.booking_id}. Delete the duplicate or give it its own ID.`);
      else ids.set(a.booking_id, a.row);
    }
    if (a.cancelled) continue;
    if (!a.date) { problems.push(`${where(a)}: the date "${a.date_raw}" can't be read, so this booking is on nobody's list and gets no reminder. Use YYYY-MM-DD.`); continue; }
    if (a.date !== TODAY) continue;
    if (!a.doctor) { problems.push(`${where(a)}: doctor "${a.doctor_raw}" isn't one of the clinic's doctors, so today's ${a.time ? timeLabel(a.time) : ''} booking for ${a.patient_name || 'a patient'} is on nobody's list.`); continue; }
    if (!a.time) problems.push(`${where(a)}: the time "${a.time_raw}" can't be read. ${a.patient_name || 'The patient'} is listed for ${a.doctor} without a time.`);
    if (byDoctor[a.doctor].some(b => b.booking_id && b.booking_id === a.booking_id)) continue;   // duplicate row, already reported
    byDoctor[a.doctor].push({ booking_id: a.booking_id, time: a.time, time_label: a.time ? timeLabel(a.time) : 'Time?', patient_name: a.patient_name, visit_type: a.visit_type, phone: a.phone });
  }
  const items = [];
  for (const [doctor, list] of Object.entries(byDoctor)) {
    list.sort((x, y) => (x.time || '99').localeCompare(y.time || '99'));
    const closed = closedWhy(doctor, TODAY);                // the doctor's email warns them; reception hears about clashes from d3 (5c)
    items.push(out({ kind: 'doctor', doctor, to: CLINIC.doctors[doctor].email, date: TODAY, date_label: dateLabel(TODAY), closed, appointments: list, prepared_at: timeLabel(nowStr.slice(11, 16)) }));
  }
  if (problems.length) items.push(out({ kind: 'attention', source: "Doctors' morning lists", problems }));
  return items;
}

// ============ 5e. BOOKING: cancel link opened -> find the booking and say if it can be cancelled ============
if (action === 'booking') {
  const id = clean(data.id).toUpperCase(), token = clean(data.token);
  const a = id && token ? appts.find(x => x.booking_id === id && x.cancel_token === token) : null;
  if (!a) return [out({ status: 'not_found', booking_id: id })];
  const info = { booking_id: a.booking_id, doctor: a.doctor || a.doctor_raw, doctor_specialty: specialty(a.doctor), patient_name: a.patient_name, patient_email: a.email, visit_type: a.visit_type,
    when: a.date && a.time ? whenLabel(a.date, a.time) : a.date_raw + ' ' + a.time_raw };
  if (a.cancelled) return [out({ ...info, status: 'already_cancelled' })];
  if (!a.date || !a.time) throw new Error(`Booking ${a.booking_id} (row ${a.row}) has an unreadable date or time, so it can't be cancelled online.`);
  const minutesLeft = daysBetween(TODAY, a.date) * 1440 + toMin(a.time) - NOW_MIN;
  if (minutesLeft <= 0) return [out({ ...info, status: 'passed' })];
  if (minutesLeft < CLINIC.cancelCutoffMinutes) return [out({ ...info, status: 'too_late', cutoff_hours: CLINIC.cancelCutoffMinutes / 60 })];
  return [out({ ...info, status: 'cancellable', update: { booking_id: a.booking_id, status: 'Cancelled', cancelled_at: STAMP } })];
}

throw new Error(`Unknown action "${action}". Use slots, check, reminders, schedule or booking.`);
