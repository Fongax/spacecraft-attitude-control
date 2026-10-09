/**
 * adcs-ui.js: ADCS.ui, the shared UI kit.
 *
 * Chrome (header, navigation, theme toggle, footer, breadcrumb and module strip), storage,
 * DOM helpers, number formatting, controls (slider, toggle, segmented, select, button, chip),
 * tags and badges, widget cards, callouts, the "Where this came from" provenance box, quizzes,
 * simulation displays (mode pill, annunciator, requirement badges, metrics table), popovers,
 * tabs, downloads, KaTeX typesetting and glossary term links.
 *
 * The file touches `document` only inside functions, so it can be loaded anywhere.
 * Controls return {el, value, set(v), on('change', fn)}; set() does not fire 'change'.
 */
(function (root) { 'use strict';
  const ADCS = root.ADCS = root.ADCS || {};
  const ui = ADCS.ui = ADCS.ui || {};

  const SITE_NAME = 'Attitude Control: The Big Picture';
  const MINUS = '−';
  const NBSP = ' ';
  let BASE = '';   // prefix for generated site links; '' for root pages, '../' for tests/ pages
  let uidCounter = 0;

  /* ================================================================ small utilities */

  /**
   * Unique id with a prefix.
   * @param {string} [prefix='adcs'] @returns {string}
   */
  function uid(prefix) { uidCounter += 1; return (prefix || 'adcs') + '-' + uidCounter; }
  ui.uid = uid;

  /** @returns {string} the prefix used for generated site links ('' or '../'). */
  ui.base = function () { return BASE; };

  /**
   * Resolve a CSS custom property on an element (default: the root element).
   * @param {string} name e.g. '--accent' @param {Element} [elem] @returns {string}
   */
  ui.cssVar = function (name, elem) {
    const node = elem || document.documentElement;
    return root.getComputedStyle(node).getPropertyValue(name).trim();
  };

  /** @returns {boolean} true when the reader asked for reduced motion. */
  ui.prefersReducedMotion = function () {
    try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  };

  function moduleData(id) {
    const D = ADCS.data;
    return D && typeof D.module === 'function' ? D.module(id) : null;
  }
  function modulesList() { return (ADCS.data && Array.isArray(ADCS.data.modules)) ? ADCS.data.modules : []; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ================================================================ storage */

  const memory = new Map();
  /**
   * Storage that never throws: localStorage when available, an in-memory map otherwise.
   * Strings are stored as they are; other values as JSON. get() parses JSON and falls back
   * to the raw string, so a stored 'dark' reads back as 'dark'.
   */
  ui.storage = {
    /** @param {string} k @param {*} [def] default when nothing is stored @returns {*} */
    get: function (k, def) {
      let raw = null;
      try { raw = root.localStorage.getItem(k); } catch (e) { raw = null; }
      if (raw === null && memory.has(k)) raw = memory.get(k);
      if (raw === null || raw === undefined) return def;
      try { return JSON.parse(raw); } catch (e) { return raw; }
    },
    /** @param {string} k @param {*} v @returns {boolean} true if persisted in localStorage */
    set: function (k, v) {
      const raw = typeof v === 'string' ? v : JSON.stringify(v);
      memory.set(k, raw);
      try { root.localStorage.setItem(k, raw); return true; } catch (e) { return false; }
    },
    /** @param {string} k */
    remove: function (k) {
      memory.delete(k);
      try { root.localStorage.removeItem(k); } catch (e) { /* storage blocked: nothing persisted */ }
    }
  };

  /* ================================================================ lifecycle */

  /**
   * Run fn once the DOM is ready. Errors are caught, shown inline at the top of <main>
   * and reported once to the console, so a broken widget never leaves an uncaught exception.
   * @param {Function} fn
   */
  ui.ready = function (fn) {
    function run() {
      try { fn(); } catch (err) { reportError(err); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
  };

  function reportError(err) {
    const msg = err && err.message ? err.message : String(err);
    if (root.console && root.console.error) root.console.error('[ADCS] page setup failed:', err);
    const main = document.getElementById('main') || document.body;
    if (!main) return;
    const box = ui.callout('error', 'Part of this page could not be set up', 'Details: ' + msg);
    box.classList.add('page-error', 'container');
    main.insertBefore(box, main.firstChild);
  }

  /* ================================================================ theme */

  const THEMES = ['system', 'light', 'dark'];
  const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' };
  let themeListenersOn = false;

  function systemDark() {
    try { return !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { return false; }
  }
  function applyTheme(t) {
    const html = document.documentElement;
    if (t === 'light' || t === 'dark') html.setAttribute('data-theme', t);
    else html.removeAttribute('data-theme');
  }
  function dispatchTheme() {
    const detail = { theme: ui.theme.get(), effective: ui.theme.effective() };
    let ev;
    try { ev = new root.CustomEvent('adcs:themechange', { detail: detail }); } catch (e) { ev = null; }
    if (ev) root.dispatchEvent(ev);
    updateThemeButtons();
  }
  function ensureThemeListeners() {
    if (themeListenersOn) return;
    themeListenersOn = true;
    try {
      const mq = root.matchMedia('(prefers-color-scheme: dark)');
      const onChange = function () { if (ui.theme.get() === 'system') dispatchTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    } catch (e) { /* matchMedia unavailable */ }
    root.addEventListener('storage', function (e) {
      if (e.key !== 'adcs-theme') return;
      applyTheme(ui.theme.get());
      dispatchTheme();
    });
  }

  /** Theme preference: 'system' (follow the OS), 'light' or 'dark'. */
  ui.theme = {
    /** @returns {'system'|'light'|'dark'} the stored choice */
    get: function () {
      const t = ui.storage.get('adcs-theme', 'system');
      return THEMES.indexOf(t) >= 0 ? t : 'system';
    },
    /**
     * Set and store the theme, update html[data-theme] and dispatch 'adcs:themechange' on window.
     * @param {'system'|'light'|'dark'} t
     */
    set: function (t) {
      const v = THEMES.indexOf(t) >= 0 ? t : 'system';
      if (v === 'system') ui.storage.remove('adcs-theme'); else ui.storage.set('adcs-theme', v);
      applyTheme(v);
      ensureThemeListeners();
      dispatchTheme();
    },
    /** @returns {'light'|'dark'} the theme actually shown */
    effective: function () {
      const a = document.documentElement.getAttribute('data-theme');
      if (a === 'light' || a === 'dark') return a;
      return systemDark() ? 'dark' : 'light';
    },
    /** Cycle System → Light → Dark → System. @returns {string} the new choice */
    cycle: function () {
      const next = THEMES[(THEMES.indexOf(ui.theme.get()) + 1) % THEMES.length];
      ui.theme.set(next);
      return next;
    }
  };

  /* ================================================================ DOM helpers */

  const PROPS = { value: 1, checked: 1, selected: 1, indeterminate: 1, muted: 1 };
  function applyAttrs(node, attrs) {
    if (!attrs) return;
    Object.keys(attrs).forEach(function (k) {
      const v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'class' || k === 'className') {
        const cls = Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v);
        if (cls) node.setAttribute('class', cls);
      } else if (k === 'text') {
        node.textContent = String(v);
      } else if (k === 'html') {
        node.innerHTML = String(v);
      } else if (k === 'style') {
        if (typeof v === 'string') node.setAttribute('style', v);
        else Object.keys(v).forEach(function (p) {
          if (p.slice(0, 2) === '--') node.style.setProperty(p, v[p]); else node.style[p] = v[p];
        });
      } else if (k === 'dataset') {
        Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
      } else if (k === 'on') {
        Object.keys(v).forEach(function (evt) { node.addEventListener(evt, v[evt]); });
      } else if (typeof v === 'function' && k.slice(0, 2) === 'on') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (PROPS[k]) {
        node[k] = v;
      } else if (v === true) {
        node.setAttribute(k, '');
      } else {
        node.setAttribute(k, String(v));
      }
    });
  }
  function appendChildren(node, children) {
    children.forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) { appendChildren(node, c); return; }
      node.appendChild(typeof c === 'object' && c.nodeType ? c : document.createTextNode(String(c)));
    });
  }

  /**
   * Create an element. attrs: class (string|array), text, html (trusted strings only), style
   * (string|object, '--x' keys allowed), dataset, on {event: fn}, onClick-style handlers,
   * value/checked properties, booleans (true → empty attribute, false/null → omitted).
   * @param {string} tag @param {Object} [attrs] @param {...(Node|string|Array)} children
   * @returns {HTMLElement}
   */
  function el(tag, attrs) {
    const node = document.createElement(tag);
    applyAttrs(node, attrs);
    appendChildren(node, Array.prototype.slice.call(arguments, 2));
    return node;
  }
  ui.el = el;

  /**
   * Create an SVG element (same attrs as el, except class is set as an attribute).
   * @param {string} tag @param {Object} [attrs] @param {...Node} children @returns {SVGElement}
   */
  function svg(tag, attrs) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    applyAttrs(node, attrs);
    appendChildren(node, Array.prototype.slice.call(arguments, 2));
    return node;
  }
  ui.svg = svg;

  /** @param {string} sel @param {ParentNode} [scope=document] @returns {Element|null} */
  ui.qs = function (sel, scope) { return (scope || document).querySelector(sel); };
  /** @param {string} sel @param {ParentNode} [scope=document] @returns {Element[]} */
  ui.qsa = function (sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); };

  /**
   * Debounce: fn runs once, ms after the last call. The result has cancel() and flush().
   * @param {Function} fn @param {number} ms @returns {Function}
   */
  ui.debounce = function (fn, ms) {
    let timer = null, lastArgs = null, lastThis = null;
    function d() {
      lastArgs = arguments; lastThis = this;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { timer = null; fn.apply(lastThis, lastArgs); }, ms);
    }
    d.cancel = function () { if (timer) clearTimeout(timer); timer = null; };
    d.flush = function () { if (timer) { clearTimeout(timer); timer = null; fn.apply(lastThis, lastArgs); } };
    return d;
  };

  /* ================================================================ formatting */

  const NO_SPACE_UNITS = { '°': 1, '%': 1, '′': 1, '″': 1 };
  const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
  function withUnit(s, unit) {
    if (!unit) return s;
    return NO_SPACE_UNITS[unit.charAt(0)] ? s + unit : s + NBSP + unit;
  }
  function niceMinus(s) {
    if (s.charAt(0) !== '-') return s;
    return Number(s) === 0 ? s.slice(1) : MINUS + s.slice(1);
  }

  /**
   * Format a number for display: significant digits (default 3, trailing zeros dropped) or
   * fixed decimals, a proper minus sign and an optional unit ('°' and '%' attach directly).
   * Non-finite values give an en dash. Very small or large magnitudes switch to fmtSci.
   * @param {number} x @param {{sig?:number, fixed?:number, unit?:string, sign?:boolean}|number} [o]
   * @returns {string}
   */
  ui.fmt = function (x, o) {
    const opt = typeof o === 'number' ? { sig: o } : (o || {});
    if (typeof x !== 'number' || !isFinite(x)) return '–';
    let s;
    if (opt.fixed !== undefined && opt.fixed !== null) {
      s = x.toFixed(opt.fixed);
    } else {
      const sig = opt.sig || 3;
      const ax = Math.abs(x);
      if (x === 0) s = '0';
      else if (ax < 1e-4 || ax >= 1e6) return withUnit((opt.sign && x > 0 ? '+' : '') + ui.fmtSci(x, sig), opt.unit);
      else s = String(Number(x.toPrecision(sig)));
    }
    s = niceMinus(s);
    if (opt.sign && x > 0 && Number(s) !== 0) s = '+' + s;
    return withUnit(s, opt.unit);
  };

  /**
   * Scientific notation with a Unicode exponent, e.g. 1.50×10⁻⁵.
   * @param {number} x @param {number} [sig=3] significant digits @returns {string}
   */
  ui.fmtSci = function (x, sig) {
    const n = sig || 3;
    if (typeof x !== 'number' || !isFinite(x)) return '–';
    if (x === 0) return '0';
    let e = Math.floor(Math.log10(Math.abs(x)));
    let m = x / Math.pow(10, e);
    let ms = m.toFixed(n - 1);
    if (Math.abs(Number(ms)) >= 10) { e += 1; m = x / Math.pow(10, e); ms = m.toFixed(n - 1); }
    const exp = String(e).split('').map(function (c) { return SUP[c] || c; }).join('');
    return niceMinus(ms) + '×10' + exp;
  };

  /**
   * Format a time in seconds: "4.25 s", "47.5 s", "2 min 5 s", "1 h 30 min".
   * Rounds before it splits, so 719.9999 s is "12 min" and 59.99 s is "1 min", never "60 s".
   * @param {number} t seconds @returns {string}
   */
  ui.fmtTime = function (t) {
    if (typeof t !== 'number' || !isFinite(t)) return '–';
    const a = Math.abs(t), sign = t < 0 ? MINUS : '';
    if (a < 9.995) return sign + ui.fmt(a, { fixed: 2, unit: 's' });
    if (a < 59.95) return sign + ui.fmt(a, { fixed: 1, unit: 's' });
    const sec = Math.round(a);
    if (sec < 3600) {
      const m = Math.floor(sec / 60), s = sec - 60 * m;
      return sign + m + NBSP + 'min' + (s ? ' ' + s + NBSP + 's' : '');
    }
    const mins = Math.round(sec / 60), h = Math.floor(mins / 60), mm = mins - 60 * h;
    return sign + h + NBSP + 'h' + (mm ? ' ' + mm + NBSP + 'min' : '');
  };

  /* ================================================================ icons */

  const ICONS = {
    check: 'M5 12.5l4.5 4.5L19 7',
    cross: 'M6 6l12 12M18 6L6 18',
    dash: 'M6 12h12',
    info: 'M12 2.5a9.5 9.5 0 1 0 0 19a9.5 9.5 0 1 0 0-19zM12 11v6M12 7.5h.01',
    warn: 'M12 3.5l9.5 17h-19L12 3.5zM12 10v4.5M12 17.5h.01',
    ext: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8',
    play: 'M7 4.5l12 7.5-12 7.5V4.5z',
    pause: 'M8 5v14M16 5v14',
    'step-back': 'M18 6l-8 6 8 6V6zM6 6v12',
    'step-fwd': 'M6 6l8 6-8 6V6zM18 6v12',
    reset: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5',
    copy: 'M8 8h11v11H8zM5 15.5V5h10.5',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    menu: 'M4 7h16M4 12h16M4 17h16',
    sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
    system: 'M3 5h18v11H3zM8 20h8M12 16v4',
    'chevron-right': 'M9 6l6 6-6 6',
    'chevron-left': 'M15 6l-6 6 6 6',
    'arrow-right': 'M5 12h14M13 6l6 6-6 6',
    external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    sim: 'M12 2.5a9.5 9.5 0 1 0 0 19a9.5 9.5 0 1 0 0-19zM10 8l6 4-6 4V8z',
    sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
    ring: 'M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14z',
    alert: 'M12 5.5v8M12 18.5h.01'
  };
  const SHAPES = {
    circle: function () { return svg('circle', { cx: 12, cy: 12, r: 8, fill: 'currentColor' }); },
    triangle: function () { return svg('path', { d: 'M12 3.5l9 16h-18z', fill: 'currentColor' }); },
    square: function () { return svg('rect', { x: 4.5, y: 4.5, width: 15, height: 15, rx: 1.5, fill: 'currentColor' }); }
  };

  /**
   * Inline SVG icon (24×24, stroke = currentColor), aria-hidden unless a label is given.
   * Names: check cross dash info warn ext play pause step-back step-fwd reset copy download
   * link menu sun moon system chevron-right chevron-left arrow-right external sim sliders ring alert,
   * plus filled shapes circle triangle square.
   * @param {string} name @param {{label?:string, size?:number}} [o] @returns {SVGElement}
   */
  ui.icon = function (name, o) {
    const opt = o || {};
    const s = svg('svg', {
      viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', focusable: 'false', class: 'icon icon-' + name
    });
    if (opt.size) { s.setAttribute('width', opt.size); s.setAttribute('height', opt.size); }
    if (opt.label) { s.setAttribute('role', 'img'); s.setAttribute('aria-label', opt.label); }
    else s.setAttribute('aria-hidden', 'true');
    if (SHAPES[name]) { s.setAttribute('stroke', 'none'); s.appendChild(SHAPES[name]()); }
    else s.appendChild(svg('path', { d: ICONS[name] || ICONS.dash }));
    return s;
  };

  /** Site logo: a cube with three body axes. @returns {SVGElement} */
  function logo() {
    const s = svg('svg', { viewBox: '0 0 32 32', class: 'brand-logo', 'aria-hidden': 'true', focusable: 'false' });
    const edge = { fill: 'none', style: 'stroke:var(--text-2)', 'stroke-width': 1.6, 'stroke-linejoin': 'round' };
    s.appendChild(svg('path', Object.assign({ d: 'M16 6l9 4.5v10L16 25l-9-4.5v-10z' }, edge)));
    s.appendChild(svg('path', Object.assign({ d: 'M7 10.5l9 4.5 9-4.5M16 15v10' }, edge)));
    const ax = function (d, v) {
      return svg('path', { d: d, fill: 'none', style: 'stroke:var(' + v + ')', 'stroke-width': 2.2, 'stroke-linecap': 'round' });
    };
    s.appendChild(ax('M16 15l-9.5 6.5', '--axis-x'));
    s.appendChild(ax('M16 15l10.5 4.5', '--axis-y'));
    s.appendChild(ax('M16 15V2.5', '--axis-z'));
    return s;
  }

  /* ================================================================ chrome */

  const NAV = [
    { id: 'index', href: 'index.html', label: 'Big picture' },
    { id: 'simulator', href: 'simulator.html', label: 'Simulator' },
    { id: 'learn', href: 'learn.html', label: 'Learn' },
    { id: 'atlas', href: 'atlas.html', label: 'Atlas' },
    { id: 'glossary', href: 'glossary.html', label: 'Glossary' },
    { id: 'about', href: 'about.html', label: 'About' }
  ];

  function normalisePage(p) {
    const s = String(p || '').replace(/\.html$/, '');
    if (s === 'landing' || s === '' || s === 'big-picture') return 'index';
    const m = s.match(/^m(\d{2})(?:-|$)/);
    return m ? 'm' + m[1] : s;
  }

  function buildHeader(page) {
    const isModule = /^m\d\d$/.test(page);
    const header = el('header', { class: 'site-header' });
    const inner = el('div', { class: 'container header-inner' });
    const brand = el('a', { class: 'brand', href: BASE + 'index.html', 'aria-label': SITE_NAME + ', home' },
      logo(), el('span', { class: 'brand-text' }, 'Attitude Control', el('span', { class: 'brand-sub' }, ': The Big Picture')));
    const navToggle = el('button', {
      type: 'button', class: 'nav-toggle', 'aria-expanded': 'false', 'aria-controls': 'site-nav'
    }, ui.icon('menu'), el('span', { class: 'nav-label' }, 'Menu'));
    navToggle.setAttribute('aria-label', 'Menu');
    const list = el('ul');
    NAV.forEach(function (n) {
      const a = el('a', { href: BASE + n.href }, n.label);
      if (n.id === page) a.setAttribute('aria-current', 'page');
      else if (isModule && n.id === 'learn') a.setAttribute('aria-current', 'true');
      list.appendChild(el('li', null, a));
    });
    const nav = el('nav', { id: 'site-nav', class: 'site-nav', 'aria-label': 'Main' }, list);
    const themeBtn = el('button', { type: 'button', class: 'theme-toggle' });
    themeBtn.addEventListener('click', function () { ui.theme.cycle(); });
    function setOpen(open) {
      header.classList.toggle('nav-open', open);
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    navToggle.addEventListener('click', function () { setOpen(!header.classList.contains('nav-open')); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    header.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('nav-open')) { setOpen(false); navToggle.focus(); }
    });
    inner.appendChild(brand);
    inner.appendChild(nav);
    inner.appendChild(themeBtn);
    inner.appendChild(navToggle);
    header.appendChild(inner);
    return header;
  }

  function updateThemeButtons() {
    const t = ui.theme.get();
    const next = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];
    ui.qsa('.theme-toggle').forEach(function (b) {
      b.textContent = '';
      b.appendChild(ui.icon(t === 'system' ? 'system' : t === 'light' ? 'sun' : 'moon'));
      b.appendChild(el('span', { class: 'theme-label' }, 'Theme: ' + THEME_LABEL[t]));
      b.setAttribute('aria-label', 'Theme: ' + THEME_LABEL[t] + ' (switch to ' + THEME_LABEL[next] + ')');
      b.setAttribute('title', 'Theme: ' + THEME_LABEL[t] + '. Click for ' + THEME_LABEL[next] + '.');
    });
  }

  function buildFooter() {
    return el('footer', { class: 'site-footer' },
      el('div', { class: 'container' },
        el('p', null, 'An educational reconstruction of a student spacecraft attitude-control simulation project. ' +
          'Subjects are described by generic name and subject matter only.'),
        el('ul', { class: 'footer-links' },
          el('li', null, el('a', { href: BASE + 'about.html' }, 'About')),
          el('li', null, el('a', { href: BASE + 'glossary.html' }, 'Glossary')),
          el('li', null, el('a', { href: BASE + 'about.html#licences' }, 'Licences'))),
        el('p', null, 'Works offline: open ', el('code', null, 'index.html'), ' directly.')));
  }

  function readSet() {
    const v = ui.storage.get('adcs-read', null);
    const set = new Set();
    if (Array.isArray(v)) v.forEach(function (id) { set.add(String(id)); });
    else if (v && typeof v === 'object') Object.keys(v).forEach(function (id) { if (v[id]) set.add(id); });
    return set;
  }

  /**
   * Breadcrumb for a module page: "Learn › 05 Control design".
   * @param {string} moduleId @returns {HTMLElement|null}
   */
  ui.breadcrumb = function (moduleId) {
    const m = moduleData(moduleId);
    if (!m) return null;
    return el('nav', { class: 'breadcrumb', 'aria-label': 'Breadcrumb' },
      el('ol', null,
        el('li', null, el('a', { href: BASE + 'learn.html' }, 'Learn')),
        el('li', { 'aria-current': 'page' }, pad2(m.num) + ' ' + m.title)));
  };

  /**
   * Progress strip: one dot per module linking to it; the current one is highlighted and
   * modules marked as read (localStorage 'adcs-read') are filled.
   * @param {string} moduleId @returns {HTMLElement|null}
   */
  ui.moduleStrip = function (moduleId) {
    const mods = modulesList();
    if (!mods.length) return null;
    const read = readSet();
    const cur = moduleData(moduleId);
    const ol = el('ol');
    mods.forEach(function (m) {
      const label = pad2(m.num) + ' ' + m.title + (m.extension ? ' (extension)' : '') +
        (read.has(m.id) ? ', read' : '') + (m.id === moduleId ? ', current module' : '');
      const a = el('a', {
        href: BASE + m.slug, title: pad2(m.num) + ' ' + m.title, 'aria-label': label,
        class: [read.has(m.id) ? 'is-read' : '', m.extension ? 'is-ext' : '']
      }, el('span', { class: 'dot', 'aria-hidden': 'true' }));
      if (m.id === moduleId) a.setAttribute('aria-current', 'page');
      ol.appendChild(el('li', null, a));
    });
    return el('nav', { class: 'module-strip', 'aria-label': 'Modules' },
      cur ? el('span', { class: 'module-strip-label' }, 'Module ' + cur.num + ' of ' + mods.length) : null, ol);
  };

  /**
   * Previous/next links for a module page.
   * @param {string} moduleId @param {HTMLElement} [nav] an existing nav.module-pager to fill
   * @returns {HTMLElement}
   */
  ui.pager = function (moduleId, nav) {
    const mods = modulesList();
    const i = mods.findIndex(function (m) { return m.id === moduleId; });
    const box = nav || el('nav', { class: 'module-pager pager', 'aria-label': 'Previous and next module' });
    box.classList.add('pager');
    if (!box.getAttribute('aria-label')) box.setAttribute('aria-label', 'Previous and next module');
    box.textContent = '';
    function link(cls, dir, href, title) {
      return el('a', { class: cls, href: BASE + href }, el('span', { class: 'pager-dir' }, dir), el('span', { class: 'pager-title' }, title));
    }
    if (i > 0) box.appendChild(link('prev', 'Previous', mods[i - 1].slug, pad2(mods[i - 1].num) + ' ' + mods[i - 1].title));
    else box.appendChild(link('prev', 'Back', 'learn.html', 'Learning path'));
    if (i >= 0 && i < mods.length - 1) box.appendChild(link('next', 'Next', mods[i + 1].slug, pad2(mods[i + 1].num) + ' ' + mods[i + 1].title));
    else box.appendChild(link('next', 'Next', 'atlas.html', 'Subjects atlas'));
    return box;
  };

  function isEmpty(node) { return node && !node.children.length && !node.textContent.trim(); }

  function fillModuleParts(moduleId) {
    const m = moduleData(moduleId);
    if (!m) return;
    const pager = ui.qs('nav.module-pager');
    if (pager && isEmpty(pager)) ui.pager(moduleId, pager);
    const pre = ui.qs('[data-auto="prereqs"]');
    if (pre && isEmpty(pre)) {
      const ids = m.prereqs || [];
      pre.appendChild(document.createTextNode('Prerequisites: '));
      if (!ids.length) pre.appendChild(document.createTextNode('none; this is a good place to start.'));
      ids.forEach(function (id, k) {
        const p = moduleData(id);
        if (!p) return;
        if (k) pre.appendChild(document.createTextNode(k === ids.length - 1 ? ' and ' : ', '));
        pre.appendChild(el('a', { href: BASE + p.slug }, pad2(p.num) + ' ' + p.title));
      });
      if (ids.length) pre.appendChild(document.createTextNode('.'));
    }
    const sims = ui.qs('[data-auto="simlinks"]');
    if (sims && isEmpty(sims)) {
      const links = m.simLinks || [];
      links.forEach(function (s) { sims.appendChild(el('li', null, ui.simLink(s.label, s.hash))); });
      // a module without simulator links (m12) hides the whole "Try it in the simulator" aside
      const aside = sims.closest('.sim-links');
      if (!links.length && aside) aside.hidden = true;
    }
    const obj = ui.qs('[data-auto="objectives"]');
    if (obj && isEmpty(obj)) (m.objectives || []).forEach(function (t) { obj.appendChild(el('li', null, t)); });
    fillFedBy(m);
    fillReadToggle(m, pager);
  }

  /** Hero line "Fed by N subjects from M disciplines" with a dot and count per discipline (links to #provenance). */
  function fillFedBy(m) {
    const D = ADCS.data;
    if (!D || typeof D.mappingsFor !== 'function') return;
    let slot = ui.qs('[data-auto="fed"]');
    if (slot && !isEmpty(slot)) return;
    if (!slot) {
      const hero = ui.qs('.module-hero');
      if (!hero || ui.qs('.module-fed', hero)) return;
      slot = el('div', { 'data-auto': 'fed' });
      const after = ui.qs('.module-meta', hero);
      if (after && after.parentNode === hero) hero.insertBefore(slot, after.nextSibling); else hero.appendChild(slot);
    }
    const rows = D.mappingsFor(m.id);
    if (!rows.length) { slot.hidden = true; return; }
    const groups = D.byDiscipline(rows);
    slot.classList.add('module-fed');
    const text = 'Fed by ' + rows.length + (rows.length === 1 ? ' subject' : ' subjects') + ' from ' +
      groups.length + (groups.length === 1 ? ' discipline' : ' disciplines');
    const target = document.getElementById('provenance') ? '#provenance' : BASE + 'atlas.html';
    slot.appendChild(el('a', { href: target }, text));
    const list = el('ul', { class: 'module-fed-list', 'aria-label': 'Subjects per discipline' });
    groups.forEach(function (g) {
      list.appendChild(el('li', null,
        el('span', { class: 'prov-dot', 'aria-hidden': 'true', style: { '--dot': 'var(' + g.discipline.color + ')' } }),
        g.discipline.name + NBSP + '(' + g.rows.length + ')'));
    });
    slot.appendChild(list);
  }

  /** "Mark this module as read" switch next to the pager; shares localStorage 'adcs-read' with learn.html. */
  function fillReadToggle(m, pager) {
    let slot = ui.qs('[data-auto="read"]');
    if (slot && !isEmpty(slot)) return;
    if (!slot) {
      if (!pager || !pager.parentNode || ui.qs('.module-read')) return;
      slot = el('div', { 'data-auto': 'read' });
      pager.parentNode.insertBefore(slot, pager);
    }
    slot.classList.add('module-read');
    const sw = ui.toggle({
      label: 'Mark this module as read', checked: readSet().has(m.id),
      help: 'Kept in this browser only. The dots at the top and the learning path show it too.'
    });
    sw.on('change', function (on) {
      const set = readSet();
      if (on) set.add(m.id); else set.delete(m.id);
      // same format as learn.js: an array of module ids in module order
      ui.storage.set('adcs-read', modulesList().map(function (x) { return x.id; }).filter(function (id) { return set.has(id); }));
      const old = ui.qs('.chrome-crumbs .module-strip');
      const strip = ui.moduleStrip(m.id);
      if (old && strip) old.replaceWith(strip);
    });
    slot.appendChild(sw.el);
  }

  /**
   * Inject the global chrome: skip link, header with navigation and theme toggle, footer, and on
   * module pages the breadcrumb, module strip, pager and empty [data-auto] parts (prereqs,
   * simlinks, objectives). Replaces [data-chrome="header"|"footer"|"crumbs"] slots when present.
   * @param {{page?:string, base?:string}} [opts] page: 'index', 'simulator', 'learn', 'atlas',
   *   'glossary', 'about' or 'm01'…'m13' (default: body[data-page]); base: link prefix ('../' for tests/)
   * @returns {{header:HTMLElement, footer:HTMLElement}}
   */
  ui.mountChrome = function (opts) {
    const o = opts || {};
    if (typeof o.base === 'string') BASE = o.base;
    const body = document.body;
    const page = normalisePage(o.page || body.getAttribute('data-page'));
    ensureThemeListeners();
    applyTheme(ui.theme.get());

    let skip = ui.qs('.skip-link');
    if (!skip) {
      skip = el('a', { class: 'skip-link', href: '#main' }, 'Skip to content');
      body.insertBefore(skip, body.firstChild);
    }
    const main = document.getElementById('main');
    if (main && !main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    // Move focus without touching location.hash: atlas and simulator keep their state in the hash.
    // href="#main" stays as the fallback without JavaScript.
    if (!skip.dataset.bound) {
      skip.dataset.bound = '1';
      skip.addEventListener('click', function (e) {
        const m = document.getElementById('main');
        if (!m) return;
        e.preventDefault();
        if (!m.hasAttribute('tabindex')) m.setAttribute('tabindex', '-1');
        m.focus({ preventScroll: true });
        m.scrollIntoView({ block: 'start' });
      });
    }

    const header = buildHeader(page);
    const oldHeader = ui.qs('header.site-header') || ui.qs('[data-chrome="header"]');
    if (oldHeader) oldHeader.replaceWith(header); else body.insertBefore(header, skip.nextSibling);

    const footer = buildFooter();
    const oldFooter = ui.qs('footer.site-footer') || ui.qs('[data-chrome="footer"]');
    if (oldFooter) oldFooter.replaceWith(footer); else body.appendChild(footer);

    if (/^m\d\d$/.test(page) && moduleData(page)) {
      let slot = ui.qs('[data-chrome="crumbs"]');
      if (!slot) {
        slot = el('div', { class: 'container', 'data-chrome': 'crumbs' });
        if (main) main.insertBefore(slot, main.firstChild);
      }
      slot.textContent = '';
      slot.classList.add('chrome-crumbs');
      slot.appendChild(ui.breadcrumb(page));
      const strip = ui.moduleStrip(page);
      if (strip) slot.appendChild(strip);
      fillModuleParts(page);
    }
    updateThemeButtons();
    return { header: header, footer: footer };
  };

  /* ================================================================ live region */

  let live = null;
  /** @returns {HTMLElement} the shared polite live region (created on first use). */
  ui.liveRegion = function () {
    if (live && live.isConnected) return live;
    live = el('div', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', id: 'adcs-live' });
    document.body.appendChild(live);
    return live;
  };
  /**
   * Announce a status message through the shared live region.
   * @param {string} msg
   */
  ui.announce = function (msg) {
    const r = ui.liveRegion();
    r.textContent = '';
    setTimeout(function () { r.textContent = msg; }, 40);
  };

  /* ================================================================ controls */

  function makeControl(rootEl, getV, setV) {
    const handlers = {};
    const api = {
      el: rootEl,
      get value() { return getV(); },
      set: function (v) { setV(v); return api; },
      on: function (evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); return api; },
      emit: function (evt) {
        const name = evt || 'change';
        const v = getV();
        (handlers[name] || []).forEach(function (fn) { fn(v, api); });
        if (name === 'change') (handlers.input || []).forEach(function (fn) { fn(v, api); });
      }
    };
    return api;
  }

  function decimalsOf(step) {
    if (!isFinite(step) || step <= 0) return 3;
    const s = String(step);
    if (s.indexOf('e-') >= 0) return parseInt(s.split('e-')[1], 10);
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
  }

  function fieldHead(id, label, unit, tag) {
    const lab = el('label', { for: id, id: id + '-label', class: 'field-label' }, label,
      unit ? el('span', { class: 'unit' }, ' (' + unit + ')') : null);
    return el('div', { class: 'field-head' }, lab, tag ? ui.tag(tag) : null);
  }

  /**
   * Slider with a synchronised number input, unit and optional tag chip and help text.
   * With log:true the track is logarithmic (min must be > 0).
   * @param {{id?:string, label:string, min:number, max:number, step?:number, value:number,
   *   unit?:string, log?:boolean, tag?:string, help?:string, sig?:number}} o
   * @returns {{el:HTMLElement, value:number, set:Function, on:Function, range:HTMLInputElement,
   *   number:HTMLInputElement, disable:Function}}
   */
  ui.slider = function (o) {
    const id = o.id || uid('slider');
    const min = Number(o.min), max = Number(o.max);
    const log = !!o.log && min > 0;
    const step = o.step !== undefined ? Number(o.step) : (log ? 0 : (max - min) / 100);
    const dec = decimalsOf(step);
    const sig = o.sig || 3;
    const N = 1000;
    let current = clampNum(Number(o.value), min, max);

    function clampNum(v, a, b) { return Math.min(b, Math.max(a, isFinite(v) ? v : a)); }
    function toPos(v) { return log ? Math.round(N * (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min))) : v; }
    function fromPos(p) {
      if (!log) return Number(p);
      return Number(Math.exp(Math.log(min) + (Number(p) / N) * (Math.log(max) - Math.log(min))).toPrecision(sig));
    }
    function show(v) { return log ? String(Number(v.toPrecision(sig))) : (step > 0 ? v.toFixed(dec) : String(v)); }

    const range = el('input', {
      type: 'range', id: id, min: log ? 0 : min, max: log ? N : max, step: log ? 1 : (step > 0 ? step : 'any'),
      'aria-describedby': o.help ? id + '-help' : null
    });
    const number = el('input', {
      type: 'number', id: id + '-num', min: min, max: max, step: log ? 'any' : (step > 0 ? step : 'any'),
      inputmode: 'decimal', 'aria-labelledby': id + '-label', 'aria-describedby': o.help ? id + '-help' : null
    });
    const unitEl = o.unit ? el('span', { class: 'unit', 'aria-hidden': 'true' }, o.unit) : null;
    const wrap = el('div', { class: 'field slider-row' },
      fieldHead(id, o.label, null, o.tag),
      el('div', { class: 'slider-inputs' }, range, number, unitEl),
      o.help ? el('p', { class: 'field-help', id: id + '-help' }, o.help) : null);

    function paint() {
      range.value = String(toPos(current));
      const lo = Number(range.min), hi = Number(range.max);
      const pct = hi > lo ? (100 * (Number(range.value) - lo) / (hi - lo)) : 0;
      range.style.setProperty('--fill', pct.toFixed(2) + '%');
      range.setAttribute('aria-valuetext', ui.fmt(current, { sig: 4, unit: o.unit }));
    }
    function setValue(v) {
      current = clampNum(Number(v), min, max);
      number.value = show(current);
      number.removeAttribute('aria-invalid');
      paint();
    }
    const api = makeControl(wrap, function () { return current; }, setValue);
    range.addEventListener('input', function () {
      current = clampNum(fromPos(range.value), min, max);
      number.value = show(current);
      number.removeAttribute('aria-invalid');
      paint();
      api.emit('change');
    });
    number.addEventListener('input', function () {
      const v = parseFloat(number.value);
      if (!isFinite(v) || v < min || v > max) { number.setAttribute('aria-invalid', 'true'); return; }
      number.removeAttribute('aria-invalid');
      current = v;
      paint();
      api.emit('change');
    });
    number.addEventListener('change', function () {
      const v = parseFloat(number.value);
      const was = current;
      setValue(isFinite(v) ? v : was);
      if (current !== was) api.emit('change');
    });
    setValue(current);
    api.range = range;
    api.number = number;
    /** @param {boolean} off */
    api.disable = function (off) { range.disabled = !!off; number.disabled = !!off; return api; };
    return api;
  };

  /**
   * Switch-styled checkbox (role="switch").
   * @param {{id?:string, label:string, checked?:boolean, tag?:string, help?:string}} o
   * @returns {{el:HTMLElement, value:boolean, set:Function, on:Function, input:HTMLInputElement}}
   */
  ui.toggle = function (o) {
    const id = o.id || uid('toggle');
    const input = el('input', { type: 'checkbox', role: 'switch', id: id, checked: !!o.checked, 'aria-describedby': o.help ? id + '-help' : null });
    const wrap = el('div', { class: 'field toggle-field' },
      el('div', { class: 'field-head' },
        el('label', { class: 'switch', for: id }, input,
          el('span', { class: 'switch-track', 'aria-hidden': 'true' }, el('span', { class: 'switch-thumb' })),
          el('span', { class: 'switch-text' }, o.label)),
        o.tag ? ui.tag(o.tag) : null),
      o.help ? el('p', { class: 'field-help', id: id + '-help' }, o.help) : null);
    const api = makeControl(wrap, function () { return input.checked; }, function (v) { input.checked = !!v; });
    input.addEventListener('change', function () { api.emit('change'); });
    api.input = input;
    api.disable = function (off) { input.disabled = !!off; return api; };
    return api;
  };

  function normOptions(options) {
    return (options || []).map(function (op) {
      return (op && typeof op === 'object') ? op : { value: op, label: String(op) };
    });
  }

  /**
   * Segmented control: radio inputs styled as joined buttons, inside a fieldset with a legend.
   * @param {{id?:string, label:string, options:{value:*, label:string, disabled?:boolean}[], value:*,
   *   tag?:string, help?:string}} o
   * @returns {{el:HTMLElement, value:*, set:Function, on:Function}}
   */
  ui.segmented = function (o) {
    const id = o.id || uid('seg');
    const opts = normOptions(o.options);
    const inputs = [];
    const box = el('div', { class: 'seg-options' });
    opts.forEach(function (op, i) {
      const inp = el('input', { type: 'radio', name: id, id: id + '-' + i, value: String(op.value), disabled: !!op.disabled });
      inputs.push(inp);
      box.appendChild(el('label', { for: id + '-' + i }, inp, el('span', null, op.label)));
    });
    const fs = el('fieldset', { class: 'seg', id: id, 'aria-describedby': o.help ? id + '-help' : null },
      el('legend', null, o.label, o.tag ? ' ' : null, o.tag ? ui.tag(o.tag) : null), box,
      o.help ? el('p', { class: 'field-help', id: id + '-help' }, o.help) : null);
    function get() {
      for (let i = 0; i < inputs.length; i++) if (inputs[i].checked) return opts[i].value;
      return null;
    }
    function set(v) { inputs.forEach(function (inp, i) { inp.checked = String(opts[i].value) === String(v); }); }
    const api = makeControl(fs, get, set);
    set(o.value !== undefined ? o.value : (opts[0] && opts[0].value));
    inputs.forEach(function (inp) { inp.addEventListener('change', function () { api.emit('change'); }); });
    api.disable = function (off) { inputs.forEach(function (inp, i) { inp.disabled = !!off || !!opts[i].disabled; }); return api; };
    return api;
  };

  /**
   * Labelled native select.
   * @param {{id?:string, label:string, options:({value:*, label:string, disabled?:boolean}|string)[],
   *   value?:*, tag?:string, help?:string}} o
   * @returns {{el:HTMLElement, value:*, set:Function, on:Function, select:HTMLSelectElement}}
   */
  ui.select = function (o) {
    const id = o.id || uid('select');
    const opts = normOptions(o.options);
    const sel = el('select', { id: id, 'aria-describedby': o.help ? id + '-help' : null });
    opts.forEach(function (op, i) { sel.appendChild(el('option', { value: String(i), disabled: !!op.disabled }, op.label)); });
    const wrap = el('div', { class: 'field select-field' }, fieldHead(id, o.label, null, o.tag), sel,
      o.help ? el('p', { class: 'field-help', id: id + '-help' }, o.help) : null);
    function get() { const i = Number(sel.value); return opts[i] ? opts[i].value : null; }
    function set(v) {
      const i = opts.findIndex(function (op) { return String(op.value) === String(v); });
      if (i >= 0) sel.value = String(i);
    }
    const api = makeControl(wrap, get, set);
    if (o.value !== undefined) set(o.value);
    sel.addEventListener('change', function () { api.emit('change'); });
    api.select = sel;
    api.disable = function (off) { sel.disabled = !!off; return api; };
    return api;
  };

  /**
   * Button. Returns the <button> itself, with b.el === b and b.on(evt, fn) ('change' = click).
   * @param {{label:string, kind?:'primary'|'secondary'|'ghost', icon?:string, onClick?:Function,
   *   title?:string, small?:boolean, iconOnly?:boolean}} o
   * @returns {HTMLButtonElement}
   */
  ui.button = function (o) {
    const kind = o.kind || 'secondary';
    const b = el('button', {
      type: 'button', class: ['btn', kind, o.small ? 'sm' : '', o.iconOnly ? 'icon-only' : ''], title: o.title || null,
      'aria-label': o.iconOnly ? o.label : null
    }, o.icon ? ui.icon(o.icon) : null, o.iconOnly ? null : el('span', { class: 'btn-label' }, o.label));
    if (o.onClick) b.addEventListener('click', o.onClick);
    b.el = b;
    b.on = function (evt, fn) { b.addEventListener(evt === 'change' ? 'click' : evt, fn); return b; };
    return b;
  };

  /**
   * Toggle chip (aria-pressed), e.g. a discipline filter with a colour dot.
   * @param {{label:string, pressed?:boolean, dot?:string, title?:string}} o dot: a CSS variable name such as '--d-math'
   * @returns {{el:HTMLButtonElement, value:boolean, set:Function, on:Function}}
   */
  ui.chip = function (o) {
    const check = ui.icon('check');
    check.classList.add('chip-check');
    const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': o.pressed ? 'true' : 'false', title: o.title || null },
      check, o.dot ? el('span', { class: 'dot', 'aria-hidden': 'true', style: { '--dot': 'var(' + o.dot + ')' } }) : null,
      el('span', null, o.label));
    const api = makeControl(b, function () { return b.getAttribute('aria-pressed') === 'true'; },
      function (v) { b.setAttribute('aria-pressed', v ? 'true' : 'false'); });
    b.addEventListener('click', function () { api.set(!api.value); api.emit('change'); });
    return api;
  };

  /**
   * Disclosure (<details class="disclosure">). Append content to the returned element's .body.
   * @param {string} title @param {boolean} [open] @returns {HTMLDetailsElement}
   */
  ui.details = function (title, open) {
    const body = el('div', { class: 'details-body' });
    const d = el('details', { class: 'disclosure', open: !!open }, el('summary', null, title), body);
    d.body = body;
    return d;
  };

  /* ================================================================ tags, badges, pills */

  const TAGS = {
    project: ['Project', 'Project: stated in the project notes.'],
    derived: ['Derived', 'Derived: computed from project parameters.'],
    site: ['Site default', 'Site default: a value chosen for this site because the notes do not give one.'],
    option: ['Site option', 'Site option: an option offered by this site; the original project did not include it.'],
    illustrative: ['Illustrative', 'Illustrative: example hardware numbers, not project data.'],
    extension: ['Extension', 'Extension: beyond the original project scope.'],
    analogy: ['Analogy', 'Analogy: a teaching bridge rather than course content.'],
    typical: ['Typical content', 'Typical content: standard syllabus for a subject of that name, inferred from its outline, not from notes.']
  };
  ui.TAGS = TAGS;

  /**
   * Honesty tag. kind ∈ project | derived | site | option | illustrative | extension | analogy | typical.
   * @param {string} kind @param {string} [text] visible text override @returns {HTMLSpanElement}
   */
  ui.tag = function (kind, text) {
    const k = TAGS[kind] ? kind : 'site';
    return el('span', { class: 'tag tag-' + k, title: TAGS[k][1] }, text || TAGS[k][0]);
  };

  /** Evidence legend (<details class="legend">) explaining every tag. @param {boolean} [open] @returns {HTMLDetailsElement} */
  ui.legend = function (open) {
    const dl = el('dl', { class: 'legend-list' });
    ['project', 'derived', 'site', 'option', 'illustrative', 'extension', 'analogy', 'typical'].forEach(function (k) {
      dl.appendChild(el('dt', null, ui.tag(k)));
      dl.appendChild(el('dd', null, TAGS[k][1].replace(/^[^:]+:\s*/, '')));
    });
    dl.appendChild(el('dt', null, ui.evidence('notes')));
    dl.appendChild(el('dd', null, 'The subject’s own notes support the link.'));
    dl.appendChild(el('dt', null, ui.evidence('partial')));
    dl.appendChild(el('dd', null, 'Only part of the subject’s notes exist; the rest is typical content.'));
    return el('details', { class: 'legend', open: !!open }, el('summary', null, 'Evidence labels explained'),
      el('div', { class: 'details-body' }, dl));
  };

  const BADGE_TEXT = { pass: 'PASS', fail: 'FAIL', na: 'N/A' };
  const BADGE_ICON = { pass: 'check', fail: 'cross', na: 'dash' };
  /**
   * Pass/fail/n.a. badge: always icon plus text.
   * @param {'pass'|'fail'|'na'} status @param {string} [text] @returns {HTMLSpanElement}
   */
  ui.badge = function (status, text) {
    const s = BADGE_TEXT[status] ? status : 'na';
    return el('span', { class: 'badge ' + s }, ui.icon(BADGE_ICON[s]), el('span', null, text || BADGE_TEXT[s]));
  };

  const PILL = { strong: 'Strong', moderate: 'Moderate', weak: 'Weak' };
  /**
   * Strength pill with a shape (filled, half-filled or empty dot, drawn in CSS) and text.
   * @param {'strong'|'moderate'|'weak'} strength @returns {HTMLSpanElement}
   */
  ui.pill = function (strength) {
    const s = PILL[strength] ? strength : 'weak';
    return el('span', { class: 'pill ' + s, title: 'Strength of the link: ' + PILL[s].toLowerCase() },
      el('span', { class: 'pill-glyph', 'aria-hidden': 'true' }), PILL[s]);
  };

  const EVIDENCE = {
    notes: ['Notes', 'Supported by the subject’s notes.'],
    partial: ['Partial notes', 'Partly supported by notes; the rest is typical content.'],
    outline: ['Typical content', 'Typical content of this subject, inferred from its outline, not from notes.']
  };
  /**
   * Evidence badge for a subject: Notes | Partial notes | Typical content.
   * @param {'notes'|'partial'|'outline'} evidence @returns {HTMLSpanElement}
   */
  ui.evidence = function (evidence) {
    const e = EVIDENCE[evidence] ? evidence : 'outline';
    return el('span', { class: 'ev ev-' + e, title: EVIDENCE[e][1] }, EVIDENCE[e][0]);
  };

  /* ================================================================ cards and callouts */

  /**
   * Widget card: <figure class="widget"> with a figcaption head ("Interactive", title, Try/Notice),
   * a body and a footer for notes and tags.
   * @param {{id:string, title:string, try?:string, notice?:string, tags?:string[], notes?:string}} o
   *   id without the 'w-' prefix
   * @returns {{el:HTMLElement, body:HTMLElement, foot:HTMLElement, head:HTMLElement}}
   */
  ui.widget = function (o) {
    const wid = 'w-' + String(o.id).replace(/^w-/, '');
    const titleId = wid + '-title';
    const head = el('figcaption', { class: 'widget-head' },
      el('span', { class: 'widget-kicker' }, ui.icon('sliders'), 'Interactive'),
      el('h3', { class: 'widget-title', id: titleId }, o.title),
      (o.try || o.notice) ? el('p', { class: 'widget-try' },
        o.try ? [el('strong', null, 'Try: '), o.try] : null, (o.try && o.notice) ? ' ' : null,
        o.notice ? [el('strong', null, 'Notice: '), o.notice] : null) : null);
    const body = el('div', { class: 'widget-body' });
    const foot = el('div', { class: 'widget-foot' },
      o.notes ? el('p', null, o.notes) : null,
      (o.tags && o.tags.length) ? el('span', { class: 'tags' }, o.tags.map(function (t) { return ui.tag(t); })) : null);
    const fig = el('figure', { class: 'widget', id: wid, 'aria-labelledby': titleId }, head, body, foot);
    return { el: fig, body: body, foot: foot, head: head };
  };

  const CALLOUT_ICON = { info: 'info', warn: 'warn', ext: 'ext', error: 'warn' };
  /**
   * Callout box. kind ∈ info | warn | ext (striped extension banner) | error.
   * @param {string} kind @param {string|null} title @param {...(Node|string)} content
   * @returns {HTMLElement}
   */
  ui.callout = function (kind, title) {
    const k = CALLOUT_ICON[kind] ? kind : 'info';
    const content = el('div', { class: 'callout-content' }, title ? el('p', { class: 'callout-title' }, title) : null);
    Array.prototype.slice.call(arguments, 2).forEach(function (c) {
      if (c === null || c === undefined) return;
      content.appendChild(typeof c === 'string' ? el('p', null, c) : c);
    });
    const ic = ui.icon(CALLOUT_ICON[k]);
    ic.classList.add('callout-icon');
    return el('div', { class: 'callout ' + k, role: k === 'error' ? 'alert' : 'note' }, ic, content);
  };

  /**
   * Show an error (for example a RangeError from ADCS.sim.run) inline at the top of a container.
   * Calling it again replaces the message.
   * @param {HTMLElement} container @param {Error|string} err @returns {HTMLElement}
   */
  ui.showError = function (container, err) {
    ui.clearError(container);
    const msg = err && err.message ? err.message : String(err);
    const box = ui.callout('error', null, msg);
    box.classList.add('inline-error');
    container.insertBefore(box, container.firstChild);
    return box;
  };
  /** Remove an inline error shown by showError. @param {HTMLElement} container */
  ui.clearError = function (container) {
    Array.prototype.slice.call(container.children).forEach(function (c) {
      if (c.classList.contains('inline-error')) c.remove();
    });
  };

  /**
   * Stat tile.
   * @param {{value:string, label:string, tag?:string}} o @returns {HTMLElement}
   */
  ui.stat = function (o) {
    return el('div', { class: 'stat' }, el('span', { class: 'stat-value' }, o.value),
      el('span', { class: 'stat-label' }, o.label), o.tag ? ui.tag(o.tag) : null);
  };

  /**
   * Simple data table inside .scroll-x.
   * @param {{key:string, label:string, num?:boolean}[]} columns
   * @param {(Object|Array)[]} rows objects keyed by column key, or arrays in column order
   * @param {{caption?:string, rowHeaders?:boolean, compact?:boolean}} [o]
   * @returns {HTMLElement} the .scroll-x wrapper (wrapper.table is the <table>)
   */
  ui.table = function (columns, rows, o) {
    const opt = o || {};
    const table = el('table', { class: ['table', opt.compact ? 'compact' : ''] },
      opt.caption ? el('caption', null, opt.caption) : null,
      el('thead', null, el('tr', null, columns.map(function (c) {
        return el('th', { scope: 'col', class: c.num ? 'num' : null }, c.label);
      }))));
    const tb = el('tbody');
    (rows || []).forEach(function (r) {
      tb.appendChild(el('tr', null, columns.map(function (c, j) {
        const v = Array.isArray(r) ? r[j] : r[c.key];
        const cell = (v && v.nodeType) ? v : (v === null || v === undefined ? '–' : String(v));
        return (opt.rowHeaders && j === 0) ? el('th', { scope: 'row' }, cell) : el('td', { class: c.num ? 'num' : null }, cell);
      })));
    });
    table.appendChild(tb);
    const wrap = el('div', { class: 'scroll-x', tabindex: '0', role: 'region', 'aria-label': opt.caption || 'Table' }, table);
    wrap.table = table;
    return wrap;
  };

  /* ================================================================ provenance */

  /**
   * Render the "Where this came from" box for a module from ADCS.data: subjects grouped by
   * discipline, each with an atlas link, evidence badge, strength pill, tag (when not direct)
   * and the concept text. If the container is a <section>, it becomes the provenance section.
   * @param {HTMLElement|string} container element, or a module id (then #provenance is used or created)
   * @param {string} [moduleId] e.g. 'm05'
   * @returns {HTMLElement} the section.provenance
   */
  ui.renderProvenance = function (container, moduleId) {
    let host = container, mid = moduleId;
    if (typeof container === 'string') { mid = container; host = document.getElementById('provenance'); }
    let section;
    if (host && host.tagName === 'SECTION') { section = host; section.textContent = ''; }
    else {
      section = el('section');
      if (host) { host.textContent = ''; host.appendChild(section); }
    }
    section.classList.add('provenance');
    const titleId = (section.id || uid('prov')) + '-title';
    section.setAttribute('aria-labelledby', titleId);
    section.appendChild(el('h2', { id: titleId }, 'Where this came from'));
    section.appendChild(el('p', { class: 'provenance-intro' }, 'Subjects whose material feeds this part of the project, grouped by discipline.'));
    const D = ADCS.data;
    if (!D || typeof D.mappingsFor !== 'function') {
      section.appendChild(el('p', { class: 'provenance-empty' }, 'Subject data is not available on this page.'));
      return section;
    }
    const rows = D.mappingsFor(mid);
    const groups = D.byDiscipline(rows);
    const mod = typeof D.module === 'function' ? D.module(mid) : null;
    const sectionTitles = {};
    if (mod) (mod.sections || []).forEach(function (s) { sectionTitles[s.id] = s.title; });
    // "Used in: <section>" takes the reader from the subject to the part of the page that uses it.
    function usedIn(sid) {
      if (!sid || !sectionTitles[sid]) return null;
      const here = !!document.getElementById(sid) && document.body.getAttribute('data-page') === mid;
      const href = here ? '#' + sid : BASE + mod.slug + '#' + sid;
      return el('p', { class: 'prov-where' }, 'Used in: ', el('a', { href: href }, sectionTitles[sid]));
    }
    section.appendChild(el('p', { class: 'provenance-count' },
      rows.length + (rows.length === 1 ? ' subject' : ' subjects') + ' · ' + groups.length + (groups.length === 1 ? ' discipline' : ' disciplines')));
    if (!rows.length) section.appendChild(el('p', { class: 'provenance-empty' }, 'No subject links are recorded for this part.'));
    groups.forEach(function (g) {
      const dot = { '--dot': 'var(' + g.discipline.color + ')' };
      const list = el('ul', { class: 'prov-list' });
      g.rows.forEach(function (r) {
        const c = D.course(r.course) || { id: r.course, name: r.course, evidence: 'outline' };
        list.appendChild(el('li', { class: 'prov-row', style: dot },
          el('div', { class: 'prov-meta' },
            el('a', { href: BASE + 'atlas.html#c-' + c.id }, c.name),
            ui.evidence(c.evidence), ui.pill(r.strength),
            r.tag && r.tag !== 'direct' ? ui.tag(r.tag) : null),
          el('p', { class: 'prov-concept' }, r.concept),
          usedIn(r.section)));
      });
      section.appendChild(el('div', { class: 'prov-group' },
        el('h3', null, el('span', { class: 'prov-dot', 'aria-hidden': 'true', style: dot }), g.discipline.name,
          el('span', { class: 'count' }, '(' + g.rows.length + ')')), list));
    });
    const legendNote = (D.notes && D.notes.typicalLegend) ||
      'Typical content = standard syllabus for a subject of that name, inferred from its outline, not from notes.';
    section.appendChild(el('footer', { class: 'provenance-foot' }, ui.legend(false), el('p', null, legendNote)));
    return section;
  };

  /* ================================================================ quiz */

  /**
   * Predict-then-reveal quiz: one radio group per item, a Check button that reveals correctness
   * and the explanation (aria-live), and Try again.
   * @param {HTMLElement} container
   * @param {{q:string, options:string[], correct:number, explain:string}[]} items
   * @returns {{el:HTMLElement, reset:Function, score:Function}}
   */
  ui.quiz = function (container, items) {
    const qid = uid('quiz');
    const list = el('div', { class: 'quiz-list' });
    const state = [];
    (items || []).forEach(function (it, i) {
      const name = qid + '-' + i;
      const optsBox = el('div', { class: 'quiz-options' });
      const labels = [];
      it.options.forEach(function (text, j) {
        const inp = el('input', { type: 'radio', name: name, value: String(j), id: name + '-' + j });
        const mark = el('span', { class: 'quiz-mark' });
        const lab = el('label', { class: 'quiz-option', for: name + '-' + j }, inp, el('span', { class: 'quiz-text' }, text), mark);
        labels.push({ lab: lab, inp: inp, mark: mark });
        optsBox.appendChild(lab);
      });
      const feedback = el('p', { class: 'quiz-feedback', 'aria-live': 'polite' });
      const check = ui.button({ label: 'Check', kind: 'primary', small: true });
      const again = ui.button({ label: 'Try again', kind: 'ghost', small: true, icon: 'reset' });
      again.hidden = true;
      const fs = el('fieldset', { class: 'quiz-item' },
        el('legend', null, el('span', { class: 'quiz-num' }, (i + 1) + '.'), it.q), optsBox,
        el('div', { class: 'btn-row' }, check, again), feedback);
      const st = { answered: false, correct: false };
      state.push(st);
      function clearMarks() {
        labels.forEach(function (l) { l.lab.classList.remove('is-correct', 'is-wrong'); l.mark.textContent = ''; });
      }
      function reveal() {
        const chosen = labels.findIndex(function (l) { return l.inp.checked; });
        clearMarks();
        feedback.textContent = '';
        if (chosen < 0) { feedback.textContent = 'Choose an answer first, then check it.'; return; }
        const ok = chosen === it.correct;
        st.answered = true; st.correct = ok;
        const right = labels[it.correct];
        right.lab.classList.add('is-correct');
        right.mark.appendChild(ui.icon('check'));
        right.mark.appendChild(document.createTextNode(ok ? 'Your answer: correct' : 'Correct answer'));
        if (!ok) {
          labels[chosen].lab.classList.add('is-wrong');
          labels[chosen].mark.appendChild(ui.icon('cross'));
          labels[chosen].mark.appendChild(document.createTextNode('Your answer'));
        }
        feedback.appendChild(el('span', { class: 'verdict ' + (ok ? 'ok' : 'bad') }, ok ? 'Correct. ' : 'Not quite. '));
        feedback.appendChild(document.createTextNode(it.explain || ''));
        again.hidden = false;
        ui.typeset(fs);
      }
      check.addEventListener('click', reveal);
      again.addEventListener('click', function () {
        labels.forEach(function (l) { l.inp.checked = false; });
        clearMarks(); feedback.textContent = ''; again.hidden = true; st.answered = false; st.correct = false;
        labels[0].inp.focus();
      });
      optsBox.addEventListener('change', function () { if (st.answered) { clearMarks(); feedback.textContent = ''; st.answered = false; } });
      list.appendChild(fs);
    });
    container.appendChild(list);
    ui.typeset(list);
    return {
      el: list,
      reset: function () { ui.qsa('input[type=radio]', list).forEach(function (r) { r.checked = false; }); ui.qsa('.quiz-feedback', list).forEach(function (f) { f.textContent = ''; }); },
      score: function () { return state.filter(function (s) { return s.correct; }).length; }
    };
  };

  /* ================================================================ simulation displays */

  const MODE_NAMES = ['NOMINAL', 'SAFE_DETUMBLE', 'SAFE_HOLD'];
  const MODE_CLASS = ['n', 'sd', 'sh'];
  const MODE_SHAPE = ['circle', 'triangle', 'square'];
  function modeIndex(mode) {
    if (typeof mode === 'number') return mode;
    const names = (ADCS.modes && ADCS.modes.NAMES) || MODE_NAMES;
    return names.indexOf(String(mode));
  }

  /**
   * Mode pill (colour, shape and name, so colour is never the only cue).
   * @param {number|string} mode 0/1/2 or 'NOMINAL'|'SAFE_DETUMBLE'|'SAFE_HOLD'
   * @param {{large?:boolean}} [o] @returns {HTMLSpanElement}
   */
  ui.modePill = function (mode, o) {
    const i = modeIndex(mode);
    if (i < 0 || i > 2) return el('span', { class: 'mode-pill na' }, '–');
    return el('span', { class: ['mode-pill', MODE_CLASS[i], o && o.large ? 'lg' : ''] }, ui.icon(MODE_SHAPE[i]), MODE_NAMES[i]);
  };

  /**
   * Guard lamp: on/off dot with icon, label, live value and optional progress bar.
   * trigger:true marks an entry trigger (lit = triggered, shown in the alarm colour).
   * @param {{label:string, on?:boolean, value?:string, progress?:number|null, trigger?:boolean}} o
   * @returns {{el:HTMLElement, update:Function}}
   */
  ui.lamp = function (o) {
    const dot = el('span', { class: 'lamp-dot', 'aria-hidden': 'true' }, ui.icon(o.trigger ? 'alert' : 'check'));
    const label = el('span', { class: 'lamp-label' }, o.label);
    const state = el('span', { class: 'visually-hidden' });
    const value = el('span', { class: 'lamp-value' });
    const bar = el('span');
    const prog = el('div', { class: 'lamp-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': o.label + ' progress' }, bar);
    const box = el('div', { class: ['lamp', o.trigger ? 'trigger' : ''] }, dot, el('span', { class: 'lamp-label-wrap' }, label, state), value, prog);
    function update(u) {
      if (u.label !== undefined) label.textContent = u.label;
      const on = !!u.on;
      box.classList.toggle('on', on);
      state.textContent = o.trigger ? (on ? ': triggered' : ': not triggered') : (on ? ': met' : ': not met');
      value.textContent = u.value !== undefined && u.value !== null ? u.value : '';
      const p = u.progress;
      if (p === null || p === undefined) { prog.hidden = true; }
      else {
        prog.hidden = false;
        const pct = Math.max(0, Math.min(100, 100 * p));
        bar.style.width = pct.toFixed(1) + '%';
        prog.setAttribute('aria-valuenow', pct.toFixed(0));
      }
    }
    update(o);
    return { el: box, update: update };
  };

  function smConfig(result) {
    if (result && result.config && result.config.safeMode) return result.config.safeMode;
    return ADCS.params && ADCS.params.DEFAULTS ? ADCS.params.DEFAULTS.safeMode : null;
  }
  function dtOf(result) {
    if (result && isFinite(result.dt)) return result.dt;
    if (result && result.config && isFinite(result.config.dt)) return result.config.dt;
    return ADCS.params && ADCS.params.DEFAULTS ? ADCS.params.DEFAULTS.dt : 0.01;
  }
  function f2(x) { return ui.fmt(x, { fixed: 2 }); }

  function reasonText(ev, sm) {
    const v = ev.values || {};
    switch (ev.reason) {
      case 'rate': return 'because |ω| > ' + sm.enterRateDeg + ' deg/s' + (isFinite(v.rateDeg) ? ' (' + f2(v.rateDeg) + ' deg/s)' : '');
      case 'fault': return 'because the fault persisted for ' + sm.faultPersist + ' s';
      case 'rate-low': return 'because |ω| < ' + sm.exitRateDeg + ' deg/s for ' + sm.exitHold + ' s';
      case 'guards': return 'because the fault was clear, |ω| < ' + sm.returnRateDeg + ' deg/s, error < ' + sm.returnErrDeg + '° and the ' + sm.dwell + ' s dwell was complete';
      case 'reupset': return 'because of a re-upset during SAFE_HOLD';
      default: return ev.reason ? 'because of ' + ev.reason : '';
    }
  }

  /**
   * Mode annunciator: a large mode pill for the cursor time, the last transition with its reason,
   * and lamps for the current mode's exit guard (or NOMINAL's entry triggers), with live values
   * and dwell/hold progress.
   * @param {HTMLElement} container
   * @returns {{el:HTMLElement, update:function(Object, Object):void}} update(sample, result):
   *   sample from ADCS.sim.sampleAt ({t, mode, fault, rateDeg(Used), errDeg(Used), counters});
   *   result supplies config.safeMode, dt and events.
   */
  ui.modeAnnunciator = function (container) {
    const pillBox = el('span', { class: 'ann-pill' });
    const time = el('span', { class: 'ann-time' });
    const change = el('p', { class: 'ann-change' });
    const kind = el('p', { class: 'ann-kind' });
    const lampsBox = el('div', { class: 'lamps', role: 'group' });
    const sr = el('p', { class: 'visually-hidden', 'aria-live': 'polite' });
    const box = el('div', { class: 'annunciator', role: 'group', 'aria-label': 'Mode annunciator' },
      el('div', { class: 'ann-top' }, pillBox, time), change, kind, lampsBox, sr);
    container.appendChild(box);
    let lastMode = -1, lamps = [], lastKey = '';

    function build(key, defs) {
      if (key === lastKey) return;
      lastKey = key;
      lampsBox.textContent = '';
      lamps = defs.map(function (d) { const l = ui.lamp(d); lampsBox.appendChild(l.el); return l; });
    }

    function update(sample, result) {
      if (!sample) return;
      const sm = smConfig(result);
      const dt = dtOf(result);
      const mode = modeIndex(sample.mode);
      const t = isFinite(sample.t) ? sample.t : (isFinite(sample.k) ? sample.k * dt : 0);
      const rate = isFinite(sample.rateDegUsed) ? sample.rateDegUsed : sample.rateDeg;
      const err = isFinite(sample.errDegUsed) ? sample.errDegUsed : sample.errDeg;
      const c = sample.counters || { fault: 0, below: 0, dwell: 0 };
      const fault = !!sample.fault;

      if (mode !== lastMode) {
        pillBox.textContent = '';
        pillBox.appendChild(ui.modePill(mode, { large: true }));
        if (lastMode !== -1) sr.textContent = 'Mode ' + (MODE_NAMES[mode] || 'unknown');
        lastMode = mode;
      }
      time.textContent = 't = ' + ui.fmt(t, { fixed: 2, unit: 's' });

      const events = (result && result.events) || [];
      let ev = null;
      for (let i = events.length - 1; i >= 0; i--) { if (events[i].t <= t + 1e-9) { ev = events[i]; break; } }
      change.textContent = '';
      if (ev && sm) {
        change.appendChild(document.createTextNode('Last change: entered '));
        change.appendChild(el('strong', null, MODE_NAMES[ev.to]));
        change.appendChild(document.createTextNode(' at ' + ui.fmt(ev.t, { fixed: 2, unit: 's' }) + ' ' + reasonText(ev, sm) + '.'));
      } else {
        change.textContent = 'No mode change yet in this run.';
      }

      if (!sm) { kind.textContent = 'Guard thresholds are not available.'; build('none', []); return; }
      if (!sm.enabled) { kind.textContent = 'Safe mode is disabled in this run, so no guards are active.'; build('off', []); return; }
      if (mode === 0) {
        kind.textContent = 'Entry triggers to SAFE_DETUMBLE (either one)';
        build('n', [{ label: '|ω| > ' + sm.enterRateDeg + ' deg/s', trigger: true },
          { label: 'Fault ≥ ' + sm.faultPersist + ' s', trigger: true }]);
        const ft = c.fault * dt;
        lamps[0].update({ on: rate > sm.enterRateDeg, value: f2(rate) + ' deg/s', progress: null });
        lamps[1].update({ on: ft >= sm.faultPersist - 1e-9, value: f2(ft) + '/' + sm.faultPersist + ' s', progress: ft / sm.faultPersist });
      } else if (mode === 1) {
        kind.textContent = 'Exit guard to SAFE_HOLD';
        build('sd', [{ label: '|ω| < ' + sm.exitRateDeg + ' deg/s' }, { label: 'Held for ' + sm.exitHold + ' s' }]);
        const bt = c.below * dt;
        lamps[0].update({ on: rate < sm.exitRateDeg, value: f2(rate) + ' deg/s', progress: null });
        lamps[1].update({ on: bt >= sm.exitHold - 1e-9, value: f2(bt) + '/' + sm.exitHold + ' s', progress: bt / sm.exitHold });
      } else if (mode === 2) {
        kind.textContent = 'Exit guards to NOMINAL (all must hold)';
        build('sh', [{ label: 'Fault clear' }, { label: '|ω| < ' + sm.returnRateDeg + ' deg/s' },
          { label: 'Error < ' + sm.returnErrDeg + '°' }, { label: 'Dwell ≥ ' + sm.dwell + ' s' }]);
        const dw = c.dwell * dt;
        lamps[0].update({ on: !fault, value: fault ? 'fault active' : 'clear', progress: null });
        lamps[1].update({ on: rate < sm.returnRateDeg, value: f2(rate) + ' deg/s', progress: null });
        lamps[2].update({ on: err < sm.returnErrDeg, value: ui.fmt(err, { fixed: 2, unit: '°' }), progress: null });
        lamps[3].update({ on: dw >= sm.dwell - 1e-9, value: ui.fmt(dw, { fixed: 1 }) + '/' + sm.dwell + ' s', progress: dw / sm.dwell });
      }
    }
    return { el: box, update: update };
  };

  const REQ_ORDER = ['F1', 'F2', 'S1', 'S2', 'L1'];
  function reqKey(id) { return String(id || '').replace(/^REQ-/, ''); }
  function reqRecord(key) {
    const P = ADCS.params;
    if (P && typeof P.reqById === 'function') return P.reqById(key) || P.reqById('REQ-' + key);
    return null;
  }

  /**
   * Requirement badges (REQ-F1, F2, S1, S2, L1): status icon and text, a one-line value, and a
   * popover with the requirement text, the check used and the verification method.
   * @param {HTMLElement} container @param {{notes?:Object}} [o] notes: short per-key badge notes
   *   (default L1: 'single run; verified statistically by Monte Carlo below' on the simulator page,
   *   'single run; L1 is verified statistically by Monte Carlo' elsewhere)
   * @returns {{el:HTMLElement, update:function((Object[]|Object)):void}} update(result.req)
   */
  ui.reqBadges = function (container, o) {
    const onSim = document.body.getAttribute('data-page') === 'simulator';
    const notes = Object.assign({ L1: onSim ? 'single run; verified statistically by Monte Carlo below' : 'single run; L1 is verified statistically by Monte Carlo' },
      (o && o.notes) || {});
    const box = el('div', { class: 'req-badges', role: 'list', 'aria-label': 'Requirement checks for this run' });
    container.appendChild(box);
    const cells = {};
    const latest = {};
    function popContent(key) {
      const r = latest[key] || {};
      const rec = reqRecord(key) || {};
      const id = r.id || rec.id || 'REQ-' + key;
      return el('div', null,
        el('h3', null, id + (r.class || rec.class ? ' · ' + (r.class || rec.class) : '')),
        el('p', null, '“' + (r.text || rec.text || '') + '” ', ui.tag('project')),
        el('dl', { class: 'legend-list' },
          el('dt', null, 'Check used'), el('dd', null, r.check || rec.check || '–'),
          el('dt', null, 'Verification'), el('dd', null, r.method || rec.method || '–'),
          el('dt', null, 'This run'), el('dd', null, ui.badge(r.status), ' ', r.value || '')),
        r.note ? el('p', { class: 'muted' }, r.note) : null);
    }
    function update(reqs) {
      const arr = Array.isArray(reqs) ? reqs : Object.keys(reqs || {}).map(function (k) { return Object.assign({ id: k }, reqs[k]); });
      arr.forEach(function (r) { latest[reqKey(r.key || r.id)] = r; });
      REQ_ORDER.forEach(function (key) {
        const r = latest[key];
        if (!r) return;
        let c = cells[key];
        if (!c) {
          const btn = el('button', { type: 'button', class: 'req-badge' });
          box.appendChild(el('div', { role: 'listitem' }, btn));
          ui.popover(btn, function () { return popContent(key); }, { label: 'REQ-' + key + ' details' });
          c = cells[key] = btn;
        }
        c.className = 'req-badge ' + (r.status || 'na');
        c.textContent = '';
        c.appendChild(el('span', { class: 'req-head' }, ui.badge(r.status), el('span', null, r.id || 'REQ-' + key)));
        c.appendChild(el('span', { class: 'req-value' }, r.value || ''));
        if (notes[key]) c.appendChild(el('span', { class: 'req-note' }, notes[key]));
      });
    }
    return { el: box, update: update };
  };

  /**
   * Metrics table for ADCS.metrics.compute(result) output.
   * @param {HTMLElement} container @returns {{el:HTMLElement, update:function(Object):void}}
   */
  ui.metricsTable = function (container) {
    const tbody = el('tbody');
    const table = el('table', { class: 'table compact metrics-table' },
      el('caption', null, 'Run metrics (true state) ', ui.tag('derived')),
      el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Metric'), el('th', { scope: 'col', class: 'num' }, 'Value'))),
      tbody);
    const wrap = el('div', { class: 'scroll-x', tabindex: '0', role: 'region', 'aria-label': 'Run metrics' }, table);
    container.appendChild(wrap);
    function L() { return (ADCS.params && ADCS.params.LIMITS) || { errDeg: 2, rateDeg: 0.5, rateMaxDeg: 15 }; }
    function s(x) { return x === null || x === undefined ? '–' : ui.fmt(x, { fixed: 2, unit: 's' }); }
    function update(m) {
      if (!m) return;
      const lim = L();
      const rows = [
        ['Settling time (last entry into error < ' + lim.errDeg + '° and |ω| < ' + lim.rateDeg + ' deg/s)',
          m.settle === null ? 'not settled' : (m.settle === 0 ? '0 s (always inside)' : s(m.settle))],
        ['Peak attitude error', ui.fmt(m.peakErr, { fixed: 2, unit: '°' })],
        ['Peak rate |ω|', ui.fmt(m.peakRate, { fixed: 2, unit: 'deg/s' }) + (isFinite(m.peakRateT) ? ' at ' + s(m.peakRateT) : '')],
        ['Safety margin (' + lim.rateMaxDeg + ' − peak rate)', ui.fmt(m.margin, { fixed: 2, unit: 'deg/s' })],
        ['Max |τ| after saturation', ui.fmt(m.maxTau * 1000, { fixed: 3, unit: 'mN m' })],
        ['Max demanded |τ|', ui.fmt(m.maxTauCmd * 1000, { fixed: 3, unit: 'mN m' })],
        ['Control effort ∫Στ² dt', ui.fmtSci(m.effort, 3) + NBSP + 'N² m² s'],
        ['Time saturated', ui.fmt(m.satFrac * 100, { fixed: 1, unit: '%' })],
        ['Safe-mode entries', String(m.entries ? m.entries.length : 0)],
        ['Detumble times', m.detumble && m.detumble.length ? m.detumble.map(function (d) { return d === null ? 'not reached' : s(d); }).join(', ') : 'none'],
        ['Mode transitions', String(m.transitions)],
        ['Last entry into NOMINAL', m.tLastNominalEntry === null || m.tLastNominalEntry === undefined ? '–' : s(m.tLastNominalEntry)],
        ['Final mode', m.final ? MODE_NAMES[m.final.mode] : '–'],
        ['Final error', m.final ? ui.fmt(m.final.errDeg, { fixed: 3, unit: '°' }) : '–'],
        ['Final rate', m.final ? ui.fmt(m.final.rateDeg, { fixed: 3, unit: 'deg/s' }) : '–']
      ];
      if (m.estRmsDeg !== null && m.estRmsDeg !== undefined) rows.push(['Estimation error RMS (extension)', ui.fmt(m.estRmsDeg, { fixed: 3, unit: '°' })]);
      if (m.estMaxDeg !== null && m.estMaxDeg !== undefined) rows.push(['Estimation error max (extension)', ui.fmt(m.estMaxDeg, { fixed: 3, unit: '°' })]);
      tbody.textContent = '';
      // a word joiner inside |x| stops the line from breaking after the opening bar
      rows.forEach(function (r) { tbody.appendChild(el('tr', null, el('th', { scope: 'row' }, r[0].replace(/\|([^|\s]+)\|/g, '|\u2060$1\u2060|')), el('td', { class: 'num' }, r[1]))); });
    }
    return { el: wrap, update: update };
  };

  /* ================================================================ popover */

  let openPop = null;
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /**
   * Popover attached to an anchor: click or Enter opens, Escape or an outside click closes,
   * Tab wraps inside (a light trap) and focus returns to the anchor on close.
   * @param {HTMLElement} anchorEl usually a <button>; other elements get role="button" and tabindex
   * @param {Node|function():Node} contentEl content, or a function building it on each open
   * @param {{label?:string}} [o] accessible name of the dialog
   * @returns {{open:Function, close:Function, toggle:Function, isOpen:function():boolean, destroy:Function}}
   */
  ui.popover = function (anchorEl, contentEl, o) {
    const opt = o || {};
    const id = uid('popover');
    let pop = null;
    if (anchorEl.tagName !== 'BUTTON' && anchorEl.tagName !== 'A') {
      if (!anchorEl.hasAttribute('tabindex')) anchorEl.setAttribute('tabindex', '0');
      if (!anchorEl.hasAttribute('role')) anchorEl.setAttribute('role', 'button');
    }
    anchorEl.setAttribute('aria-haspopup', 'dialog');
    anchorEl.setAttribute('aria-expanded', 'false');

    function position() {
      if (!pop) return;
      const r = anchorEl.getBoundingClientRect();
      const de = document.documentElement;
      const vw = de.clientWidth, vh = de.clientHeight;
      const sx = root.pageXOffset, sy = root.pageYOffset;
      const pw = pop.offsetWidth, ph = pop.offsetHeight;
      let left = r.left;
      left = Math.max(8, Math.min(left, vw - pw - 8));
      let top = r.bottom + 6;
      if (top + ph > vh - 8) {
        // Below does not fit: go above when that fits, otherwise to whichever side has more room,
        // and keep the box inside the viewport (its CSS max-height lets long content scroll).
        const above = r.top - ph - 6;
        if (above >= 8 || r.top > vh - r.bottom) top = above;
        top = Math.max(8, Math.min(top, vh - ph - 8));
      }
      pop.style.left = (left + sx) + 'px';
      pop.style.top = (top + sy) + 'px';
    }
    function onDocDown(e) { if (pop && !pop.contains(e.target) && !anchorEl.contains(e.target)) close(false); }
    function onKey(e) {
      if (!pop) return;
      if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
      if (e.key === 'Tab') {
        const f = ui.qsa(FOCUSABLE, pop);
        if (!f.length) { e.preventDefault(); return; }
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === pop)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    function open() {
      if (pop) return;
      if (openPop && openPop !== api) openPop.close(false);
      const content = typeof contentEl === 'function' ? contentEl() : contentEl;
      const closeBtn = el('button', { type: 'button', class: 'popover-close', 'aria-label': 'Close' }, ui.icon('cross'));
      pop = el('div', { class: 'popover', id: id, role: 'dialog', 'aria-label': opt.label || anchorEl.textContent.trim().slice(0, 80) || 'Details', tabindex: '-1' },
        closeBtn, content);
      closeBtn.addEventListener('click', function () { close(true); });
      pop.style.left = '0px'; pop.style.top = '0px';
      document.body.appendChild(pop);
      position();
      anchorEl.setAttribute('aria-expanded', 'true');
      anchorEl.setAttribute('aria-controls', id);
      document.addEventListener('pointerdown', onDocDown, true);
      pop.addEventListener('keydown', onKey);
      root.addEventListener('resize', position);
      openPop = api;
      ui.typeset(pop);
      pop.focus({ preventScroll: true });
    }
    function close(returnFocus) {
      if (!pop) return;
      document.removeEventListener('pointerdown', onDocDown, true);
      root.removeEventListener('resize', position);
      pop.remove();
      pop = null;
      anchorEl.setAttribute('aria-expanded', 'false');
      anchorEl.removeAttribute('aria-controls');
      if (openPop === api) openPop = null;
      if (returnFocus) anchorEl.focus();
    }
    function toggle() { if (pop) close(true); else open(); }
    function onAnchorKey(e) {
      if (anchorEl.tagName === 'BUTTON') return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    }
    function onAnchorClick(e) { e.preventDefault(); toggle(); }
    anchorEl.addEventListener('click', onAnchorClick);
    anchorEl.addEventListener('keydown', onAnchorKey);
    const api = {
      open: open, close: close, toggle: toggle,
      isOpen: function () { return !!pop; },
      destroy: function () { close(false); anchorEl.removeEventListener('click', onAnchorClick); anchorEl.removeEventListener('keydown', onAnchorKey); }
    };
    return api;
  };

  /* ================================================================ tabs */

  function wireTabs(list, tabs, panels, onSelect) {
    function select(i, focus) {
      tabs.forEach(function (t, j) {
        const on = i === j;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.setAttribute('tabindex', on ? '0' : '-1');
        if (panels[j]) panels[j].hidden = !on;
      });
      if (focus) tabs[i].focus();
      if (onSelect) onSelect(i);
      // a panel that was hidden had no width, so its scroll boxes are measured again
      if (scrollWatch) queueScrollRefresh(null);
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(i, false); });
      t.addEventListener('keydown', function (e) {
        let k = -1;
        if (e.key === 'ArrowRight') k = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') k = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') k = 0;
        else if (e.key === 'End') k = tabs.length - 1;
        if (k >= 0) { e.preventDefault(); select(k, true); }
      });
    });
    return select;
  }

  /**
   * Accessible tabs (role=tablist, roving tabindex, arrow keys, Home/End).
   * @param {HTMLElement} container
   * @param {{id:string, label:string, content?:(Node|string|function():Node)}[]} items
   * @param {{selected?:string, label?:string}} [o] label: accessible name of the tab list
   * @returns {{el:HTMLElement, value:string, select:function(string):void, on:Function, panel:function(string):HTMLElement}}
   */
  ui.tabs = function (container, items, o) {
    const opt = o || {};
    const base = uid('tabs');
    const list = el('div', { role: 'tablist', 'aria-label': opt.label || 'Views' });
    const wrap = el('div', { class: 'tabs' }, list);
    const tabs = [], panels = [];
    items.forEach(function (it) {
      const t = el('button', { type: 'button', role: 'tab', id: base + '-tab-' + it.id, 'aria-controls': base + '-panel-' + it.id }, it.label);
      const content = typeof it.content === 'function' ? it.content() : it.content;
      const p = el('div', { role: 'tabpanel', class: 'tab-panel', id: base + '-panel-' + it.id, 'aria-labelledby': t.id, tabindex: '0' }, content || null);
      tabs.push(t); panels.push(p); list.appendChild(t); wrap.appendChild(p);
    });
    let current = 0;
    const handlers = [];
    const select = wireTabs(list, tabs, panels, function (i) {
      const changed = i !== current;
      current = i;
      if (changed) handlers.forEach(function (fn) { fn(items[i].id); });
    });
    const start = Math.max(0, items.findIndex(function (it) { return it.id === opt.selected; }));
    current = start;
    select(start, false);
    container.appendChild(wrap);
    return {
      el: wrap,
      get value() { return items[current].id; },
      select: function (id) { const i = items.findIndex(function (it) { return it.id === id; }); if (i >= 0) select(i, false); },
      on: function (evt, fn) { if (evt === 'change') handlers.push(fn); return this; },
      panel: function (id) { const i = items.findIndex(function (it) { return it.id === id; }); return panels[i] || null; }
    };
  };

  /**
   * Add tab behaviour to existing markup: a .tabs element containing [role=tablist] with
   * [role=tab][aria-controls] buttons; panels are found by id.
   * @param {ParentNode} [scope=document] @returns {number} how many tab sets were wired
   */
  ui.enhanceTabs = function (scope) {
    let n = 0;
    ui.qsa('.tabs [role="tablist"]', scope).forEach(function (list) {
      if (list.dataset.wired) return;
      list.dataset.wired = '1';
      const tabs = ui.qsa('[role="tab"]', list);
      const panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
      const select = wireTabs(list, tabs, panels, null);
      const i = Math.max(0, tabs.findIndex(function (t) { return t.getAttribute('aria-selected') === 'true'; }));
      select(i, false);
      n += 1;
    });
    return n;
  };

  /* ================================================================ files and URLs */

  /**
   * Download text as a file (Blob + <a download>; works from file://).
   * @param {string} filename @param {string} text @param {string} [mime='text/csv']
   */
  ui.download = function (filename, text, mime) {
    const blob = new root.Blob([text], { type: (mime || 'text/csv') + ';charset=utf-8' });
    const url = root.URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename, hidden: true });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { root.URL.revokeObjectURL(url); a.remove(); }, 1500);
  };

  function csvNum(x) { return isFinite(x) ? String(Number(x.toPrecision(10))) : ''; }

  /**
   * CSV of a logged simulation run in display units (deg, deg/s, mN m).
   * @param {Object} result ADCS.sim.run result with logs @param {{decimate?:number}} [o] keep every n-th sample
   * @returns {string}
   */
  ui.toCSV = function (result, o) {
    const step = Math.max(1, Math.round((o && o.decimate) || 1));
    const R2D = 180 / Math.PI;
    const n = result.n;
    const cols = ['t_s', 'q0', 'q1', 'q2', 'q3', 'wx_deg_s', 'wy_deg_s', 'wz_deg_s', 'tau_x_mNm', 'tau_y_mNm', 'tau_z_mNm',
      'tau_cmd_x_mNm', 'tau_cmd_y_mNm', 'tau_cmd_z_mNm', 'err_deg', 'rate_deg_s', 'mode', 'fault'];
    if (result.estErrDeg) cols.push('est_err_deg');
    const lines = [cols.join(',')];
    for (let k = 0; k < n; k += step) {
      const row = [csvNum(result.t[k]),
        csvNum(result.q[4 * k]), csvNum(result.q[4 * k + 1]), csvNum(result.q[4 * k + 2]), csvNum(result.q[4 * k + 3]),
        csvNum(result.w[3 * k] * R2D), csvNum(result.w[3 * k + 1] * R2D), csvNum(result.w[3 * k + 2] * R2D),
        csvNum(result.tau[3 * k] * 1000), csvNum(result.tau[3 * k + 1] * 1000), csvNum(result.tau[3 * k + 2] * 1000),
        csvNum(result.tauCmd[3 * k] * 1000), csvNum(result.tauCmd[3 * k + 1] * 1000), csvNum(result.tauCmd[3 * k + 2] * 1000),
        csvNum(result.errDeg[k]), csvNum(result.rateDeg[k]), MODE_NAMES[result.mode[k]] || '', result.fault[k] ? '1' : '0'];
      if (result.estErrDeg) row.push(csvNum(result.estErrDeg[k]));
      lines.push(row.join(','));
    }
    return lines.join('\n') + '\n';
  };

  /**
   * Copy text to the clipboard (Clipboard API, with a textarea fallback).
   * @param {string} s @returns {Promise<boolean>} true when copied
   */
  ui.copyText = function (s) {
    function fallback() {
      const ta = el('textarea', { readonly: true, style: 'position:fixed;left:-9999px;top:0;opacity:0' });
      ta.value = s;
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }
    try {
      if (root.navigator && root.navigator.clipboard && root.isSecureContext) {
        return root.navigator.clipboard.writeText(s).then(function () { return true; }, function () { return fallback(); });
      }
    } catch (e) { /* fall through to the textarea fallback */ }
    return Promise.resolve(fallback());
  };

  /**
   * Link into the simulator. hash: 'preset=T03' string, an object of raw hash keys
   * ({preset:'T03', gap:1}) or a config delta encoded with ADCS.hash.encode.
   * @param {string} label @param {string|Object} [hashObj] @returns {HTMLAnchorElement}
   */
  ui.simLink = function (label, hashObj) {
    let h = '';
    if (typeof hashObj === 'string') h = hashObj.replace(/^#/, '');
    else if (hashObj && typeof hashObj === 'object') {
      const keys = Object.keys(hashObj);
      const raw = ADCS.hash && ADCS.hash.KEYS ? ADCS.hash.KEYS : ['preset', 'eul', 'w', 'ctl', 'pid', 'kd', 'lqr', 'safe', 'gap', 'fault', 'td', 'sat', 'dur', 'dt', 'sens', 'q0', 'mc', 't', 'method', 'renorm'];
      const allRaw = keys.every(function (k) { return raw.indexOf(k) >= 0; });
      if (allRaw || !(ADCS.hash && ADCS.hash.encode)) {
        h = keys.map(function (k) {
          const v = hashObj[k];
          return k + '=' + (Array.isArray(v) ? v.join(',') : (v === true ? '1' : v === false ? '0' : String(v)));
        }).join('&');
      } else h = ADCS.hash.encode(hashObj);
    }
    return el('a', { class: 'sim-link', href: BASE + 'simulator.html' + (h ? '#' + h : '') }, ui.icon('sim'), el('span', null, label));
  };

  /* ================================================================ maths and glossary terms */

  /**
   * Typeset \( … \) and \[ … \] with KaTeX auto-render when it is loaded. Without KaTeX the
   * TeX source stays as readable text and html gets the class 'no-katex'.
   * @param {HTMLElement} [scope=document.body] @returns {boolean} true if KaTeX ran
   */
  ui.typeset = function (scope) {
    const node = scope || document.body;
    if (typeof root.renderMathInElement !== 'function') {
      document.documentElement.classList.add('no-katex');
      ui.markScrollable(node);
      return false;
    }
    try {
      root.renderMathInElement(node, {
        delimiters: [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }],
        throwOnError: false,
        strict: 'ignore',
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
        ignoredClasses: ['no-math'],
        errorCallback: function () { node.classList.add('math-error'); }
      });
      ui.markScrollable(node);
      return true;
    } catch (e) {
      document.documentElement.classList.add('no-katex');
      return false;
    }
  };

  const SCROLL_SEL = ['.katex-display', '.eq', '.scroll-x', '[data-scroll-x]'];
  const extraScrollSel = [];
  const scrollables = new Set();
  let notScrollBox = new WeakSet();
  let scrollWatch = false, scrollQueued = false, scrollFull = false, scrollScopes = [];
  function scrollLabel(box) {
    const table = box.querySelector('table');
    if (table) {
      const cap = table.querySelector('caption');
      const t = cap ? cap.textContent.replace(/\s+/g, ' ').trim() : '';
      return (t ? 'Table: ' + (t.length > 80 ? t.slice(0, 79) + '…' : t) : 'Table') + ' (scrolls sideways)';
    }
    if (box.querySelector('.katex') || box.classList.contains('katex-display') || box.classList.contains('eq')) return 'Equation (scrolls sideways)';
    return 'Wide content (scrolls sideways)';
  }
  function refreshScrollable(box) {
    if (!box.isConnected) { scrollables.delete(box); return; }
    const over = box.scrollWidth > box.clientWidth + 1;
    if (over && !box.hasAttribute('tabindex')) {
      box.setAttribute('tabindex', '0');
      box.dataset.autoTab = '1';
      // a focusable box needs a name; a page that named it already keeps its own
      if (!box.hasAttribute('role') && !box.hasAttribute('aria-label') && !box.hasAttribute('aria-labelledby')) {
        box.setAttribute('role', 'group');
        box.setAttribute('aria-label', scrollLabel(box));
        box.dataset.autoName = '1';
      }
    } else if (!over && box.dataset.autoTab) {
      box.removeAttribute('tabindex');
      delete box.dataset.autoTab;
      if (box.dataset.autoName) { box.removeAttribute('role'); box.removeAttribute('aria-label'); delete box.dataset.autoName; }
    }
  }
  /** Add the scroll boxes inside scope to the watched set, including any box of inline maths that scrolls itself. */
  function collectScrollables(scope) {
    ui.qsa(SCROLL_SEL.concat(extraScrollSel).join(', '), scope).forEach(function (b) { scrollables.add(b); });
    ui.qsa('.katex', scope).forEach(function (k) {
      const p = k.parentElement;
      if (!p || scrollables.has(p) || notScrollBox.has(p) || p.classList.contains('katex-display')) return;
      const ox = root.getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') scrollables.add(p); else notScrollBox.add(p);
    });
  }
  /**
   * Measure the queued work: everything after a font, resize or load event (which also picks up
   * boxes rendered since), otherwise only the boxes inside the scopes that typeset() just changed,
   * so a widget that re-typesets on every input does not re-measure the whole page.
   */
  function runScrollRefresh() {
    scrollQueued = false;
    if (!document.body) return;
    if (scrollFull) {
      scrollFull = false; scrollScopes = [];
      notScrollBox = new WeakSet();
      collectScrollables(document.body);
      scrollables.forEach(refreshScrollable);
      return;
    }
    const scopes = scrollScopes.filter(function (sc) { return sc.isConnected; });
    scrollScopes = [];
    scopes.forEach(collectScrollables);
    scrollables.forEach(function (b) {
      if (!b.isConnected) { scrollables.delete(b); return; }
      if (scopes.some(function (sc) { return sc === b || sc.contains(b); })) refreshScrollable(b);
    });
  }
  /** Queue a measurement for the next frame, together with the layout the browser does for painting anyway. */
  function queueScrollRefresh(scope) {
    if (scope && scope.nodeType === 1) { if (scrollScopes.indexOf(scope) < 0) scrollScopes.push(scope); }
    else scrollFull = true;
    if (scrollQueued) return;
    scrollQueued = true;
    if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(runScrollRefresh);
    else setTimeout(runScrollRefresh, 0);
  }
  function watchScrollables() {
    if (scrollWatch) return;
    scrollWatch = true;
    const later = ui.debounce(function () { queueScrollRefresh(null); }, 150);
    root.addEventListener('resize', later);
    root.addEventListener('load', later);
    // KaTeX's web fonts usually arrive after typesetting and widen the equations.
    const fonts = document.fonts;
    if (fonts) {
      if (fonts.ready && typeof fonts.ready.then === 'function') fonts.ready.then(later, function () { /* no fonts: nothing changes */ });
      if (typeof fonts.addEventListener === 'function') fonts.addEventListener('loadingdone', later);
    }
    // A late vertical scrollbar or new content can narrow or widen <main> without a resize event.
    const main = document.getElementById('main');
    if (main && typeof root.ResizeObserver === 'function') {
      let lastW = -1;
      new root.ResizeObserver(function (entries) {
        const w = Math.round(entries[0].contentRect.width);
        if (w !== lastW) { lastW = w; later(); }
      }).observe(main);
    }
  }
  /**
   * Make horizontally scrolling boxes keyboard-focusable while they overflow, so keyboard users
   * can scroll them. A box made focusable gets role="group" and an aria-label unless it already
   * has a name. Boxes: .katex-display, .eq, .scroll-x, [data-scroll-x], any element whose own
   * overflow-x is auto/scroll and that directly holds inline KaTeX, and the extra selectors passed
   * here (remembered for later checks). The check runs on the next animation frame (for the
   * scope only) and again for the whole page after the web fonts load, on window load and resize,
   * when the width of #main changes and when ui.tabs shows another panel. typeset() calls this.
   * @param {ParentNode} [scope=document.body]
   * @param {string|string[]} [extraSelectors] e.g. '.my-scroll-box'
   */
  ui.markScrollable = function (scope, extraSelectors) {
    (Array.isArray(extraSelectors) ? extraSelectors : extraSelectors ? [extraSelectors] : []).forEach(function (s) {
      if (typeof s === 'string' && s && extraScrollSel.indexOf(s) < 0) extraScrollSel.push(s);
    });
    watchScrollables();
    queueScrollRefresh(scope && scope.nodeType === 1 ? scope : document.body);
  };

  let tip = null, tipHide = null, tipAnchor = null;
  function showTip(anchor, text) {
    if (tipHide) { clearTimeout(tipHide); tipHide = null; }
    if (!tip) {
      tip = el('div', { class: 'term-tip', role: 'tooltip', id: 'adcs-term-tip', hidden: true });
      tip.addEventListener('mouseenter', function () { if (tipHide) { clearTimeout(tipHide); tipHide = null; } });
      tip.addEventListener('mouseleave', function () { hideTip(120); });
      document.body.appendChild(tip);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideTip(0); });
    }
    tipAnchor = anchor;
    tip.textContent = text;
    tip.hidden = false;
    const r = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.max(8, Math.min(r.left, vw - w - 8));
    let top = r.bottom + 6;
    if (top + h > vh - 8) top = Math.max(8, r.top - h - 6);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function hideTip(delay) {
    if (!tip) return;
    if (tipHide) clearTimeout(tipHide);
    tipHide = setTimeout(function () { tip.hidden = true; tipAnchor = null; tipHide = null; }, delay || 0);
  }

  /**
   * Turn <dfn data-term="id">…</dfn> into links to glossary.html#g-<id>, with the definition
   * shown on hover and focus (dismiss with Escape) and exposed as the link's description.
   * Unknown terms are left as plain text.
   * @param {ParentNode} [scope=document.body] @returns {number} how many terms were linked
   */
  ui.linkTerms = function (scope) {
    const D = ADCS.data;
    if (!D || typeof D.term !== 'function') return 0;
    let defs = document.getElementById('adcs-term-defs');
    let n = 0;
    ui.qsa('dfn[data-term]', scope || document.body).forEach(function (d) {
      if (d.dataset.linked) return;
      const id = d.getAttribute('data-term');
      const t = D.term(id);
      d.dataset.linked = '1';
      if (!t) { d.classList.add('term-unknown'); return; }
      if (!defs) { defs = el('div', { id: 'adcs-term-defs', hidden: true }); document.body.appendChild(defs); }
      const defId = 'def-' + id;
      if (!document.getElementById(defId)) defs.appendChild(el('span', { id: defId }, t.def));
      const a = el('a', { class: 'term', href: BASE + 'glossary.html#g-' + id, 'aria-describedby': defId });
      while (d.firstChild) a.appendChild(d.firstChild);
      d.appendChild(a);
      const text = t.term + ': ' + t.def;
      a.addEventListener('mouseenter', function () { showTip(a, text); });
      a.addEventListener('mouseleave', function () { hideTip(150); });
      a.addEventListener('focus', function () { showTip(a, text); });
      a.addEventListener('blur', function () { if (tipAnchor === a) hideTip(0); });
      n += 1;
    });
    return n;
  };

})(typeof window !== 'undefined' ? window : globalThis);
