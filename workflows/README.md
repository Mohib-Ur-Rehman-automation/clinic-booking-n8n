# Workflow notes

Node by node, in the order each workflow runs. The sticky notes on the n8n canvas say the same thing in shorter form. Code nodes are mirrored as plain files in [`../code/`](../code/).

| File | Workflow | Nodes |
|---|---|---:|
| `d0.clinic-core.json` | [d0 · clinic-core](#d0--clinic-core) | 5 + 2 notes |
| `d1.clinic-booking.json` | [d1 · clinic-booking](#d1--clinic-booking) | 12 + 5 notes |
| `d2.clinic-cancel.json` | [d2 · clinic-cancel](#d2--clinic-cancel) | 11 + 2 notes |
| `d3.clinic-reminders.json` | [d3 · clinic-reminders](#d3--clinic-reminders) | 7 + 2 notes |
| `d4.clinic-doctor-list.json` | [d4 · clinic-doctor-list](#d4--clinic-doctor-list) | 5 + 1 note |
| `e0.error-alerts.json` | [e0 · error-alerts](#e0--error-alerts) | 3 + 1 note |
| `f0.front-desk.json` | [f0 · front-desk](#f0--front-desk) | 17 + 2 notes |
| `f1.front-desk-find-times.json` | [f1 · find-times](#f1--find-times) | 3 + 1 note |
| `f2.front-desk-book.json` | [f2 · book](#f2--book) | 14 + 1 note |
| `f3.front-desk-hand-off.json` | [f3 · hand-off](#f3--hand-off) | 7 + 1 note |
| `r0.sera-red-team.json` | [r0 · sera-red-team](#r0--sera-red-team) | 9 + 1 note |

---

## d0 · clinic-core

The clinic's rules, pages and emails, in one place. Called by d1–d4; never runs on its own. Reads the sheet, writes nothing.

| Node | Type | What it does |
|---|---|---|
| **Start** | Execute Workflow Trigger | Receives `action` (text) and `data` (object) from the caller. |
| **Read Appointments** | Google Sheets | Reads the whole Appointments tab. Runs once, and outputs an empty item when the tab is empty, so an empty sheet is not an error. |
| **Read Closures** | Google Sheets | Same, for Closures. |
| **Clinic Rules** | Code · [`d0-clinic-rules.js`](../code/d0-clinic-rules.js) | The `CLINIC` block (hours, 20-minute slots, Sundays off, 30-day window, 60-minute booking notice, 2-hour cancel cut-off, 8 AM reminder hour, doctors, visit types, URLs, emails), then one section per action. Cleans every value it reads: dates in four formats, 12- or 24-hour times, phone numbers with or without +92, doctor names typed without the dot. |
| **Clinic Templates** | Code · [`d0-clinic-templates.js`](../code/d0-clinic-templates.js) | Builds every result page and email from the Rules answer. Pages use the Tropical Teal & Apricot palette and the Figtree font; emails are table-based with inline styles so Gmail and Outlook show them properly. Escapes everything that came from a person. |

**Actions**

| Action | Called by | Answers with |
|---|---|---|
| `slots` | d1 › Find Times | `choose` (free times + the Choose Time page) or `refused` (invalid details, too far ahead, no free time + its page) |
| `check` | d1 › Final Check | `book` (the row to save, confirmation email, booked page, when the reminder will arrive) or `stop` (taken, too late, closed, declined, abandoned + its page) |
| `booking` | d2 › Find Booking, Check Again | `cancellable` (confirm form, the update to write, cancellation email, pages) or `not_found` / `already_cancelled` / `too_late` / `passed` |
| `info` | f0 › Clinic Info, f3 › Clinic Info | Open now or not, closing time or next opening, the next 14 days with closures marked, doctors, visit types |
| `availability` | f1 › Ask d0, f2 › Check Time | Free times for one doctor or all, or the next day with times and why. Bad input comes back as `bad_date` / `too_far` / `unknown_doctor`, never an error |
| `reminders` | d3 › Due Reminders | One item per reminder due, plus one *Needs attention* item listing upcoming clashes and rows that can't be reminded |
| `schedule` | d4 › Doctor Lists | One item per doctor with today's list, plus one *Needs attention* item for anything in the sheet it can't read |

---

## d1 · clinic-booking

| # | Node | Type | What it does |
|---|---|---|---|
| 1 | **Booking Form** | n8n Form Trigger | Page 1 at `/form/clinic-booking`: name, phone, email, doctor, visit type, preferred date. A steps bar sits at the top. |
| 2 | **Find Times** | Execute Workflow → d0 `slots` | Checks the details and finds free times on that day, or the next day that has some. |
| 3 | **Can Choose?** | If | `status = choose` → page 2. Anything else → Finish, with the reason. |
| 4 | **Choose Time** | n8n Form (next page) | Page 2, built by d0: a doctor card and a dropdown of free times plus *None of these times suit me*. Waits up to 30 minutes. |
| 5 | **Make Cancel Token** | Crypto | A random UUID that becomes the secret in this booking's cancel link. |
| 6 | **Final Check** | Execute Workflow → d0 `check` | Re-reads the sheet: still free, still far enough ahead, no closure added meanwhile. |
| 7 | **Book It?** | If | `status = book` → save. Anything else → Finish. |
| 8 | **Save Appointment** | Google Sheets | Append-or-update on `booking_id`, RAW values. A retry updates the same row instead of adding a second one. |
| 9 | **Send Confirmation** | Send Email (SMTP) | HTML and plain text. Set to continue on error, so a failed email can't undo a saved booking. |
| 10 | **Finish** | Code · [`d1-finish.js`](../code/d1-finish.js) | Picks the page for whatever happened (including "booked, but the email failed") and builds the Request Log row. |
| 11 | **Log Request** | Google Sheets | Append-or-update on `booking_id` in Request Log: outcome, reason, offered date, chosen time, email status. |
| 12 | **Done** | n8n Form (completion) | Shows Finish's page. |

---

## d2 · clinic-cancel

| # | Node | Type | What it does |
|---|---|---|---|
| 1 | **Cancel Form** | n8n Form Trigger | `/form/clinic-cancel?id=…&t=…`. The ID and token arrive as hidden fields; the patient presses Continue. |
| 2 | **Find Booking** | Execute Workflow → d0 `booking` | Matches ID **and** token. A wrong token reveals nothing about the booking. |
| 3 | **Can Cancel?** | If | `cancellable` → confirm page. Anything else → Finish. |
| 4 | **Confirm Cancel** | n8n Form (next page) | The doctor card and *Yes, cancel it* / *No, keep it*. Waits up to 30 minutes. |
| 5 | **Cancel It?** | If | Yes → Check Again. No, or the page expired → Finish (kept). |
| 6 | **Check Again** | Execute Workflow → d0 `booking` | Asks d0 again at the moment of confirming: another tab may have cancelled it, or the 2-hour cut-off may have passed. |
| 7 | **Still Cancellable?** | If | Yes → Mark Cancelled. No → Finish, which shows the up-to-date page. |
| 8 | **Mark Cancelled** | Google Sheets | Update on `booking_id`: status `Cancelled`, `cancelled_at` in PKT. The time is free again straight away. |
| 9 | **Send Cancellation** | Send Email (SMTP) | Continues on error. |
| 10 | **Finish** | Code · [`d2-finish.js`](../code/d2-finish.js) | Picks the page: cancelled, cancelled (email failed), kept, not found, already cancelled, too late, passed. |
| 11 | **Done** | n8n Form (completion) | Shows it. |

---

## d3 · clinic-reminders

| # | Node | Type | What it does |
|---|---|---|---|
| 1 | **Every Morning 8 AM** / **Run Now** | Schedule / Manual | Every day at 8 AM, Pakistan time. Run Now is for testing. |
| 2 | **Due Reminders** | Execute Workflow → d0 `reminders` | Tomorrow's bookings, plus today's booked after yesterday's run; not cancelled, not already sent. Upcoming clashes and unusable rows go into one *Needs attention* item. |
| 3 | **Send Emails** | Send Email (SMTP) | One per item. Continues on error, so one bad address doesn't stop the rest. |
| 4 | **Stamp** | Code · [`d3-stamp.js`](../code/d3-stamp.js) | Pairs each send result with its booking: `Sent 2026-10-26 08:00 PKT` or `Failed …: reason`. |
| 5 | **Save Stamp** | Google Sheets | Writes the reminder column, matched on `booking_id`. |
| 6 | **Check Sends** | Code · [`d3-check-sends.js`](../code/d3-check-sends.js) | On the lower branch, so it runs after the stamps are saved. If any email failed, it stops the run with the names, and e0 sends an alert. |

---

## d4 · clinic-doctor-list

| # | Node | Type | What it does |
|---|---|---|---|
| 1 | **Every Morning 8 AM** / **Run Now** | Schedule (cron `0 8 * * 1-6`) / Manual | Monday to Saturday. |
| 2 | **Doctor Lists** | Execute Workflow → d0 `schedule` | Each doctor's confirmed appointments today, sorted by time. A doctor with none still gets an email saying so. A doctor marked away gets a warning at the top. Also checks the whole sheet: unreadable dates or times, unknown doctors, duplicate IDs, bad Closures rows. |
| 3 | **Send Emails** | Send Email (SMTP) | Continues on error. |
| 4 | **Check Sends** | Code · [`d4-check-sends.js`](../code/d4-check-sends.js) | Stops the run with the names if any email failed. |

---

## e0 · error-alerts

| # | Node | Type | What it does |
|---|---|---|---|
| 1 | **Error Trigger** | Error Trigger | Fires when a production run of any workflow pointing here fails. Runs started from the editor don't trigger it. |
| 2 | **Build Alert** | Code · [`e0-build-alert.js`](../code/e0-build-alert.js) | Workflow, failed node, error message, execution link, and a *Check first* hint matched on the error text (failed emails, Google access, dropdown mismatch, a test date left in, network). Colour-coded per project. Shared with my Amazon Toolkit workflows, so it also carries their labels and hints. |
| 3 | **Send an Email** | Send Email (SMTP) | To you. |

---

## f0 · front-desk

| # | Node | Type | What it does |
|---|---|---|---|
| 1 | **Open Page** | Webhook (GET) | `/webhook/front-desk`. |
| 2 | **Page** | Code · [`f0-page.js`](../code/f0-page.js) | The chat page. Works out the chat address from the request's host, because n8n serves webhook pages in a sandbox. |
| 3 | **Send Page** | Respond to Webhook | Sends it as HTML. |
| 4 | **Chat In** | Webhook (POST) | `/webhook/front-desk/chat`: `{ sessionId, message }` or `{ sessionId, hello: true }`, as text/plain. |
| 5 | **Clinic Info** | Execute Workflow → d0 `info` | Today's facts. |
| 6 | **Prep** | Code · [`f0-prep.js`](../code/f0-prep.js) | Reads the message, picks the route (hello, empty, emergency, agent), writes Sera's briefing with the 14-day calendar. |
| 7 | **Ask Sera?** | If | Only the `agent` route reaches the AI. |
| 8 | **Sera** | AI Agent | Groq, chat memory per session, three tools, max 6 steps, returns its tool steps. On error, the error output goes to Reply. |
| 9 | **Chat Model** | Groq Chat Model | `openai/gpt-oss-120b`, temperature 0.4, max 600 tokens. Swap for any chat model that can call tools. |
| 9b | **Fallback Model** | Groq Chat Model | `qwen/qwen3.8-27b`, used when Chat Model fails or is out of free tokens. Its own daily allowance. |
| 10 | **Chat Memory** | Simple Memory | Last 6 messages (kept short to save tokens), keyed on the page's session ID. |
| 11 | **find_times** · **book_appointment** · **hand_off** | Call n8n Workflow Tool | f1, f2, f3. Their inputs are filled by the model (`$fromAI`). |
| 12 | **Reply** | Code · [`f0-reply.js`](../code/f0-reply.js) | The reply, the panel steps, time buttons (times Sera names first, then a spread across the day), the token slip, the hand-off reference, and the log row. |
| 13 | **Answer** | Respond to Webhook | JSON with `Access-Control-Allow-Origin: *` (the sandboxed page has no origin of its own). |
| 14 | **Worth Logging?** | If | Skips page-open greetings. |
| 15 | **Log Chat** | Google Sheets | Appends to Front Desk Log, RAW. Continues on error, so a sheet problem never blocks a reply. |

## f1 · find-times

| # | Node | Type | What it does |
|---|---|---|---|
| 1 | **Start** | Execute Workflow Trigger | `doctor`, `date`. |
| 2 | **Ask d0** | Execute Workflow → d0 `availability` | |
| 3 | **Answer** | Code · [`f1-answer.js`](../code/f1-answer.js) | A short answer for Sera (no pages or emails in it) and the panel lines. |

## f2 · book

| # | Node | Type | What it does |
|---|---|---|---|
| 1 | **Start** | Execute Workflow Trigger | `patient_name`, `phone`, `email`, `doctor`, `visit_type`, `date`, `time`. |
| 2 | **Check Time** | Execute Workflow → d0 `availability` | Is that exact time free on that exact day? |
| 3 | **Shape** | Code · [`f2-shape.js`](../code/f2-shape.js) | Everything present, one doctor, no silent move to another day, a readable free time, a real visit type. Builds the form-shaped data d0 `slots` expects. |
| 4 | **Ready?** | If | No → Result, nothing written. |
| 5 | **Find Times** | Execute Workflow → d0 `slots` | Validates name, mobile and email exactly like page 1 of the form. |
| 6 | **Can Book?** | If | Details accepted, same day, time still listed. |
| 7 | **Make Cancel Token** | Crypto | UUID for the cancel link. |
| 8 | **Final Check** | Execute Workflow → d0 `check` | The last-second re-check, as in d1. |
| 9 | **Book It?** | If | |
| 10 | **Save Appointment** · **Send Confirmation** | Google Sheets · Send Email | Same nodes and settings as d1. |
| 11 | **Finish** | Code · [`f2-finish.js`](../code/f2-finish.js) | Request Log row, reason "Booked in the website chat (Sera)". |
| 12 | **Log Request** | Google Sheets | Append-or-update on `booking_id`. |
| 13 | **Result** | Code · [`f2-result.js`](../code/f2-result.js) | `booked` with the ticket, or `not_booked` with the reason and alternatives; panel lines either way. |

## f3 · hand-off

| # | Node | Type | What it does |
|---|---|---|---|
| 1 | **Start** | Execute Workflow Trigger | `patient_name`, `contact`, `reason`, `summary`. |
| 2 | **Clinic Info** | Execute Workflow → d0 `info` | Reception's address and the clinic's from-address. |
| 3 | **Build** | Code · [`f3-build.js`](../code/f3-build.js) | HO reference, escaped email, sheet row. No contact → not sent. |
| 4 | **Ready?** | If | |
| 5 | **Send to Reception** | Send Email (SMTP) | Continues on error. |
| 6 | **Save Handoff** | Google Sheets | Appends to Handoffs, RAW, status Open. Continues on error. |
| 7 | **Result** | Code · [`f3-result.js`](../code/f3-result.js) | `handed_off` with the reference, or `not_sent`. |

## r0 · sera-red-team

Start it with **Execute workflow** in the editor only (see the note on the canvas).

| # | Node | Type | What it does |
|---|---|---|---|
| 1 | **Run Red Team** | Manual Trigger | |
| 2 | **Settings** | Code · [`r0-settings.js`](../code/r0-settings.js) | Chat address, pause between messages, test phone and email, report address, optional script filter. |
| 3 | **Attack Scripts** | Code · [`r0-scripts.js`](../code/r0-scripts.js) | The 48 conversations, each with its category, severity and checks. |
| 4 | **One at a Time** | Loop Over Items | One script per pass, so no Code node runs near n8n's time limit. |
| 5 | **Play & Grade** | Code · [`r0-play.js`](../code/r0-play.js) | Plays the conversation through Sera's chat webhook (with pauses for the AI provider's per-minute limit), then grades every reply. |
| 6 | **Report** | Code · [`r0-report.js`](../code/r0-report.js) | Pass rates by category and severity, the failures, any test bookings, the summary email. |
| 7 | **Summary?** | If | The summary goes to email, the rows go to the sheet. |
| 8 | **Email Report** | Send Email (SMTP) | Continues on error. |
| 9 | **Save Results** | Google Sheets | Appends to Red Team, RAW. Continues on error. |

