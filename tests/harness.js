// Tiny n8n Code-node harness: runs a Code node's JavaScript unchanged with mocked $(), $input, $now.
const fs = require('fs');
const path = require('path');
const { DateTime } = require('luxon');

const CODE_DIR = process.env.CODE_DIR || path.join(__dirname, '..', 'code');
const load = name => fs.readFileSync(path.join(CODE_DIR, name), 'utf8');

// nodes: { 'Node Name': json | [json] | { executed: false } }
// staticData: the object $getWorkflowStaticData('global') returns (n8n keeps it between production runs)
function run(src, { nodes = {}, input = [], nowUTC = '2026-10-19T04:00:00Z', staticData = {} } = {}) {
  const fixed = new Date(nowUTC).getTime();
  const $ = name => {
    const v = nodes[name];
    if (v === undefined || (v && v.__notExecuted)) {
      return { isExecuted: false, first: () => { throw new Error(`$('${name}') was not executed`); }, all: () => [], item: undefined };
    }
    const arr = [].concat(v);
    return { isExecuted: true, first: () => ({ json: arr[0] }), all: () => arr.map(json => ({ json })), item: { json: arr[0] } };
  };
  const $input = { all: () => input.map(json => ({ json })), first: () => ({ json: input[0] }) };
  const $now = DateTime.fromMillis(fixed).setZone('Asia/Karachi');
  // n8n's Code sandbox has no Node-only globals; hide them so tests fail the same way n8n would.
  const HIDDEN = ['URLSearchParams', 'URL', 'Buffer', 'require', 'process', 'global', 'globalThis', 'setImmediate', 'TextEncoder', 'TextDecoder', 'structuredClone', 'fetch'];
  const $getWorkflowStaticData = () => staticData;
  const fn = new Function('$', '$input', '$now', 'DateTime', '$getWorkflowStaticData', ...HIDDEN, src);
  const res = fn($, $input, $now, DateTime, $getWorkflowStaticData, ...HIDDEN.map(() => undefined));
  if (!Array.isArray(res)) throw new Error('Code node must return an array of items');
  return res.map(i => i.json);
}
const notExecuted = { __notExecuted: true };

let pass = 0, fail = 0;
const failures = [];
function t(name, cond, got) {
  if (cond) pass++;
  else { fail++; failures.push(`FAIL ${name}\n     got: ${typeof got === 'string' ? got : JSON.stringify(got)}`); }
}
function throws(name, f, re) {
  try { f(); t(name, false, 'no error thrown'); } catch (e) { t(name, re.test(e.message), e.message); }
}
function report(label) {
  console.log(`${label}: ${pass} pass, ${fail} fail`);
  for (const f of failures) console.log(f);
  return fail;
}
module.exports = { load, run, notExecuted, t, throws, report };
