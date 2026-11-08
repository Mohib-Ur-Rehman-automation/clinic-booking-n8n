# Break test, 3 Nov 2026

The first round of tests (500/500, 14/14 engine scenarios) checked that the Lead Engine **works**. This round checked whether a stranger can **misuse** it. The public form and webhook were treated as hostile: anyone can type anything, including someone else's email address.

The attacks are in `test_attacks.js`. They run the workflows' own Code-node source, so they can be re-run against any future change:

```bash
node test_attacks.js
```

## Results

The suite has 12 checks: attacks A1 to A9, plus three sub-checks (A3b, A4b, A6b).

| | Before | After |
|---|---|---|
| Checks broken | **8 of 12** | **0 of 12** |
| Existing tests (rules, intake, follow-ups, replies, 500-lead report) | all pass | all pass |

## What broke, and the fix

| # | Attack | What happened before | Fix |
|---|---|---|---|
| A1 | Scam text in **City**, with a stranger's email | The instant reply mailed "We have your solar request for Lahore. Refund due, verify at halden-refund.example" to the stranger, from the business's own Gmail | Only a link-safe city (letters, spaces, `. , ' -`, at most 4 words) is ever put in an email to the lead. The full city is still saved for the team. |
| A2 | A link as the **name** | The subject read "We got your solar request, bit.ly/claim-refund" | Names allow letters in any script plus `. ' -`. A dot glued to a letter gets a space ("M.Ali" becomes "M. Ali", "site.com" becomes "site. com"), so a name can't become a clickable link. Digits, `@`, `/` and `:` reject the lead as `bad_name`. |
| A3 | 100 bot submissions with 100 different addresses | 100 instant replies, plus 300 follow-ups queued. Enough to get the Gmail account limited. | At most `MAX_REPLIES_PER_HOUR` (default 20) instant replies per hour. Above that, leads are still saved and scored but not emailed, and the team gets one `[HOLD]` email per hour. L2 follow-ups lowered from 50 to 20 per hour (480 per day, under Gmail's published ~500 per day; new or freshly automated accounts can be limited much sooner). |
| A4 | A stranger submits using a **real lead's email** | The real lead's name, phone, city, score and tier in HubSpot were overwritten (score 85, hot, became 0, cold) | A returning contact is matched but never changed from the form. The team alert marks it "Returning. These details were NOT saved to HubSpot. Check before acting." New contacts still get every field. |
| A5 | Public webhook sends `_id` | It could set the internal test flag, which wrote a test ID into the Rejects tab | `_id` is no longer read from public input. Only L5 (internal) sets it. |
| A6 | Prompt injection that makes the AI put a link in its note | The AI note "Verified buyer… https://halden-crm-login.example" reached the team alert, HubSpot and the board | Links are stripped from the AI note ("[link removed]"). The ±10 score limit already held. |
| A9 | Scam text already stored in HubSpot (from before the fix, or typed in by hand) | Follow-ups 1 to 3 would echo it to the lead | L2 applies the same link-safe check before echoing name or city. |

## What held (no change needed)

- **A6b:** the AI still can't move a score by more than 10.
- **A7:** a line break typed into the name can't add hidden email headers (Bcc and so on).
- **A8:** HTML and script typed into any field reach the team alert as plain text.
- Formulas typed into the form are stored as text (the Sheet is written in RAW mode).
- No credentials, real emails or Sheet IDs are in the repo or the screenshots.

## Settings changed

- **The board needs a login.** It shows every lead's name, city and AI note, and the quote form has to be public, so the board can't rely on "keep n8n on localhost". It now has its own branded sign-in page (light and dark): 8-hour sessions in an HttpOnly, SameSite=Strict cookie; 5 wrong passwords lock sign-in for 15 minutes; a sign-out link on the board. Checked by `test_auth.js` (20 checks) and on the live instance.

## Still open (known limits)

- **No CAPTCHA on the n8n form.** The hourly cap limits the damage but doesn't stop junk contacts. Put the form behind a CAPTCHA or a rate limit before real traffic.
- **Spoofed replies.** L3 trusts the sender address. A forged email "from" a lead could mark them as replied and stop their follow-ups. Gmail's spam filter catches most forged mail, and the worst case is missed follow-ups, not leaked data.
- **Returning leads aren't updated automatically.** This is a trade-off: someone who sends a second request with new details has to be updated by hand, using the team alert.
- **Two identical submissions in the same second** can both pass the repeat check, because the Events lookup and write aren't one step. How HubSpot handles two simultaneous upserts for the same email hasn't been tested.
- **A correction to the first test round:** the 56 "repeat or update" cases in the 500-lead test were all exact repeats. None of them tested "same person, new details". A4 now covers that path.

## How these results were produced

The attacks run in Node.js against the exact Code-node source, with HubSpot, Sheets, Gmail and the AI mocked. After the fixes were published, the same attacks were repeated against the live n8n instance and all 12 checks held. The other live checks are listed in the main README under "How it was tested".


# Round 2: invariant fuzzing, 3 Nov 2026

Round 1 tried attacks I thought of. Round 2 turned that around: I wrote down the rules the system must never break, then threw random and mutated input at the real Code nodes and checked every rule each time. The inputs included links, look-alike dots, HTML, line breaks, very long text, numbers, lists, and JSON objects that pretend to be text. Run it with `node test_fuzz.js`.

**Rules checked:** intake never crashes. The public form can't set the test flag. An accepted name, and the safe city, carry no link. The instant reply to a stranger carries no link or HTML from the form, and its subject has no line break. The AI moves a score by at most 10 and never adds a link. The hourly reply cap holds. `crm_update` only sends whitelisted fields. Follow-ups carry no link or HTML from stored data, never exceed the hourly batch, and are only #1 to #3. Our own mail and alerts never count as lead replies. The board sign-in never crashes, and the board only opens with a session that sign-in issued.

## What round 2 found, and the fix

| # | Found | Fix |
|---|---|---|
| B1 | A JSON sign-in request with `{"password":{"toString":1}}` crashed the Auth node, and every request sent an e0 email. **Confirmed live.** | Auth reads only plain-text values from the request; anything else counts as a wrong password |
| F3 | Follow-ups echoed the stored first name with no link check. Round 1 said L2 checks name and city, but only the city was checked. Someone typing a name into HubSpot by hand (`http://...`, or text with a line break) got it into the subject and greeting | The stored first name gets the same check as the city. Anything that isn't a plain name becomes "there". Checked in n8n's sandbox before publishing |

After the fixes: about 150,000 fuzz checks over 6 seeds, 0 failures. All earlier tests still pass.

## Known limits (round 2)

- **A name like `www.claim-refund.com`** is accepted as `www. claim-refund. com`. The spaces mean it can't be clicked, but someone could still read it as a web address. That's the trade-off of the A2 fix.
- **A line break typed by hand into a HubSpot name** reaches the subject of the internal `[REPLY]` alert. The mail library flattens it, and the alert only goes to the team.
