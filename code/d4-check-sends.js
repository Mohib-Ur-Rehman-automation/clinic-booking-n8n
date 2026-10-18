// Check Sends: after every email has been tried, fail loudly if any didn't go out, so e0 emails you.
// Sits on its own branch BELOW the other one: n8n runs the top branch first, so stamps are saved before this runs.
const failMsg = j => j.error ? String(j.error.message || j.error.description || j.error) : (Array.isArray(j.rejected) && j.rejected.length ? 'rejected by the mail server: ' + j.rejected.join(', ') : '');
const ANSWERS = 'Doctor Lists';                                 // the node whose items were emailed
const answers = $(ANSWERS).all();
const sends = $('Send Emails').all();

const failed = [];
sends.forEach((s, i) => {
  const err = failMsg(s.json);
  if (!err) return;
  const a = answers[i].json;
  const who = a.kind === 'attention' ? 'the "Needs attention" email' : a.kind === 'doctor' ? `${a.doctor}'s list` : `${a.patient_name} (${a.booking_id})`;
  failed.push(`${who}: ${err}`);
});
if (failed.length) {
  throw new Error(`${failed.length} of ${sends.length} emails failed to send. ${failed.join(' | ')}`);
}
return [{ json: { sent: sends.length } }];
