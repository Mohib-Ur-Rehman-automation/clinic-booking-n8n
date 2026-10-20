/**
 * Demo Family Clinic: sheet setup and formatting.
 * Extensions → Apps Script → paste this whole file → pick setupClinicSheet at the top → Run → allow access.
 *
 * Safe to run again: a tab whose header row already matches is only re-formatted (rows kept).
 * A tab with different headers is renamed "<name> (old …)" and a fresh one is made, so nothing is deleted.
 * Row 1 of Appointments, Closures and Request Log must keep these exact names: n8n finds columns by them.
 * DOCTORS and VISITS must match the CLINIC block in d0 · Clinic Rules.
 */
const DOCTORS = ['Dr. Ayesha Khan', 'Dr. Usman Ali'];
const VISITS = ['Check-up', 'Follow-up', 'Consultation'];

// Palette: Tropical Teal & Apricot (same as the pages and emails)
const TEAL = '#0F766E', APRICOT = '#FF8B5A', PEACH = '#FFE2C2', PAPER = '#FFF8F1', INK = '#0F172A', MUTED = '#64748B',
  EUCALYPTUS = '#6B8F7A', SLATE_BG = '#E2E8F0', ALERT = '#B42318', BROWN = '#7A3410', WHITE = '#FFFFFF', LINE = '#E8D9C6';
const DOCTOR_COLOURS = [['#741B47', WHITE], ['#073763', WHITE], ['#B45309', WHITE], ['#1D4ED8', WHITE]];   // one per doctor, in DOCTORS order
// Header colour per tab
const HEAD = { Appointments: '#115762', 'Request Log': '#4A0241', Closures: '#541414', Upcoming: INK, Handoffs: '#7A3410', 'Front Desk Log': '#334155', 'Red Team': '#B42318' };
const FONT = 'Figtree';

const APPOINTMENTS = ['booking_id', 'booked_at', 'status', 'doctor', 'date', 'day', 'time', 'patient_name', 'phone', 'email', 'visit_type', 'reminder', 'cancel_token', 'cancelled_at'];
const REQUEST_LOG = ['booking_id', 'requested_at', 'finished_at', 'outcome', 'doctor', 'requested_date', 'offered_date', 'chosen_time', 'patient_name', 'phone', 'email', 'visit_type', 'reason', 'confirmation_email'];
const CLOSURES = ['date', 'doctor', 'reason'];
const UPCOMING = ['Date', 'Day', 'Time', 'Doctor', 'Patient', 'Visit', 'Phone', 'Token'];
// Front desk (Sera, the website chat): f3 writes Handoffs, f0 writes Front Desk Log
const HANDOFFS = ['ref', 'created_at', 'reason', 'patient_name', 'contact', 'summary', 'status'];
const RED_TEAM = ['run_at', 'id', 'category', 'severity', 'attack', 'verdict', 'failed_checks', 'conversation', 'bookings_made', 'seconds'];
const FRONT_DESK_LOG = ['at', 'session_id', 'route', 'patient_message', 'reply', 'tools_used', 'booking_id', 'handoff_ref', 'seconds'];

function setupClinicSheet() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone('Asia/Karachi');

  // ---- Appointments: the clinic's schedule ----
  const ap = dataTab_(ss, 'Appointments', APPOINTMENTS, TEAL, [118, 150, 104, 140, 100, 92, 64, 160, 116, 210, 112, 230, 150, 150]);
  const apRows = body_(ap, APPOINTMENTS.length);
  listRule_(ap, 'status', APPOINTMENTS, ['Confirmed', 'Cancelled']);
  listRule_(ap, 'doctor', APPOINTMENTS, DOCTORS);
  listRule_(ap, 'visit_type', APPOINTMENTS, VISITS);
  const status = col_(ap, 'status', APPOINTMENTS), reminder = col_(ap, 'reminder', APPOINTMENTS);
  ap.setConditionalFormatRules([
    rule_('=$C2="Cancelled"', [apRows], r => r.setFontColor(MUTED).setStrikethrough(true).setBackground(SLATE_BG)),
    rule_('=$C2="Confirmed"', [status], r => r.setBackground(TEAL).setFontColor(WHITE).setBold(true)),
    rule_('=LEFT($L2,6)="Failed"', [reminder], r => r.setBackground(ALERT).setFontColor(WHITE).setBold(true)),
    rule_('=LEFT($L2,4)="Sent"', [reminder], r => r.setFontColor(EUCALYPTUS).setBold(true)),
    ...doctorChips_('$D2', col_(ap, 'doctor', APPOINTMENTS)),
    rule_('=$E2=TEXT(TODAY(),"yyyy-mm-dd")', [apRows], r => r.setBackground(PEACH).setBold(true)),
  ]);
  note_(ap, 'date', APPOINTMENTS, 'Type dates as YYYY-MM-DD, e.g. 2026-10-20.');
  note_(ap, 'time', APPOINTMENTS, 'Type times as HH:MM in 24-hour time, e.g. 17:20. Slots start every 20 minutes.');
  note_(ap, 'booking_id', APPOINTMENTS, 'Every booking needs its own ID. For bookings you add by hand, use something like BK-STAFF1.');
  note_(ap, 'status', APPOINTMENTS, 'Change to Cancelled to free the time. Never delete a booking row.');

  // ---- Closures: days off. A real date picker, so dates can't be typed the wrong way round ----
  const cl = dataTab_(ss, 'Closures', CLOSURES, APRICOT, [130, 170, 340]);
  const clRows = body_(cl, CLOSURES.length);
  listRule_(cl, 'doctor', CLOSURES, ['All doctors'].concat(DOCTORS));
  col_(cl, 'date', CLOSURES).setNumberFormat('yyyy-mm-dd')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).setHelpText('Pick a date: double-click the cell for a calendar.').build());
  cl.setConditionalFormatRules([
    rule_('=AND($A2<>"",$A2<TODAY())', [clRows], r => r.setFontColor(MUTED).setStrikethrough(true)),
    rule_('=$B2="All doctors"', [col_(cl, 'doctor', CLOSURES)], r => r.setBackground(APRICOT).setFontColor(INK).setBold(true)),
    ...doctorChips_('$B2', col_(cl, 'doctor', CLOSURES)),
    rule_('=AND($A2<>"",$A2>=TODAY())', [clRows], r => r.setBackground(PEACH)),
  ]);
  note_(cl, 'date', CLOSURES, 'One row per closed day. Double-click a cell to pick the date from a calendar.');
  note_(cl, 'doctor', CLOSURES, 'A doctor on leave, or "All doctors" when the clinic is closed.');
  note_(cl, 'reason', CLOSURES, 'For staff only. Patients are just told the doctor or clinic is not available.');

  // ---- Request Log: every booking attempt and how it ended ----
  const lg = dataTab_(ss, 'Request Log', REQUEST_LOG, EUCALYPTUS, [118, 150, 150, 160, 140, 116, 108, 96, 160, 116, 210, 112, 380, 210]);
  const outcome = col_(lg, 'outcome', REQUEST_LOG), mail = col_(lg, 'confirmation_email', REQUEST_LOG);
  col_(lg, 'reason', REQUEST_LOG).setWrap(true);
  lg.setConditionalFormatRules([
    rule_('=$D2="Booked"', [outcome], r => r.setBackground(TEAL).setFontColor(WHITE).setBold(true)),
    rule_('=OR($D2="Taken before submit",$D2="Too late")', [outcome], r => r.setBackground(APRICOT).setFontColor(INK).setBold(true)),
    rule_('=OR($D2="Invalid details",$D2="No free time",$D2="Too far ahead")', [outcome], r => r.setBackground(PEACH).setFontColor(BROWN).setBold(true)),
    rule_('=OR($D2="Declined",$D2="Abandoned",$D2="Choosing time")', [outcome], r => r.setBackground(SLATE_BG).setFontColor(MUTED)),
    rule_('=LEFT($N2,6)="Failed"', [mail], r => r.setBackground(ALERT).setFontColor(WHITE).setBold(true)),
    rule_('=$N2="Sent"', [mail], r => r.setFontColor(EUCALYPTUS).setBold(true)),
    ...doctorChips_('$E2', col_(lg, 'doctor', REQUEST_LOG)),
  ]);

  // ---- Handoffs: questions Sera passed to a person. Staff set status to Done when it's dealt with ----
  const ho = dataTab_(ss, 'Handoffs', HANDOFFS, BROWN, [96, 150, 190, 150, 170, 420, 96]);
  const hoRows = body_(ho, HANDOFFS.length);
  col_(ho, 'summary', HANDOFFS).setWrap(true);
  listRule_(ho, 'status', HANDOFFS, ['Open', 'Done']);
  ho.setConditionalFormatRules([
    rule_('=$G2="Done"', [hoRows], r => r.setFontColor(MUTED).setStrikethrough(true).setBackground(SLATE_BG)),
    rule_('=AND($G2="Open",OR($C2="Medical question",$C2="Complaint"))', [col_(ho, 'reason', HANDOFFS)], r => r.setBackground(APRICOT).setFontColor(INK).setBold(true)),
    rule_('=$G2="Open"', [col_(ho, 'status', HANDOFFS)], r => r.setBackground(ALERT).setFontColor(WHITE).setBold(true)),
  ]);
  note_(ho, 'status', HANDOFFS, 'Set to Done once someone has called or emailed the patient back.');
  note_(ho, 'reason', HANDOFFS, 'Medical questions and complaints are highlighted: reply to those the same day.');

  // ---- Front Desk Log: one row per chat message, for checking what Sera said ----
  const fd = dataTab_(ss, 'Front Desk Log', FRONT_DESK_LOG, '#334155', [150, 180, 96, 300, 380, 84, 110, 96, 72]);
  col_(fd, 'patient_message', FRONT_DESK_LOG).setWrap(true);
  col_(fd, 'reply', FRONT_DESK_LOG).setWrap(true);
  const route = col_(fd, 'route', FRONT_DESK_LOG);
  fd.setConditionalFormatRules([
    rule_('=$C2="emergency"', [route], r => r.setBackground(ALERT).setFontColor(WHITE).setBold(true)),
    rule_('=$C2="ai_failed"', [route], r => r.setBackground(APRICOT).setFontColor(INK).setBold(true)),
    rule_('=$G2<>""', [col_(fd, 'booking_id', FRONT_DESK_LOG)], r => r.setBackground(TEAL).setFontColor(WHITE).setBold(true)),
    rule_('=$H2<>""', [col_(fd, 'handoff_ref', FRONT_DESK_LOG)], r => r.setBackground(PEACH).setFontColor(BROWN).setBold(true)),
  ]);
  note_(fd, 'route', FRONT_DESK_LOG, 'agent = Sera answered · emergency = fixed 1122 reply, AI skipped · empty = nothing typed · ai_failed = Gemini did not answer, fallback reply sent.');

  // ---- Red Team: results of r0 (attack conversations played against Sera, graded automatically) ----
  const rt = dataTab_(ss, 'Red Team', RED_TEAM, ALERT, [150, 60, 140, 84, 320, 72, 360, 520, 120, 72]);
  ['attack', 'failed_checks', 'conversation'].forEach(n => col_(rt, n, RED_TEAM).setWrap(true));
  rt.setConditionalFormatRules([
    rule_('=$F2="PASS"', [col_(rt, 'verdict', RED_TEAM)], r => r.setBackground(TEAL).setFontColor(WHITE).setBold(true)),
    rule_('=$F2="FAIL"', [col_(rt, 'verdict', RED_TEAM)], r => r.setBackground(ALERT).setFontColor(WHITE).setBold(true)),
    rule_('=$D2="critical"', [col_(rt, 'severity', RED_TEAM)], r => r.setFontColor(ALERT).setBold(true)),
  ]);

  // ---- Upcoming: a read-only board built from Appointments ----
  const up = ss.getSheetByName('Upcoming') || ss.insertSheet('Upcoming');
  up.getBandings().forEach(b => b.remove());
  if (up.getFilter()) up.getFilter().remove();
  up.clear();
  up.getRange('A:H').setDataValidation(null);
  up.setConditionalFormatRules([]);
  up.getRange('A1:H1').merge().setValue('Upcoming appointments').setFontFamily(FONT).setFontSize(20).setFontWeight('bold').setFontColor(TEAL).setVerticalAlignment('middle');
  up.getRange('A2:H2').merge().setValue('Built automatically from Appointments: confirmed bookings from today on, soonest first. Edit bookings in Appointments, not here.')
    .setFontFamily(FONT).setFontSize(10).setFontColor(MUTED).setVerticalAlignment('top');
  up.setRowHeight(1, 40); up.setRowHeight(2, 26);
  up.getRange('A3').setFormula(
    '=LET(h, Appointments!A1:N1, d, Appointments!A2:N, col, LAMBDA(n, CHOOSECOLS(d, XMATCH(n, h))),' +
    ' keep, ARRAYFORMULA((col("date")>=TEXT(TODAY(),"yyyy-mm-dd"))*(col("status")<>"Cancelled")*(col("date")<>"")),' +
    ' rows, HSTACK(col("date"), col("day"), col("time"), col("doctor"), col("patient_name"), col("visit_type"), col("phone"), col("booking_id")),' +
    ' VSTACK({"' + UPCOMING.join('","') + '"}, IFERROR(SORT(FILTER(rows, keep), 1, TRUE, 3, TRUE), {"No upcoming appointments","","","","","","",""})))');
  header_(up, 3, UPCOMING.length, HEAD.Upcoming);
  up.setFrozenRows(3);
  const upRows = up.getRange(4, 1, 300, UPCOMING.length);
  upRows.setFontFamily(FONT).setVerticalAlignment('middle');
  up.getRange(3, 1, 301, UPCOMING.length).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor(HEAD.Upcoming).setFirstRowColor(WHITE).setSecondRowColor(PAPER);
  up.setConditionalFormatRules([
    ...doctorChips_('$D4', up.getRange(4, 4, 300, 1)),
    rule_('=$A4=TEXT(TODAY(),"yyyy-mm-dd")', [upRows], r => r.setBackground(PEACH).setBold(true)),
    rule_('=$A4=TEXT(TODAY()+1,"yyyy-mm-dd")', [upRows], r => r.setBackground('#FFF1E4')),
  ]);
  [108, 96, 70, 150, 170, 120, 120, 120].forEach((w, i) => up.setColumnWidth(i + 1, w));
  up.setTabColor(INK);

  // ---- Tab order ----
  ['Upcoming', 'Appointments', 'Closures', 'Request Log', 'Handoffs', 'Front Desk Log', 'Red Team'].forEach((n, i) => { ss.setActiveSheet(ss.getSheetByName(n)); ss.moveActiveSheet(i + 1); });
  ss.setActiveSheet(up);
  const done = 'Clinic sheet is set up: Upcoming, Appointments, Closures, Request Log, Handoffs, Front Desk Log, Red Team.\n\nTabs named "(old …)" hold the previous test data. Delete them whenever you like.';
  Logger.log(done);
  try { SpreadsheetApp.getUi().alert(done); } catch (e) { /* run from the script editor: no pop-up there, the log line above says the same */ }
}

// Creates or re-formats a data tab. Data cells are Plain text (except Closures dates), so Sheets never turns
// 03001234567 into a number or 17:20 into a time.
function dataTab_(ss, name, headers, tabColor, widths) {
  let sh = ss.getSheetByName(name);
  if (sh) {
    const now = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getDisplayValues()[0];
    const same = now.length === headers.length && headers.every((h, i) => now[i] === h);
    if (!same && sh.getLastRow() > 0) {
      sh.setName(name + ' (old ' + Utilities.formatDate(new Date(), 'Asia/Karachi', 'yyyy-MM-dd HHmm') + ')');
      sh = null;
    }
  }
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
  if (sh.getMaxColumns() > headers.length) sh.deleteColumns(headers.length + 1, sh.getMaxColumns() - headers.length);
  sh.getBandings().forEach(b => b.remove());
  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  header_(sh, 1, headers.length, HEAD[name]);
  const body = body_(sh, headers.length);
  body.setNumberFormat('@').setFontFamily(FONT).setFontSize(10).setVerticalAlignment('middle').setDataValidation(null);
  sh.getRange(1, 1, sh.getMaxRows(), headers.length).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor(HEAD[name]).setFirstRowColor(WHITE).setSecondRowColor(PAPER);
  sh.getRange(1, 1, sh.getMaxRows(), headers.length).createFilter();
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.setFrozenColumns(1);
  sh.setTabColor(tabColor);
  return sh;
}
function header_(sh, row, n, color) {
  sh.setFrozenRows(row);
  sh.getRange(row, 1, 1, n).setBackground(color).setFontColor(WHITE).setFontWeight('bold').setFontFamily(FONT).setFontSize(10).setVerticalAlignment('middle');
  sh.setRowHeight(row, 34);
}
function body_(sh, n) { return sh.getRange(2, 1, sh.getMaxRows() - 1, n); }
function col_(sh, name, headers) { return sh.getRange(2, headers.indexOf(name) + 1, sh.getMaxRows() - 1, 1); }
function listRule_(sh, name, headers, list) {
  col_(sh, name, headers).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build());
}
function rule_(formula, ranges, style) {
  return style(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula)).setRanges(ranges).build();
}
// Each doctor gets their own colour wherever their name appears
function doctorChips_(cellRef, range) {
  return DOCTORS.map((d, i) => rule_('=' + cellRef + '="' + d + '"', [range],
    r => r.setBackground(DOCTOR_COLOURS[i % DOCTOR_COLOURS.length][0]).setFontColor(DOCTOR_COLOURS[i % DOCTOR_COLOURS.length][1]).setBold(true)));
}
function note_(sh, name, headers, text) { sh.getRange(1, headers.indexOf(name) + 1).setNote(text); }
