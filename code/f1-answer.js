// f1 · Answer: turns d0's availability answer into a short reply for Sera, plus trace lines for the page's side panel.
const a = $input.first().json;
const out = { kind: 'find_times', status: a.status };
const trace = [];
if (a.status === 'ok') {
  out.results = a.results.map(r => ({ doctor: r.doctor, date: r.date, date_label: r.date_label, note: r.note, free_times: r.times }));
  for (const r of a.results) {
    if (!r.times.length) trace.push({ icon: 'search', text: `${r.doctor}: no free times in the next 30 days` });
    else trace.push({ icon: 'search', text: `Free times for ${r.doctor}, ${r.date_label}: ${r.times.length}` + (r.moved ? ` (asked day had none: ${r.note.split('.')[0].toLowerCase()})` : '') });
  }
} else if (a.status === 'bad_date') {
  out.message = `The date "${a.asked_date}" can't be read. Send it as YYYY-MM-DD, using the 14-day list.`;
  trace.push({ icon: 'skip', text: `Unreadable date "${a.asked_date}": asked Sera to resend it` });
} else if (a.status === 'too_far') {
  out.message = `Online booking only goes up to ${a.last_day_label} (${a.last_day}).`;
  trace.push({ icon: 'skip', text: `Date beyond the 30-day booking window` });
} else if (a.status === 'unknown_doctor') {
  out.message = `There is no doctor called "${a.asked_doctor}". The doctors are ${a.doctors.join(' and ')}.`;
  trace.push({ icon: 'skip', text: `Unknown doctor "${a.asked_doctor}"` });
}
out._trace = trace;
return [{ json: out }];
