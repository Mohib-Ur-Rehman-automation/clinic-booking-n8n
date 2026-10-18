// d1 · Finish: whichever way the booking went, pick the page to show and build the Request Log row.
// Paths: refused on page 1 · stopped at the final check · booked (email sent or failed).
const failMsg = j => j.error ? String(j.error.message || j.error.description || j.error) : (Array.isArray(j.rejected) && j.rejected.length ? 'rejected by the mail server: ' + j.rejected.join(', ') : '');

const req = $('Find Times').first().json;                                    // answer to page 1
const chk = $('Final Check').isExecuted ? $('Final Check').first().json : null;  // answer after page 2
const last = chk || req;

let html = last.page_html;
let emailStatus = '';
if (chk && chk.status === 'book') {
  const err = failMsg($('Send Confirmation').first().json);
  emailStatus = err ? 'Failed: ' + err : 'Sent';
  if (err) html = chk.page_html_email_failed;
}
const p = req.patient || {}, typed = req.typed || {};
return [{ json: {
  html,
  log: {
    booking_id: req.booking_id,
    requested_at: req.requested_at,
    finished_at: last.now,
    outcome: last.outcome,
    doctor: req.doctor,
    requested_date: req.requested_date || typed.date || '',
    offered_date: req.date || '',
    chosen_time: chk && chk.time ? chk.time : '',
    patient_name: p.name || typed.name || '',
    phone: p.phone || typed.phone || '',
    email: p.email || typed.email || '',
    visit_type: req.visit_type,
    reason: last.reason || '',
    confirmation_email: emailStatus,
  },
}}];
