// Follow-up cadence (the only place it lives): #1 on day 1, #2 on day 3, #3 on day 7, then closed.
// The stage is saved BEFORE the email is sent, so a crash can never send the same follow-up twice.
const s = $('Settings').first().json;
const now = s.now;
const DAY = 24 * 3600 * 1000;
const WAIT_AFTER = { 1: 2 * DAY, 2: 4 * DAY };       // after #1 wait 2 days, after #2 wait 4 days
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BRAND = s.settings.BRAND;
const F = "'DM Sans','Helvetica Neue',Arial,sans-serif", H = "'DM Serif Display',Georgia,'Times New Roman',serif";
const shell = ({ pre, title, body }) => `<!doctype html><html><body style="margin:0;padding:0;background:#F6F8F7">
<span style="display:none;max-height:0;overflow:hidden">${esc(pre)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F8F7"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid #DFE6E4;border-radius:12px">
<tr><td style="height:4px;line-height:4px;font-size:0;background:#E0A21B;border-radius:12px 12px 0 0">&nbsp;</td></tr>
<tr><td style="padding:24px 32px 0;font-family:${H};font-size:20px;line-height:28px;color:#0F2624"><span style="display:inline-block;width:18px;height:9px;background:#E0A21B;border-radius:9px 9px 0 0;margin-right:8px;vertical-align:middle"></span>${esc(BRAND)}</td></tr>
<tr><td style="padding:24px 32px 0;font-family:${H};font-size:28px;line-height:36px;color:#0F2624">${title}</td></tr>
<tr><td style="padding:12px 32px 24px;font-family:${F};font-size:16px;line-height:26px;color:#0F2624">${body}<p style="margin:0">The ${esc(BRAND)} team</p></td></tr>
<tr><td style="padding:16px 32px 24px;border-top:1px solid #DFE6E4;font-family:${F};font-size:14px;line-height:20px;color:#4E6260">${esc(BRAND)} is a demo business used to showcase an automation. No real service is offered. Reply to this email and follow-ups stop.</td></tr>
</table></td></tr></table></body></html>`;
const p = t => `<p style="margin:0 0 16px">${t}</p>`;
const TEMPLATES = {
  1: (f, city) => ({
    subject: `Did our message reach you, ${f}?`,
    pre: 'Reply with your bill amount and a good time to call.',
    title: `Hi ${esc(f)}, just checking in.`,
    body: p('We sent you a note yesterday about your solar request and wanted to make sure it reached you.')
      + p(`If it's easier, reply with your latest electricity bill amount and a good time to call, so we can size your system before we speak.`),
  }),
  2: (f, city) => ({
    subject: `A free site survey${city ? ' in ' + city : ''}?`,
    pre: 'We check your roof, shade and meter at no cost.',
    title: 'The fastest way to an exact quote',
    body: p(`Hi ${esc(f)}, a short site survey tells us exactly what your roof can carry and what it will save you. We check your roof, shade and meter, free of charge.`)
      + p('Reply <b>YES</b> with a day that suits you and we will book it.'),
  }),
  3: (f) => ({
    subject: 'Should we close your solar request?',
    pre: 'This is our last email. Reply any time to pick it back up.',
    title: 'Closing your request for now',
    body: p(`Hi ${esc(f)}, we haven't heard back, so this is our last email.`)
      + p("If you'd like a quote later, reply to this email any time and we'll pick it up where we left off."),
  }),
};
const out = [];
for (const r of ($input.first().json.results || []).slice(0, s.settings.MAX_PER_RUN)) {
  const pr = r.properties || {};
  const stage = Number(pr.followup_stage || 0);
  if (!pr.email || !Number.isInteger(stage) || stage < 0 || stage > 2) continue;
  const n = stage + 1;
  const props = n < 3
    ? { followup_stage: n, next_followup_at: now + WAIT_AFTER[n] }
    : { followup_stage: 3, engine_status: 'closed' };
  // Same echo rule as L0: name/city typed into a public form never become links in our emails.
  const unglue = v => String(v || '').replace(/\.(?=\p{L})/gu, '. ');
  const city = unglue(pr.city);
  const safeCity = /^[\p{L}\p{M}][\p{L}\p{M} .,'-]*$/u.test(city) && city.split(' ').filter(Boolean).length <= 4 && city.length <= 40 ? city : '';
  // The name gets the same check as the city: whatever is stored in HubSpot (typed in by hand, imported, older data),
  // only a plain name is echoed. Anything else, a link or a line break included, becomes "there".
  const nm = unglue(String(pr.firstname || '').trim());
  const first = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(nm) && nm.split(' ').filter(Boolean).length <= 4 && nm.length <= 40 ? nm : 'there';
  const t = TEMPLATES[n](first, safeCity);
  out.push({ json: {
    action: 'crm_update',
    data: { contact_id: String(r.id), properties: props },
    n, lead_key: pr.lead_key || pr.email,
    to: pr.email,
    from: `${BRAND} <${s.settings.FROM_EMAIL}>`,
    subject: t.subject,
    html: shell(t),
  } });
}
return out;
