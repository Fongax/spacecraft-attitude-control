#!/usr/bin/env node
/**
 * link-check.js: file:// and GitHub Pages subpath safety (plan §7.7).
 *
 * Usage:  node tests/link-check.js <site dir> [--pending-ok] [--quiet]
 *
 * Fails (exit code 1) on:
 *   - root-absolute references (an href, src or url() value that starts with a slash) and base
 *     elements;
 *   - ES modules and local fetching: module-type scripts, import/export at the start of a line in
 *     .js files, the fetch API and XHR (assets/vendor/ is exempt: the vendored libraries are
 *     unmodified);
 *   - absolute http(s):// URLs, except XML namespace URIs and plain <a href> links in about.html,
 *     README.md and assets/vendor/LICENSES.md (documented external links the site works without);
 *   - relative href/src/url() targets that do not exist, and #anchors missing from their target
 *     page. Ids that page scripts create from ADCS.data are known: atlas.html#c-<course id>,
 *     glossary.html#g-<term id>, and the chrome's site-nav. Every module's section anchors from
 *     ADCS.data.modules must exist in its page, as must #check and #provenance;
 *   - a module page whose number of figure.widget elements differs from its
 *     ADCS.data.modules[].widgets list (a widget title missing from the page is a warning).
 * Templates (assets/templates/) resolve links from the site root, and {{placeholder}} links are
 * skipped. Hash values with "=" (simulator deep links such as #preset=T03) are not anchors.
 * --pending-ok reports missing top-level pages (built by other packages) as pending, not errors.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PAGES = ['index.html', 'simulator.html', 'learn.html', 'atlas.html', 'glossary.html', 'about.html', '404.html',
  'm01-requirements.html', 'm02-architecture.html', 'm03-dynamics.html', 'm04-integration.html', 'm05-control.html',
  'm06-actuators.html', 'm07-sensors.html', 'm08-safe-mode.html', 'm09-verification.html', 'm10-software.html',
  'm11-visualisation.html', 'm12-project-risk.html', 'm13-operations.html'];
const EXTERNAL_OK = ['about.html', 'README.md', 'assets/vendor/LICENSES.md'];
const CHROME_IDS = ['site-nav', 'adcs-live'];
const NS_RE = /^https?:\/\/www\.w3\.org\/(2000\/svg|1999\/xlink|1999\/xhtml|1998\/Math\/MathML|XML\/1998\/namespace)/;

const args = process.argv.slice(2);
const dirArg = args.find(function (a) { return a.charAt(0) !== '-'; });
const pendingOk = args.indexOf('--pending-ok') >= 0;
const quiet = args.indexOf('--quiet') >= 0;
if (!dirArg) { process.stderr.write('Usage: node tests/link-check.js <site dir> [--pending-ok] [--quiet]\n'); process.exit(2); }
const SITE = path.resolve(dirArg);

const errors = [], pending = [], warnings = [];
function rel(p) { return path.relative(SITE, p).split(path.sep).join('/'); }
function report(list, file, line, msg) { list.push(file + (line ? ':' + line : '') + '  ' + msg); }
function lineOf(text, idx) { let n = 1; for (let i = 0; i < idx; i++) if (text.charCodeAt(i) === 10) n++; return n; }

function walk(dir, list) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (d) {
    if (d.name === '.git' || d.name === 'node_modules') return;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, list); else list.push(p);
  });
  return list;
}
const files = walk(SITE, []);

/* ---------------------------------------------------------------- ids known per page */
let data = null;
try {
  const sandbox = { console: console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(SITE, 'assets/js/adcs-data.js'), 'utf8'), sandbox, { filename: 'adcs-data.js' });
  data = sandbox.ADCS && sandbox.ADCS.data;
} catch (e) {
  report(warnings, 'assets/js/adcs-data.js', 0, 'could not load ADCS.data (' + e.message + '); data-driven anchors are not checked');
}
const dynamicIds = {};
if (data) {
  dynamicIds['atlas.html'] = (data.courses || []).map(function (c) { return 'c-' + c.id; });
  dynamicIds['glossary.html'] = (data.glossary || []).map(function (g) { return 'g-' + g.id; });
}
const idCache = new Map();
function idsOf(absFile) {
  if (idCache.has(absFile)) return idCache.get(absFile);
  const set = new Set(CHROME_IDS);
  if (fs.existsSync(absFile)) {
    const text = fs.readFileSync(absFile, 'utf8');
    let m;
    const re = /\b(?:id|name)\s*=\s*["']([^"']+)["']/g;
    while ((m = re.exec(text))) set.add(m[1]);
  }
  (dynamicIds[rel(absFile)] || []).forEach(function (id) { set.add(id); });
  idCache.set(absFile, set);
  return set;
}

/* ---------------------------------------------------------------- reference checks */
function checkRef(fromFile, baseDir, ref, line, kind) {
  const r = ref.trim();
  if (!r || r.indexOf('{{') >= 0) return;
  if (/^(data|mailto|tel|blob|about):/i.test(r)) return;
  if (/^javascript:/i.test(r)) { report(warnings, fromFile, line, kind + ' uses a javascript: URL'); return; }
  if (/^https?:/i.test(r) || r.indexOf('//') === 0) return; // handled by the absolute-URL rule
  const hashAt = r.indexOf('#');
  const p = (hashAt >= 0 ? r.slice(0, hashAt) : r).split('?')[0];
  const hash = hashAt >= 0 ? decodeURIComponent(r.slice(hashAt + 1)) : '';
  let target;
  if (!p) target = path.join(SITE, fromFile);
  else if (p.charAt(0) === '/') { report(errors, fromFile, line, kind + ' is root-absolute: ' + r); return; }
  else target = path.resolve(baseDir, decodeURIComponent(p));
  const tRel = rel(target);
  if (tRel.indexOf('..') === 0) { report(errors, fromFile, line, kind + ' leaves the site folder: ' + r); return; }
  if (!fs.existsSync(target)) {
    if (pendingOk && PAGES.indexOf(tRel) >= 0) report(pending, fromFile, line, kind + ' target page not built yet: ' + tRel);
    else report(errors, fromFile, line, kind + ' target missing: ' + r);
    return;
  }
  if (hash && hash.indexOf('=') < 0 && /\.html?$/i.test(target)) {
    if (!idsOf(target).has(hash)) report(errors, fromFile, line, kind + ' anchor #' + hash + ' not found in ' + tRel);
  }
}

function checkAbsolute(text, fileRel, isHtml) {
  const re = /https?:\/\/[^\s"'<>)\\]+/g;
  let m;
  while ((m = re.exec(text))) {
    const url = m[0];
    if (NS_RE.test(url)) continue;
    const line = lineOf(text, m.index);
    if (EXTERNAL_OK.indexOf(fileRel) >= 0) {
      if (isHtml) {
        const before = text.slice(Math.max(0, m.index - 300), m.index);
        const tag = before.slice(before.lastIndexOf('<'));
        if (!/^<a\s[^>]*href\s*=\s*["']?$/i.test(tag)) report(errors, fileRel, line, 'external URL outside a plain <a href> link: ' + url);
      }
      continue;
    }
    report(errors, fileRel, line, 'absolute URL: ' + url);
  }
}

const ROOT_ABS = [
  [/\b(?:href|src|action|poster)\s*=\s*["']\/(?!\/)/gi, 'root-absolute href/src'],
  [/url\(\s*["']?\/(?!\/)/gi, 'root-absolute url()'],
  [/<base[\s>]/gi, 'base element']
];
const MODULE_RE = /\btype\s*=\s*["']?module\b/gi;
const FETCH_RE = new RegExp('\\bfetch\\s*\\(|\\bXMLHttp' + 'Request\\b', 'g');

function scanPatterns(text, fileRel, list, isVendor) {
  ROOT_ABS.forEach(function (pr) {
    pr[0].lastIndex = 0;
    let m;
    while ((m = pr[0].exec(text))) report(list, fileRel, lineOf(text, m.index), pr[1]);
  });
  if (isVendor) return;
  MODULE_RE.lastIndex = 0;
  let m;
  while ((m = MODULE_RE.exec(text))) report(list, fileRel, lineOf(text, m.index), 'module-type script (classic scripts only)');
  FETCH_RE.lastIndex = 0;
  while ((m = FETCH_RE.exec(text))) report(list, fileRel, lineOf(text, m.index), 'network request API (' + m[0].replace(/[\s(]/g, '') + ') is blocked on file://');
}

let checked = 0, refs = 0;
files.forEach(function (abs) {
  const fileRel = rel(abs);
  const ext = path.extname(abs).toLowerCase();
  if (['.html', '.htm', '.css', '.js', '.md'].indexOf(ext) < 0) return;
  const isVendor = fileRel.indexOf('assets/vendor/') === 0;
  const text = fs.readFileSync(abs, 'utf8');
  checked++;
  const baseDir = fileRel.indexOf('assets/templates/') === 0 ? SITE : path.dirname(abs);
  scanPatterns(text, fileRel, errors, isVendor);
  if (ext === '.html' || ext === '.htm') {
    checkAbsolute(text, fileRel, true);
    const re = /\b(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
    let m;
    while ((m = re.exec(text))) { refs++; checkRef(fileRel, baseDir, m[2] !== undefined ? m[2] : m[3], lineOf(text, m.index), m[1].toLowerCase()); }
    const st = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    while ((m = st.exec(text))) {
      const u = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
      let k;
      while ((k = u.exec(m[1]))) { refs++; checkRef(fileRel, baseDir, k[1], lineOf(text, m.index), 'url()'); }
    }
  } else if (ext === '.css') {
    const u = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
    let m;
    while ((m = u.exec(text))) {
      // Vendored KaTeX lists woff/ttf fallbacks after woff2; only the woff2 files are shipped and used.
      if (isVendor && !/\.woff2$/i.test(m[1])) continue;
      refs++; checkRef(fileRel, baseDir, m[1], lineOf(text, m.index), 'url()');
    }
    if (!isVendor) checkAbsolute(text, fileRel, false);
  } else if (ext === '.js') {
    if (isVendor) return;
    const esm = /^[ \t]*(import|export)[\s{*]/gm;
    let m;
    while ((m = esm.exec(text))) report(errors, fileRel, lineOf(text, m.index), m[1] + ' statement (ES modules are blocked on file://)');
    checkAbsolute(text, fileRel, false);
    // String literals naming site pages, e.g. 'atlas.html#c-' or "m05-control.html#lqr".
    const lit = /(['"`])([a-z0-9-]+\.html)(#[A-Za-z0-9_-]*)?\1/g;
    while ((m = lit.exec(text))) {
      refs++;
      const anchor = m[3] && m[3].length > 1 && !/-$/.test(m[3]) ? m[3] : '';
      if (fileRel.indexOf('tests/') === 0 && fileRel !== 'tests/components.js') continue;
      checkRef(fileRel, SITE, m[2] + anchor, lineOf(text, m.index), 'page literal');
    }
  } else if (ext === '.md') {
    checkAbsolute(text, fileRel, false);
  }
});

/* ---------------------------------------------------------------- module anchors from ADCS.data */
if (data && Array.isArray(data.modules)) {
  data.modules.forEach(function (mod) {
    const page = path.join(SITE, mod.slug);
    if (!fs.existsSync(page)) {
      if (pendingOk) report(pending, 'assets/js/adcs-data.js', 0, 'module page not built yet: ' + mod.slug);
      else report(errors, 'assets/js/adcs-data.js', 0, 'module page missing: ' + mod.slug);
      return;
    }
    const ids = idsOf(page);
    (mod.sections || []).map(function (s) { return s.id; }).concat(['main', 'check', 'provenance']).forEach(function (id) {
      if (!ids.has(id)) report(errors, mod.slug, 0, 'section anchor #' + id + ' (from ADCS.data.modules) is missing');
    });
    // ADCS.data.modules[].widgets drives the learning path's widget counts: it must match the page.
    const html = fs.readFileSync(page, 'utf8');
    const figs = html.match(/<figure\b[^>]*\bclass="(?:[^"]*\s)?widget(?:\s[^"]*)?"/g) || [];
    const listed = (mod.widgets || []).length;
    if (figs.length !== listed) {
      report(errors, mod.slug, 0, figs.length + ' figure.widget element(s) in the page, but ADCS.data.modules lists ' + listed + ' widget(s)');
    }
    const titles = [];
    html.replace(/<h3\b[^>]*\bclass="widget-title"[^>]*>([\s\S]*?)<\/h3>/g, function (m, t) {
      titles.push(t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim());
      return m;
    });
    (mod.widgets || []).forEach(function (w) {
      if (titles.indexOf(w.title) < 0) report(warnings, mod.slug, 0, 'widget ' + w.id + ' "' + w.title + '" (from ADCS.data.modules) has no matching widget title in the page');
    });
  });
}

const out = ['link-check: ' + checked + ' files, ' + refs + ' references checked' + (pendingOk ? ' (--pending-ok)' : '')];
errors.forEach(function (e) { out.push('FAIL ' + e); });
if (!quiet) pending.forEach(function (e) { out.push('pending ' + e); });
if (!quiet) warnings.forEach(function (e) { out.push('warn ' + e); });
out.push('link-check: ' + errors.length + ' error(s), ' + pending.length + ' pending, ' + warnings.length + ' warning(s): ' + (errors.length ? 'FAIL' : 'PASS'));
process.stdout.write(out.join('\n') + '\n');
process.exit(errors.length ? 1 : 0);
