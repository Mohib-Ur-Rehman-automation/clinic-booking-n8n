// node validate.js -> checks the workflow files and runs every test suite against the code inside them.
// 1. Each workflow's connections point at real nodes, and no node is left unconnected.
// 2. Every Code node in workflows/ is byte-for-byte the file in code/ (so what you read is what runs).
// 3. All test suites run against the code pulled OUT of the workflow JSON, not the copies in code/.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const WF = path.join(__dirname, 'workflows'), CODE = path.join(__dirname, 'code');
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'clinic-extract-'));
const fileFor = { 'd0.clinic-core|Clinic Rules': 'd0-clinic-rules.js', 'd0.clinic-core|Clinic Templates': 'd0-clinic-templates.js', 'd1.clinic-booking|Finish': 'd1-finish.js',
  'd2.clinic-cancel|Finish': 'd2-finish.js', 'd3.clinic-reminders|Stamp': 'd3-stamp.js', 'd3.clinic-reminders|Check Sends': 'd3-check-sends.js', 'd4.clinic-doctor-list|Check Sends': 'd4-check-sends.js', 'e0.error-alerts|Build Alert': 'e0-build-alert.js' };
let problems = 0;
const problem = (...m) => { console.log('PROBLEM:', ...m); problems++; };
for (const f of fs.readdirSync(WF).filter(f => f.endsWith('.json'))) {
  const w = JSON.parse(fs.readFileSync(path.join(WF, f), 'utf8'));
  const names = new Set(w.nodes.map(n => n.name));
  if (names.size !== w.nodes.length) problem(f, 'duplicate node names');
  for (const [from, c] of Object.entries(w.connections)) {
    if (!names.has(from)) problem(f, 'connection from missing node', from);
    for (const out of c.main) for (const l of out) if (!names.has(l.node)) problem(f, 'connection to missing node', l.node);
  }
  const connected = new Set(Object.keys(w.connections).concat(Object.values(w.connections).flatMap(c => c.main.flat().map(l => l.node))));
  for (const n of w.nodes) if (n.type !== 'n8n-nodes-base.stickyNote' && !connected.has(n.name)) problem(f, 'unconnected node', n.name);
  for (const n of w.nodes.filter(n => n.type === 'n8n-nodes-base.code')) {
    const file = fileFor[f.replace('.json', '') + '|' + n.name];
    if (!file) { problem('no code file mapped for', f, n.name); continue; }
    if (fs.readFileSync(path.join(CODE, file), 'utf8').replace(/\n$/, '') !== n.parameters.jsCode.replace(/\n$/, '')) problem(`${f} › ${n.name} differs from code/${file}`);
    fs.writeFileSync(path.join(tmp, file), n.parameters.jsCode);
  }
  console.log(`${f}: ${w.nodes.length} nodes OK`);
}
for (const s of ['d0-rules.test.js', 'd0-templates.test.js', 'flows.test.js', 'e0.test.js', 'stress.test.js']) {
  try { process.stdout.write(execFileSync('node', [path.join(__dirname, 'tests', s)], { env: { ...process.env, CODE_DIR: tmp } }).toString()); }
  catch (e) { process.stdout.write(String(e.stdout || e.message)); problems++; }
}
fs.rmSync(tmp, { recursive: true });
console.log(problems ? `${problems} PROBLEMS` : 'All checks passed');
process.exitCode = problems ? 1 : 0;
