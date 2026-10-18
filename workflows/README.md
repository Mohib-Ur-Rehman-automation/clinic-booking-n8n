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
