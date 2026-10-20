// f2 · Finish: one Request Log row for every chat booking that reached d0's final check, booked or not.
// Same columns as d1's log, so reception sees form and chat bookings in one place.
const failMsg = j => j.error ? String(j.error.message || j.error.description || j.error) : (Array.isArray(j.rejected) && j.rejected.length ? 'rejected by the mail server: ' + j.rejected.join(', ') : '');
const req = $('Find Times').first().json;
const chk = $('Final Check').first().json;
const booked = chk.status === 'book';
const emailStatus = booked && $('Send Confirmation').isExecuted ? (failMsg($('Send Confirmation').first().json) ? 'Failed: ' + failMsg($('Send Confirmation').first().json) : 'Sent') : '';
const p = req.patient || {};
return [{ json: { email_status: emailStatus, log: {
  booking_id: req.booking_id,
  requested_at: req.requested_at,
  finished_at: chk.now,
  outcome: chk.outcome,
  doctor: req.doctor,
  requested_date: req.requested_date || '',
  offered_date: req.date || '',
  chosen_time: chk.time || '',
  patient_name: p.name || '',
  phone: p.phone || '',
  email: p.email || '',
  visit_type: req.visit_type,
  reason: booked ? 'Booked in the website chat (Sera)' : 'Website chat (Sera): ' + (chk.reason || ''),
  confirmation_email: emailStatus,
} } }];
