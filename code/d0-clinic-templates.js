// d0 · Clinic Templates: every page and email the clinic shows, in one place.
// Takes Clinic Rules' answer and adds: page_html (result pages), email {from,to,subject,html,text},
// form (Choose Time page blocks) and confirm (cancel page).
// Everything a patient or staff member typed is escaped with esc() before it goes into HTML.

// ============ LOOK: Tropical Teal & Apricot ============
const C = {
  teal: '#0F766E',      // headings, time, main buttons (white on it 5.5:1)
  apricot: '#FF8B5A',   // token highlight, calendar button: always with Midnight text (6.9:1), never as text
  peach: '#FFE2C2',     // Peach Cream: background shapes
  paper: '#FFF6EC',     // page background (lighter Peach Cream, so the shapes stand out)
  slip: '#FFF1E4',      // appointment slip
  ink: '#0F172A',       // Midnight: body text
  muted: '#475569',     // secondary text (7.0:1 on paper)
  eucalyptus: '#6B8F7A',// tear line, done steps, decoration only, never text
  line: '#E8D9C6',      // card borders
  alert: '#B42318',
  alertBg: '#FDECE8',
};
const FONT = "'Figtree', 'Segoe UI', Helvetica, Arial, sans-serif";
const FONT_MAIL = 'Helvetica, Arial, sans-serif';   // Gmail drops web fonts, so emails use system fonts

// Shared by the result pages (below) and the n8n form pages (gen.js copies BRAND_CSS + FORM_CSS into Custom Form Styling).
// Plain strings on purpose: no ${} inside, so the build script can copy them exactly.
const BRAND_CSS = `@import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;700;800&display=swap');
html{background:#FFF6EC url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E %3CfeColorMatrix values='0 0 0 0 .06 0 0 0 0 .09 0 0 0 0 .16 0 0 0 .09 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E") repeat}
body{background:transparent !important;min-height:100vh;position:relative;overflow-x:hidden}
body::before,body::after{content:'';position:fixed;z-index:0;pointer-events:none;background-repeat:no-repeat;background-size:contain}
body::before{top:0;right:0;width:min(46vw,520px);height:min(38vw,420px);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 520 420'%3E %3Cpath d='M520 0H120c-18 64 22 130 104 150 86 21 118 96 196 150 40 28 76 38 100 40z' fill='%23FFE2C2'/%3E %3Cpath d='M520 0H286c-14 58 18 112 92 128 62 13 104 50 142 96z' fill='%230F766E'/%3E %3Ccircle cx='300' cy='64' r='44' fill='%23FF8B5A'/%3E %3Cpath d='M520 236c-34-6-64 4-82 30 30 6 58 22 82 46z' fill='%236B8F7A' opacity='.75'/%3E%3C/svg%3E");background-position:top right}
body::after{bottom:0;left:0;width:min(42vw,480px);height:min(36vw,400px);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 480 400'%3E %3Cpath d='M0 400V96c74 6 124 60 150 128 22 58 74 118 168 176z' fill='%23FFE2C2'/%3E %3Cpath d='M0 400V214c58 2 98 46 116 104 10 34 28 62 56 82z' fill='%236B8F7A' opacity='.85'/%3E %3Ccircle cx='212' cy='352' r='26' fill='%23FF8B5A'/%3E %3Cpath d='M0 150c40 4 66 26 78 58-30-2-58-16-78-36z' fill='%230F766E'/%3E%3C/svg%3E");background-position:bottom left}
@media (max-width:640px){body::before{width:70vw;height:56vw;opacity:.85}body::after{width:62vw;height:52vw;opacity:.85}}`;

const FORM_CSS = `:root{--font-family:'Figtree','Segoe UI',Helvetica,Arial,sans-serif;--font-size-label:15px;--font-size-input:16px;--font-size-header:28px;--font-size-paragraph:15px;
--color-background:transparent;--color-card-bg:#FFFFFF;--color-card-border:#E8D9C6;--color-card-shadow:rgba(15,23,42,0.08);--color-header:#0F766E;--color-label:#0F172A;
--color-input-border:#D9C7B2;--color-input-text:#0F172A;--color-focus-border:#0F766E;--color-submit-btn-bg:#0F766E;--color-submit-btn-text:#FFFFFF;
--color-required:#B42318;--color-error:#B42318;--color-link:#475569;--color-html-text:#0F172A;--color-html-link:#0F766E;
--border-radius-card:16px;--border-radius-input:10px;--container-width:500px;--padding-card:28px}
.container{position:relative;z-index:1;padding:28px 16px 40px !important;max-width:100%}
.container section::before{content:'Demo Family Clinic';display:block;padding:6px 0 6px 46px;margin:0 0 18px;min-height:36px;line-height:24px;font:800 17px/24px var(--font-family);color:#0F172A;text-align:left;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40' aria-hidden='true'%3E%3Crect width='40' height='40' rx='11' fill='%230F766E'/%3E %3Cpath d='M9 30c0-10 7.5-17.5 18.5-18.5C26.5 22.5 19 30 9 30z' fill='%23FFE2C2'/%3E%3Cpath d='M9.5 29.5 21 18' stroke='%230F766E' stroke-width='1.6' stroke-linecap='round'/%3E %3Ccircle cx='29' cy='11' r='5' fill='%23FF8B5A'/%3E%3C/svg%3E") left center/36px 36px no-repeat}
.card{box-shadow:0 18px 40px -18px rgba(15,23,42,.25) !important}
.form-header{text-align:left}
.form-header h1{font-weight:800 !important;letter-spacing:-.3px}
.form-header p{color:#0F172A !important}
#submit-btn{font-weight:700;letter-spacing:.2px}
#submit-btn:hover{filter:brightness(1.1)}
div.html{margin-bottom:6px}
div.html ol{display:flex;flex-direction:row !important;gap:6px;list-style:none;padding:0 !important;margin:0 0 4px !important;counter-reset:s;line-height:1.3 !important}
div.html ol li{flex:1;counter-increment:s;font-size:12.5px;color:#475569;border-top:4px solid #E8D9C6;padding-top:7px;margin:0 !important;text-align:left}
div.html ol li::before{content:counter(s) '. '}
div.html ol li:has(i){border-top-color:#6B8F7A}
div.html ol li:has(i)::before{content:'\\2713  '}
div.html ol li:has(b){border-top-color:#0F766E;color:#0F172A}
div.html ol li b,div.html ol li i{font-style:normal;font-weight:700}
div.html div{display:flex;align-items:center;gap:14px;background:#FFF1E4;border-radius:12px;padding:12px 14px}
div.html div h3{line-height:1 !important;flex:0 0 48px;width:48px;height:48px;margin:0 !important;border-radius:50%;background:#0F766E;color:#FFFFFF !important;font-size:17px !important;font-weight:800;display:flex;align-items:center;justify-content:center;letter-spacing:.5px}
div.html div p{margin:0 !important;font-size:14px;line-height:1.45;color:#475569}
div.html div p b{color:#0F172A;font-size:16px}
@media only screen and (max-width:500px){.container{width:100% !important;padding:20px 14px 32px !important}.card{padding:22px 18px !important;border:1px solid #E8D9C6 !important;border-radius:16px !important;background:#FFFFFF !important}}`;

const LOGO_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40' aria-hidden='true'><rect width='40' height='40' rx='11' fill='#0F766E'/> <path d='M9 30c0-10 7.5-17.5 18.5-18.5C26.5 22.5 19 30 9 30z' fill='#FFE2C2'/><path d='M9.5 29.5 21 18' stroke='#0F766E' stroke-width='1.6' stroke-linecap='round'/> <circle cx='29' cy='11' r='5' fill='#FF8B5A'/></svg>`;

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const phoneShow = p => /^03\d{9}$/.test(String(p)) ? String(p).slice(0, 4) + '-' + String(p).slice(4) : String(p ?? '');
const firstName = n => String(n ?? '').trim().split(/\s+/)[0] || 'there';
const splitWhen = w => { const i = String(w).lastIndexOf(', '); return i < 0 ? [String(w), ''] : [w.slice(0, i), w.slice(i + 2)]; };   // "Tuesday 20 Oct, 5:20 PM"
const initials = name => String(name).replace(/^dr\.?\s+/i, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const enc = encodeURIComponent;

// Link back to the booking form with what the patient typed already filled in.
// Built by hand: n8n's Code sandbox has no URLSearchParams.
function againLink(j, keepDate) {
  const t = j.typed || {};
  const pairs = [['Patient name', t.name], ['Phone', t.phone], ['Email', t.email], ['Doctor', j.doctor], ['Visit type', j.visit_type], ['Preferred date', keepDate ? t.date : '']];
  const q = pairs.filter(([, v]) => v).map(([k, v]) => enc(k) + '=' + enc(v)).join('&');
  return j.clinic.booking_form_url + (q ? '?' + q : '');
}
// "Add to Google Calendar": a pre-filled link, nothing to install or pay for
function calendarLink(j) {
  const pad = n => String(n).padStart(2, '0');
  const endMin = Number(j.time.slice(0, 2)) * 60 + Number(j.time.slice(3, 5)) + j.clinic.slot_minutes;
  const day = j.date.replace(/-/g, '');
  const dates = `${day}T${j.time.replace(':', '')}00/${day}T${pad(Math.floor(endMin / 60))}${pad(endMin % 60)}00`;
  const details = `Token ${j.booking_id}. Please arrive 10 minutes early.` + (j.cancel_link ? `\nCan't make it? Cancel: ${j.cancel_link}` : '');
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE' + '&text=' + enc(`${j.visit_type} with ${j.doctor}`) +
    '&dates=' + dates + '&ctz=' + enc(j.clinic.timezone) + '&details=' + enc(details) + '&location=' + enc(j.clinic.name);
}

// ============ FORM PAGE BLOCKS (n8n strips classes from these, so FORM_CSS styles them by their tags) ============
// Steps: <i> = done, <b> = current
const formSteps = current => '<ol>' + ['Your details', 'Choose a time', 'Confirmed']
  .map((s, i) => `<li>${i + 1 < current ? `<i>${s}</i>` : i + 1 === current ? `<b>${s}</b>` : s}</li>`).join('') + '</ol>';
const doctorCard = (doctor, specialty, line) => `<div><h3>${esc(initials(doctor))}</h3><p><b>${esc(doctor)}</b><br>${esc(specialty)}${line ? '<br>' + esc(line) : ''}</p></div>`;

// ============ RESULT PAGES (n8n Form completion → Show Text) ============
function page(j, { title, lead = '', body = '', button = null, aside = '', step = 0, tone = 'ok' }) {
  const steps = step ? '<ol class="dc-steps">' + ['Your details', 'Choose a time', 'Confirmed']
    .map((s, i) => `<li class="${i + 1 < step ? 'done' : i + 1 === step ? 'now' : ''}">${s}</li>`).join('') + '</ol>' : '';
  return `<style>${BRAND_CSS}
.dc{position:relative;z-index:1;box-sizing:border-box;width:100%;max-width:560px;margin:0 auto;padding:28px 16px 40px;font-family:${FONT};color:${C.ink};font-size:16px;line-height:1.55;text-align:left}
.dc *{box-sizing:border-box}
.dc-top{display:flex;align-items:center;gap:10px;margin:0 0 18px}
.dc-top svg{width:36px;height:36px;flex:0 0 36px}
.dc-top b{display:block;font-size:17px;font-weight:800;line-height:1.2}
.dc-top small{display:block;font-size:13px;color:${C.muted}}
.dc-steps{display:flex;gap:6px;list-style:none;padding:0;margin:0 0 16px;counter-reset:s}
.dc-steps li{flex:1;counter-increment:s;font-size:12.5px;color:${C.muted};border-top:4px solid ${C.line};padding-top:7px}
.dc-steps li::before{content:counter(s) '. '}
.dc-steps li.done{border-top-color:${C.eucalyptus}}
.dc-steps li.done::before{content:'\\2713  '}
.dc-steps li.now{border-top-color:${C.teal};color:${C.ink};font-weight:700}
.dc-grid{display:grid;gap:16px}
.dc-card,.dc-side{background:#fff;border:1px solid ${C.line};border-radius:16px;padding:28px 24px;box-shadow:0 18px 40px -18px rgba(15,23,42,.25)}
.dc-side{background:rgba(255,255,255,.88);padding:22px 22px}
.dc h1{font-size:28px;line-height:1.15;color:${tone === 'alert' ? C.alert : C.teal};margin:0 0 8px;font-weight:800;letter-spacing:-.3px}
.dc h2{font-size:17px;margin:0 0 12px;font-weight:800;color:${C.ink}}
.dc-lead{margin:0 0 18px}
.dc-slip{background:${C.slip};border-top:2px dashed ${C.eucalyptus};border-radius:0 0 12px 12px;padding:18px 20px 16px;margin:4px 0 20px}
.dc-time{font-size:44px;line-height:1;font-weight:800;color:${C.teal};letter-spacing:-1px}
.dc-date{font-size:18px;font-weight:700;margin:6px 0 14px}
.dc-slip table{border-collapse:collapse;width:100%;font-size:15px}
.dc-slip td{padding:3px 0;vertical-align:top}
.dc-slip td:first-child{color:${C.muted};width:92px}
.dc-token{background:${C.apricot};color:${C.ink};padding:2px 8px;border-radius:6px;font-weight:800;letter-spacing:1px}
.dc-gone .dc-time,.dc-gone .dc-date{text-decoration:line-through;color:${C.muted}}
.dc p{margin:0 0 12px}
.dc ul{margin:0 0 12px;padding-left:20px}
.dc-next{list-style:none;padding:0;margin:0 0 16px;counter-reset:n}
.dc-next li{counter-increment:n;position:relative;padding:0 0 12px 38px;font-size:15px}
.dc-next li::before{content:counter(n);position:absolute;left:0;top:0;width:26px;height:26px;border-radius:50%;background:${C.peach};color:${C.ink};font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center}
.dc-note{background:${C.alertBg};border-left:4px solid ${C.alert};padding:10px 14px;margin:0 0 16px;border-radius:0 8px 8px 0}
.dc-btn{display:inline-block;background:${C.teal};color:#fff !important;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;margin-top:4px}
.dc-btn.warm{background:${C.apricot};color:${C.ink} !important}
.dc-btn:focus-visible,.dc a:focus-visible{outline:3px solid ${C.ink};outline-offset:2px}
.dc a{color:${C.teal};font-weight:600}
.dc-info{margin:0;font-size:14.5px}
.dc-info dt{color:${C.muted};font-size:13px}
.dc-info dd{margin:0 0 10px}
.dc .dc-foot{font-size:13px;color:${C.muted};margin:16px 0 0}
@media (min-width:880px){.dc{max-width:940px}.dc-grid{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);align-items:start}}
</style>
<div class="dc">
<header class="dc-top">${LOGO_SVG}<span><b>${esc(j.clinic.name)}</b><small>${esc(j.clinic.hours)}</small></span></header>
${steps}
<div class="dc-grid">
<main class="dc-card">
<h1>${esc(title)}</h1>
${lead ? `<p class="dc-lead">${lead}</p>` : ''}
${body}
${button ? `<a class="dc-btn" href="${esc(button.href)}">${esc(button.text)}</a>` : ''}
</main>
<aside class="dc-side">${aside || clinicInfo(j)}</aside>
</div>
<p class="dc-foot">Questions? Call ${esc(j.clinic.phone)}.</p>
</div>`;
}
function slipPage(s, gone = false) {
  const [date, time] = splitWhen(s.when);
  return `<div class="dc-slip${gone ? ' dc-gone' : ''}">
<div class="dc-time">${esc(time)}</div>
<div class="dc-date">${esc(date)}</div>
<table>
<tr><td>Doctor</td><td>${esc(s.doctor)}</td></tr>
${s.visit_type ? `<tr><td>Visit</td><td>${esc(s.visit_type)}</td></tr>` : ''}
${s.patient_name ? `<tr><td>Patient</td><td>${esc(s.patient_name)}</td></tr>` : ''}
<tr><td>Token</td><td><span class="dc-token">${esc(s.booking_id)}</span></td></tr>
</table>
</div>`;
}
function clinicInfo(j) {
  return `<h2>About booking online</h2><dl class="dc-info">
<dt>Opening hours</dt><dd>${esc(j.clinic.hours)}</dd>
<dt>How far ahead</dt><dd>Up to ${j.clinic.max_days} days. Online booking closes ${j.clinic.min_notice_minutes} minutes before each time.</dd>
<dt>Cancelling</dt><dd>Use the link in your confirmation email, up to ${j.clinic.cancel_cutoff_hours} hours before.</dd>
<dt>Phone</dt><dd>${esc(j.clinic.phone)}</dd></dl>`;
}

// ============ EMAILS (tables + inline styles, so Gmail/Outlook show them right) ============
function mail(j, { preheader, title, body }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${C.paper}">
<div style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px">
<tr><td style="padding:0 4px 14px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="34" height="34" style="width:34px;height:34px;background:${C.teal};border-radius:10px;text-align:right;vertical-align:top;padding:5px 5px 0 0"><span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${C.apricot}"></span></td>
<td style="padding-left:10px;font-family:${FONT_MAIL};font-size:15px;font-weight:bold;color:${C.ink}">${esc(j.clinic.name)}<br><span style="font-size:12px;font-weight:normal;color:${C.muted}">${esc(j.clinic.hours)}</span></td>
</tr></table></td></tr>
<tr><td style="background:#ffffff;border:1px solid ${C.line};border-radius:16px;padding:26px 24px;font-family:${FONT_MAIL};font-size:15px;line-height:1.55;color:${C.ink}">
<div style="font-size:23px;line-height:1.25;font-weight:bold;color:${C.teal};margin:0 0 12px">${esc(title)}</div>
${body}
</td></tr>
<tr><td style="padding:14px 4px;font-family:${FONT_MAIL};font-size:12px;color:${C.muted}">${esc(j.clinic.name)} &nbsp; Questions? Call ${esc(j.clinic.phone)}.</td></tr>
</table></td></tr></table></body></html>`;
}
function slipMail(s, gone = false) {
  const [date, time] = splitWhen(s.when);
  const strike = gone ? 'text-decoration:line-through;color:' + C.muted + ';' : '';
  const row = (k, v) => `<tr><td width="90" style="padding:3px 0;font-family:${FONT_MAIL};font-size:14px;color:${C.muted};vertical-align:top">${k}</td><td style="padding:3px 0;font-family:${FONT_MAIL};font-size:14px;color:${C.ink}">${v}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px"><tr><td style="background:${C.slip};border-top:2px dashed ${C.eucalyptus};border-radius:0 0 12px 12px;padding:16px 18px">
<div style="font-family:${FONT_MAIL};font-size:36px;line-height:1;font-weight:bold;color:${C.teal};${strike}">${esc(time)}</div>
<div style="font-family:${FONT_MAIL};font-size:16px;font-weight:bold;color:${C.ink};margin:6px 0 12px;${strike}">${esc(date)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
${row('Doctor', esc(s.doctor))}
${s.visit_type ? row('Visit', esc(s.visit_type)) : ''}
${row('Token', `<span style="background:${C.apricot};color:${C.ink};padding:2px 8px;border-radius:6px;font-weight:bold;letter-spacing:1px">${esc(s.booking_id)}</span>`)}
</table></td></tr></table>`;
}
const p = t => `<p style="margin:0 0 12px">${t}</p>`;
const mailBtn = (href, text, kind = 'main') => {
  const look = { main: [`background:${C.teal}`, '#ffffff', ''], warm: [`background:${C.apricot}`, C.ink, ''], quiet: ['', C.teal, `border:2px solid ${C.teal};`] }[kind];
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;margin:4px 8px 10px 0"><tr><td style="${look[0]};${look[2]}border-radius:10px"><a href="${esc(href)}" style="display:inline-block;padding:${kind === 'quiet' ? '9px 16px' : '11px 18px'};font-family:${FONT_MAIL};font-size:14px;font-weight:bold;color:${look[1]};text-decoration:none">${esc(text)}</a></td></tr></table>`;
};
const textSlip = s => `${s.when}\nDoctor: ${s.doctor}${s.visit_type ? '\nVisit: ' + s.visit_type : ''}\nToken: ${s.booking_id}`;
const textFoot = j => `\n\n${j.clinic.name}\nQuestions? Call ${j.clinic.phone}.`;

// ============ BUILD, per answer ============
const results = [];
for (const item of $input.all()) {
  const j = { ...item.json };
  const slip = { when: j.when, doctor: j.doctor, visit_type: j.visit_type, booking_id: j.booking_id, patient_name: j.patient && j.patient.name };

  // ---- d1 page 1 answered: either the Choose Time page, or a result page ----
  if (j.action === 'slots' && j.status === 'choose') {
    j.form = { ...j.form, fields: [{ fieldType: 'html', html: formSteps(2) }, { fieldType: 'html', html: doctorCard(j.doctor, j.doctor_specialty, `${j.date_label} · ${j.visit_type}`) }, ...j.form.fields] };
  }
  if (j.action === 'slots' && j.status === 'refused') {
    if (j.outcome === 'Invalid details') {
      j.page_html = page(j, { step: 1, title: 'Check your details', tone: 'alert', lead: 'Nothing was booked yet. Please fix these and send the form again:',
        body: '<ul>' + j.errors.map(e => `<li>${esc(e)}</li>`).join('') + '</ul>', button: { href: againLink(j, true), text: 'Back to the form' } });
    } else if (j.outcome === 'Too far ahead') {
      j.page_html = page(j, { step: 1, title: 'Choose an earlier date', lead: esc(j.reason), button: { href: againLink(j, false), text: 'Choose another date' } });
    } else {
      j.page_html = page(j, { step: 1, title: 'No free times', lead: esc(j.reason), body: p(`Please call ${esc(j.clinic.phone)} and the front desk will help you find a time.`) });
    }
  }

  // ---- d1: patient picked a time ----
  if (j.action === 'check') {
    if (j.status === 'book') {
      const cal = calendarLink(j);
      j.calendar_link = cal;   // the front desk's booking ticket uses it too
      // Rules decide when d3 will remind them (5b): the day before, the visit morning, or not at all (booked on the day).
      const reminderLine = { day_before: `A reminder email arrives at ${j.clinic.reminder_time} the day before your visit.`,
        visit_morning: `A reminder email arrives tomorrow at ${j.clinic.reminder_time}, the morning of your visit.` }[j.reminder_plan];
      const aside = `<h2>What happens next</h2><ol class="dc-next">` +
        (reminderLine ? `<li>${esc(reminderLine)}</li>` : '') +
        `<li>Arrive 10 minutes early. Bring any previous prescriptions or reports.</li>` +
        `<li>Can't make it? <a href="${esc(j.cancel_link)}">Cancel online</a> up to ${j.clinic.cancel_cutoff_hours} hours before, so another patient can have the time.</li></ol>` +
        `<a class="dc-btn warm" href="${esc(cal)}" target="_blank" rel="noopener">Add to Google Calendar</a>`;
      j.page_html = page(j, { step: 3, title: "You're booked", lead: `A confirmation is on its way to ${esc(j.patient.email)}.`, body: slipPage(slip), aside });
      j.page_html_email_failed = page(j, { step: 3, title: "You're booked", lead: 'Your appointment is saved.', aside,
        body: slipPage(slip) + `<div class="dc-note">We couldn't send the confirmation email to ${esc(j.patient.email)}. Please take a screenshot of this page or note your token.</div>` });
      j.email = {
        from: j.clinic.from, to: j.patient.email,
        subject: `Booked: ${j.when} with ${j.doctor}`,
        html: mail(j, { preheader: `Your token is ${j.booking_id}. Please arrive 10 minutes early.`, title: `You're booked, ${firstName(j.patient.name)}`,
          body: slipMail(slip) + p('Please arrive 10 minutes early and bring any previous prescriptions or reports.') + mailBtn(cal, 'Add to Google Calendar', 'warm') +
            `<p style="margin:10px 0 8px">Can't make it? Cancelling frees the time for another patient. You can cancel online up to ${j.clinic.cancel_cutoff_hours} hours before.</p>` + mailBtn(j.cancel_link, 'Cancel this appointment', 'quiet') }),
        text: `Hi ${firstName(j.patient.name)},\n\nYour appointment is booked.\n\n${textSlip(slip)}\n\nPlease arrive 10 minutes early.\nAdd to Google Calendar: ${cal}\nCan't make it? Cancel online up to ${j.clinic.cancel_cutoff_hours} hours before: ${j.cancel_link}` + textFoot(j),
      };
    } else {
      const titles = { 'Taken before submit': 'That time was just taken', 'Too late': 'That time is too close now', 'No free time': 'That day is no longer available',
        Declined: 'No appointment booked', Abandoned: 'This page has expired', 'Invalid details': 'Something went wrong with that time' };
      const leads = { Declined: 'You chose none of the times, so nothing was booked.', Abandoned: 'No time was chosen within 30 minutes, so nothing was booked.' };
      j.page_html = page(j, { step: 2, title: titles[j.outcome] || 'No appointment booked', lead: esc(leads[j.outcome] || j.reason) + (j.outcome === 'Declined' || j.outcome === 'Abandoned' ? '' : ' Nothing was booked.'),
        body: p('Your details are filled in already. Pick a date and you will see the times that are free now.'), button: { href: againLink(j, j.outcome !== 'Declined'), text: 'Choose another time' } });
    }
  }

  // ---- d3: reminder ----
  if (j.action === 'reminders' && j.kind === 'due') {
    const s = { ...slip, patient_name: '' };
    j.email = {
      from: j.clinic.from, to: j.patient_email,
      subject: `Reminder: ${j.day_word} at ${splitWhen(j.when)[1]} with ${j.doctor}`,
      html: mail(j, { preheader: `${j.when}. Token ${j.booking_id}.`, title: `See you ${j.day_word}, ${firstName(j.patient_name)}`,
        body: slipMail(s) + p('Please arrive 10 minutes early.') +
          (j.cancel_link ? p("If you can't come, please cancel so another patient can have the time.") + mailBtn(j.cancel_link, 'Cancel this appointment', 'quiet') : p(`If you can't come, please call ${esc(j.clinic.phone)}.`)) }),
      text: `Hi ${firstName(j.patient_name)},\n\nA reminder of your appointment ${j.day_word}.\n\n${textSlip(s)}\n\nPlease arrive 10 minutes early.\n` +
        (j.cancel_link ? `Can't come? Cancel here: ${j.cancel_link}` : `Can't come? Call ${j.clinic.phone}.`) + textFoot(j),
    };
  }

  // ---- d4: doctor's list ----
  if (j.action === 'schedule' && j.kind === 'doctor') {
    const n = j.appointments.length;
    const td = 'padding:9px 12px 9px 0;border-bottom:1px solid ' + C.line + ';font-family:' + FONT_MAIL + ';font-size:14px;vertical-align:top';
    const th = td + ';color:' + C.muted + ';font-size:12px;font-weight:normal;text-align:left';
    const table = n ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 16px"><tr><th style="${th}">Time</th><th style="${th}">Patient</th><th style="${th}">Visit</th><th style="${th}">Phone</th></tr>` +
      j.appointments.map(a => `<tr><td style="${td};white-space:nowrap;color:${C.teal};font-weight:bold">${esc(a.time_label)}</td><td style="${td}">${esc(a.patient_name)}</td><td style="${td}">${esc(a.visit_type)}</td><td style="${td};white-space:nowrap">${esc(phoneShow(a.phone))}</td></tr>`).join('') + '</table>'
      : p('No appointments are booked for today.');
    const closedNote = j.closed ? `<div style="background:${C.alertBg};border-left:4px solid ${C.alert};padding:10px 14px;margin:0 0 14px">The sheet says ${esc(j.closed)}. ${n ? 'Reception has been asked to contact these patients.' : ''}</div>` : '';
    j.email = {
      from: j.clinic.from, to: j.to,
      subject: `Today: ${n} appointment${n === 1 ? '' : 's'}, ${j.date_label}`,
      html: mail(j, { preheader: n ? `First at ${j.appointments[0].time_label}.` : 'No appointments today.', title: `Good morning, ${j.doctor}`,
        body: closedNote + p(`You have <b>${n}</b> appointment${n === 1 ? '' : 's'} today, ${esc(j.date_label)}.`) + table +
          `<p style="margin:0;font-size:12px;color:${C.muted}">Prepared at ${esc(j.prepared_at)}. Bookings or cancellations after that aren't included.</p>` }),
      text: `Good morning, ${j.doctor}\n\nYou have ${n} appointment${n === 1 ? '' : 's'} today, ${j.date_label}.\n\n` +
        (n ? j.appointments.map(a => `${a.time_label}  ${a.patient_name}  ${a.visit_type}  ${phoneShow(a.phone)}`).join('\n') : 'No appointments are booked for today.') +
        `\n\nPrepared at ${j.prepared_at}.` + textFoot(j),
    };
  }

  // ---- d3/d4: problems for the admin ----
  if (j.kind === 'attention') {
    const n = j.problems.length;
    j.email = {
      from: j.clinic.from, to: j.clinic.admin,
      subject: `Clinic sheet needs attention: ${n} issue${n === 1 ? '' : 's'}`,
      html: mail(j, { preheader: j.problems[0], title: `${n} thing${n === 1 ? '' : 's'} to fix in the clinic sheet`,
        body: p(`Found by ${esc(j.source)} at ${esc(j.now)}. Everything else went out as normal.`) +
          '<ol style="margin:0 0 14px;padding-left:20px">' + j.problems.map(x => `<li style="margin:0 0 8px">${esc(x)}</li>`).join('') + '</ol>' +
          p('Fix the rows in the sheet. The next run picks them up automatically.') }),
      text: `Found by ${j.source} at ${j.now}.\n\n` + j.problems.map((x, i) => `${i + 1}. ${x}`).join('\n') + '\n\nFix the rows in the sheet. The next run picks them up automatically.',
    };
  }

  // ---- d2: cancel link ----
  if (j.action === 'booking') {
    const s = { ...slip, patient_name: '' };
    const again = { href: j.clinic.booking_form_url, text: 'Book an appointment' };
    const bookAside = `<h2>Need another time?</h2><p>Choose a doctor and a day, and you'll see the times that are free.</p><a class="dc-btn warm" href="${esc(j.clinic.booking_form_url)}">Book an appointment</a>`;
    if (j.status === 'cancellable') {
      j.confirm = {
        title: 'Cancel your appointment?',
        description: `Token ${j.booking_id}. Cancelling frees this time for another patient.`,
        fields: [{ fieldType: 'html', html: doctorCard(j.doctor, j.doctor_specialty, `${j.when}${j.visit_type ? ' · ' + j.visit_type : ''}`) },
          { fieldLabel: 'Cancel this appointment?', fieldType: 'radio', requiredField: true, fieldOptions: { values: [{ option: 'Yes, cancel it' }, { option: 'No, keep it' }] } }],
      };
      j.page_html = page(j, { title: 'Appointment cancelled', lead: `The time is free again for another patient. A cancellation email is on its way to ${esc(j.patient_email)}.`, body: slipPage(s, true), aside: bookAside });
      j.page_html_email_failed = page(j, { title: 'Appointment cancelled', lead: 'The time is free again for another patient.', aside: bookAside, body: slipPage(s, true) +
        `<div class="dc-note">We couldn't send the cancellation email to ${esc(j.patient_email)}. This page is your confirmation.</div>` });
      j.page_html_kept = page(j, { title: 'Your appointment is kept', lead: 'Nothing changed. See you then.', body: slipPage(s) });
      j.email = {
        from: j.clinic.from, to: j.patient_email,
        subject: `Cancelled: ${j.when} with ${j.doctor}`,
        html: mail(j, { preheader: `Token ${j.booking_id} is cancelled.`, title: 'Your appointment is cancelled', body: slipMail(s, true) + p('Thank you for letting us know. Need another time?') + mailBtn(j.clinic.booking_form_url, 'Book an appointment') }),
        text: `Your appointment is cancelled.\n\n${textSlip(s)}\n\nNeed another time? ${j.clinic.booking_form_url}` + textFoot(j),
      };
    } else {
      const map = {
        not_found: ['This cancel link doesn\'t work', 'It may be cut short or copied wrongly. Open the link from your confirmation email again, or call the clinic.', false],
        already_cancelled: ['Already cancelled', 'This appointment was cancelled earlier. Nothing else to do.', true],
        too_late: ['Too late to cancel online', `Online cancelling closes ${j.cutoff_hours} hours before the appointment. Please call ${esc(j.clinic.phone)} so the doctor knows.`, false],
        passed: ['This appointment has passed', 'It can no longer be changed.', false],
      };
      const [title, lead, gone] = map[j.status];
      j.page_html = page(j, { title, lead, body: j.status === 'not_found' ? '' : slipPage(s, gone), aside: j.status === 'too_late' ? '' : bookAside });
    }
  }
  results.push({ json: j });
}
return results;
