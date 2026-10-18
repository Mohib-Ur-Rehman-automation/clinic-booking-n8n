// d3 · Stamp: one row update per reminder, saying whether it went out.
// Send Emails returns one result per email, in the same order as Due Reminders' items.
const failMsg = j => j.error ? String(j.error.message || j.error.description || j.error) : (Array.isArray(j.rejected) && j.rejected.length ? 'rejected by the mail server: ' + j.rejected.join(', ') : '');
const answers = $('Due Reminders').all();

const rows = [];
$input.all().forEach((sent, i) => {
  const a = answers[i].json;
  if (a.kind !== 'due') return;                               // the "Needs attention" email isn't a booking
  const err = failMsg(sent.json);
  rows.push({ json: { booking_id: a.booking_id, reminder: err ? `Failed ${a.now}: ${err.slice(0, 200)}` : `Sent ${a.now}` } });
});
return rows;
