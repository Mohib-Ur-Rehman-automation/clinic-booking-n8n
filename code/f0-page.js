// f0 · Page: the front desk chat page, served by n8n at /webhook/front-desk.
// n8n serves webhook pages in a sandbox (no same-origin), so the page:
//  - calls the chat webhook by its full address, worked out here from the request's host
//  - sends JSON as text/plain, which needs no CORS pre-check
//  - keeps the chat session in memory (browser storage is blocked inside the sandbox)
// Everything Sera writes is escaped in the browser; only **bold** and line breaks are turned into HTML.
const h = $('Open Page').first().json.headers || {};
const first = v => String(v || '').split(',')[0].trim();
const typed = first(h['x-forwarded-host']) || first(h.host);
const host = /^[A-Za-z0-9.\-:\[\]]+$/.test(typed) ? typed : 'localhost:5678';     // anything odd in the header -> the local default
const proto = first(h['x-forwarded-proto']) === 'https' ? 'https' : 'http';
const endpoint = `${proto}://${host}/webhook/front-desk/chat`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sera, the front desk</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--teal:#0F766E;--teal-deep:#0B5A54;--apricot:#FFE2C2;--coral:#FF8B5A;--ink:#0F172A;--cream:#FFF6EC;--paper:#FFFDF9;--line:#E8D9C6;--muted:#5B6474;--good:#0F766E;--bad:#B42318;
  --font:'Figtree','Segoe UI',Helvetica,Arial,sans-serif}
*{box-sizing:border-box}
html{background:var(--cream) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E %3CfeColorMatrix values='0 0 0 0 .06 0 0 0 0 .09 0 0 0 0 .16 0 0 0 .09 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E") repeat}
body{margin:0;min-height:100vh;font:16px/1.5 var(--font);color:var(--ink);background:transparent;position:relative;overflow-x:hidden}
body::before{content:'';position:fixed;top:0;right:0;width:min(46vw,520px);height:min(38vw,420px);z-index:0;pointer-events:none;background:no-repeat top right/contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 520 420'%3E%3Cpath d='M520 0H120c-18 64 22 130 104 150 86 21 118 96 196 150 40 28 76 38 100 40z' fill='%23FFE2C2'/%3E%3Cpath d='M520 0H286c-14 58 18 112 92 128 62 13 104 50 142 96z' fill='%23FFD2A6' opacity='.55'/%3E%3C/svg%3E");}
body.night::before{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 520 420'%3E%3Cpath d='M520 0H120c-18 64 22 130 104 150 86 21 118 96 196 150 40 28 76 38 100 40z' fill='%230F766E' opacity='.16'/%3E%3Cpath d='M520 0H286c-14 58 18 112 92 128 62 13 104 50 142 96z' fill='%230F766E' opacity='.12'/%3E%3Ccircle cx='330' cy='70' r='22' fill='%23FFE2C2'/%3E%3Ccircle cx='341' cy='63' r='19' fill='%23FFF6EC'/%3E%3C/svg%3E")}
.wrap{position:relative;z-index:1;max-width:1040px;margin:0 auto;padding:22px 20px 28px;display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:28px;align-items:start}
header{grid-column:1/-1;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.logo{width:46px;height:46px;flex:none}
.who h1{margin:0;font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1.1}
.who p{margin:2px 0 0;color:var(--muted);font-size:15px}
.pill{margin-left:auto;display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;background:#fff;border:1px solid var(--line);font-size:14px;font-weight:600;white-space:nowrap}
.pill i{width:9px;height:9px;border-radius:50%;background:var(--good);box-shadow:0 0 0 4px rgba(15,118,110,.14)}
.night .pill{background:var(--ink);color:#F8F4EC;border-color:var(--ink)}
.night .pill i{background:none;box-shadow:inset -3px -1px 0 0 #FFD9A8;width:12px;height:12px}

/* chat */
.chat{background:var(--paper);border:1px solid var(--line);border-radius:22px;box-shadow:0 18px 40px -22px rgba(15,23,42,.35);display:flex;flex-direction:column;height:min(720px,calc(100vh - 120px));min-height:460px;overflow:hidden}
.feed{flex:1;overflow-y:auto;padding:22px 20px 8px;display:flex;flex-direction:column;gap:12px;scroll-behavior:smooth;scrollbar-width:thin;scrollbar-color:#E8D9C6 transparent}
.feed::-webkit-scrollbar{width:6px}.feed::-webkit-scrollbar-thumb{background:#E8D9C6;border-radius:6px}.feed::-webkit-scrollbar-track{background:transparent}
.msg bdi{unicode-bidi:isolate}
.msg{max-width:84%;padding:11px 15px;border-radius:18px;font-size:16px;line-height:1.5;overflow-wrap:anywhere}
.msg b{font-weight:700}
.noor{align-self:flex-start;background:#fff;border:1px solid var(--line);border-bottom-left-radius:6px}
.me{align-self:flex-end;background:var(--teal);color:#fff;border-bottom-right-radius:6px}
.msg[dir=rtl]{font-size:17px;line-height:1.8}
.typing{align-self:flex-start;display:flex;gap:5px;padding:14px 16px;background:#fff;border:1px solid var(--line);border-radius:18px;border-bottom-left-radius:6px}
.typing span{width:7px;height:7px;border-radius:50%;background:var(--teal);opacity:.35;animation:blink 1.2s infinite}
.typing span:nth-child(2){animation-delay:.2s}.typing span:nth-child(3){animation-delay:.4s}
@keyframes blink{40%{opacity:1;transform:translateY(-2px)}}
.chips{align-self:flex-start;display:flex;flex-wrap:wrap;gap:8px;max-width:92%}
.chips p{width:100%;margin:2px 0 0;font-size:13px;color:var(--muted)}
.chip{font:600 15px var(--font);color:var(--teal-deep);background:var(--apricot);border:1px solid #F5C99A;border-radius:12px;padding:8px 13px;cursor:pointer;font-variant-numeric:tabular-nums}
.chip:hover{background:#FFD3A3}
.chip:focus-visible,.send:focus-visible,.sugg button:focus-visible,textarea:focus-visible,.roll-toggle:focus-visible,.slip a:focus-visible{outline:3px solid var(--coral);outline-offset:2px}
.chips.used{opacity:.45;pointer-events:none}
.chips .grp{display:contents}
.chip.more{background:#fff;border:1px dashed var(--teal);font-weight:500}

/* token slip */
.slip{align-self:flex-start;width:min(360px,92%);background:var(--apricot);border-radius:16px;padding:18px 20px 16px;position:relative;
  -webkit-mask:radial-gradient(circle 11px at 0 64%,#0000 98%,#000) left/51% 100% no-repeat,radial-gradient(circle 11px at 100% 64%,#0000 98%,#000) right/51% 100% no-repeat;
          mask:radial-gradient(circle 11px at 0 64%,#0000 98%,#000) left/51% 100% no-repeat,radial-gradient(circle 11px at 100% 64%,#0000 98%,#000) right/51% 100% no-repeat}
.slip .tok{font-size:13px;color:var(--teal-deep);font-weight:600;margin:0}
.slip .num{display:block;font:800 34px var(--font);letter-spacing:.02em;margin:0 0 8px;padding:0;color:var(--ink);font-variant-numeric:tabular-nums;background:none;border:0;cursor:copy;text-align:left}
.slip .num:focus-visible{outline:3px solid var(--coral);outline-offset:2px}
.slip .tok span{font-weight:500;color:var(--muted)}
.slip .when{font-size:17px;font-weight:700;margin:0}
.slip .doc{margin:2px 0 14px;color:#3B4352;font-size:15px}
.slip .tear{border-top:2px dashed rgba(15,118,110,.35);margin:0 -4px 12px}
.slip .acts{display:flex;flex-wrap:wrap;gap:8px}
.slip a{font:700 14px var(--font);text-decoration:none;border-radius:10px;padding:8px 12px}
.slip a.cal{background:var(--teal);color:#fff}
.slip a.cxl{color:var(--teal-deep);background:rgba(255,255,255,.6)}
.slip .mail{margin:10px 0 0;font-size:13px;color:#3B4352}
.handoff{align-self:flex-start;max-width:84%;border-left:4px solid var(--coral);background:#fff;border-radius:8px;padding:10px 14px;font-size:15px}

.sugg[hidden],.pill[hidden]{display:none}
.sugg{display:flex;gap:8px;flex-wrap:wrap;padding:0 20px 10px}
.sugg button{font:500 14px var(--font);color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:999px;padding:7px 13px;cursor:pointer}
.sugg button:hover{border-color:var(--teal)}
form.composer{display:flex;gap:10px;padding:12px 14px 14px;border-top:1px solid var(--line);background:#fff}
textarea{flex:1;resize:none;font:16px/1.4 var(--font);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:11px 14px;max-height:120px;background:var(--paper);overflow-y:hidden}
.send{flex:none;font:700 15px var(--font);color:#fff;background:var(--teal);border:0;border-radius:14px;padding:0 18px;cursor:pointer}
.send:disabled{opacity:.5;cursor:default}

/* the receipt roll */
aside.roll{position:sticky;top:18px}
.roll-toggle{display:none}
.paper{background:#FFFEFB;padding:18px 18px 30px;filter:drop-shadow(0 12px 18px rgba(15,23,42,.14));
  -webkit-mask:conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) bottom/16px 51% repeat-x,linear-gradient(#000 0 0) top/100% calc(100% - 8px) no-repeat;
          mask:conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) bottom/16px 51% repeat-x,linear-gradient(#000 0 0) top/100% calc(100% - 8px) no-repeat}
.paper h2{margin:0;font-size:18px;font-weight:800}
.paper .sub{margin:2px 0 12px;font-size:13px;color:var(--muted)}
.lines{max-height:min(560px,calc(100vh - 230px));overflow-y:auto;font-size:14px;line-height:1.4;font-variant-numeric:tabular-nums}
.turn{margin:12px 0 6px;padding-top:10px;border-top:1px dashed #D8CBB8;font-weight:700;font-size:13px;color:var(--teal-deep);overflow-wrap:anywhere}
.turn:first-child{border-top:0;margin-top:0;padding-top:0}
.ln{display:grid;grid-template-columns:20px 1fr;gap:8px;padding:4px 0;overflow-wrap:anywhere}
.ln svg{width:16px;height:16px;margin-top:2px;color:var(--teal)}
.ln.alert svg{color:var(--bad)}
.ln.new{animation:print .32s ease-out both}
@keyframes print{from{clip-path:inset(0 100% 0 0);opacity:.2}to{clip-path:inset(0 0 0 0);opacity:1}}
.empty{color:var(--muted);font-size:14px;margin:6px 0 0}

@media (max-width:860px){
  .wrap{grid-template-columns:1fr;gap:14px;padding:14px 16px 20px}
  .chat{height:calc(100vh - 150px)}
  header{order:-2}
  aside.roll{position:static;order:-1}
  .paper h2{display:none}
  .roll-toggle{display:flex;width:100%;align-items:center;justify-content:space-between;font:700 15px var(--font);color:var(--ink);background:#FFFEFB;border:1px solid var(--line);border-radius:14px;padding:10px 14px;cursor:pointer}
  .roll-toggle b{background:var(--teal);color:#fff;border-radius:999px;padding:1px 9px;font-size:13px}
  .paper{display:none;margin-top:8px}
  .roll.open .paper{display:block}
  .pill{margin-left:0}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <svg class="logo" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="11" fill="#0F766E"/><path d="M9 30c0-10 7.5-17.5 18.5-18.5C26.5 22.5 19 30 9 30z" fill="#FFE2C2"/><path d="M9.5 29.5 21 18" stroke="#0F766E" stroke-width="1.6" stroke-linecap="round"/><circle cx="29" cy="11" r="5" fill="#FF8B5A"/></svg>
    <div class="who"><h1>Sera</h1><p id="clinicLine">The front desk, online</p></div>
    <span class="pill" id="pill" hidden><i></i><span id="pillText"></span></span>
  </header>

  <main class="chat" aria-label="Chat with Sera">
    <div class="feed" id="feed" role="log" aria-live="polite"></div>
    <div class="sugg" id="sugg">
      <button type="button">Any free times tomorrow?</button>
      <button type="button">Kal Dr. Ayesha free hain?</button>
      <button type="button">What are your hours?</button>
    </div>
    <form class="composer" id="composer">
      <label for="box" style="position:absolute;left:-9999px">Message</label>
      <textarea id="box" rows="1" maxlength="600" placeholder="Ask about times, or book a visit"></textarea>
      <button class="send" id="send" type="submit">Send</button>
    </form>
  </main>

  <aside class="roll" id="roll">
    <button class="roll-toggle" id="rollToggle" type="button" aria-expanded="false" aria-controls="paper">Behind the desk <b id="rollCount">0</b></button>
    <div class="paper" id="paper">
      <h2>Behind the desk</h2>
      <p class="sub">Every step the automation takes, as it happens.</p>
      <div class="lines" id="lines"><p class="empty">Nothing yet. Say hello and watch this roll.</p></div>
    </div>
  </aside>
</div>
<script>
(function () {
  var ENDPOINT = ${JSON.stringify(endpoint)};
  var session = 'web-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  var feed = document.getElementById('feed'), box = document.getElementById('box'), send = document.getElementById('send');
  var lines = document.getElementById('lines'), count = 0, busy = false;
  var ICONS = {
    rules: '<path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z M4 17a3 3 0 0 1 3-3h12"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    sheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
    ai: '<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z"/>',
    skip: '<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>',
    hello: '<path d="M7 12V6a1.5 1.5 0 0 1 3 0v5M10 11V4.5a1.5 1.5 0 0 1 3 0V11M13 11V6a1.5 1.5 0 0 1 3 0v6c0 4-2.5 8-7 8-3 0-4.5-2-6-5l-1-2a1.5 1.5 0 0 1 2.6-1.5L7 14"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'
  };
  function icon(k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[k] || ICONS.skip) + '</svg>'; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // Times and tokens are isolated left-to-right, so "10:00 AM" stays in order inside Urdu text
  function fmt(s) { return esc(s).replace(/\\b\\d{1,2}(?::[0-5]\\d)?\\s?[AaPp]\\.?[Mm]\\b|\\b\\d{1,2}:[0-5]\\d\\b|\\b(?:BK|HO)-[A-Z0-9]{4,8}\\b/g, '<bdi dir="ltr">$&</bdi>')
    .replace(/\\*\\*([^*\\n]{1,80})\\*\\*/g, '<b>$1</b>').replace(/\\n/g, '<br>'); }
  function rtl(s) { return /[\\u0600-\\u06FF]/.test(s) && (String(s).match(/[\\u0600-\\u06FF]/g) || []).length > String(s).length / 3; }
  function scroll() { feed.scrollTop = feed.scrollHeight; }
  function bubble(cls, text) {
    var d = document.createElement('div'); d.className = 'msg ' + cls; d.innerHTML = fmt(text);
    d.setAttribute('dir', rtl(text) ? 'rtl' : 'auto');
    feed.appendChild(d); scroll(); return d;
  }
  function printSteps(title, steps) {
    if (!steps || !steps.length) return;
    var empty = lines.querySelector('.empty'); if (empty) empty.remove();
    var t = document.createElement('div'); t.className = 'turn'; t.textContent = title; lines.appendChild(t);
    steps.forEach(function (s, i) {
      var l = document.createElement('div'); l.className = 'ln new' + (s.icon === 'alert' ? ' alert' : '');
      l.style.animationDelay = (i * 0.12) + 's';
      l.innerHTML = icon(s.icon) + '<span>' + esc(s.text) + '</span>';
      lines.appendChild(l); count++;
    });
    document.getElementById('rollCount').textContent = count;
    lines.scrollTop = lines.scrollHeight;
  }
  function chipsFor(chips) {
    if (!chips || !chips.length) return;
    var wrap = document.createElement('div'), group = wrap; wrap.className = 'chips';
    function chip(c, into) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = c.label;
      b.addEventListener('click', function () { wrap.classList.add('used'); ask(c.say); });
      into.appendChild(b);
    }
    chips.forEach(function (c) {
      if (!c.heading) return chip(c, group);
      var p = document.createElement('p'); p.textContent = c.heading + (c.all ? ' · a few of ' + c.total + ' free times' : ''); wrap.appendChild(p);
      group = document.createElement('span'); group.className = 'grp'; wrap.appendChild(group);
      if (c.all) {
        var g = group, all = c.all, m = document.createElement('button');
        m.type = 'button'; m.className = 'chip more'; m.textContent = 'More times';
        m.addEventListener('click', function () { g.innerHTML = ''; all.forEach(function (x) { chip(x, g); }); m.remove(); g.firstChild && g.firstChild.focus(); });
        wrap.appendChild(m);
      }
    });
    feed.appendChild(wrap); scroll();
  }
  function slip(t) {
    var d = document.createElement('div'); d.className = 'slip';
    d.innerHTML = '<p class="tok">Your token <span aria-live="polite">· tap to copy</span></p><button type="button" class="num" aria-label="Copy token ' + esc(t.booking_id) + '">' + esc(t.booking_id) + '</button>' +
      '<p class="when">' + esc(t.when) + '</p><p class="doc">' + esc(t.doctor) + (t.visit_type ? ', ' + esc(t.visit_type) : '') + '</p>' +
      '<div class="tear"></div><div class="acts">' +
      (t.calendar_link ? '<a class="cal" target="_blank" rel="noopener" href="' + esc(t.calendar_link) + '">Add to Google Calendar</a>' : '') +
      (t.cancel_link ? '<a class="cxl" target="_blank" rel="noopener" href="' + esc(t.cancel_link) + '">Cancel booking</a>' : '') + '</div>' +
      '<p class="mail">' + (t.email_sent ? 'Confirmation sent to ' + esc(t.email) + '.' : 'The confirmation email didn\\'t send. Keep this token.') + '</p>';
    var num = d.querySelector('.num'), note = d.querySelector('.tok span');
    num.addEventListener('click', function () {
      var done = function () { note.textContent = '· Copied'; setTimeout(function () { note.textContent = '· tap to copy'; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.booking_id).then(done, function () { note.textContent = '· press and hold to copy'; });
      else { var r = document.createRange(); r.selectNodeContents(num); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); try { document.execCommand('copy'); done(); } catch (e) {} sel.removeAllRanges(); }
    });
    feed.appendChild(d); scroll();
  }
  function setStatus(r) {
    if (!r.status_label) return;
    document.getElementById('pillText').textContent = r.status_label;
    document.getElementById('pill').hidden = false;
    document.body.classList.toggle('night', !r.open_now);
    if (r.clinic && r.clinic.name) document.getElementById('clinicLine').textContent = 'The front desk at ' + r.clinic.name;
  }
  function typing(on) {
    var t = document.getElementById('typing');
    if (on && !t) { t = document.createElement('div'); t.id = 'typing'; t.className = 'typing'; t.setAttribute('aria-label', 'Sera is typing'); t.innerHTML = '<span></span><span></span><span></span>'; feed.appendChild(t); scroll(); }
    if (!on && t) t.remove();
  }
  function post(payload) {
    return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(payload) })
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); });
  }
  function ask(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true; send.disabled = true;
    document.getElementById('sugg').hidden = true;
    bubble('me', text); box.value = ''; grow();
    typing(true);
    post({ sessionId: session, message: text }).then(function (r) {
      typing(false);
      bubble('noor', r.reply);
      if (r.ticket) slip(r.ticket);
      if (r.handoff) { var h = document.createElement('div'); h.className = 'handoff'; h.innerHTML = 'Passed to reception. Your reference is <b>' + esc(r.handoff.ref) + '</b>.'; feed.appendChild(h); }
      chipsFor(r.chips);
      setStatus(r);
      printSteps('You: ' + (text.length > 42 ? text.slice(0, 42) + '…' : text), r.steps);
    }).catch(function () {
      typing(false);
      var d = bubble('noor', "Couldn't reach the front desk. Check your connection, then tap to send it again.");
      d.style.cursor = 'pointer'; d.addEventListener('click', function once() { d.removeEventListener('click', once); d.remove(); feed.lastChild && feed.lastChild.className.indexOf('me') > -1 && feed.lastChild.remove(); busy = false; ask(text); });
    }).then(function () { busy = false; send.disabled = false; box.focus(); });
  }
  function grow() { box.style.height = 'auto'; box.style.height = Math.min(box.scrollHeight, 120) + 'px'; box.style.overflowY = box.scrollHeight > 120 ? 'auto' : 'hidden'; }
  document.getElementById('composer').addEventListener('submit', function (e) { e.preventDefault(); ask(box.value); });
  box.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(box.value); } });
  box.addEventListener('input', grow);
  Array.prototype.forEach.call(document.querySelectorAll('#sugg button'), function (b) { b.addEventListener('click', function () { ask(b.textContent); }); });
  var roll = document.getElementById('roll'), tog = document.getElementById('rollToggle');
  tog.addEventListener('click', function () { var o = roll.classList.toggle('open'); tog.setAttribute('aria-expanded', o ? 'true' : 'false'); });

  typing(true);
  post({ sessionId: session, hello: true }).then(function (r) {
    typing(false); bubble('noor', r.reply); setStatus(r); printSteps('Page opened', r.steps);
  }).catch(function () {
    typing(false); bubble('noor', "Couldn't reach the front desk. Make sure the front desk workflow is published, then refresh this page.");
  });
})();
</script>
</body>
</html>`;
return [{ json: { html } }];
