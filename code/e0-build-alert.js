// e0 Error Alerts: builds the alert email (email-safe: tables + inline styles). Reads only the Error Trigger's data.
const d = $('Error Trigger').first().json;
const wf = d.workflow || {};
const ex = d.execution || {};
const trig = d.trigger || {};
const err = ex.error || trig.error || {};
const name = wf.name || 'Unknown workflow';
const node = ex.lastNodeExecuted || (err.node && err.node.name) || (trig.error ? 'trigger' : 'unknown');
const message = String(err.message || err.description || 'No error message was passed on.').trim();
const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const when = $now.setZone('Asia/Karachi').toFormat('dd LLL yyyy, HH:mm') + ' PKT';

// Tool colour from the workflow name ("i4. market-autopilot" -> i4)
const TOOL = { i1: ['#1B3A6B', 'Market Screener'], i2: ['#0F3D3E', 'Market Deep Dive'], i3: ['#8B4E34', 'Competitor Targeting'], i4: ['#4A1F3D', 'Market Autopilot'], i5: ['#214235', 'Next Keywords'], c1: ['#0D1B2A', 'Toolkit Core'],
  d0: ['#0F766E', 'Clinic Core'], d1: ['#0F766E', 'Clinic Booking'], d2: ['#0F766E', 'Clinic Cancel'], d3: ['#0F766E', 'Clinic Reminders'], d4: ['#0F766E', 'Doctor Lists'] };
const code = (String(name).match(/^\s*([icd]\d)\b/i) || [])[1]?.toLowerCase();
const [toolColour, toolName] = TOOL[code] || ['#0D1B2A', ''];

// What to check first, matched on the error text. First match wins; a general fallback otherwise.
const HINTS = [
  [/emails? failed to send/i, 'Some emails did not go out. The error names who and why; usually a mistyped address in the sheet. Everyone else was sent. Failed reminders retry next morning by themselves.'],
  [/Forbidden - perhaps check your credentials|caller does not have permission|PERMISSION_DENIED|Requested entity was not found/i, 'Google refused access. Clinic (service account): share the sheet with the service account email as Editor and check that the Google Sheets API is enabled in its Cloud project; a fresh share can take a few minutes. Amazon tools (OAuth): n8n → Credentials → Reconnect.'],
  [/not in CLINIC\.(doctors|visitTypes)/i, 'A form dropdown and the CLINIC block in d0 · Clinic Rules do not match. Make the option text identical in both.'],
  [/test_now must look like/i, 'A test date was left in a workflow. Set the data field back to {{ {} }}.'],
    [/invalid_grant|unauthori[sz]ed|\b40[13]\b|token (has )?(been )?expired|expired token|re-?auth|credentials? (are|is|was) (invalid|expired)|reconnect/i, 'Google sign-in has probably expired (Testing-mode OAuth lasts about a week). n8n → Credentials → open the Google Sheets or Gmail credential → Reconnect, then run again.'],
  [/run out of searches|searches.*(left|limit)|429|too many requests|upgrade your (plan|account)/i, 'SerpApi monthly searches may be used up. Check the SerpApi dashboard; the free tier resets monthly.'],
  [/only \d+ usable listings|no usable listings/i, 'The keyword returned too few real products. The error names the word to drop; try the keyword without it.'],
  [/no (seed )?keywords? entered|no seed keyword/i, 'The form was sent without a keyword. Nothing to fix in the workflow.'],
  [/all \d+ keywords failed/i, 'Every search failed. Check the SerpApi key and searches left, then the keywords themselves.'],
  [/ECONN|ETIMEDOUT|ENOTFOUND|socket|network|timeout/i, 'A network call timed out. Usually temporary: check the internet connection and run again.'],
  [/sheet|range|column/i, 'Google Sheets rejected the write. If a header was renamed or added, open the Sheets node → Columns → Refresh, then Save → Publish.'],
];
const hint = (HINTS.find(([re]) => re.test(message)) || [null, 'Open the execution, click the red node, and read its input and output.'])[1];

const FONT = 'font-family:Segoe UI,Helvetica,Arial,sans-serif';
const row = (k, v) => `<tr><td width="150" valign="top" style="padding:9px 0;border-bottom:1px solid #f0ece5;${FONT};font-size:13px;color:#5f6670">${esc(k)}</td><td valign="top" style="padding:9px 0;border-bottom:1px solid #f0ece5;${FONT};font-size:14px;color:#1f2328">${v}</td></tr>`;
const button = ex.url ? `<tr><td style="padding:4px 28px 24px"><a href="${esc(ex.url)}" style="display:inline-block;background:${toolColour};color:#ffffff;text-decoration:none;${FONT};font-size:14px;font-weight:bold;padding:11px 20px;border-radius:4px">Open the failed execution</a></td></tr>` : '';

const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid #e2ddd5">
<tr><td style="background:#DC143C;height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>
<tr><td style="background:${toolColour};padding:22px 28px 18px;border-bottom:4px solid #9C7A3C">
  <div style="font-family:Consolas,monospace;font-size:12px;letter-spacing:3px;color:#D8CBB8">E0 · ERROR ALERT${toolName ? ` · ${esc(code)} ${esc(toolName.toUpperCase())}` : ''}</div>
  <div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;color:#ffffff;margin-top:10px">A run failed</div>
  <div style="${FONT};font-size:13px;color:#D8CBB8;margin-top:6px">${esc(name)} &nbsp;·&nbsp; ${esc(when)}</div>
</td></tr>
<tr><td style="padding:22px 28px 6px">
  <div style="${FONT};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#DC143C;font-weight:bold">Error</div>
  <div style="margin-top:8px;padding:12px 14px;background:#fdf1f3;border-left:4px solid #DC143C;font-family:Consolas,monospace;font-size:13px;line-height:1.5;color:#1f2328;word-break:break-word">${esc(message)}</div>
</td></tr>
<tr><td style="padding:14px 28px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  ${row('Workflow', `<b>${esc(name)}</b>`)}
  ${row('Failed at node', `<b>${esc(node)}</b>`)}
  ${row('Execution', esc(ex.id || '–'))}
  ${row('Mode', esc(ex.mode || trig.mode || '–'))}
</table></td></tr>
<tr><td style="padding:14px 28px 18px">
  <div style="padding:12px 14px;background:#f7f5f2;border:1px solid #e2ddd5;border-radius:4px;${FONT};font-size:13px;line-height:1.5;color:#3d434a"><b style="color:${toolColour}">Check first:</b> ${esc(hint)}</div>
</td></tr>
${button}
<tr><td style="padding:12px 28px;background:#fbfaf7;border-top:1px solid #eee7dc;${FONT};font-size:12px;color:#5f6670">Sent by e0 · error-alerts. Runs started from the editor don't send alerts.</td></tr>
</table></td></tr></table></body></html>`;

const subject = `⚠ n8n failed: ${name} · ${node}`;
return [{ json: { subject, html } }];