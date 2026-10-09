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
 *   - absolute http(s):// URLs, except XML namespace URIs, plain <a href> links in about.html,
 *     README.md and assets/vendor/LICENSES.md, and the `url` fields of the bibliography
 *     assets/js/adcs-resources.js, which the reading cards render as plain <a href> links
 *     (documented external links the site works without);
 *   - relative href/src/url() targets that do not exist, and #anchors missing from their target
 *     page. Ids that page scripts create from ADCS.data are known: atlas.html#c-<course id>,
 *     glossary.html#g-<term id>, and the chrome's site-nav. Every module's section anchors from
 *     ADCS.data.modules must exist in its page, as must #check and #provenance;
 *   - a module page whose number of figure.widget elements differs from its
 *     ADCS.data.modules[].widgets list (a widget title missing from the page is a warning), or
 *     that lacks its "All resources for this module" link (resources.html#m=<module id>);
 *   - a resources.html deep link (#m=m05&type=paper,book&level=intro&access=free&q=…&sort=year)
 *     with an unknown key or value, or whose filters match no item of ADCS.resources; and a
 *     #fragment with a malformed %-escape.
 * href and src values are read as HTML, so character references such as &amp; are decoded first.
 * Templates (assets/templates/) resolve links from the site root, and {{placeholder}} links are
 * skipped. Hash values with "=" (simulator deep links such as #preset=T03) are not anchors.
 * --pending-ok reports missing top-level pages (built by other packages) as pending, not errors.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PAGES = ['index.html', 'simulator.html', 'learn.html', 'atlas.html', 'glossary.html', 'resources.html', 'about.html', '404.html',
  'm01-requirements.html', 'm02-architecture.html', 'm03-dynamics.html', 'm04-integration.html', 'm05-control.html',
  'm06-actuators.html', 'm07-sensors.html', 'm08-safe-mode.html', 'm09-verification.html', 'm10-software.html',
  'm11-visualisation.html', 'm12-project-risk.html', 'm13-operations.html'];
const EXTERNAL_OK = ['about.html', 'README.md', 'assets/vendor/LICENSES.md'];
// The further-reading bibliography: its absolute URLs are allowed only as the value of a `url` field.
const BIBLIOGRAPHY = 'assets/js/adcs-resources.js';
const RES_SORTS = ['module', 'year', 'title'];
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
let data = null, biblio = null;
const sandbox = { console: console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
try {
  vm.runInContext(fs.readFileSync(path.join(SITE, 'assets/js/adcs-data.js'), 'utf8'), sandbox, { filename: 'adcs-data.js' });
  data = sandbox.ADCS && sandbox.ADCS.data;
} catch (e) {
  report(warnings, 'assets/js/adcs-data.js', 0, 'could not load ADCS.data (' + e.message + '); data-driven anchors are not checked');
}
try {
  vm.runInContext(fs.readFileSync(path.join(SITE, BIBLIOGRAPHY), 'utf8'), sandbox, { filename: 'adcs-resources.js' });
  biblio = sandbox.ADCS && sandbox.ADCS.resources && Array.isArray(sandbox.ADCS.resources.items) ? sandbox.ADCS.resources : null;
} catch (e) {
  report(warnings, BIBLIOGRAPHY, 0, 'could not load ADCS.resources (' + e.message + '); resources.html deep links are not checked');
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
// HTML attribute values hold character references: "&amp;" is the valid way to write "&" in an href.
const NAMED_REFS = { amp: '&', quot: '"', apos: '\'', lt: '<', gt: '>' };
function decodeAttr(s) {
  return s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, function (m, dec, hex, name) {
    if (dec) return String.fromCodePoint(Number(dec));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    const k = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(NAMED_REFS, k) ? NAMED_REFS[k] : m;
  });
}
function decodeOr(s, fallback) { try { return decodeURIComponent(s); } catch (e) { return fallback; } }

function checkRef(fromFile, baseDir, ref, line, kind) {
  const r = ref.trim();
  if (!r || r.indexOf('{{') >= 0) return;
  if (/^(data|mailto|tel|blob|about):/i.test(r)) return;
  if (/^javascript:/i.test(r)) { report(warnings, fromFile, line, kind + ' uses a javascript: URL'); return; }
  if (/^https?:/i.test(r) || r.indexOf('//') === 0) return; // handled by the absolute-URL rule
  const hashAt = r.indexOf('#');
  const p = (hashAt >= 0 ? r.slice(0, hashAt) : r).split('?')[0];
  const rawHash = hashAt >= 0 ? r.slice(hashAt + 1) : '';
  const hash = decodeOr(rawHash, null);
  if (hash === null) { report(errors, fromFile, line, kind + ' has a malformed %-escape in its #fragment: ' + r); return; }
  let target;
  if (!p) target = path.join(SITE, fromFile);
  else if (p.charAt(0) === '/') { report(errors, fromFile, line, kind + ' is root-absolute: ' + r); return; }
  else target = path.resolve(baseDir, decodeOr(p, p));
  const tRel = rel(target);
  if (tRel.indexOf('..') === 0) { report(errors, fromFile, line, kind + ' leaves the site folder: ' + r); return; }
  if (!fs.existsSync(target)) {
    if (pendingOk && PAGES.indexOf(tRel) >= 0) report(pending, fromFile, line, kind + ' target page not built yet: ' + tRel);
    else report(errors, fromFile, line, kind + ' target missing: ' + r);
    return;
  }
  if (hash && hash.indexOf('=') < 0 && /\.html?$/i.test(target)) {
    if (!idsOf(target).has(hash)) report(errors, fromFile, line, kind + ' anchor #' + hash + ' not found in ' + tRel);
  } else if (hash && tRel === 'resources.html') {
    checkResourcesHash(fromFile, line, kind, rawHash);
  }
}

/* resources.html#m=m05&type=paper,book&level=intro&access=free&q=…&sort=year: the keys and values
   resources.js understands, and filters that leave at least one item (the search text is free).
   Like resources.js, the hash is split on "&" before each value is %-decoded. */
function checkResourcesHash(fromFile, line, kind, hash) {
  if (!biblio || !data) { report(warnings, fromFile, line, kind + ' resources.html deep link not checked (data not loaded): #' + hash); return; }
  const items = biblio.items;
  const values = function (key) { return new Set(items.map(function (it) { return it[key]; })); };
  const st = { m: null, type: null, level: null, access: null };
  hash.split('&').forEach(function (pair) {
    const i = pair.indexOf('=');
    const k = i < 0 ? pair : pair.slice(0, i);
    const v = i < 0 ? '' : decodeOr(pair.slice(i + 1).replace(/\+/g, ' '), pair.slice(i + 1));
    const bad = function (what) { report(errors, fromFile, line, kind + ' resources.html#' + hash + ': ' + what); };
    if (k === 'm') { if (!(data.modules || []).some(function (m) { return m.id === v; })) bad('unknown module "' + v + '"'); else st.m = v; }
    else if (k === 'type') {
      const ok = values('type');
      const list = v.split(',');
      list.forEach(function (t) { if (!ok.has(t)) bad('unknown type "' + t + '"'); });
      st.type = list;
    } else if (k === 'level') { if (!values('level').has(v)) bad('unknown level "' + v + '"'); else st.level = v; }
    else if (k === 'access') { if (!values('access').has(v)) bad('unknown access "' + v + '"'); else st.access = v; }
    else if (k === 'sort') { if (RES_SORTS.indexOf(v) < 0) bad('unknown sort "' + v + '"'); }
    else if (k !== 'q') bad('unknown key "' + k + '"');
  });
  const n = items.filter(function (it) {
    return (!st.m || it.modules.indexOf(st.m) >= 0) && (!st.type || st.type.indexOf(it.type) >= 0) &&
      (!st.level || it.level === st.level) && (!st.access || it.access === st.access);
  }).length;
  if (!n) report(errors, fromFile, line, kind + ' resources.html#' + hash + ' matches no resource');
}

function checkAbsolute(text, fileRel, isHtml) {
  const re = /https?:\/\/[^\s"'<>)\\]+/g;
  let m;
  while ((m = re.exec(text))) {
    const url = m[0];
    if (NS_RE.test(url)) continue;
    const line = lineOf(text, m.index);
    if (fileRel === BIBLIOGRAPHY) {
      if (!/\burl:\s*['"]$/.test(text.slice(Math.max(0, m.index - 12), m.index))) {
        report(errors, fileRel, line, 'external URL outside a url field of the bibliography: ' + url);
      }
      continue;
    }
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
    while ((m = re.exec(text))) { refs++; checkRef(fileRel, baseDir, decodeAttr(m[2] !== undefined ? m[2] : m[3]), lineOf(text, m.index), m[1].toLowerCase()); }
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
    if (html.indexOf('href="resources.html#m=' + mod.id + '"') < 0) {
      report(errors, mod.slug, 0, 'no "All resources for this module" link (resources.html#m=' + mod.id + ')');
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
