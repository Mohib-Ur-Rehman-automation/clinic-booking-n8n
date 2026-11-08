// ===== SETTINGS: edit once =====
const SETTINGS = {
  L0_ID: 'PASTE_L0_ID_FROM_ADDRESS_BAR',
  BRAND: 'Halden Solar Co.',
  FROM_EMAIL: 'PASTE_YOUR_SMTP_EMAIL',
  MAX_PER_RUN: 20,          // Gmail's published limit is ~500/day (new accounts get limited sooner); 20/hour x 24 = 480
  TIME_TRAVEL_HOURS: 0,     // TESTING ONLY: pretend it's N hours later (e.g. 25 = day 1 is due). Keep 0 in real use.
};
// ===============================
const now = Date.now() + SETTINGS.TIME_TRAVEL_HOURS * 3600 * 1000;
return [{ json: {
  settings: SETTINGS,
  now,
  search_body: {
    filterGroups: [{ filters: [
      { propertyName: 'engine_status', operator: 'EQ', value: 'awaiting' },
      { propertyName: 'next_followup_at', operator: 'LTE', value: String(now) },
      { propertyName: 'email', operator: 'HAS_PROPERTY' },
      { propertyName: 'followup_stage', operator: 'LT', value: '3' },   // finished sequences never come back
    ] }],
    sorts: [{ propertyName: 'next_followup_at', direction: 'ASCENDING' }],
    properties: ['email', 'firstname', 'city', 'followup_stage', 'next_followup_at', 'lead_key'],
    limit: Math.min(100, SETTINGS.MAX_PER_RUN),
  },
} }];
