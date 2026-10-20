// f0 · Reply: builds what the page shows after each message.
//   reply  : Sera's words (plain text; the page escapes it and only turns **x** into bold)
//   steps  : the "Behind the desk" panel, from Prep and from every tool Sera used this turn
//   chips  : free times as buttons, from the last find_times answer
//   ticket : the booking card, when book_appointment booked something
//   log    : one row for the Front Desk Log tab
// It also adds this turn's booking or hand-off to the chat's counters (static data, shared with Prep).
const prep = $('Prep').first().json;
const info = $('Clinic Info').first().json;
const steps = [...prep.steps];
let reply = prep.reply, chips = [], ticket = null, handoff = null, toolCalls = 0, aiFailed = false;
const checked = new Set();   // every free time the tools returned this turn (the red-team grader uses it to catch invented times)

// Tool answers reach the agent as JSON text, sometimes wrapped in arrays or other JSON. Dig out every object with a "kind".
function kinds(x, found = [], depth = 0) {
  if (depth > 6 || x == null) return found;
  if (typeof x === 'string') {
    const s = x.trim();
    if (s[0] === '{' || s[0] === '[') { try { return kinds(JSON.parse(s), found, depth + 1); } catch (e) { return found; } }
    return found;
  }
  if (Array.isArray(x)) { for (const v of x) kinds(v, found, depth + 1); return found; }
  if (typeof x === 'object') {
    if (['find_times', 'book', 'hand_off'].includes(x.kind)) found.push(x);
    else for (const v of Object.values(x)) kinds(v, found, depth + 1);
  }
  return found;
}

if (prep.route === 'agent') {
  const j = $input.first().json;
  const output = typeof j.output === 'string' ? j.output.trim() : '';
  if (j.error || !output) {
    aiFailed = true;
    const phone = (prep.clinic && prep.clinic.phone) || '';
    reply = {
      urdu: `معذرت، ابھی جواب دینے میں مشکل ہو رہی ہے۔ ایک منٹ بعد دوبارہ کوشش کریں، یا کلینک کو ${phone} پر کال کریں۔`,
      roman: `Maazrat, abhi jawab dene mein mushkil ho rahi hai. Ek minute baad dobara koshish karein, ya clinic ko ${phone} par call karein.`,
    }[prep.lang] || `Sorry, I'm having trouble answering right now. Please try again in a minute, or call ${phone}.`;
    steps.push({ icon: 'alert', text: 'The AI didn\'t answer' + (j.error ? ': ' + String(j.error.message || j.error).slice(0, 120) : '') + '. Sent the fallback reply' });
  } else {
    reply = output;
    const results = [];
    for (const s of Array.isArray(j.intermediateSteps) ? j.intermediateSteps : []) {
      toolCalls++;
      const found = kinds(s.observation);
      results.push(...found);
      // A tool that errored (wrong workflow ID, unpublished, crashed) returns text, not our JSON: show it on the roll
      if (!found.length) steps.push({ icon: 'alert', text: `Tool ${(s.action && s.action.tool) || '?'} failed: ${String(s.observation || 'no answer').slice(0, 120)}` });
    }
    for (const r of results) {
      for (const tr of Array.isArray(r._trace) ? r._trace : []) steps.push(tr);
      if (r.kind === 'book' && r.status === 'booked' && r.ticket) ticket = r.ticket;
      if (r.kind === 'hand_off' && r.status === 'handed_off') handoff = { ref: r.ref, reason: r.reason };
    }
    // Honesty guard: Sera may only say she has passed something on if hand_off really ran and returned a reference.
    const CLAIM = /\b(I('|\u2019)?ll|I will|I('|\u2019)?ve|I have|I am|I('|\u2019)?m|I('|\u2019)?m going to|Main|Maine|Mein)\s+(already\s+|abhi\s+)?(forward(ed|ing)?|pass(ed|ing)?\s+(it|this|your)|sen[dt]|bhej|notify|let reception)|forward\s+kar\s+(de|di|diya|deti|deta)|bhej\s+(diya|deti|deta|di)/i;
    if (!handoff && !ticket && CLAIM.test(reply) && /reception|team|staff|someone|insaan|forward|pass(ed)? (it|this|your)|ریسیپشن/i.test(reply)) {
      reply = {
        urdu: 'میں یہ سوال ریسیپشن تک پہنچا سکتی ہوں۔ براہ کرم اپنا پورا نام اور فون نمبر یا ای میل بتائیں، تاکہ میں ابھی بھیج دوں۔',
        roman: 'Main yeh sawal reception tak pohncha sakti hoon. Apna poora naam aur phone number ya email bata dein, main abhi bhej deti hoon.',
      }[prep.lang] || "I can pass this to reception. Please confirm your full name and a phone number or email, and I'll send it right away.";
      steps.push({ icon: 'alert', text: 'Sera said she had passed it on without using hand_off: reply corrected so it stays honest' });
    }
    for (const r of results) if (r.kind === 'find_times' && r.status === 'ok') for (const x of r.results) x.free_times.forEach(t => checked.add(t));
    for (const r of results) if (r.kind === 'book') (r.free_times || []).forEach(t => checked.add(t));
    const lastFind = results.filter(r => r.kind === 'find_times' && r.status === 'ok').pop();
    if (lastFind && !ticket) {
      // Times Sera names in her reply ("5:20 PM") come first, so the buttons match her words; the rest spread across the day.
      // "5:20, 5:40, 6:00 aur 6:20 PM" names four times with one PM: match bare h:mm too. The clinic's hours never
      // repeat an h:mm in both AM and PM, so the free list itself says which one she meant.
      const said = new Set();
      const re = /\b(1[0-2]|[1-9])(?::([0-5]\d))?\s*([ap])\.?\s*m\b/gi;
      for (let m; (m = re.exec(reply));) said.add(`${+m[1]}:${m[2] || '00'} ${m[3].toUpperCase()}M`);
      const bare = new Set([...reply.matchAll(/\b(1[0-2]|[1-9]):([0-5]\d)\b/g)].map(m => `${+m[1]}:${m[2]}`));
      // Asked for evening or morning? Then the other buttons come from that part of the day only.
      const asked = String(prep.message || '').toLowerCase();
      const part = /evening|shaa?m|raat|night|after\s*5|شام|رات/.test(asked) ? 'pm' : /morning|subah?|subha|صبح/.test(asked) ? 'am' : '';
      const mins = t => { const [, h, m, ap] = t.match(/(\d+):(\d+) ([AP])M/); return (+h % 12 + (ap === 'P' ? 12 : 0)) * 60 + +m; };
      const inPart = t => !part || (part === 'pm' ? mins(t) >= 17 * 60 : mins(t) < 14 * 60);
      const pick = (times, k) => {
        const named = times.filter(t => said.has(t) || bare.has(t.replace(/ [AP]M$/, '')));
        const pool = times.filter(inPart).length ? times.filter(inPart) : times;
        const keep = new Set(named.slice(0, k));
        for (let i = 0; keep.size < Math.min(k, pool.length + named.length) && i < pool.length * 2; i++) keep.add(pool[Math.floor(i * pool.length / k) % pool.length] ?? pool[i]);
        return times.filter(t => keep.has(t));
      };
      const withTimes = lastFind.results.filter(x => x.free_times.length);
      for (const x of withTimes) {
        chips.push({ heading: `${x.doctor}, ${x.date_label}` });
        for (const t of pick(x.free_times, withTimes.length > 1 ? 4 : 8)) chips.push({ label: t, say: `${t} with ${x.doctor} on ${x.date_label}, please` });
      }
    }
    steps.push({ icon: 'ai', text: `Sera replied after ${toolCalls} tool call${toolCalls === 1 ? '' : 's'}` });
  }
}
// Count what really happened in this chat, for Prep's caps on the next message
const chat = ($getWorkflowStaticData('global').chats || {})[prep.sessionId];
if (chat && ticket) chat.bookings++;
if (chat && handoff) chat.handoffs++;
// The 2-second rule counts from when this reply went out, not from when the message came in: n8n handles one
// message at a time, so a flood queues up behind a slow AI reply and would otherwise look nicely spaced.
// Prep's clock plus the real time spent since, so it holds however n8n dates $now within one run.
if (chat && prep.route !== 'hello') chat.last = Math.max($now.toMillis(), (prep.now_ms || 0) + (Date.now() - prep.started));
const seconds = Math.round((Date.now() - prep.started) / 100) / 10;
steps.push({ icon: 'clock', text: `Done in ${seconds} s` });

return [{ json: {
  response: { reply, steps, chips, ticket, handoff, status_label: prep.status_label, open_now: prep.open_now, clinic: prep.clinic, sessionId: prep.sessionId,
    route: aiFailed ? 'ai_failed' : prep.route, checked: [...checked] },
  log: { at: info.now, session_id: prep.sessionId, route: aiFailed ? 'ai_failed' : prep.route, patient_message: prep.message, reply,
    tools_used: toolCalls, booking_id: ticket ? ticket.booking_id : '', handoff_ref: handoff ? handoff.ref : '', seconds },
} }];
