// f2 · Result: what Sera hears back after a booking attempt, plus trace lines and the ticket for the page.
// Paths: details not ready · d0 refused the details · time gone by the final check · booked (email sent or failed).
const label = t => { const h = Number(t.slice(0, 2)); return (h % 12 || 12) + ':' + t.slice(3, 5) + (h >= 12 ? ' PM' : ' AM'); };
const shape = $('Shape').first().json;
if (!shape.ready) return [{ json: shape.result }];

const trace = [{ icon: 'search', text: `Checked the clinic's rules: ${shape.chosen} is free with ${shape.doctor}, ${shape.date_label}` }];
const slots = $('Find Times').first().json;
if (!$('Final Check').isExecuted) {
  if (slots.status === 'refused') {
    trace.push({ icon: 'skip', text: `Details refused: ${slots.outcome.toLowerCase()}` });
    return [{ json: { kind: 'book', status: 'not_booked', reason: slots.reason, fix: slots.errors || [], _trace: trace } }];
  }
  trace.push({ icon: 'skip', text: `${shape.chosen} was taken a moment ago` });
  return [{ json: { kind: 'book', status: 'not_booked', reason: `Someone else just took ${shape.chosen}.`,
    free_times: (slots.times || []).slice(0, 6).map(label), _trace: trace } }];
}
trace.push({ icon: 'rules', text: 'Checked the name, mobile number and email' });
const chk = $('Final Check').first().json;
if (chk.status !== 'book') {
  trace.push({ icon: 'skip', text: `Last-second re-check stopped it: ${chk.outcome.toLowerCase()}` }, { icon: 'sheet', text: 'Attempt written to Request Log' });
  return [{ json: { kind: 'book', status: 'not_booked', reason: chk.reason, _trace: trace } }];
}
const fin = $('Finish').first().json;
const emailOk = fin.email_status === 'Sent';
trace.push({ icon: 'lock', text: `Re-checked at the last second, then saved to Appointments as ${chk.booking_id}` },
  { icon: emailOk ? 'mail' : 'alert', text: emailOk ? `Confirmation email sent to ${chk.patient.email}` : `Confirmation email failed: ${fin.email_status.replace(/^Failed: /, '')}` },
  { icon: 'sheet', text: 'Written to Request Log (outcome: Booked)' });
return [{ json: {
  kind: 'book', status: 'booked', booking_id: chk.booking_id, when: chk.when, doctor: chk.doctor, visit_type: chk.visit_type,
  confirmation_email: emailOk ? 'sent' : 'failed',
  ticket: { booking_id: chk.booking_id, when: chk.when, doctor: chk.doctor, specialty: chk.doctor_specialty, visit_type: chk.visit_type,
    patient_name: chk.patient.name, email: chk.patient.email, email_sent: emailOk, cancel_link: chk.cancel_link, calendar_link: chk.calendar_link || '' },
  _trace: trace,
} }];
