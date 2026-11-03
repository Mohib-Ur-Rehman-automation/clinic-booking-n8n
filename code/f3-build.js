// f3 · Build: turns Sera's hand-off into an email for reception and a row for the Handoffs tab.
// The sheet node writes in RAW mode, so a summary starting with "=" stays text and can't become a formula.
// Without a phone number or email nobody can call the patient back, so nothing is sent and Sera is told to ask.
const inp = $('Start').first().json;
const info = $('Clinic Info').first().json;
const c = info.clinic;
const clean = v => ((v !== null && typeof v === 'object') || typeof v === 'function' ? '' : String(v ?? '')).replace(/[\x00-\x1F\x7F]/g, ' ').trim();
const esc = v => clean(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const name = clean(inp.patient_name).slice(0, 80);
const contact = clean(inp.contact).slice(0, 120);
const summary = clean(inp.summary).slice(0, 1000);
const REASONS = { medical: 'Medical question', reschedule: 'Change or reschedule', complaint: 'Complaint', question: 'Question Sera could not answer', human: 'Asked for a person' };
const reason = Object.prototype.hasOwnProperty.call(REASONS, clean(inp.reason).toLowerCase()) ? clean(inp.reason).toLowerCase() : 'question';

// The gate is sealed by f0's Prep node, not written by the AI: it caps hand-offs per chat, so nobody can flood reception.
let gate = {};
try { gate = JSON.parse(inp.gate || '{}') || {}; } catch (e) { gate = {}; }
if (gate.handoff_pause === true) {
  return [{ json: { ready: false, result: { kind: 'hand_off', status: 'not_sent', reason: `Reception has had a lot of chat messages in the last hour, so nothing more can be sent from the chat right now. Ask the patient to call the clinic on ${c.phone}.`,
    _trace: [{ icon: 'lock', text: 'Clinic-wide hand-off limit reached: nothing sent' }] } } }];
}
if (!(gate.handoffs_left > 0)) {
  return [{ json: { ready: false, result: { kind: 'hand_off', status: 'not_sent', reason: 'This chat has already passed questions to reception. Tell the patient reception will reply, or to call the clinic.',
    _trace: [{ icon: 'lock', text: 'Hand-off limit for this chat reached: nothing sent' }] } } }];
}
const hasContact = /\d{7,}/.test(contact.replace(/\D/g, '')) || /\S+@\S+\.\S+/.test(contact);
if (!hasContact) {
  return [{ json: { ready: false, result: { kind: 'hand_off', status: 'not_sent', reason: 'Need a phone number or email so reception can reply. Ask the patient for one.',
    _trace: [{ icon: 'skip', text: 'Hand-off held back: no phone number or email yet' }] } } }];
}
const CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
let ref = 'HO-';
for (let i = 0; i < 5; i++) ref += CH[Math.floor(Math.random() * CH.length)];
const label = REASONS[reason];
const urgent = reason === 'medical' || reason === 'complaint';

const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#0F172A;max-width:560px">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#0F766E;font-weight:bold">Front desk hand-off · ${esc(ref)}</p>
<h2 style="margin:0 0 14px;font-size:20px">${esc(label)}${urgent ? ' · please reply today' : ''}</h2>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">
<tr><td style="padding:6px 0;color:#475569;width:110px">Patient</td><td style="padding:6px 0"><b>${esc(name) || 'Not given'}</b></td></tr>
<tr><td style="padding:6px 0;color:#475569">Contact</td><td style="padding:6px 0">${esc(contact)}</td></tr>
<tr><td style="padding:6px 0;color:#475569">When</td><td style="padding:6px 0">${esc(info.now)}</td></tr></table>
<div style="margin:14px 0;padding:12px 14px;background:#FFF6EC;border-left:4px solid #FF8B5A;border-radius:6px;font-size:14px;line-height:1.5">${esc(summary) || 'No summary given.'}</div>
<p style="margin:0;font-size:13px;color:#475569">Written by Sera, the website chat. Mark the row in <b>Handoffs</b> as Done when it's dealt with.</p></div>`;
const text = `Front desk hand-off ${ref}\n${label}${urgent ? ' (please reply today)' : ''}\n\nPatient: ${name || 'Not given'}\nContact: ${contact}\nWhen: ${info.now}\n\n${summary || 'No summary given.'}\n\nWritten by Sera, the website chat. Mark the row in Handoffs as Done when it's dealt with.`;

return [{ json: { ready: true, ref, label,
  email: { from: c.from, to: c.admin, subject: `[Front desk] ${label}: ${name || 'patient'} (${ref})`, html, text },
  row: { ref, created_at: info.now, reason: label, patient_name: name, contact, summary, status: 'Open' } } }];
