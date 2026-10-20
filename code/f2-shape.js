// f2 · Shape: checks what Sera sent before anything is booked.
// d0 has already answered "is this time free?" (Check Time). Here: are all details present, is it one doctor,
// is it the exact day asked (no silent move to another day), is the time really free, is the visit type real?
// Anything wrong -> ready: false and a plain reason Sera can pass on. Nothing is booked.
// First of all, the gate: sealed by f0's Prep node, never written by the AI. No yes in the patient's own message,
// or no bookings left in this chat, means no booking, whatever the AI was talked into. No gate at all also means no.
const inp = $('Start').first().json;
const a = $('Check Time').first().json;
const clean = v => String(v ?? '').trim();
const key = v => clean(v).toLowerCase().replace(/[^a-z0-9]/g, '');
const pad = n => String(n).padStart(2, '0');
const label = t => { const h = Number(t.slice(0, 2)); return (h % 12 || 12) + ':' + t.slice(3, 5) + (h >= 12 ? ' PM' : ' AM'); };
// "5:20 PM", "5.20pm", "17:20", "5 pm" -> "17:20", or ''
function to24(v) {
  const s = clean(v).toLowerCase().replace(/\s+/g, '').replace('.', ':');
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
  if (!m) return '';
  let h = +m[1]; const min = m[2] === undefined ? 0 : +m[2];
  if (min > 59 || h > 23 || (m[3] && (h < 1 || h > 12)) || (!m[3] && m[2] === undefined)) return '';
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  return pad(h) + ':' + pad(min);
}
const fail = (reason, extra = {}) => [{ json: { ready: false, result: { kind: 'book', status: 'not_booked', reason, ...extra,
  _trace: [{ icon: 'skip', text: 'Booking not attempted: ' + reason }] } } }];

let gate = {};
try { gate = JSON.parse(inp.gate || '{}') || {}; } catch (e) { gate = {}; }
if (gate.affirm !== true) return fail('The patient hasn\'t confirmed in this message. Repeat the details in one line and ask them to say yes.', { needs: 'confirmation' });
if (!(gate.bookings_left > 0)) return fail('This chat has already made its bookings. For more, the patient can call reception or use the booking form.', { needs: 'reception' });

const need = { patient_name: 'full name', phone: 'mobile number', email: 'email', doctor: 'doctor', visit_type: 'visit type', date: 'date', time: 'time' };
const missing = Object.keys(need).filter(k => !clean(inp[k]));
if (missing.length) return fail('Missing details: ' + missing.map(k => need[k]).join(', ') + '.', { missing: missing.map(k => need[k]) });

if (a.status === 'unknown_doctor') return fail(`There is no doctor called "${a.asked_doctor}". The doctors are ${a.doctors.join(' and ')}.`);
if (a.status === 'bad_date') return fail(`The date "${a.asked_date}" can't be read. Send it as YYYY-MM-DD.`);
if (a.status === 'too_far') return fail(`Online booking only goes up to ${a.last_day_label}.`);
if (a.status !== 'ok' || a.results.length !== 1) return fail('Choose one doctor before booking.');

// A full name, so two people on one family phone stay apart: at least a first and a last name.
const nameParts = clean(inp.patient_name).split(/\s+/).filter(w => /\p{L}{2,}/u.test(w));
if (nameParts.length < 2) return fail('Ask for the patient\'s full name (first and last name) before booking.', { missing: ['full name'] });
// Caps: a person is the mobile number plus the name. Family members sharing a phone each get their own visits.
const nameKey = v => clean(v).toLowerCase().replace(/[^a-z\u0600-\u06ff]+/g, ' ').trim();
const mine = (a.phone_upcoming_names || []).filter(n => n === nameKey(inp.patient_name)).length;
if (mine >= a.max_upcoming) {
  return fail(`${clean(inp.patient_name)} already has ${mine} upcoming visits booked, the most the chat can book for one person. Reception can help with more.`, { needs: 'reception' });
}
if ((a.phone_upcoming || 0) >= (a.max_per_phone || 4)) {
  return fail(`This mobile number already has ${a.phone_upcoming} upcoming visits booked, the most the chat can book for one number. Reception can help with more.`, { needs: 'reception' });
}
const r = a.results[0];
if (r.moved || r.date !== a.asked_date) {
  return fail(`No free times with ${r.doctor} that day. ${r.note}`, r.times.length ? { next_day: r.date_label, next_day_date: r.date, free_times: r.times.slice(0, 6) } : {});
}
const t = to24(inp.time);
if (!t) return fail(`The time "${clean(inp.time)}" can't be read. Use one of the free times, like ${r.times[0]}.`, { free_times: r.times.slice(0, 6) });
if (!r.times_24.includes(t)) {
  const mins = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const near = [...r.times_24].sort((x, y) => Math.abs(mins(x) - mins(t)) - Math.abs(mins(y) - mins(t))).slice(0, 4).sort().map(label);
  return fail(`${label(t)} isn't free with ${r.doctor} on ${r.date_label}.`, { free_times: near });
}
const vk = key(inp.visit_type);
const visit = vk.length >= 3 ? (a.visit_types || []).find(v => key(v) === vk || key(v).startsWith(vk)) : undefined;
if (!visit) return fail(`The visit type must be one of: ${(a.visit_types || []).join(', ')}.`);

return [{ json: { ready: true, doctor: r.doctor, date: r.date, date_label: r.date_label, time24: t, chosen: label(t),
  form: { 'Patient name': clean(inp.patient_name), Phone: clean(inp.phone), Email: clean(inp.email), Doctor: r.doctor, 'Visit type': visit, 'Preferred date': r.date } } }];
