#!/usr/bin/env node
/**
 * budget.js: the landing-page weight budget (plan §7.6, "landing JS and CSS excluding vendor
 * <= 300 KB").
 *
 * Usage:  node tests/budget.js <site dir> [--page index.html] [--limit-kb 300]
 *
 * The budget is measured as transfer size: every local script and stylesheet the page loads,
 * excluding assets/vendor/, compressed with gzip (level 9), the way GitHub Pages serves them.
 * Raw sizes are reported for information only: the shared files are deliberately readable,
 * commented source with no build step. Fails (exit code 1) when the gzip total exceeds the limit
 * (1 KB = 1000 bytes) or when a referenced file is missing.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const args = process.argv.slice(2);
function opt(name, def) { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; }
const SITE = path.resolve(args.find(function (a, i) { return a.charAt(0) !== '-' && (i === 0 || args[i - 1].charAt(0) !== '-'); }) || '.');
const PAGE = opt('--page', 'index.html');
const LIMIT_KB = Number(opt('--limit-kb', '300'));

const html = fs.readFileSync(path.join(SITE, PAGE), 'utf8');
const refs = [];
html.replace(/<script\b[^>]*\bsrc="([^"]+)"/g, function (m, src) { refs.push(src); return m; });
html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g, function (m, href) { refs.push(href); return m; });
html.replace(/<link\b[^>]*\bhref="([^"]+)"[^>]*\brel="stylesheet"/g, function (m, href) { if (refs.indexOf(href) < 0) refs.push(href); return m; });

let raw = 0, gz = 0, missing = 0;
const rows = [];
refs.filter(function (r) { return !/^(?:[a-z]+:)?\/\//i.test(r) && !/^data:/.test(r) && r.indexOf('assets/vendor/') !== 0; })
  .forEach(function (r) {
    const file = path.join(SITE, r.split('#')[0].split('?')[0]);
    if (!fs.existsSync(file)) { missing++; rows.push('MISSING ' + r); return; }
    const buf = fs.readFileSync(file);
    const z = zlib.gzipSync(buf, { level: 9 }).length;
    raw += buf.length; gz += z;
    rows.push(('      ' + buf.length).slice(-8) + ' raw ' + ('      ' + z).slice(-8) + ' gzip  ' + r);
  });

const out = ['budget: ' + PAGE + ', local JS and CSS excluding assets/vendor/'].concat(rows);
out.push('budget: ' + (gz / 1000).toFixed(1) + ' KB gzip (limit ' + LIMIT_KB + ' KB), ' + (raw / 1000).toFixed(1) + ' KB raw (information only)');
const ok = !missing && gz <= LIMIT_KB * 1000;
out.push('budget: ' + (ok ? 'PASS' : 'FAIL'));
process.stdout.write(out.join('\n') + '\n');
process.exit(ok ? 0 : 1);
