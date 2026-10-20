// f3 · Result: what Sera hears back after a hand-off, plus trace lines for the page.
const b = $('Build').first().json;
if (!b.ready) return [{ json: b.result }];
const s = $('Send to Reception').first().json;
const err = s.error ? String(s.error.message || s.error) : (Array.isArray(s.rejected) && s.rejected.length ? 'rejected by the mail server' : '');
return [{ json: {
  kind: 'hand_off', status: 'handed_off', ref: b.ref, reason: b.label, reception_emailed: !err,
  _trace: [
    { icon: err ? 'alert' : 'mail', text: err ? `Reception email failed (${err}); still saved in Handoffs` : `Reception emailed: ${b.label} (${b.ref})` },
    { icon: 'sheet', text: `Written to Handoffs as ${b.ref}, status Open` },
  ],
} }];
