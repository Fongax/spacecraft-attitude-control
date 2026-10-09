#!/usr/bin/env node
/*
 * run-node.js: Node runner for the engine tests.
 * Usage (from the site folder): node tests/run-node.js [--filter text]
 * Loads the shared engine scripts with vm.runInThisContext (the same classic
 * scripts the pages load), then tests/engine.test.js, and exits non-zero on
 * any failure.
 */
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const site = path.resolve(__dirname, '..');
const out = function (s) { process.stdout.write(s + '\n'); };

function load(rel, optional) {
  const file = path.join(site, rel);
  if (!fs.existsSync(file)) {
    if (optional) { out('  (skipped ' + rel + ': not present)'); return false; }
    throw new Error('Missing ' + rel);
  }
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
  return true;
}

const argv = process.argv.slice(2);
const fi = argv.indexOf('--filter');
const filterText = fi >= 0 ? String(argv[fi + 1] || '').toLowerCase() : '';

out('ADCS engine tests (Node ' + process.version + ')');
load('assets/js/adcs-math.js');
load('assets/js/adcs-sim.js');
load('assets/js/adcs-data.js', true);
load('tests/engine.test.js');

const T = globalThis.ADCSTests;
let lastGroup = '';
T.runAll({
  filter: filterText ? function (c) { return (c.group + ' ' + c.name).toLowerCase().indexOf(filterText) >= 0; } : null,
  onResult: function (r) {
    if (r.group !== lastGroup) { out('\n' + r.group); lastGroup = r.group; }
    const mark = r.status === 'pass' ? 'PASS' : (r.status === 'skip' ? 'SKIP' : 'FAIL');
    out('  ' + mark + '  ' + r.name + (r.detail ? '  [' + r.detail + ']' : '') + '  (' + r.ms.toFixed(0) + ' ms)');
  }
}).then(function (s) {
  out('\n' + s.passed + ' passed, ' + s.failed + ' failed, ' + s.skipped + ' skipped in ' + (s.ms / 1000).toFixed(1) + ' s');
  process.exitCode = s.failed ? 1 : 0;
}, function (e) {
  out('Runner error: ' + (e && e.stack ? e.stack : e));
  process.exitCode = 2;
});
