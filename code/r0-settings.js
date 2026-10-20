// r0 · Settings: change these before a run.
// Start this workflow with "Execute workflow" in the editor. Never give it a schedule or webhook: with
// N8N_CONCURRENCY_PRODUCTION_LIMIT=1 a production run would wait for Sera while Sera waits for it.
return [{ json: {
  chatUrl: 'http://localhost:5678/webhook/front-desk/chat',  // Sera's chat address (f0 must be published)
  pauseSeconds: 25,             // between messages: keeps under Groq's free 8,000-tokens-a-minute limit (and Sera's 2-second rule)
  testPhone: '0300 0000001',    // used where a script needs a patient's details
  testEmail: 'you+redteam@example.com',   // a booking test sends its confirmation here
  reportTo: 'you@example.com',  // gets the summary email
  onlyIds: [],                  // e.g. ['B01', 'D05'] to rerun a few; empty = all
  onlyCategories: [],           // e.g. ['Medical advice']; empty = all
  onlySeverity: 'critical',     // 'critical' = the 37 scripts that must pass (fits Groq's free daily tokens); '' = all 48
} }];
