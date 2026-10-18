// d2 · Finish: pick the page to show after a cancel link was opened.
const failMsg = j => j.error ? String(j.error.message || j.error.description || j.error) : (Array.isArray(j.rejected) && j.rejected.length ? 'rejected by the mail server: ' + j.rejected.join(', ') : '');

const b = $('Find Booking').first().json;                                  // when the link was opened
const again = $('Check Again').isExecuted ? $('Check Again').first().json : null;   // after "Yes, cancel it"
let html = b.page_html;                                       // not found / already cancelled / too late / passed
if (b.status === 'cancellable') {
  if (!again) html = b.page_html_kept;                                     // chose "No, keep it" or left the page
  else if (again.status !== 'cancellable') html = again.page_html;         // cancelled in another tab, or too late by now
  else html = failMsg($('Send Cancellation').first().json) ? again.page_html_email_failed : again.page_html;
}
return [{ json: { html } }];
