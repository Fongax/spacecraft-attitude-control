#!/usr/bin/env node
/**
 * privacy-scan.js: fail if the site contains identifying information (plan §7.3).
 *
 * Usage:  node tests/privacy-scan.js <site dir> [--forbid <terms file>] [--quiet]
 *
 * Scans the text of every .html, .js, .css, .md, .txt, .svg and .json file (and every file
 * path) under the site directory, and fails (exit code 1) on:
 *   - course-code-like tokens (four digits + three capitals, or three/four capitals + three/four
 *     digits), apart from an allow-list of technical identifiers;
 *   - email addresses;
 *   - education-record words and phrases, internal folder paths and migration hints, links to
 *     .md files that are not part of the site, wiki-style double-bracket links, and textbook author names;
 *   - "Week <n>" dates (use "Iteration <n>");
 *   - every term in the --forbid file (one per line, whole word, case-insensitive; lines starting
 *     with # are comments). The file itself is never copied into the site.
 * Four-digit years of the 2010s and 2020s outside assets/vendor/ are reported as warnings to review,
 * unless they directly follow the word "seed" (the Monte Carlo seeds of plan §8.3 are not dates).
 *
 * The further-reading bibliography (assets/js/adcs-resources.js) lists published works by public
 * authors and organisations. In that file only, a capitalised education-record word that is part
 * of a publisher's or institution's proper name (such as "<Name> <word> Press" or "<word> of
 * <Place>") names that public body rather than a study record, and years in its metadata fields
 * (id, title, year, venue, url and checked) are publication years, not study dates. Years in the
 * free-text why and concepts strings are still reported, unless that line or the comment line
 * just above it says "privacy-scan: publication years" (a reviewed exception). Every other rule,
 * the --forbid identity terms included, still applies.
 *
 * The built-in word and name lists are stored as truncated SHA-256 hashes of the lower-case
 * phrase (1 to 3 words), so this file neither spells them out nor matches itself.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HASHED = {
  'education-record word': [
    'adba6c0ec8a8d89e', 'bdc227fb53d6967e', '42c97db3df4b1373', '7269e0b7d0422ef2', '25dc48a8d7c19499', '8f926af6cf694270',
    'b4e58cd7cb1cbf25', 'af836f761664bbfd', '9c4555cecf3cac27', '08a752a70fef3b3d', '2e239ad56ec1321f', 'ffe97bba510b9f5c',
    'f506049c62c953b0', '8ff3e09bd548dc19', '859cbc6539f7ceeb', '1ca7aaa322fbe8cd', 'b9f35367f758df20', '038740ef981ab56f',
    '21a56657277cef6a', 'ce7a7c10b0dfd968', 'ef8dcf7162a95536', '5e89e9d8544af15b', 'd6bd4331946ce8fa', '0b3e8a578e6a662f',
    '263aacfa8168d264', '9b9253fda5075075', '21d6bbdd4973cec6', '5a0963f460c1413e', 'd0e1cf6e553543c6', 'b8ecaaf836b54d10',
    '59b81ea8b4f6bcf1', '5cbc65708f0040e3', '765c746389a3bf13', 'a3de9b2ee6cab318', '5ef5afd600b718b1', '598f51bd3c1a1dd6',
    '0ecc02d9d50d4b49', '9edabf1df5588a1f', '1575907fb4e7d220', '2362621e8e175ba7', '50f43e6eb9880097'
  ],
  'internal path or migration hint': ['5417dcf3515cce99', 'e6f0a1fbb43c8919', 'e59882976f4cdcc4'],
  'textbook name': [
    '1a3073af6317a028', '1d8b4cf854cd42f4', 'e8aaa8720c56cca6', 'e8f87d52ee6aff50', 'c8058d58e081091f', 'e04b00a2a6a737b1',
    '3c89ff3dc8f3c1e3', '603ee179d0e50aed', '1b0d4da897ad0c36', 'ef444daa5dc06b41', 'c421f5e5eeb7ace3', '5ba4c5ad7f67ea1a',
    '20b054f22781a9c1', '4a8e6dcfd1ea2c1c', '1d740452c2bcda8b', '2d207f293fed905a'
  ]
};
// Hashed words that may appear in the bibliography as part of a proper name (see the header).
const BIBLIOGRAPHY = ['assets/js/adcs-resources.js'];
const PROPER_NAME_OK = new Set(['adba6c0ec8a8d89e']);
// Bibliography lines whose years are publication metadata, and the marker for a reviewed exception.
const BIB_YEAR_KEY = /^\s*(id|title|year|venue|url|checked)\s*:/;
const BIB_YEAR_MARK = /privacy-scan: publication years/;
const HASH_RULE = new Map();
Object.keys(HASHED).forEach(function (rule) { HASHED[rule].forEach(function (h) { HASH_RULE.set(h, rule); }); });
function hash(s) { return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16); }

/* Technical identifiers that look like codes but are not. */
const CODE_ALLOW = /^(REQ|ISO|IEC|JSF|MISRA|CRC|IEEE|ECSS|NASA|ESA|SAE|RTCA|ARINC|UTF|RGB|RGBA|SRGB|ARGB|BGRA|SHA|AES|RSA|HSL|HSV|DXT|ETC|PVRTC|ASTC|BPTC|RGTC|BC|WEBGL|GLSL|ES|ECMA|ANSI|POSIX|AVX|SSE|CIE|NTSC|PAL|IPV)/;
const CODE_RES = [/\b\d{4}[A-Z]{3}\b/g, /\b[A-Z]{3,4}\d{3,4}\b/g];
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g;
const WEEK_RE = /\bweek\s*\d/gi;
const PATH_RES = [
  [/\/tmp\//g, 'temporary folder path'],
  [/\b[A-Za-z]:\\(?=[A-Za-z])/g, 'Windows path'],
  [/\bUsers\//g, 'home folder path'],
  [/\[\[[A-Za-z][^\][\n'",]{0,118}\]\]/g, 'wiki-style link']
];
const MD_REF = /[\w./-]*\.md\b/g;
const YEAR_RE = /\b20[12]\d\b/g;
const SEED_BEFORE = /seeds?\b[\s:=,(]*(?:\d+\s*(?:,|and)\s*)*$/i;
const TEXT_EXT = /\.(html?|js|mjs|css|md|txt|svg|json|xml)$/i;

function parseArgs(argv) {
  const out = { dir: null, forbid: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--forbid') out.forbid = argv[++i];
    else if (a.indexOf('--forbid=') === 0) out.forbid = a.slice(9);
    else if (a === '--quiet') out.quiet = true;
    else if (!out.dir) out.dir = a;
  }
  return out;
}

function walk(dir, base, list) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (d) {
    if (d.name === '.git' || d.name === 'node_modules') return;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, base, list);
    else list.push(path.relative(base, p).split(path.sep).join('/'));
  });
  return list;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function forbidRegexes(file) {
  if (!file) return [];
  const text = fs.readFileSync(file, 'utf8');
  return text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l && l.charAt(0) !== '#'; })
    .map(function (term) {
      const body = term.split(/\s+/).map(escapeRe).join('[\\s_-]+');
      return new RegExp('(?:^|[^A-Za-z0-9])(' + body + ')(?![A-Za-z0-9])', 'gi');
    });
}

function lineCol(text, idx) {
  let line = 1, last = -1;
  for (let i = 0; i < idx; i++) if (text.charCodeAt(i) === 10) { line++; last = i; }
  return { line: line, col: idx - last };
}
function context(text, idx, len) {
  const a = Math.max(0, idx - 30), b = Math.min(text.length, idx + len + 30);
  return text.slice(a, b).replace(/\s+/g, ' ').trim();
}

/* Token i is capitalised and joined by a single space to a capitalised neighbour or to a following "of". */
function inProperName(text, toks, i) {
  const t = toks[i];
  if (!/^[A-Z]/.test(text.charAt(t.i))) return false;
  const prev = toks[i - 1], next = toks[i + 1];
  const prevOk = prev && text.slice(prev.e, t.i) === ' ' && /^[A-Z]/.test(text.charAt(prev.i));
  const nextOk = next && text.slice(t.e, next.i) === ' ' && (/^[A-Z]/.test(text.charAt(next.i)) || next.s === 'of');
  return !!(prevOk || nextOk);
}

/* In the bibliography: is the year at idx on a metadata line, or on or just below a marked line? */
function bibPublicationYear(text, idx) {
  const start = text.lastIndexOf('\n', idx - 1) + 1;
  const end = text.indexOf('\n', idx);
  const line = text.slice(start, end < 0 ? text.length : end);
  const prev = start > 0 ? text.slice(text.lastIndexOf('\n', start - 2) + 1, start - 1) : '';
  return BIB_YEAR_KEY.test(line) || BIB_YEAR_MARK.test(line) || (/^\s*\/\//.test(prev) && BIB_YEAR_MARK.test(prev));
}

function scanText(text, rel, forbid, siteFiles, findings, warnings) {
  const isVendor = rel.indexOf('assets/vendor/') === 0;
  const isBib = BIBLIOGRAPHY.indexOf(rel) >= 0;
  function add(list, idx, len, rule) {
    const lc = lineCol(text, idx);
    list.push({ file: rel, line: lc.line, col: lc.col, rule: rule, match: text.substr(idx, len), ctx: context(text, idx, len) });
  }
  CODE_RES.forEach(function (re) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) { if (!CODE_ALLOW.test(m[0])) add(findings, m.index, m[0].length, 'code-like token'); }
  });
  EMAIL_RE.lastIndex = 0;
  let m;
  while ((m = EMAIL_RE.exec(text))) add(findings, m.index, m[0].length, 'email address');
  WEEK_RE.lastIndex = 0;
  while ((m = WEEK_RE.exec(text))) add(findings, m.index, m[0].length, 'week date (use "Iteration")');
  PATH_RES.forEach(function (pr) {
    pr[0].lastIndex = 0;
    let mm;
    while ((mm = pr[0].exec(text))) add(findings, mm.index, mm[0].length, pr[1]);
  });
  MD_REF.lastIndex = 0;
  while ((m = MD_REF.exec(text))) {
    const name = m[0].split('/').pop();
    if (name === '.md' || !/^[\w.-]+\.md$/.test(name)) continue;
    if (!siteFiles.has(name)) add(findings, m.index, m[0].length, '.md link outside the site');
  }
  // Hashed words and phrases: n-grams of 1 to 3 tokens separated only by spaces or hyphens.
  const tokRe = /[A-Za-z0-9]+/g;
  const toks = [];
  let t;
  while ((t = tokRe.exec(text))) toks.push({ s: t[0].toLowerCase(), i: t.index, e: t.index + t[0].length });
  for (let i = 0; i < toks.length; i++) {
    let phrase = toks[i].s;
    for (let n = 1; n <= 3 && i + n - 1 < toks.length; n++) {
      if (n > 1) {
        const gap = text.slice(toks[i + n - 2].e, toks[i + n - 1].i);
        if (!/^[ \t-]{1,3}$/.test(gap)) break;
        phrase += ' ' + toks[i + n - 1].s;
      }
      const h = hash(phrase);
      const rule = HASH_RULE.get(h);
      if (rule && isBib && n === 1 && PROPER_NAME_OK.has(h) && inProperName(text, toks, i)) continue;
      if (rule) add(findings, toks[i].i, toks[i + n - 1].e - toks[i].i, rule);
    }
  }
  forbid.forEach(function (re) {
    re.lastIndex = 0;
    let mm;
    while ((mm = re.exec(text))) {
      const idx = mm.index + mm[0].indexOf(mm[1]);
      add(findings, idx, mm[1].length, 'identity term (--forbid list)');
      if (re.lastIndex === mm.index) re.lastIndex++;
    }
  });
  if (!isVendor && !/LICENSE/i.test(rel)) {
    YEAR_RE.lastIndex = 0;
    while ((m = YEAR_RE.exec(text))) {
      // allow-list: a number right after "seed", "seeds 7 and" or "baseSeed:" is a random seed (plan §8.3), not a date
      if (SEED_BEFORE.test(text.slice(Math.max(0, m.index - 16), m.index))) continue;
      if (isBib && bibPublicationYear(text, m.index)) continue;
      add(warnings, m.index, m[0].length, 'year (check it is not a study date)');
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir) {
    process.stderr.write('Usage: node tests/privacy-scan.js <site dir> [--forbid <terms file>] [--quiet]\n');
    process.exit(2);
  }
  const dir = path.resolve(args.dir);
  const forbid = forbidRegexes(args.forbid);
  const files = walk(dir, dir, []);
  const siteFiles = new Set(files.map(function (f) { return f.split('/').pop(); }));
  const findings = [], warnings = [];
  let bytes = 0, scanned = 0;
  files.forEach(function (rel) {
    // File paths are scanned too.
    scanText(rel, '(path) ' + rel, forbid, siteFiles, findings, []);
    if (!TEXT_EXT.test(rel)) return;
    const text = fs.readFileSync(path.join(dir, rel), 'utf8');
    bytes += text.length; scanned++;
    scanText(text, rel, forbid, siteFiles, findings, warnings);
  });
  const out = [];
  out.push('privacy-scan: ' + scanned + ' text files (' + Math.round(bytes / 1024) + ' KiB) and ' + files.length + ' paths scanned' +
    (forbid.length ? ', ' + forbid.length + ' identity terms' : ', no --forbid list given'));
  findings.forEach(function (f) { out.push('FAIL ' + f.file + ':' + f.line + ':' + f.col + ' [' + f.rule + '] "' + f.match + '"  …' + f.ctx + '…'); });
  if (!args.quiet) warnings.forEach(function (f) { out.push('warn ' + f.file + ':' + f.line + ':' + f.col + ' [' + f.rule + '] "' + f.match + '"  …' + f.ctx + '…'); });
  out.push('privacy-scan: ' + findings.length + ' finding(s), ' + warnings.length + ' warning(s): ' + (findings.length ? 'FAIL' : 'PASS'));
  process.stdout.write(out.join('\n') + '\n');
  process.exit(findings.length ? 1 : 0);
}

main();
