const { load, run, t, report } = require('./harness');
// Optional: pass the previous alert code to prove the other projects' alerts are unchanged (private kit only).
const OLD = process.argv[2] ? require('fs').readFileSync(process.argv[2], 'utf8') : null;
const NEW = load('e0-build-alert.js');
const alert = (src, name, message) => run(src, { nowUTC: '2026-10-19T03:00:00Z', nodes: { 'Error Trigger': { workflow: { name }, execution: { id: '9', mode: 'trigger', lastNodeExecuted: 'X', url: 'https://n8n.local/e/9', error: { message } } } } })[0];
if (OLD) for (const [name, msg] of [['i4. market-autopilot', 'invalid_grant'], ['i1. market-screener', 'You have run out of searches'], ['c1. toolkit-core', 'ETIMEDOUT'], ['i2. market-deep-dive', 'Unable to parse range']]) {
  const o = alert(OLD, name, msg), n = alert(NEW, name, msg);
  const strip = h => h.replace('open the Google Sheets or Gmail credential', 'Google Sheets account');
  t(`Amazon alert unchanged: ${name} / ${msg}`, strip(n.html) === o.html && n.subject === o.subject, 'differs');
}
for (const [name, msg, label, hint] of [
  ['d3. clinic-reminders', '1 of 3 emails failed to send. Failed reminders are retried next morning. Bilal: 550', 'D3 CLINIC REMINDERS', /Some emails did not go out/],
  ['d1. clinic-booking', 'The caller does not have permission', 'D1 CLINIC BOOKING', /service account/],
  ['d0. clinic-core', 'Forbidden - perhaps check your credentials?', 'D0 CLINIC CORE', /Google refused access/],
  ['d0. clinic-core', 'Doctor "Dr. X" is not in CLINIC.doctors. The form dropdown and d0 must match exactly.', 'D0 CLINIC CORE', /do not match/],
  ['d4. clinic-doctor-list', 'getaddrinfo ENOTFOUND smtp.gmail.com', 'D4 DOCTOR LISTS', /network call timed out/],
]) {
  const n = alert(NEW, name, msg);
  t(`clinic alert labelled: ${name}`, n.html.toUpperCase().includes(label), n.html.match(/E0 · ERROR ALERT[^<]*/)[0]);
  t(`clinic hint: ${name}`, hint.test(n.html), (n.html.match(/Check first:<\/b> ([^<]+)/) || [])[1]);
}
process.exitCode = report('e0 Build Alert');
