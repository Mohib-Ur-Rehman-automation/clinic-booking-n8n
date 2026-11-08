# Tests

Plain Node.js (18 or newer), no installs. Each test runs the exact Code-node source from the workflows against fake inputs.

```bash
node test_core.js && node test_l0.js && node test_l1.js && node test_l2.js && node test_l3.js && node test_l5.js && node test_attacks.js && node test_auth.js && node test_fuzz.js
```

| Test | What it checks | Expected |
|---|---|---|
| `test_core.js` | Lead cleaning, email and phone rules, scoring, the AI clamp | `20 tests passed`, `phone typo tests passed` |
| `test_l0.js` | All 500 leads in `test_leads.json` through L0's rules and CRM shaping | `15890 checks passed … 0 mismatches, 380 distinct contacts` |
| `test_l1.js` | The full intake path, simulated: repeats, rejects, replies, alerts | `3326 checks passed … replies 367; hot alerts 113` |
| `test_l2.js` | 14 simulated days, hour by hour: follow-ups at hours 24, 72, 168, then closed; a reply stops them; phone-only leads get none | `12 checks passed` |
| `test_l3.js` | Inbox parsing: own mail skipped, unknown senders dropped, already-replied ignored, real replies marked and alerted | `11 checks passed` |
| `test_l5.js` | The stress-test report logic, plus a sabotage check that a broken AI clamp is caught | `[L5 PASS] 500/500` and `broken clamp caught` |
| `test_attacks.js` | Misuse by strangers: scam text and links in name/city, mail bombs, overwriting a real lead, the test flag, prompt-injected links, header and HTML injection, scam text in follow-ups | `0 attack(s) broke through` (see `BREAK_TEST.md`) |
| `test_fuzz.js` | Round 2: random and mutated input against the rules that must always hold: no crash, no links or HTML to strangers, caps, whitelisted CRM fields, sign-in sessions | `0 failed` |
| `test_auth.js` | The board's sign-in page: placeholder password refused, theme kept, 5-try lock, session cookie flags, forged/expired sessions, sign-out, digest skips the login | `Board login: 20 checks passed.` |

Files:
- `src/`, `l1src/` … `l5src/`: the Code-node sources, one file per node.
- `lead_core.js`: the rules as a plain module. `harness.js`: runs node code the way n8n does.
- `test_leads.json`: 500 generated leads across 8 categories. `gen_leads.py` regenerates them.
