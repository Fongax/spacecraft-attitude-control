/**
 * adcs-plot.js: ADCS.plot, dependency-free canvas plots.
 *
 *   line(container, opts)       time series with thresholds, bands, a cursor and hover readout
 *   timeline(container, opts)   mode bands with hatched fault windows and event ticks
 *   histogram(container, opts)  bins with markers, optional overlays and density curves
 *   scatter(container, opts)    points coloured on a sequential scale, click to pick
 *   splane(container, opts)     poles on the complex plane with damping lines and ωn circles
 *   bars(container, opts)       horizontal bars (optionally log scale) with reference lines
 *
 * Every plot: devicePixelRatio scaling, ResizeObserver re-render, colours read from CSS
 * variables at render time (re-render on 'adcs:themechange'), a focusable canvas with
 * role="img", keyboard cursor (←/→, Shift for bigger steps, Home/End), a visually hidden
 * text summary, and a "Data (CSV)" button. Colours may be CSS variable names ('--axis-x')
 * or literal CSS colours.
 */
(function (root) { 'use strict';
  const ADCS = root.ADCS = root.ADCS || {};
  const plot = ADCS.plot = ADCS.plot || {};

  const MONO = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const SANS = '12px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const SANS_B = '600 12px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const MINUS = '−';
  const PALETTE = ['--axis-x', '--axis-y', '--axis-z', '--accent', '--warn', '--ext', '--text-2'];
  const MODE_VARS = ['--mode-n', '--mode-sd', '--mode-sh'];
  const MODE_NAMES = ['NOMINAL', 'SAFE_DETUMBLE', 'SAFE_HOLD'];
  const MODE_ABBR = ['N', 'SD', 'SH'];
  let idc = 0;

  /* ================================================================ helpers */

  function h(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : String(v));
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function svgEl(tag, attrs) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, String(attrs[k])); });
    return n;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function fin(v) { return typeof v === 'number' && isFinite(v); }
  function minus(s) { return s.charAt(0) === '-' ? (Number(s) === 0 ? s.slice(1) : MINUS + s.slice(1)) : s; }
  const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
  function sup(n) { return String(n).split('').map(function (c) { return SUP[c] || c; }).join(''); }

  /** Format a value with sig significant digits (proper minus, scientific for extremes). */
  function num(v, sig) {
    if (!fin(v)) return '–';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a < 1e-3 || a >= 1e6) {
      const d = Math.max(0, (sig || 3) - 1);
      let e = Math.floor(Math.log10(a));
      let m = (v / Math.pow(10, e)).toFixed(d);
      if (Math.abs(Number(m)) >= 10) { e += 1; m = (v / Math.pow(10, e)).toFixed(d); }
      return minus(m) + '×10' + sup(e);
    }
    return minus(String(Number(v.toPrecision(sig || 3))));
  }
  plot.formatValue = num;

  function niceStep(span, maxTicks) {
    const raw = span / Math.max(1, maxTicks);
    if (!(raw > 0) || !isFinite(raw)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }
  function linTicks(min, max, maxTicks) {
    let step = niceStep(max - min, maxTicks);
    function count(st) { return Math.floor(max / st + 1e-9) - Math.ceil(min / st - 1e-9) + 1; }
    // Rounding the step up can leave one tick in a narrow range (−90…90 with step 100 shows only 0):
    // step down the 1-2-5 ladder until at least two ticks fall inside.
    for (let guard = 0; max > min && count(step) < 2 && guard < 6; guard++) {
      const p = Math.pow(10, Math.floor(Math.log10(step) + 1e-9)), m = Math.round(step / p);
      step = (m > 5 ? 5 : m > 2 ? 2 : m > 1 ? 1 : 0.5) * p;
    }
    const out = [];
    const t0 = Math.ceil(min / step - 1e-9) * step;
    for (let v = t0, i = 0; v <= max + step * 1e-9 && i < 200; v = t0 + (++i) * step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return { ticks: out, step: step };
  }
  function tickLabel(v, step) {
    if (v === 0) return '0';
    if (Math.abs(step) < 1e-3 || Math.abs(v) >= 1e5) {
      const e = Math.floor(Math.log10(Math.abs(step)));
      const m = v / Math.pow(10, e);
      return minus(String(Number(m.toPrecision(3)))) + '×10' + sup(e);
    }
    const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    return minus(v.toFixed(d));
  }
  function logLabel(k) { return (k >= -2 && k <= 3) ? minus(String(Math.pow(10, k))) : '10' + sup(k); }
  /** Split an axis label "t (s)" into {name:'t', unit:'s'}. */
  function parseLabel(label) {
    const m = String(label || '').match(/^(.*?)\s*\(([^()]*)\)\s*$/);
    return m ? { name: m[1], unit: m[2] } : { name: String(label || ''), unit: '' };
  }
  function withUnit(v, unit) { return unit ? v + (/^[°%]/.test(unit) ? '' : ' ') + unit : v; }
  /** Shorten text with an ellipsis until it fits maxW pixels in the current canvas font. */
  function fitText(ctx, text, maxW) {
    let t = String(text);
    if (ctx.measureText(t).width <= maxW) return t;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t.replace(/\s+$/, '') + '…';
  }
  function lowerBound(xs, n, x) { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] < x) lo = m + 1; else hi = m; } return lo; }

  function parseColor(c) {
    let m = /^#([0-9a-f]{3})$/i.exec(c);
    if (m) return [0, 1, 2].map(function (i) { return parseInt(m[1][i] + m[1][i], 16); });
    m = /^#([0-9a-f]{6})/i.exec(c);
    if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(c);
    if (m) return [+m[1], +m[2], +m[3]];
    return [128, 128, 128];
  }
  function mix(a, b, t) {
    const A = parseColor(a), B = parseColor(b);
    return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(A[i] + (B[i] - A[i]) * t); }).join(',') + ')';
  }

  const hatchCache = new Map();
  function hatch(ctx, color) {
    const key = color;
    if (hatchCache.has(key)) return hatchCache.get(key);
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const g = c.getContext('2d');
    g.strokeStyle = color; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-2, 10); g.lineTo(10, -2); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(6, 10); g.lineTo(10, 6); g.stroke();
    const p = ctx.createPattern(c, 'repeat');
    hatchCache.set(key, p);
    return p;
  }

  function download(name, text) {
    if (ADCS.ui && ADCS.ui.download) { ADCS.ui.download(name, text, 'text/csv'); return; }
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: name });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  function slug(s) { return String(s || 'plot').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plot'; }
  function csvCell(v) {
    if (typeof v === 'number') return fin(v) ? String(Number(v.toPrecision(10))) : '';
    const s = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /* ================================================================ frame (shared DOM, sizing, events) */

  function frame(container, o, kind) {
    const id = 'plot-' + (++idc);
    const f = { id: id, o: o, w: 300, h: o.height || 180, dpr: 1, destroyed: false };
    f.root = h('div', { class: 'plot plot-' + kind });
    const title = o.title ? h('p', { class: 'plot-title', id: id + '-title', text: o.title }) : null;
    f.csvBtn = h('button', { type: 'button', class: 'link plot-csv', 'aria-label': 'Download data as CSV' + (o.title ? ': ' + o.title : '') }, ['Data (CSV)']);
    f.head = h('div', { class: 'plot-head' }, [title || h('span'), f.csvBtn]);
    f.legend = h('div', { class: 'plot-legend' });
    f.legend.hidden = true;
    f.wrap = h('div', { class: 'plot-canvas' });
    f.canvas = h('canvas', { role: 'img', tabindex: '0', 'aria-label': o.ariaLabel || o.title || 'Plot', 'aria-describedby': id + '-sum' });
    f.overlay = h('canvas', { class: 'plot-overlay', 'aria-hidden': 'true' });
    f.tip = h('div', { class: 'plot-tip', 'aria-hidden': 'true' });
    f.tip.hidden = true;
    f.wrap.appendChild(f.canvas); f.wrap.appendChild(f.overlay); f.wrap.appendChild(f.tip);
    f.sum = h('p', { class: 'visually-hidden', id: id + '-sum' });
    f.live = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
    f.root.appendChild(f.head); f.root.appendChild(f.legend); f.root.appendChild(f.wrap); f.root.appendChild(f.sum); f.root.appendChild(f.live);
    if (o.scaleNode) f.root.appendChild(o.scaleNode);
    container.appendChild(f.root);
    f.ctx = f.canvas.getContext('2d');
    f.octx = f.overlay.getContext('2d');
    f.customSummary = null;

    f.measure = function () {
      const w = Math.max(120, Math.floor(f.wrap.clientWidth || container.clientWidth || 300));
      const dpr = Math.min(3, root.devicePixelRatio || 1);
      const hh = f.h;
      if (w === f.w && dpr === f.dpr && f.canvas.width === Math.round(w * dpr) && f.canvas.height === Math.round(hh * dpr)) return false;
      f.w = w; f.dpr = dpr;
      [f.canvas, f.overlay].forEach(function (c) {
        c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr);
        c.style.height = hh + 'px';
      });
      return true;
    };
    f.begin = function (ctx) {
      ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
      ctx.clearRect(0, 0, f.w, f.h);
    };
    f.colors = function () {
      const cs = root.getComputedStyle(f.root);
      const cache = {};
      return function (name, fallback) {
        if (!name) return fallback || '#808080';
        if (name.slice(0, 2) !== '--') return name;
        if (!(name in cache)) cache[name] = cs.getPropertyValue(name).trim() || fallback || '#808080';
        return cache[name];
      };
    };
    f.setSummary = function (text, custom) {
      if (custom) f.customSummary = text;
      const t = f.customSummary !== null ? f.customSummary : text;
      f.sum.textContent = t;
      f.canvas.setAttribute('aria-label', (o.ariaLabel || o.title || 'Plot') + (t ? '. ' + t : ''));
    };
    let liveTimer = null;
    f.say = function (text) {
      if (liveTimer) clearTimeout(liveTimer);
      liveTimer = setTimeout(function () { f.live.textContent = text; }, 350);
    };
    f.showTip = function (lines, px) {
      f.tip.textContent = '';
      lines.forEach(function (ln, i) {
        const row = h('div');
        if (ln.color) { const sw = h('span', { class: 'sw' }); sw.style.background = ln.color; row.appendChild(sw); }
        row.appendChild(document.createTextNode(ln.text));
        if (i === 0) row.style.fontWeight = '700';
        f.tip.appendChild(row);
      });
      f.tip.hidden = false;
      const tw = f.tip.offsetWidth;
      let left = px + 12;
      if (left + tw > f.w - 4) left = px - tw - 12;
      f.tip.style.left = clamp(left, 4, Math.max(4, f.w - tw - 4)) + 'px';
    };
    f.hideTip = function () { f.tip.hidden = true; };

    let raf = 0;
    f.schedule = function () {
      if (raf || f.destroyed) return;
      raf = root.requestAnimationFrame(function () { raf = 0; if (!f.destroyed) f.render(); });
    };
    f.onTheme = function () { hatchCache.clear(); f.schedule(); };
    root.addEventListener('adcs:themechange', f.onTheme);
    if (typeof root.ResizeObserver === 'function') {
      f.ro = new root.ResizeObserver(function () {
        const w = Math.floor(f.wrap.clientWidth);
        if (w && w !== f.w) f.schedule();
      });
      f.ro.observe(f.wrap);
    } else {
      f.onResize = function () { f.schedule(); };
      root.addEventListener('resize', f.onResize);
    }
    f.csvBtn.addEventListener('click', function () { download(slug(o.title || kind) + '.csv', f.csv()); });
    f.destroy = function () {
      f.destroyed = true;
      if (raf) root.cancelAnimationFrame(raf);
      root.removeEventListener('adcs:themechange', f.onTheme);
      if (f.ro) f.ro.disconnect();
      if (f.onResize) root.removeEventListener('resize', f.onResize);
      f.root.remove();
    };
    return f;
  }

  /** Common keyboard + pointer wiring for plots with an x cursor. */
  function wireCursor(f, api, getRange, xFromPx, onHover, stepX) {
    const seekers = [];
    api.onSeek = function (fn) { seekers.push(fn); return api; };
    function seek(x) { api.setCursor(x); seekers.forEach(function (fn) { fn(x); }); }
    f.canvas.addEventListener('pointermove', function (e) {
      const r = f.canvas.getBoundingClientRect();
      onHover(xFromPx(e.clientX - r.left), e.clientX - r.left, e.clientY - r.top);
    });
    f.canvas.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') { const r = f.canvas.getBoundingClientRect(); onHover(xFromPx(e.clientX - r.left), e.clientX - r.left, e.clientY - r.top); }
    });
    f.canvas.addEventListener('pointerleave', function () { onHover(null); });
    f.canvas.addEventListener('click', function (e) {
      const r = f.canvas.getBoundingClientRect();
      const x = xFromPx(e.clientX - r.left);
      if (x !== null) seek(x);
    });
    f.canvas.addEventListener('keydown', function (e) {
      const rg = getRange();
      if (!rg) return;
      const span = rg[1] - rg[0];
      let x = api.cursor !== null && api.cursor !== undefined ? api.cursor : rg[0];
      if (e.key === 'ArrowRight') x = stepX ? stepX(x, 1, e.shiftKey) : x + span * (e.shiftKey ? 0.1 : 0.01);
      else if (e.key === 'ArrowLeft') x = stepX ? stepX(x, -1, e.shiftKey) : x - span * (e.shiftKey ? 0.1 : 0.01);
      else if (e.key === 'Home') x = rg[0];
      else if (e.key === 'End') x = rg[1];
      else if (e.key === 'Escape') { onHover(null); return; }
      else return;
      e.preventDefault();
      x = clamp(x, rg[0], rg[1]);
      seek(x);
      onHover(x, null, null, true);
    });
    f.canvas.addEventListener('blur', function () { onHover(null); });
  }

  /* ================================================================ line plot */

  /**
   * Line plot.
   * @param {HTMLElement} container
   * @param {{height?:number, title?:string, xLabel?:string, yLabel?:string, ariaLabel?:string,
   *   x?:{min?:number, max?:number, log?:boolean}, y?:{min?:number, max?:number, auto?:boolean, pad?:number, log?:boolean,
   *   symmetric?:boolean, includeLines?:boolean}, series?:{id:string, label:string, color?:string, width?:number,
   *   dash?:number[], alpha?:number, unit?:string}[], hlines?:{y:number, label?:string, color?:string, dash?:number[]}[],
   *   vlines?:{x:number, label?:string, color?:string, dash?:number[]}[], bands?:{y0:number, y1:number, color?:string}[],
   *   vbands?:{x0:number, x1:number, color?:string, hatch?:boolean}[], legend?:boolean, cursor?:boolean,
   *   margin?:{left?:number, right?:number}}} o
   *   x.log: logarithmic x axis with decade ticks (points with x <= 0 are skipped), like y.log
   * @returns {Object} p with set(id, xs, ys, {stride, offset}), addSeries, removeSeries, visible(id, on),
   *   setCursor(x), setX(min, max), setY(opts), setLines({hlines, vlines, bands, vbands}), onSeek(fn),
   *   render(), summary(text), csv(), destroy(), el
   */
  plot.line = function (container, o) {
    const opts = Object.assign({ height: 180, legend: true, cursor: true }, o || {});
    const f = frame(container, opts, 'line');
    let xo = Object.assign({ min: null, max: null, log: false }, opts.x);
    let yo = Object.assign({ auto: true, pad: 0.08, log: false, symmetric: false, includeLines: true }, opts.y);
    let hlines = opts.hlines || [], vlines = opts.vlines || [], bands = opts.bands || [], vbands = opts.vbands || [];
    const xl = parseLabel(opts.xLabel || 't (s)'), ylab = parseLabel(opts.yLabel || '');
    const series = [];
    let geo = null;     // last layout: {L, T, W, H, x0, x1, y0, y1, X, Y}
    let hoverX = null, kbd = false;
    const api = { el: f.root, canvas: f.canvas, cursor: null };

    function find(id) { return series.find(function (s) { return s.id === id; }); }
    function addSeries(def) {
      let s = find(def.id);
      if (!s) { s = { id: def.id, xs: null, ys: null, stride: 1, offset: 0, n: 0, visible: true }; series.push(s); }
      s.label = def.label || s.label || def.id;
      s.color = def.color || s.color || PALETTE[(series.indexOf(s)) % PALETTE.length];
      s.width = def.width || s.width || 1.5;
      s.dash = def.dash || s.dash || [];
      s.alpha = def.alpha !== undefined ? def.alpha : (s.alpha !== undefined ? s.alpha : 1);
      s.unit = def.unit !== undefined ? def.unit : (s.unit !== undefined ? s.unit : ylab.unit);
      s.legend = def.legend !== false;
      buildLegend();
      return s;
    }
    (opts.series || []).forEach(addSeries);

    function buildLegend() {
      f.legend.textContent = '';
      const items = series.filter(function (s) { return s.legend; });
      f.legend.hidden = !opts.legend || !items.length;
      items.forEach(function (s) {
        const sw = svgEl('svg', { viewBox: '0 0 26 10', 'aria-hidden': 'true' });
        const ln = svgEl('line', { x1: 1, y1: 5, x2: 25, y2: 5, 'stroke-width': Math.max(2, s.width), 'stroke-linecap': 'butt' });
        ln.style.stroke = s.color.slice(0, 2) === '--' ? 'var(' + s.color + ')' : s.color;
        if (s.dash.length) ln.setAttribute('stroke-dasharray', s.dash.join(' '));
        if (s.alpha < 1) ln.setAttribute('stroke-opacity', s.alpha);
        sw.appendChild(ln);
        const b = h('button', { type: 'button', 'aria-pressed': s.visible ? 'true' : 'false', title: 'Show or hide ' + s.label }, [sw, s.label]);
        b.addEventListener('click', function () { s.visible = !s.visible; b.setAttribute('aria-pressed', s.visible ? 'true' : 'false'); f.schedule(); });
        f.legend.appendChild(b);
      });
    }
    function xAt(s, i) { return s.xs ? s.xs[i] : i; }
    function yAt(s, i) { return s.ys[s.offset + i * s.stride]; }

    function extents() {
      let x0 = Infinity, x1 = -Infinity;
      series.forEach(function (s) {
        if (!s.n) return;
        let i = 0;
        if (xo.log) while (i < s.n && !(xAt(s, i) > 0)) i++;   // xs ascend: skip x <= 0
        if (i < s.n) { x0 = Math.min(x0, xAt(s, i)); x1 = Math.max(x1, xAt(s, s.n - 1)); }
      });
      if (xo.log) {
        if (!(x0 > 0) || !fin(x0) || !fin(x1)) { x0 = 1; x1 = 10; }
        let k0 = Math.floor(Math.log10(x0) + 1e-9), k1 = Math.ceil(Math.log10(x1) - 1e-9);
        if (k1 <= k0) k1 = k0 + 1;
        x0 = Math.pow(10, k0); x1 = Math.pow(10, k1);
        if (fin(xo.min) && xo.min > 0) x0 = xo.min;
        if (fin(xo.max) && xo.max > 0) x1 = xo.max;
        if (x1 <= x0) x1 = x0 * 10;
      } else {
        if (fin(xo.min)) x0 = xo.min;
        if (fin(xo.max)) x1 = xo.max;
        if (!fin(x0) || !fin(x1)) { x0 = 0; x1 = 1; }
        if (x1 <= x0) x1 = x0 + 1;
      }
      let y0 = Infinity, y1 = -Infinity;
      if (yo.auto !== false) {
        series.forEach(function (s) {
          if (!s.visible || !s.n) return;
          const i0 = s.xs ? Math.max(0, lowerBound(s.xs, s.n, x0) - 1) : 0;
          const i1 = s.xs ? Math.min(s.n - 1, lowerBound(s.xs, s.n, x1)) : s.n - 1;
          for (let i = i0; i <= i1; i++) {
            const v = yAt(s, i);
            if (!fin(v) || (yo.log && v <= 0)) continue;
            if (v < y0) y0 = v;
            if (v > y1) y1 = v;
          }
        });
        if (yo.includeLines) hlines.forEach(function (l) { if (fin(l.y) && (!yo.log || l.y > 0)) { y0 = Math.min(y0, l.y); y1 = Math.max(y1, l.y); } });
      }
      if (!fin(y0) || !fin(y1)) { y0 = yo.log ? 1e-3 : 0; y1 = yo.log ? 1 : 1; }
      if (yo.log) {
        let k0 = Math.floor(Math.log10(y0)), k1 = Math.ceil(Math.log10(y1));
        if (k1 <= k0) k1 = k0 + 1;
        y0 = Math.pow(10, k0); y1 = Math.pow(10, k1);
      } else {
        if (yo.symmetric) { const M = Math.max(Math.abs(y0), Math.abs(y1)) || 1; y0 = -M; y1 = M; }
        if (y1 === y0) { const d = Math.abs(y0) * 0.1 || 1; y0 -= d; y1 += d; }
        const pad = (y1 - y0) * (yo.pad || 0);
        const allPos = y0 >= 0;
        y0 -= pad; y1 += pad;
        if (allPos && y0 < 0 && !yo.symmetric) y0 = 0;
      }
      if (fin(yo.min)) y0 = yo.min;
      if (fin(yo.max)) y1 = yo.max;
      if (y1 <= y0) y1 = y0 + 1;
      return { x0: x0, x1: x1, y0: y0, y1: y1 };
    }

    function layout(ctx, e) {
      const T = 10, B = 22 + (opts.xLabel ? 16 : 0);
      ctx.font = MONO;
      let yt, labels;
      const Hh = f.h - T - B;
      if (yo.log) {
        yt = []; for (let k = Math.round(Math.log10(e.y0)); k <= Math.round(Math.log10(e.y1)); k++) yt.push(k);
        // every decade keeps its grid line; labels thin out so they stay at least 14 px apart
        const every = Math.max(1, Math.ceil(14 * (yt.length - 1) / Math.max(1, Hh)));
        labels = yt.map(function (k) { return (k - yt[0]) % every === 0 ? logLabel(k) : ''; });
      } else {
        const t = linTicks(e.y0, e.y1, Math.max(2, Math.floor(Hh / 30)));
        yt = t.ticks; labels = yt.map(function (v) { return tickLabel(v, t.step); });
      }
      let lw = 0;
      labels.forEach(function (s) { lw = Math.max(lw, ctx.measureText(s).width); });
      const m = opts.margin || {};
      const L = Math.max(m.left || 0, Math.ceil(lw) + 10 + (opts.yLabel ? 16 : 0), 40);
      const R = m.right !== undefined ? m.right : 12;
      const W = Math.max(20, f.w - L - R);
      const lx0 = xo.log ? Math.log10(e.x0) : 0, lx1 = xo.log ? Math.log10(e.x1) : 0;
      const X = xo.log
        ? function (v) { return v > 0 ? L + (Math.log10(v) - lx0) / (lx1 - lx0) * W : NaN; }
        : function (v) { return L + (v - e.x0) / (e.x1 - e.x0) * W; };
      const ly0 = yo.log ? Math.log10(e.y0) : 0, ly1 = yo.log ? Math.log10(e.y1) : 0;
      const Y = yo.log
        ? function (v) { return T + Hh - (Math.log10(v) - ly0) / (ly1 - ly0) * Hh; }
        : function (v) { return T + Hh - (v - e.y0) / (e.y1 - e.y0) * Hh; };
      return { L: L, T: T, W: W, H: Hh, X: X, Y: Y, yt: yt, ylabels: labels, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1 };
    }

    function drawSeries(ctx, s, g) {
      if (!s.n) return;
      const n = s.n;
      const i0 = s.xs ? Math.max(0, lowerBound(s.xs, n, g.x0) - 1) : 0;
      const i1 = s.xs ? Math.min(n - 1, lowerBound(s.xs, n, g.x1)) : n - 1;
      const count = i1 - i0 + 1;
      const yBad = function (v) { return !fin(v) || (yo.log && v <= 0); };
      const xBad = function (i) { return xo.log && !(xAt(s, i) > 0); };
      ctx.beginPath();
      let pen = false;
      if (count > 2 * g.W) {
        let col = null, first = 0, last = 0, lo = 0, hi = 0;
        const flush = function () {
          if (col === null) return;
          const cx = col + 0.5;
          if (!pen) { ctx.moveTo(cx, first); pen = true; } else ctx.lineTo(cx, first);
          ctx.lineTo(cx, lo); ctx.lineTo(cx, hi); ctx.lineTo(cx, last);
          col = null;
        };
        for (let i = i0; i <= i1; i++) {
          const v = yAt(s, i);
          if (yBad(v) || xBad(i)) { flush(); pen = false; continue; }
          const c = Math.floor(g.X(xAt(s, i)));
          const py = g.Y(v);
          if (c !== col) { flush(); col = c; first = last = lo = hi = py; }
          else { last = py; if (py < lo) lo = py; if (py > hi) hi = py; }
        }
        flush();
      } else {
        for (let i = i0; i <= i1; i++) {
          const v = yAt(s, i);
          if (yBad(v) || xBad(i)) { pen = false; continue; }
          const px = g.X(xAt(s, i)), py = g.Y(v);
          if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    }

    function render() {
      f.measure();
      const ctx = f.ctx, col = f.colors();
      f.begin(ctx);
      const g = geo = layout(ctx, extents());
      const right = g.L + g.W, bottom = g.T + g.H;
      ctx.fillStyle = col('--plot-bg', '#fff');
      ctx.fillRect(g.L, g.T, g.W, g.H);
      ctx.save();
      ctx.beginPath(); ctx.rect(g.L, g.T, g.W, g.H); ctx.clip();
      bands.forEach(function (b) {
        const ya = g.Y(clamp(b.y1, g.y0, g.y1)), yb = g.Y(clamp(b.y0, g.y0, g.y1));
        ctx.fillStyle = col(b.color || '--band-ok');
        ctx.fillRect(g.L, Math.min(ya, yb), g.W, Math.abs(yb - ya));
      });
      vbands.forEach(function (b) {
        const xa = g.X(clamp(b.x0, g.x0, g.x1)), xb = g.X(clamp(b.x1, g.x0, g.x1));
        ctx.fillStyle = col(b.color || '--band-fault');
        ctx.fillRect(xa, g.T, xb - xa, g.H);
        if (b.hatch) { ctx.fillStyle = hatch(ctx, col('--bad')); ctx.globalAlpha = 0.5; ctx.fillRect(xa, g.T, xb - xa, g.H); ctx.globalAlpha = 1; }
      });
      // grid
      ctx.strokeStyle = col('--grid'); ctx.lineWidth = 1;
      ctx.beginPath();
      g.yt.forEach(function (k) { const y = Math.round(g.Y(yo.log ? Math.pow(10, k) : k)) + 0.5; ctx.moveTo(g.L, y); ctx.lineTo(right, y); });
      if (yo.log && g.yt.length < 7) {
        for (let k = g.yt[0]; k < g.yt[g.yt.length - 1]; k++) for (let j = 2; j <= 9; j++) { const y = Math.round(g.Y(j * Math.pow(10, k))) + 0.5; ctx.moveTo(g.L, y); ctx.lineTo(right, y); }
      }
      const xt = xTicks(g);
      xt.ticks.forEach(function (v) { const x = Math.round(g.X(v)) + 0.5; ctx.moveTo(x, g.T); ctx.lineTo(x, bottom); });
      if (xo.log && xt.ticks.length < 7) {
        const k0 = Math.floor(Math.log10(g.x0) + 1e-9), k1 = Math.ceil(Math.log10(g.x1) - 1e-9);
        for (let k = k0; k < k1; k++) for (let j = 2; j <= 9; j++) {
          const v = j * Math.pow(10, k);
          if (v > g.x0 && v < g.x1) { const x = Math.round(g.X(v)) + 0.5; ctx.moveTo(x, g.T); ctx.lineTo(x, bottom); }
        }
      }
      ctx.stroke();
      // zero line
      if (!yo.log && g.y0 < 0 && g.y1 > 0) {
        ctx.strokeStyle = col('--border-strong'); ctx.globalAlpha = 0.6; ctx.beginPath();
        const y0 = Math.round(g.Y(0)) + 0.5; ctx.moveTo(g.L, y0); ctx.lineTo(right, y0); ctx.stroke(); ctx.globalAlpha = 1;
      }
      // series
      ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
      series.forEach(function (s) {
        if (!s.visible) return;
        ctx.strokeStyle = col(s.color); ctx.lineWidth = s.width; ctx.setLineDash(s.dash); ctx.globalAlpha = s.alpha;
        drawSeries(ctx, s, g);
      });
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      // threshold lines; labels sit at the right end and step left to avoid each other
      ctx.font = SANS_B;
      const placed = [];
      const shown = hlines.filter(function (l) { return fin(l.y) && l.y >= g.y0 && l.y <= g.y1 && !(yo.log && l.y <= 0); });
      // all lines first, then the labels on top, so a later line never strikes through an earlier label
      shown.forEach(function (l) {
        const y = Math.round(g.Y(l.y)) + 0.5;
        ctx.strokeStyle = col(l.color || '--line-req'); ctx.lineWidth = 1.25; ctx.setLineDash(l.dash || [5, 4]);
        ctx.beginPath(); ctx.moveTo(g.L, y); ctx.lineTo(right, y); ctx.stroke(); ctx.setLineDash([]);
      });
      shown.forEach(function (l) {
        if (!l.label) return;
        const y = Math.round(g.Y(l.y)) + 0.5;
        const below = y - g.T < 16;
        const tw = ctx.measureText(l.label).width;
        const top = below ? y + 2 : y - 16, bot = top + 15;
        let x1 = right - 4;
        for (let guard = 0; guard < placed.length + 1; guard++) {
          const hit = placed.find(function (r) { return top < r.b && bot > r.t && x1 > r.l - 6 && x1 - tw < r.r + 6; });
          if (!hit) break;
          x1 = hit.l - 10;
        }
        if (x1 - tw < g.L + 2) return;
        placed.push({ l: x1 - tw - 2, r: x1 + 2, t: top, b: bot });
        ctx.globalAlpha = 0.85; ctx.fillStyle = col('--plot-bg');
        ctx.fillRect(x1 - tw - 2, top, tw + 4, 15);
        ctx.globalAlpha = 1; ctx.fillStyle = col(l.color || '--line-req');
        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText(l.label, x1, top + 1.5);
      });
      // vertical lines; a label that would overlap an earlier one moves down a row
      const vplaced = [];
      vlines.forEach(function (l) {
        if (!fin(l.x) || l.x < g.x0 || l.x > g.x1) return;
        const x = Math.round(g.X(l.x)) + 0.5;
        ctx.strokeStyle = col(l.color || '--text-2'); ctx.lineWidth = 1; ctx.setLineDash(l.dash || [3, 3]);
        ctx.beginPath(); ctx.moveTo(x, g.T); ctx.lineTo(x, bottom); ctx.stroke(); ctx.setLineDash([]);
        if (!l.label) return;
        const w = ctx.measureText(l.label).width, flip = x > right - 60;
        const x0 = flip ? x - 4 - w : x + 4;
        let top = g.T + 2;
        for (let guard = 0; guard <= vplaced.length; guard++) {
          const hit = vplaced.some(function (r) { return x0 < r.r + 3 && x0 + w > r.l - 3 && top < r.b && top + 14 > r.t; });
          if (!hit) break;
          top += 15;
        }
        if (top + 14 > bottom) return;   // no room left: the line stays and its label is in the summary
        vplaced.push({ l: x0, r: x0 + w, t: top, b: top + 14 });
        ctx.fillStyle = col(l.color || '--text-2'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(l.label, x0, top);
      });
      ctx.restore();
      // axes
      ctx.strokeStyle = col('--border-strong'); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(g.L + 0.5, g.T); ctx.lineTo(g.L + 0.5, bottom + 0.5); ctx.lineTo(right, bottom + 0.5); ctx.stroke();
      ctx.fillStyle = col('--text-2'); ctx.font = MONO;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      g.yt.forEach(function (k, i) { ctx.fillText(g.ylabels[i], g.L - 6, g.Y(yo.log ? Math.pow(10, k) : k)); });
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      xt.ticks.forEach(function (v, i) { ctx.fillText(xt.labels[i], g.X(v), bottom + 5); });
      ctx.font = SANS; ctx.fillStyle = col('--text-2');
      if (opts.xLabel) { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(opts.xLabel, g.L + g.W / 2, f.h - 1); }
      if (opts.yLabel) {
        ctx.save(); ctx.translate(11, g.T + g.H / 2); ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(opts.yLabel, 0, 0); ctx.restore();
      }
      autoSummary();
      renderOverlay();
    }

    /** x-axis ticks and labels: 1-2-5 steps, or decades on a log axis. */
    function xTicks(g) {
      if (xo.log) {
        const ticks = [], labels = [];
        const k0 = Math.ceil(Math.log10(g.x0) - 1e-9), k1 = Math.floor(Math.log10(g.x1) + 1e-9);
        const every = Math.max(1, Math.ceil(50 * (k1 - k0) / Math.max(1, g.W)));   // labels at least 50 px apart
        for (let k = k0; k <= k1; k++) { ticks.push(Math.pow(10, k)); labels.push((k - k0) % every === 0 ? logLabel(k) : ''); }
        return { ticks: ticks, labels: labels };
      }
      const t = linTicks(g.x0, g.x1, Math.max(2, Math.floor(g.W / 70)));
      return { ticks: t.ticks, labels: t.ticks.map(function (v) { return tickLabel(v, t.step); }) };
    }
    function valueAt(s, x) {
      if (!s.n) return NaN;
      if (!s.xs) { const i = clamp(Math.round(x), 0, s.n - 1); return yAt(s, i); }
      const n = s.n;
      if (x <= s.xs[0]) return yAt(s, 0);
      if (x >= s.xs[n - 1]) return yAt(s, n - 1);
      const i = lowerBound(s.xs, n, x);
      const xa = s.xs[i - 1], xb = s.xs[i];
      const ya = yAt(s, i - 1), yb = yAt(s, i);
      const t = xb > xa ? (x - xa) / (xb - xa) : 0;
      return ya + (yb - ya) * t;
    }
    function readout(x) {
      const lines = [{ text: (xl.name || 'x') + ' = ' + withUnit(num(x, 4), xl.unit) }];
      const col = f.colors();
      series.forEach(function (s) {
        if (!s.visible || !s.n) return;
        lines.push({ text: s.label + ': ' + withUnit(num(valueAt(s, x), 4), s.unit), color: col(s.color) });
      });
      return lines;
    }
    function renderOverlay() {
      const ctx = f.octx, g = geo;
      f.begin(ctx);
      if (!g) return;
      const col = f.colors();
      const bottom = g.T + g.H;
      if (opts.cursor && fin(api.cursor) && api.cursor >= g.x0 && api.cursor <= g.x1) {
        const x = Math.round(g.X(api.cursor)) + 0.5;
        ctx.strokeStyle = col('--text'); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, g.T); ctx.lineTo(x, bottom); ctx.stroke();
        ctx.fillStyle = col('--text');
        ctx.beginPath(); ctx.moveTo(x - 5, g.T); ctx.lineTo(x + 5, g.T); ctx.lineTo(x, g.T + 6); ctx.closePath(); ctx.fill();
      }
      if (hoverX !== null && fin(hoverX)) {
        const x = Math.round(g.X(hoverX)) + 0.5;
        ctx.strokeStyle = col('--text-2'); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, g.T); ctx.lineTo(x, bottom); ctx.stroke(); ctx.setLineDash([]);
        series.forEach(function (s) {
          if (!s.visible || !s.n) return;
          const v = valueAt(s, hoverX);
          if (!fin(v) || v < g.y0 || v > g.y1 || (yo.log && v <= 0)) return;
          ctx.fillStyle = col(s.color); ctx.strokeStyle = col('--plot-bg'); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(g.X(hoverX), g.Y(v), 3.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        });
        f.showTip(readout(hoverX), g.X(hoverX));
      } else f.hideTip();
    }
    function autoSummary() {
      const parts = [];
      series.forEach(function (s) {
        if (!s.n) return;
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < s.n; i++) { const v = yAt(s, i); if (fin(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
        if (fin(lo)) parts.push(s.label + ' from ' + withUnit(num(lo, 3), s.unit) + ' to ' + withUnit(num(hi, 3), s.unit) +
          ', final ' + withUnit(num(yAt(s, s.n - 1), 3), s.unit));
      });
      const lines = hlines.concat(vlines).filter(function (l) { return l.label; }).map(function (l) { return l.label; });
      f.setSummary('Line plot against ' + (opts.xLabel || 'x') + ' from ' + num(geo.x0, 3) + ' to ' + num(geo.x1, 3) + '. ' +
        (parts.length ? parts.join('; ') + '.' : 'No data yet.') + (lines.length ? ' Reference lines: ' + lines.join(', ') + '.' : ''));
    }

    wireCursor(f, api, function () { return geo ? [geo.x0, geo.x1] : null; },
      function (px) {
        if (!geo) return null;
        if (px < geo.L - 2 || px > geo.L + geo.W + 2) return null;
        const u = clamp((px - geo.L) / geo.W, 0, 1);
        if (xo.log) return clamp(Math.pow(10, Math.log10(geo.x0) + u * (Math.log10(geo.x1) - Math.log10(geo.x0))), geo.x0, geo.x1);
        return clamp(geo.x0 + u * (geo.x1 - geo.x0), geo.x0, geo.x1);
      },
      function (x, px, py, fromKey) {
        hoverX = x; kbd = !!fromKey;
        renderOverlay();
        if (kbd && x !== null) f.say(readout(x).map(function (l) { return l.text; }).join('; '));
      },
      function (x, dir, big) {
        if (!geo) return x;
        if (!xo.log) return x + dir * (geo.x1 - geo.x0) * (big ? 0.1 : 0.01);
        const decades = Math.log10(geo.x1) - Math.log10(geo.x0);
        return Math.max(x, geo.x0) * Math.pow(10, dir * decades * (big ? 0.1 : 0.01));
      });

    api.set = function (id, xs, ys, so) {
      const s = find(id) || addSeries({ id: id, label: id });
      const o2 = so || {};
      s.xs = xs || null; s.ys = ys || []; s.stride = o2.stride || 1; s.offset = o2.offset || 0;
      const nY = Math.floor((s.ys.length - s.offset + s.stride - 1) / s.stride);
      s.n = Math.max(0, xs ? Math.min(xs.length, nY) : nY);
      if (o2.n !== undefined) s.n = Math.min(s.n, o2.n);
      f.schedule();
      return api;
    };
    api.addSeries = function (def) { addSeries(def); f.schedule(); return api; };
    api.removeSeries = function (id) { const i = series.findIndex(function (s) { return s.id === id; }); if (i >= 0) series.splice(i, 1); buildLegend(); f.schedule(); return api; };
    api.clear = function (id) { series.forEach(function (s) { if (!id || s.id === id) { s.n = 0; s.xs = null; s.ys = null; } }); f.schedule(); return api; };
    api.visible = function (id, on) { const s = find(id); if (s) { s.visible = !!on; buildLegend(); f.schedule(); } return api; };
    api.setCursor = function (x) { api.cursor = fin(x) ? x : null; if (geo) renderOverlay(); return api; };
    api.setX = function (min, max) { xo = Object.assign({}, xo, { min: fin(min) ? min : null, max: fin(max) ? max : null }); f.schedule(); return api; };
    api.setY = function (y) { yo = Object.assign(yo, y || {}); f.schedule(); return api; };
    api.setLines = function (l) {
      if (l.hlines) hlines = l.hlines; if (l.vlines) vlines = l.vlines; if (l.bands) bands = l.bands; if (l.vbands) vbands = l.vbands;
      f.schedule(); return api;
    };
    api.render = function () { render(); return api; };
    api.summary = function (text) { f.setSummary(text, true); return api; };
    api.csv = f.csv = function () {
      const withData = series.filter(function (s) { return s.n; });
      if (!withData.length) return (xl.name || 'x') + '\n';
      const same = withData.every(function (s) { return s.xs === withData[0].xs && s.n === withData[0].n; });
      const xh = (xl.name || 'x') + (xl.unit ? ' (' + xl.unit + ')' : '');
      if (same) {
        const lines = [[xh].concat(withData.map(function (s) { return s.label + (s.unit ? ' (' + s.unit + ')' : ''); })).map(csvCell).join(',')];
        for (let i = 0; i < withData[0].n; i++) {
          lines.push([xAt(withData[0], i)].concat(withData.map(function (s) { return yAt(s, i); })).map(csvCell).join(','));
        }
        return lines.join('\n') + '\n';
      }
      const out = [['series', xh, 'value'].map(csvCell).join(',')];
      withData.forEach(function (s) { for (let i = 0; i < s.n; i++) out.push([s.label, xAt(s, i), yAt(s, i)].map(csvCell).join(',')); });
      return out.join('\n') + '\n';
    };
    api.destroy = function () { f.destroy(); };
    f.render = render;
    render();
    return api;
  };

  /* ================================================================ mode timeline */

  /**
   * Mode timeline: coloured bands with mode labels, hatched fault windows and event ticks.
   * @param {HTMLElement} container
   * @param {{height?:number, segments?:{t0:number, t1:number, mode:number}[], faults?:{t0:number, t1:number}[],
   *   events?:number[], x?:{min?:number, max?:number}, title?:string, ariaLabel?:string, axis?:boolean,
   *   legend?:boolean, margin?:{left?:number, right?:number}}} o
   * @returns {Object} p with set({segments, faults, events}), setCursor, setX, onSeek, render, summary, csv, destroy, el
   */
  plot.timeline = function (container, o) {
    const opts = Object.assign({ height: 36, legend: true, axis: false, ariaLabel: 'Mode timeline' }, o || {});
    if (opts.axis && opts.height < 52) opts.height = 52;
    const f = frame(container, opts, 'timeline');
    f.root.classList.add('timeline');
    let segs = opts.segments || [], faults = opts.faults || [], events = opts.events || [];
    let xo = Object.assign({ min: null, max: null }, opts.x);
    let geo = null, hoverX = null;
    const api = { el: f.root, canvas: f.canvas, cursor: null };

    if (opts.legend) {
      f.legend.hidden = false;
      MODE_NAMES.forEach(function (nm, i) {
        const sw = svgEl('svg', { viewBox: '0 0 26 10', 'aria-hidden': 'true' });
        const r = svgEl('rect', { x: 1, y: 1, width: 24, height: 8, rx: 2 }); r.style.fill = 'var(' + MODE_VARS[i] + ')';
        sw.appendChild(r);
        f.legend.appendChild(h('span', { class: 'legend-item' }, [sw, nm + ' (' + MODE_ABBR[i] + ')']));
      });
      const sw = svgEl('svg', { viewBox: '0 0 26 10', 'aria-hidden': 'true' });
      const r = svgEl('rect', { x: 1, y: 1, width: 24, height: 8, rx: 2, fill: 'none', 'stroke-width': 1.5 }); r.style.stroke = 'var(--bad)';
      const l1 = svgEl('path', { d: 'M3 9l6-8M10 9l6-8M17 9l6-8', 'stroke-width': 1.2 }); l1.style.stroke = 'var(--bad)';
      sw.appendChild(r); sw.appendChild(l1);
      f.legend.appendChild(h('span', { class: 'legend-item' }, [sw, 'Fault window']));
    }
    function range() {
      let x0 = Infinity, x1 = -Infinity;
      segs.forEach(function (s) { x0 = Math.min(x0, s.t0); x1 = Math.max(x1, s.t1); });
      if (fin(xo.min)) x0 = xo.min;
      if (fin(xo.max)) x1 = xo.max;
      if (!fin(x0) || !fin(x1)) { x0 = 0; x1 = 1; }
      if (x1 <= x0) x1 = x0 + 1;
      return [x0, x1];
    }
    function modeAt(t) { for (let i = 0; i < segs.length; i++) if (t >= segs[i].t0 && t <= segs[i].t1) return segs[i].mode; return -1; }
    function faultAt(t) { return faults.some(function (w) { return t >= w.t0 && t < w.t1; }); }
    function render() {
      f.measure();
      const ctx = f.ctx, col = f.colors();
      f.begin(ctx);
      const rg = range();
      const m = opts.margin || {};
      const L = m.left !== undefined ? m.left : 52, R = m.right !== undefined ? m.right : 12;
      const T = 6, Hh = f.h - T - (opts.axis ? 22 : 6);
      const W = Math.max(20, f.w - L - R);
      const X = function (v) { return L + (v - rg[0]) / (rg[1] - rg[0]) * W; };
      geo = { L: L, T: T, W: W, H: Hh, X: X, x0: rg[0], x1: rg[1] };
      ctx.fillStyle = col('--plot-bg'); ctx.fillRect(L, T, W, Hh);
      ctx.font = SANS_B;
      const labels = [];
      segs.forEach(function (s) {
        const a = X(clamp(s.t0, rg[0], rg[1])), b = X(clamp(s.t1, rg[0], rg[1]));
        if (b <= a) return;
        ctx.fillStyle = col(MODE_VARS[s.mode] || '--text-2');
        ctx.fillRect(a, T, b - a, Hh);
        const full = MODE_NAMES[s.mode] || '', ab = MODE_ABBR[s.mode] || '';
        const txt = ctx.measureText(full).width + 10 < b - a ? full : (ctx.measureText(ab).width + 6 < b - a ? ab : '');
        if (txt) labels.push({ txt: txt, x: (a + b) / 2, mode: s.mode });
      });
      faults.forEach(function (w) {
        const a = X(clamp(w.t0, rg[0], rg[1])), b = X(clamp(w.t1, rg[0], rg[1]));
        if (b <= a) return;
        ctx.fillStyle = hatch(ctx, col('--bg'));
        ctx.globalAlpha = 0.9; ctx.fillRect(a, T, b - a, Hh); ctx.globalAlpha = 1;
        ctx.strokeStyle = col('--bad'); ctx.lineWidth = 2; ctx.strokeRect(a + 1, T + 1, b - a - 2, Hh - 2);
      });
      // segment labels go on top of the fault hatching, each on a patch of its own mode colour
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      labels.forEach(function (l) {
        if (faultAt(geo.x0 + (l.x - L) / W * (geo.x1 - geo.x0))) {
          const tw = ctx.measureText(l.txt).width;
          ctx.fillStyle = col(MODE_VARS[l.mode] || '--text-2');
          ctx.fillRect(l.x - tw / 2 - 3, T + Hh / 2 - 8, tw + 6, 16);
        }
        ctx.fillStyle = col('--mode-contrast'); ctx.fillText(l.txt, l.x, T + Hh / 2);
      });
      ctx.strokeStyle = col('--text'); ctx.lineWidth = 1.5;
      events.forEach(function (t) {
        if (t < rg[0] || t > rg[1]) return;
        const x = Math.round(X(t)) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, T - 4); ctx.lineTo(x, T + 5); ctx.moveTo(x, T + Hh - 5); ctx.lineTo(x, T + Hh + 3); ctx.stroke();
      });
      ctx.strokeStyle = col('--border-strong'); ctx.lineWidth = 1; ctx.strokeRect(L + 0.5, T + 0.5, W - 1, Hh - 1);
      ctx.fillStyle = col('--text-2'); ctx.font = SANS; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      if (L > 30) ctx.fillText('Mode', L - 6, T + Hh / 2);
      if (opts.axis) {
        const xt = linTicks(rg[0], rg[1], Math.max(2, Math.floor(W / 70)));
        ctx.font = MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        xt.ticks.forEach(function (v) { ctx.fillText(tickLabel(v, xt.step), X(v), T + Hh + 5); });
      }
      autoSummary();
      renderOverlay();
    }
    function readout(t) {
      const md = modeAt(t);
      const lines = [{ text: 't = ' + withUnit(num(t, 4), 's') }, { text: md >= 0 ? MODE_NAMES[md] : 'no data' }];
      if (faultAt(t)) lines.push({ text: 'fault active' });
      return lines;
    }
    function renderOverlay() {
      const ctx = f.octx, g = geo;
      f.begin(ctx);
      if (!g) return;
      const col = f.colors();
      if (fin(api.cursor) && api.cursor >= g.x0 && api.cursor <= g.x1) {
        const x = Math.round(g.X(api.cursor)) + 0.5;
        ctx.strokeStyle = col('--text'); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, g.T - 2); ctx.lineTo(x, g.T + g.H + 2); ctx.stroke();
        ctx.strokeStyle = col('--plot-bg'); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 1.5, g.T); ctx.lineTo(x + 1.5, g.T + g.H); ctx.stroke();
      }
      if (hoverX !== null && fin(hoverX)) f.showTip(readout(hoverX), g.X(hoverX)); else f.hideTip();
    }
    function autoSummary() {
      if (!segs.length) { f.setSummary('No mode data yet.'); return; }
      const parts = segs.map(function (s) { return (MODE_NAMES[s.mode] || '?') + ' ' + num(s.t0, 4) + '–' + num(s.t1, 4) + ' s'; });
      const fl = faults.map(function (w) { return num(w.t0, 4) + '–' + num(w.t1, 4) + ' s'; });
      f.setSummary('Mode sequence: ' + parts.join(', ') + '.' + (fl.length ? ' Fault window ' + fl.join(', ') + '.' : ''));
    }
    wireCursor(f, api, function () { return geo ? [geo.x0, geo.x1] : null; },
      function (px) { if (!geo || px < geo.L - 2 || px > geo.L + geo.W + 2) return null; return clamp(geo.x0 + (px - geo.L) / geo.W * (geo.x1 - geo.x0), geo.x0, geo.x1); },
      function (x, px, py, fromKey) {
        hoverX = x; renderOverlay();
        if (fromKey && x !== null) f.say(readout(x).map(function (l) { return l.text; }).join('; '));
      });
    api.set = function (d) {
      if (d.segments) segs = d.segments; if (d.faults) faults = d.faults; if (d.events) events = d.events;
      if (d.x) xo = Object.assign({ min: null, max: null }, d.x);
      f.schedule(); return api;
    };
    api.setCursor = function (x) { api.cursor = fin(x) ? x : null; if (geo) renderOverlay(); return api; };
    api.setX = function (min, max) { xo = { min: fin(min) ? min : null, max: fin(max) ? max : null }; f.schedule(); return api; };
    api.render = function () { render(); return api; };
    api.summary = function (text) { f.setSummary(text, true); return api; };
    api.csv = f.csv = function () {
      const out = ['kind,t0_s,t1_s,mode'];
      segs.forEach(function (s) { out.push(['mode', s.t0, s.t1, MODE_NAMES[s.mode] || ''].map(csvCell).join(',')); });
      faults.forEach(function (w) { out.push(['fault', w.t0, w.t1, ''].map(csvCell).join(',')); });
      events.forEach(function (t) { out.push(['event', t, t, ''].map(csvCell).join(',')); });
      return out.join('\n') + '\n';
    };
    api.destroy = function () { f.destroy(); };
    f.render = render;
    render();
    return api;
  };

  /* ================================================================ shared x/y box axes (histogram, scatter) */

  function boxLayout(ctx, f, opts, xr, yr, yIsCount) {
    const T = 10, B = 22 + (opts.xLabel ? 16 : 0);
    const Hh = f.h - T - B;
    const yt = linTicks(yr[0], yr[1], Math.max(2, Math.floor(Hh / 30)));
    if (yIsCount && yt.step < 1) { yt.step = 1; yt.ticks = []; for (let v = Math.ceil(yr[0]); v <= yr[1]; v++) yt.ticks.push(v); }
    const ylabels = yt.ticks.map(function (v) { return tickLabel(v, yt.step); });
    ctx.font = MONO;
    let lw = 0; ylabels.forEach(function (s) { lw = Math.max(lw, ctx.measureText(s).width); });
    const m = opts.margin || {};
    const L = Math.max(m.left || 0, Math.ceil(lw) + 10 + (opts.yLabel ? 16 : 0), 40), R = m.right !== undefined ? m.right : 12;
    const W = Math.max(20, f.w - L - R);
    return {
      L: L, T: T, W: W, H: Hh, x0: xr[0], x1: xr[1], y0: yr[0], y1: yr[1], yt: yt, ylabels: ylabels,
      X: function (v) { return L + (v - xr[0]) / (xr[1] - xr[0]) * W; },
      Y: function (v) { return T + Hh - (v - yr[0]) / (yr[1] - yr[0]) * Hh; }
    };
  }
  function drawBoxAxes(ctx, f, g, col, opts) {
    const right = g.L + g.W, bottom = g.T + g.H;
    ctx.strokeStyle = col('--grid'); ctx.lineWidth = 1; ctx.beginPath();
    g.yt.ticks.forEach(function (v) { const y = Math.round(g.Y(v)) + 0.5; ctx.moveTo(g.L, y); ctx.lineTo(right, y); });
    const xt = linTicks(g.x0, g.x1, Math.max(2, Math.floor(g.W / 70)));
    xt.ticks.forEach(function (v) { const x = Math.round(g.X(v)) + 0.5; ctx.moveTo(x, g.T); ctx.lineTo(x, bottom); });
    ctx.stroke();
    ctx.strokeStyle = col('--border-strong'); ctx.beginPath(); ctx.moveTo(g.L + 0.5, g.T); ctx.lineTo(g.L + 0.5, bottom + 0.5); ctx.lineTo(right, bottom + 0.5); ctx.stroke();
    ctx.fillStyle = col('--text-2'); ctx.font = MONO; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    g.yt.ticks.forEach(function (v, i) { ctx.fillText(g.ylabels[i], g.L - 6, g.Y(v)); });
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    xt.ticks.forEach(function (v) { ctx.fillText(tickLabel(v, xt.step), g.X(v), bottom + 5); });
    ctx.font = SANS;
    if (opts.xLabel) { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(opts.xLabel, g.L + g.W / 2, f.h - 1); }
    if (opts.yLabel) { ctx.save(); ctx.translate(11, g.T + g.H / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(opts.yLabel, 0, 0); ctx.restore(); }
  }
  /**
   * Vertical marker lines with labels. A label sits in row mk.row when given (0 = top), otherwise in
   * row i % 3 by index, and has a --plot-bg halo so bars and points under it do not hide it.
   */
  function drawMarkers(ctx, g, col, markers) {
    ctx.font = SANS_B;
    (markers || []).forEach(function (mk, i) {
      if (!fin(mk.x) || mk.x < g.x0 || mk.x > g.x1) return;
      const x = Math.round(g.X(mk.x)) + 0.5;
      ctx.strokeStyle = col(mk.color || '--line-req'); ctx.lineWidth = 1.5; ctx.setLineDash(mk.dash || [5, 4]);
      ctx.beginPath(); ctx.moveTo(x, g.T); ctx.lineTo(x, g.T + g.H); ctx.stroke(); ctx.setLineDash([]);
      if (mk.label) {
        const flip = x > g.L + g.W * 0.7;
        const row = fin(mk.row) && mk.row >= 0 ? Math.floor(mk.row) : i % 3;
        const tx = x + (flip ? -4 : 4), ty = g.T + 2 + row * 14, tw = ctx.measureText(mk.label).width;
        ctx.globalAlpha = 0.8; ctx.fillStyle = col('--plot-bg');
        ctx.fillRect(flip ? tx - tw - 2 : tx - 2, ty - 1, tw + 4, 14);
        ctx.globalAlpha = 1;
        ctx.fillStyle = col(mk.color || '--line-req'); ctx.textAlign = flip ? 'right' : 'left'; ctx.textBaseline = 'top';
        ctx.fillText(mk.label, tx, ty);
      }
    });
  }

  /* ================================================================ histogram */

  /**
   * Histogram.
   * @param {HTMLElement} container
   * @param {{bins:{x0:number, x1:number, count:number}[], xLabel?:string, yLabel?:string, title?:string,
   *   ariaLabel?:string, color?:string, label?:string, markers?:{x:number, label?:string, color?:string, row?:number}[],
   *   series?:{label:string, bins:Object[], color?:string, dash?:number[]}[],
   *   curves?:{label:string, points:number[][], color?:string, dash?:number[]}[], height?:number}} o
   *   series: extra histograms drawn as outlines; curves: [[x, y], …] in the same y units
   * @returns {Object} p with set({bins, markers, series, curves}), render, summary, csv, destroy, onSeek, setCursor, el
   */
  plot.histogram = function (container, o) {
    const opts = Object.assign({ height: 200, yLabel: 'trials', color: '--accent', label: 'count' }, o || {});
    const f = frame(container, opts, 'histogram');
    let bins = opts.bins || [], markers = opts.markers || [], extra = opts.series || [], curves = opts.curves || [];
    let geo = null, hover = -1;
    const api = { el: f.root, canvas: f.canvas, cursor: null };
    function legend() {
      f.legend.textContent = '';
      const items = [{ label: opts.label, color: opts.color, fill: true }].concat(extra.map(function (s) { return { label: s.label, color: s.color || '--warn', dash: s.dash || [4, 3] }; }))
        .concat(curves.map(function (c) { return { label: c.label, color: c.color || '--text', dash: c.dash || [] }; }));
      f.legend.hidden = items.length < 2;
      items.forEach(function (it) {
        const sw = svgEl('svg', { viewBox: '0 0 26 10', 'aria-hidden': 'true' });
        const c = it.color.slice(0, 2) === '--' ? 'var(' + it.color + ')' : it.color;
        if (it.fill) { const r = svgEl('rect', { x: 2, y: 1, width: 22, height: 8, rx: 1 }); r.style.fill = c; sw.appendChild(r); }
        else { const l = svgEl('line', { x1: 1, y1: 5, x2: 25, y2: 5, 'stroke-width': 2 }); l.style.stroke = c; if (it.dash && it.dash.length) l.setAttribute('stroke-dasharray', it.dash.join(' ')); sw.appendChild(l); }
        f.legend.appendChild(h('span', { class: 'legend-item' }, [sw, it.label]));
      });
    }
    function render() {
      f.measure();
      const ctx = f.ctx, col = f.colors();
      f.begin(ctx);
      let x0 = Infinity, x1 = -Infinity, y1 = 0;
      [bins].concat(extra.map(function (s) { return s.bins; })).forEach(function (bs) {
        (bs || []).forEach(function (b) { x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.count); });
      });
      curves.forEach(function (c) { c.points.forEach(function (p) { if (fin(p[1])) y1 = Math.max(y1, p[1]); if (fin(p[0])) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); } }); });
      markers.forEach(function (mk) { if (fin(mk.x)) { x0 = Math.min(x0, mk.x); x1 = Math.max(x1, mk.x); } });
      if (fin(opts.xMin)) x0 = opts.xMin;
      if (fin(opts.xMax)) x1 = opts.xMax;
      if (!fin(x0) || !fin(x1)) { x0 = 0; x1 = 1; }
      if (x1 <= x0) x1 = x0 + 1;
      const padx = (x1 - x0) * 0.02;
      const g = geo = boxLayout(ctx, f, opts, [x0 - padx, x1 + padx], [0, (y1 || 1) * 1.1], !curves.length);
      ctx.fillStyle = col('--plot-bg'); ctx.fillRect(g.L, g.T, g.W, g.H);
      drawBoxAxes(ctx, f, g, col, opts);
      ctx.save(); ctx.beginPath(); ctx.rect(g.L, g.T, g.W, g.H); ctx.clip();
      const fill = col(opts.color), gap = col('--plot-bg');
      bins.forEach(function (b, i) {
        const a = g.X(b.x0), c = g.X(b.x1), y = g.Y(b.count);
        ctx.fillStyle = fill; ctx.globalAlpha = hover === i ? 1 : 0.82;
        ctx.fillRect(a, y, Math.max(1, c - a), g.T + g.H - y);
        ctx.globalAlpha = 1; ctx.strokeStyle = gap; ctx.lineWidth = 1; ctx.strokeRect(a + 0.5, y + 0.5, Math.max(0, c - a - 1), g.T + g.H - y);
        if (hover === i) { ctx.strokeStyle = col('--text'); ctx.lineWidth = 2; ctx.strokeRect(a + 1, y + 1, Math.max(0, c - a - 2), g.T + g.H - y - 2); }
      });
      extra.forEach(function (s) {
        ctx.strokeStyle = col(s.color || '--warn'); ctx.lineWidth = 2; ctx.setLineDash(s.dash || [4, 3]);
        ctx.beginPath();
        (s.bins || []).forEach(function (b, i) {
          const a = g.X(b.x0), c = g.X(b.x1), y = g.Y(b.count);
          if (i === 0) ctx.moveTo(a, g.T + g.H);
          ctx.lineTo(a, y); ctx.lineTo(c, y);
          if (i === s.bins.length - 1) ctx.lineTo(c, g.T + g.H);
        });
        ctx.stroke(); ctx.setLineDash([]);
      });
      curves.forEach(function (cv) {
        ctx.strokeStyle = col(cv.color || '--text'); ctx.lineWidth = 2; ctx.setLineDash(cv.dash || []);
        ctx.beginPath();
        cv.points.forEach(function (p, i) { const X = g.X(p[0]), Y = g.Y(p[1]); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
        ctx.stroke(); ctx.setLineDash([]);
      });
      drawMarkers(ctx, g, col, markers);
      ctx.restore();
      legend();
      autoSummary();
      if (hover >= 0 && bins[hover]) f.showTip(tipFor(hover), g.X((bins[hover].x0 + bins[hover].x1) / 2)); else f.hideTip();
    }
    const xu = parseLabel(opts.xLabel || '');
    function tipFor(i) {
      const b = bins[i];
      return [{ text: withUnit(num(b.x0, 3) + '–' + num(b.x1, 3), xu.unit) }, { text: b.count + ' ' + (opts.yLabel || 'count') }];
    }
    function autoSummary() {
      const total = bins.reduce(function (a, b) { return a + b.count; }, 0);
      let top = -1; bins.forEach(function (b, i) { if (top < 0 || b.count > bins[top].count) top = i; });
      f.setSummary('Histogram of ' + total + ' ' + (opts.yLabel || 'values') + ' in ' + bins.length + ' bins' +
        (top >= 0 ? '; the tallest bin is ' + withUnit(num(bins[top].x0, 3) + ' to ' + num(bins[top].x1, 3), xu.unit) + ' with ' + bins[top].count : '') +
        (markers.length ? '. Markers: ' + markers.map(function (m) { return (m.label || '') + ' at ' + num(m.x, 3); }).join(', ') : '') + '.');
    }
    function binAtPx(px) {
      if (!geo) return -1;
      const x = geo.x0 + (px - geo.L) / geo.W * (geo.x1 - geo.x0);
      return bins.findIndex(function (b) { return x >= b.x0 && x <= b.x1; });
    }
    f.canvas.addEventListener('pointermove', function (e) { const r = f.canvas.getBoundingClientRect(); const i = binAtPx(e.clientX - r.left); if (i !== hover) { hover = i; render(); } });
    f.canvas.addEventListener('pointerleave', function () { if (hover !== -1) { hover = -1; render(); } });
    f.canvas.addEventListener('blur', function () { if (hover !== -1) { hover = -1; render(); } });
    f.canvas.addEventListener('keydown', function (e) {
      if (!bins.length) return;
      let i = hover;
      if (e.key === 'ArrowRight') i = Math.min(bins.length - 1, i + 1);
      else if (e.key === 'ArrowLeft') i = Math.max(0, i < 0 ? 0 : i - 1);
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = bins.length - 1;
      else if (e.key === 'Escape') i = -1;
      else return;
      e.preventDefault(); hover = i; render();
      if (i >= 0) f.say(tipFor(i).map(function (l) { return l.text; }).join(': '));
    });
    const seekers = [];
    api.onSeek = function (fn) { seekers.push(fn); return api; };
    f.canvas.addEventListener('click', function (e) {
      const r = f.canvas.getBoundingClientRect(); const i = binAtPx(e.clientX - r.left);
      if (i >= 0) seekers.forEach(function (fn) { fn((bins[i].x0 + bins[i].x1) / 2, bins[i]); });
    });
    api.setCursor = function () { return api; };
    api.set = function (d) {
      if (d.bins) bins = d.bins; if (d.markers) markers = d.markers; if (d.series) extra = d.series; if (d.curves) curves = d.curves;
      hover = -1; f.schedule(); return api;
    };
    api.render = function () { render(); return api; };
    api.summary = function (text) { f.setSummary(text, true); return api; };
    api.csv = f.csv = function () {
      const out = [['x0', 'x1', opts.label || 'count'].concat(extra.map(function (s) { return s.label; })).map(csvCell).join(',')];
      bins.forEach(function (b, i) { out.push([b.x0, b.x1, b.count].concat(extra.map(function (s) { return s.bins && s.bins[i] ? s.bins[i].count : ''; })).map(csvCell).join(',')); });
      return out.join('\n') + '\n';
    };
    api.destroy = function () { f.destroy(); };
    f.render = render;
    render();
    return api;
  };

  /* ================================================================ scatter */

  /**
   * Scatter plot coloured by a sequential scale (--seq-lo → --seq-hi).
   * @param {HTMLElement} container
   * @param {{points:{x:number, y:number, c?:number, id?:*, label?:string}[], xLabel?:string, yLabel?:string,
   *   title?:string, ariaLabel?:string, colorScale?:{min:number, max:number, label?:string}, onPick?:function(*):void,
   *   hlines?:{y:number, label?:string, color?:string}[], vlines?:{x:number, label?:string, color?:string}[], height?:number}} o
   * @returns {Object} p with set({points, colorScale}), select(id), onPick(fn), render, summary, csv, destroy, el
   */
  plot.scatter = function (container, o) {
    const opts = Object.assign({ height: 240 }, o || {});
    let scale = opts.colorScale || null;
    const scaleNode = h('div', { class: 'plot-scale' });
    opts.scaleNode = scaleNode;
    const f = frame(container, opts, 'scatter');
    let pts = opts.points || [];
    let order = [], geo = null, hover = -1, selected = null;
    const pickers = opts.onPick ? [opts.onPick] : [];
    const api = { el: f.root, canvas: f.canvas, cursor: null };
    const xu = parseLabel(opts.xLabel || 'x'), yu = parseLabel(opts.yLabel || 'y');
    function cRange() {
      if (scale && fin(scale.min) && fin(scale.max) && scale.max > scale.min) return [scale.min, scale.max];
      let a = Infinity, b = -Infinity; pts.forEach(function (p) { if (fin(p.c)) { a = Math.min(a, p.c); b = Math.max(b, p.c); } });
      return fin(a) && b > a ? [a, b] : null;
    }
    function drawScale() {
      scaleNode.textContent = '';
      const cr = cRange();
      scaleNode.hidden = !cr;
      if (!cr) return;
      scaleNode.appendChild(h('span', { text: (scale && scale.label ? scale.label + ': ' : 'Colour: ') + num(cr[0], 3) }));
      scaleNode.appendChild(h('span', { class: 'ramp', 'aria-hidden': 'true' }));
      scaleNode.appendChild(h('span', { text: num(cr[1], 3) }));
    }
    function render() {
      f.measure();
      const ctx = f.ctx, col = f.colors();
      f.begin(ctx);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      pts.forEach(function (p) { if (fin(p.x) && fin(p.y)) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } });
      if (!fin(x0)) { x0 = 0; x1 = 1; y0 = 0; y1 = 1; }
      const px = (x1 - x0) * 0.06 || 1, py = (y1 - y0) * 0.08 || 1;
      x0 -= px; x1 += px; y0 -= py; y1 += py;
      if (fin(opts.xMin)) x0 = opts.xMin; if (fin(opts.xMax)) x1 = opts.xMax;
      if (fin(opts.yMin)) y0 = opts.yMin; if (fin(opts.yMax)) y1 = opts.yMax;
      const g = geo = boxLayout(ctx, f, opts, [x0, x1], [y0, y1], false);
      ctx.fillStyle = col('--plot-bg'); ctx.fillRect(g.L, g.T, g.W, g.H);
      drawBoxAxes(ctx, f, g, col, opts);
      ctx.save(); ctx.beginPath(); ctx.rect(g.L, g.T, g.W, g.H); ctx.clip();
      (opts.hlines || []).forEach(function (l) {
        const y = Math.round(g.Y(l.y)) + 0.5; ctx.strokeStyle = col(l.color || '--line-req'); ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(g.L, y); ctx.lineTo(g.L + g.W, y); ctx.stroke(); ctx.setLineDash([]);
      });
      drawMarkers(ctx, g, col, (opts.vlines || []).map(function (l) { return { x: l.x, label: l.label, color: l.color }; }));
      const cr = cRange(), lo = col('--seq-lo'), hi = col('--seq-hi'), edge = col('--plot-bg'), acc = col('--accent');
      pts.forEach(function (p, i) {
        if (!fin(p.x) || !fin(p.y)) return;
        ctx.fillStyle = cr && fin(p.c) ? mix(lo, hi, clamp((p.c - cr[0]) / (cr[1] - cr[0]), 0, 1)) : acc;
        ctx.strokeStyle = edge; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(g.X(p.x), g.Y(p.y), 4.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        if (i === hover || (selected !== null && p.id === selected)) {
          ctx.strokeStyle = col('--text'); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(g.X(p.x), g.Y(p.y), 8, 0, 2 * Math.PI); ctx.stroke();
        }
      });
      // threshold labels go on top of the points, each on a background halo
      ctx.font = SANS_B; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      (opts.hlines || []).forEach(function (l) {
        if (!l.label) return;
        const y = Math.round(g.Y(l.y)) + 0.5, tw = ctx.measureText(l.label).width, xr = g.L + g.W - 4;
        ctx.globalAlpha = 0.85; ctx.fillStyle = col('--plot-bg'); ctx.fillRect(xr - tw - 2, y - 17, tw + 4, 15);
        ctx.globalAlpha = 1; ctx.fillStyle = col(l.color || '--line-req'); ctx.fillText(l.label, xr, y - 3);
      });
      ctx.restore();
      drawScale();
      order = pts.map(function (p, i) { return i; }).filter(function (i) { return fin(pts[i].x) && fin(pts[i].y); })
        .sort(function (a, b) { return pts[a].x - pts[b].x || pts[a].y - pts[b].y; });
      autoSummary();
      if (hover >= 0 && pts[hover]) f.showTip(tipFor(hover), g.X(pts[hover].x)); else f.hideTip();
    }
    function tipFor(i) {
      const p = pts[i];
      const lines = [{ text: p.label || (p.id !== undefined ? 'Trial ' + p.id : 'Point') }, { text: xu.name + ' = ' + withUnit(num(p.x, 4), xu.unit) }, { text: yu.name + ' = ' + withUnit(num(p.y, 4), yu.unit) }];
      if (fin(p.c)) lines.push({ text: (scale && scale.label ? scale.label : 'colour') + ' = ' + num(p.c, 4) });
      return lines;
    }
    function autoSummary() {
      f.setSummary('Scatter of ' + order.length + ' points, ' + (opts.yLabel || 'y') + ' against ' + (opts.xLabel || 'x') +
        (scale && scale.label ? ', coloured by ' + scale.label : '') + '. Use the arrow keys to step through points and Enter to pick one.');
    }
    function nearest(px, py) {
      if (!geo) return -1;
      let best = -1, bd = 14 * 14;
      pts.forEach(function (p, i) {
        if (!fin(p.x) || !fin(p.y)) return;
        const dx = geo.X(p.x) - px, dy = geo.Y(p.y) - py, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    }
    function pick(i) { if (i < 0) return; selected = pts[i].id !== undefined ? pts[i].id : i; pickers.forEach(function (fn) { fn(selected, pts[i]); }); render(); }
    f.canvas.addEventListener('pointermove', function (e) { const r = f.canvas.getBoundingClientRect(); const i = nearest(e.clientX - r.left, e.clientY - r.top); if (i !== hover) { hover = i; render(); } });
    f.canvas.addEventListener('pointerleave', function () { if (hover !== -1) { hover = -1; render(); } });
    f.canvas.addEventListener('blur', function () { if (hover !== -1) { hover = -1; render(); } });
    f.canvas.addEventListener('click', function (e) { const r = f.canvas.getBoundingClientRect(); pick(nearest(e.clientX - r.left, e.clientY - r.top)); });
    f.canvas.addEventListener('keydown', function (e) {
      if (!order.length) return;
      let k = order.indexOf(hover);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') k = Math.min(order.length - 1, k + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') k = Math.max(0, k < 0 ? 0 : k - 1);
      else if (e.key === 'Home') k = 0;
      else if (e.key === 'End') k = order.length - 1;
      else if (e.key === 'Enter' || e.key === ' ') { if (hover >= 0) { e.preventDefault(); pick(hover); } return; }
      else if (e.key === 'Escape') { hover = -1; render(); return; }
      else return;
      e.preventDefault(); hover = order[k]; render();
      f.say(tipFor(hover).map(function (l) { return l.text; }).join(', '));
    });
    api.onPick = function (fn) { pickers.push(fn); return api; };
    api.select = function (id) { selected = id; f.schedule(); return api; };
    api.set = function (d) { if (d.points) pts = d.points; if (d.colorScale) scale = d.colorScale; hover = -1; f.schedule(); return api; };
    api.setCursor = function () { return api; };
    api.onSeek = function () { return api; };
    api.render = function () { render(); return api; };
    api.summary = function (text) { f.setSummary(text, true); return api; };
    api.csv = f.csv = function () {
      const out = [['id', xu.name + (xu.unit ? ' (' + xu.unit + ')' : ''), yu.name + (yu.unit ? ' (' + yu.unit + ')' : ''), scale && scale.label ? scale.label : 'c'].map(csvCell).join(',')];
      pts.forEach(function (p, i) { out.push([p.id !== undefined ? p.id : i, p.x, p.y, fin(p.c) ? p.c : ''].map(csvCell).join(',')); });
      return out.join('\n') + '\n';
    };
    api.destroy = function () { f.destroy(); };
    f.render = render;
    render();
    return api;
  };

  /* ================================================================ s-plane */

  /**
   * Pole map on the complex plane, with constant-damping rays, constant-ωn circles, an optional
   * root locus, markers and a shaded damping band.
   * @param {HTMLElement} container
   * @param {{poles?:{re:number, im:number, label?:string}[], zetaLines?:number[], wnCircles?:number[],
   *   locus?:number[][], markers?:{re:number, im:number, label?:string}[],
   *   band?:{zetaMin:number, zetaMax:number, label?:string}|null, title?:string, ariaLabel?:string,
   *   height?:number, extent?:number}} o extent: fixed half-width of the view (1/s)
   * @returns {Object} p with set({poles, locus, markers, band, zetaLines, wnCircles}), render, summary, csv, destroy, el
   */
  plot.splane = function (container, o) {
    const opts = Object.assign({ height: 260, zetaLines: [0.35, 0.72, 1.0], wnCircles: [0.5, 1], xLabel: 'Re (1/s)', yLabel: 'Im (rad/s)' }, o || {});
    const f = frame(container, opts, 'splane');
    let poles = opts.poles || [], locus = opts.locus || [], markers = opts.markers || [], band = opts.band || null;
    let geo = null, hover = -1;
    const api = { el: f.root, canvas: f.canvas, cursor: null };
    function info(p) {
      const wn = Math.hypot(p.re, p.im);
      const z = wn > 0 ? -p.re / wn : NaN;
      return { wn: wn, zeta: z };
    }
    function render() {
      f.measure();
      const ctx = f.ctx, col = f.colors();
      f.begin(ctx);
      let R = 0;
      poles.concat(markers).forEach(function (p) { if (fin(p.re) && fin(p.im)) R = Math.max(R, Math.abs(p.re), Math.abs(p.im)); });
      locus.forEach(function (p) { if (fin(p[0]) && fin(p[1])) R = Math.max(R, Math.abs(p[0]), Math.abs(p[1])); });
      (opts.wnCircles || []).forEach(function (r) { R = Math.max(R, r); });
      if (fin(opts.extent)) R = opts.extent;
      if (!(R > 0)) R = 1;
      R *= 1.18;
      let maxRe = R * 0.3;
      poles.forEach(function (p) { if (p.re > 0) maxRe = Math.max(maxRe, p.re * 1.2); });
      const T = 10, B = 22 + 16, L0 = 52, Rm = 12;
      const W = Math.max(40, f.w - L0 - Rm), Hh = f.h - T - B;
      const spanRe = R + maxRe, spanIm = 2 * R;
      const s = Math.min(W / spanRe, Hh / spanIm);
      const cx = L0 + (W - spanRe * s) / 2 + R * s, cy = T + Hh / 2;
      const X = function (re) { return cx + re * s; }, Y = function (im) { return cy - im * s; };
      geo = { X: X, Y: Y, s: s, L: L0, T: T, W: W, H: Hh };
      ctx.fillStyle = col('--plot-bg'); ctx.fillRect(L0, T, W, Hh);
      ctx.save(); ctx.beginPath(); ctx.rect(L0, T, W, Hh); ctx.clip();
      if (band) {
        // sectors between the two damping rays, closed by an arc well outside the clip rectangle
        const a0 = Math.acos(clamp(band.zetaMin, 0, 1)), a1 = Math.acos(clamp(band.zetaMax, 0, 1));
        const far = 2 * Math.hypot(W, Hh) + 2 * R * s;
        ctx.fillStyle = col('--band-ok');
        [1, -1].forEach(function (sg) {
          ctx.beginPath(); ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, far, Math.PI + sg * a1, Math.PI + sg * a0, sg < 0);
          ctx.closePath(); ctx.fill();
        });
      }
      const grid = linTicks(-R, R, Math.max(2, Math.floor(Hh / 40)));
      ctx.strokeStyle = col('--grid'); ctx.lineWidth = 1; ctx.beginPath();
      grid.ticks.forEach(function (v) { const y = Math.round(Y(v)) + 0.5; ctx.moveTo(L0, y); ctx.lineTo(L0 + W, y); const x = Math.round(X(v)) + 0.5; ctx.moveTo(x, T); ctx.lineTo(x, T + Hh); });
      ctx.stroke();
      ctx.strokeStyle = col('--border-strong'); ctx.lineWidth = 1.2; ctx.beginPath();
      ctx.moveTo(L0, Math.round(cy) + 0.5); ctx.lineTo(L0 + W, Math.round(cy) + 0.5);
      ctx.moveTo(Math.round(cx) + 0.5, T); ctx.lineTo(Math.round(cx) + 0.5, T + Hh); ctx.stroke();
      ctx.font = MONO; ctx.fillStyle = col('--text-2');
      ctx.strokeStyle = col('--text-2'); ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      (opts.zetaLines || []).forEach(function (z) {
        const a = Math.acos(clamp(z, 0, 1));
        [1, -1].forEach(function (sg) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(X(-Math.cos(a) * R * 2), Y(sg * Math.sin(a) * R * 2)); ctx.stroke(); });
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        if (z >= 0.999) { ctx.fillText('ζ ' + z, L0 + 4, cy - 3); return; }   // the ray is the negative real axis: label its far end
        const lx = X(-Math.cos(a) * R * 0.92), ly = Y(Math.sin(a) * R * 0.92);
        ctx.fillText('ζ ' + z, clamp(lx + 3, L0 + 2, L0 + W - 40), clamp(ly - 2, T + 12, T + Hh));
      });
      (opts.wnCircles || []).forEach(function (r) {
        ctx.beginPath(); ctx.arc(cx, cy, r * s, Math.PI / 2, 3 * Math.PI / 2); ctx.stroke();
        if (r * s <= 10) return;
        // label where the circle meets the imaginary axis, in the (normally empty) right half-plane
        const txt = 'ωn ' + r, tw = ctx.measureText(txt).width, ly = cy + r * s;
        if (ly > T + Hh - 6) return;
        ctx.textBaseline = 'middle';
        if (cx + 4 + tw < L0 + W - 2) { ctx.textAlign = 'left'; ctx.fillText(txt, cx + 4, ly); }
        else { ctx.textAlign = 'right'; ctx.fillText(txt, cx - 4, ly + 8); }
      });
      ctx.setLineDash([]);
      if (locus.length > 1) {
        ctx.strokeStyle = col('--accent'); ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8; ctx.beginPath();
        let pen = false;
        locus.forEach(function (p) { if (!fin(p[0]) || !fin(p[1])) { pen = false; return; } if (pen) ctx.lineTo(X(p[0]), Y(p[1])); else { ctx.moveTo(X(p[0]), Y(p[1])); pen = true; } });
        ctx.stroke(); ctx.globalAlpha = 1;
      }
      markers.forEach(function (m) {
        ctx.strokeStyle = col('--ok'); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(X(m.re), Y(m.im), 6, 0, 2 * Math.PI); ctx.stroke();
        if (m.label) { ctx.fillStyle = col('--ok'); ctx.font = SANS_B; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(m.label, X(m.re) + 8, Y(m.im) - 4); }
      });
      poles.forEach(function (p, i) {
        if (!fin(p.re) || !fin(p.im)) return;
        const x = X(p.re), y = Y(p.im), d = i === hover ? 7 : 5.5;
        ctx.strokeStyle = col(p.re > 0 ? '--bad' : '--text'); ctx.lineWidth = i === hover ? 3 : 2.2;
        ctx.beginPath(); ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d); ctx.moveTo(x + d, y - d); ctx.lineTo(x - d, y + d); ctx.stroke();
        if (p.label && p.im >= 0) { ctx.fillStyle = col('--text'); ctx.font = SANS_B; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(p.label, x + 8, y - 4); }
      });
      if (band && band.label) {
        // bottom-left corner, wrapped to the plot width, on a translucent backing so rays stay legible
        ctx.font = SANS_B;
        const words = String(band.label).split(' '), lines = [];
        let cur = '';
        words.forEach(function (w) { const t = cur ? cur + ' ' + w : w; if (cur && ctx.measureText(t).width > W - 12) { lines.push(cur); cur = w; } else cur = t; });
        if (cur) lines.push(cur);
        const lh = 15, bw = Math.max.apply(null, lines.map(function (t) { return ctx.measureText(t).width; }));
        const by = T + Hh - 4 - lines.length * lh;
        ctx.globalAlpha = 0.85; ctx.fillStyle = col('--plot-bg'); ctx.fillRect(L0 + 2, by - 2, bw + 6, lines.length * lh + 3);
        ctx.globalAlpha = 1; ctx.fillStyle = col('--ok'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        lines.forEach(function (t, i) { ctx.fillText(t, L0 + 5, by + i * lh); });
      }
      ctx.restore();
      ctx.strokeStyle = col('--border-strong'); ctx.strokeRect(L0 + 0.5, T + 0.5, W - 1, Hh - 1);
      ctx.fillStyle = col('--text-2'); ctx.font = MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      grid.ticks.forEach(function (v) { const x = X(v); if (x > L0 + 8 && x < L0 + W - 8) ctx.fillText(tickLabel(v, grid.step), x, T + Hh + 5); });
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      grid.ticks.forEach(function (v) { const y = Y(v); if (y > T + 6 && y < T + Hh - 6) ctx.fillText(tickLabel(v, grid.step), L0 - 6, y); });
      ctx.font = SANS; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(opts.xLabel, L0 + W / 2, f.h - 1);
      ctx.save(); ctx.translate(11, T + Hh / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(opts.yLabel, 0, 0); ctx.restore();
      autoSummary();
      if (hover >= 0 && poles[hover]) f.showTip(tipFor(hover), X(poles[hover].re)); else f.hideTip();
    }
    function tipFor(i) {
      const p = poles[i], q = info(p);
      return [{ text: p.label || 'Pole ' + (i + 1) }, { text: 's = ' + num(p.re, 4) + (p.im < 0 ? ' − ' : ' + ') + num(Math.abs(p.im), 4) + 'j' },
        { text: 'ζ = ' + num(q.zeta, 3) + ', ωn = ' + num(q.wn, 3) + ' rad/s' }];
    }
    function autoSummary() {
      if (!poles.length) { f.setSummary('No poles to show.'); return; }
      const st = poles.every(function (p) { return p.re < 0; });
      f.setSummary(poles.length + ' poles: ' + poles.map(function (p) { return num(p.re, 3) + (p.im < 0 ? ' − ' : ' + ') + num(Math.abs(p.im), 3) + 'j'; }).join(', ') +
        '. ' + (st ? 'All poles are in the left half-plane (stable).' : 'At least one pole is not in the left half-plane (not asymptotically stable).'));
    }
    function nearest(px, py) {
      if (!geo) return -1;
      let best = -1, bd = 16 * 16;
      poles.forEach(function (p, i) { const dx = geo.X(p.re) - px, dy = geo.Y(p.im) - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } });
      return best;
    }
    f.canvas.addEventListener('pointermove', function (e) { const r = f.canvas.getBoundingClientRect(); const i = nearest(e.clientX - r.left, e.clientY - r.top); if (i !== hover) { hover = i; render(); } });
    f.canvas.addEventListener('pointerleave', function () { if (hover !== -1) { hover = -1; render(); } });
    f.canvas.addEventListener('blur', function () { if (hover !== -1) { hover = -1; render(); } });
    f.canvas.addEventListener('keydown', function (e) {
      if (!poles.length) return;
      let i = hover;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = (i + 1) % poles.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = i <= 0 ? poles.length - 1 : i - 1;
      else if (e.key === 'Escape') i = -1;
      else return;
      e.preventDefault(); hover = i; render();
      if (i >= 0) f.say(tipFor(i).map(function (l) { return l.text; }).join(', '));
    });
    api.set = function (d) {
      if (d.poles) poles = d.poles; if (d.locus) locus = d.locus; if (d.markers) markers = d.markers;
      if (d.band !== undefined) band = d.band; if (d.zetaLines) opts.zetaLines = d.zetaLines; if (d.wnCircles) opts.wnCircles = d.wnCircles;
      if (d.extent !== undefined) opts.extent = d.extent;
      hover = -1; f.schedule(); return api;
    };
    api.setCursor = function () { return api; };
    api.onSeek = function () { return api; };
    api.render = function () { render(); return api; };
    api.summary = function (text) { f.setSummary(text, true); return api; };
    api.csv = f.csv = function () {
      const out = ['label,re,im,zeta,wn'];
      poles.forEach(function (p, i) { const q = info(p); out.push([p.label || 'pole ' + (i + 1), p.re, p.im, q.zeta, q.wn].map(csvCell).join(',')); });
      markers.forEach(function (p) { const q = info(p); out.push([p.label || 'marker', p.re, p.im, q.zeta, q.wn].map(csvCell).join(',')); });
      return out.join('\n') + '\n';
    };
    api.destroy = function () { f.destroy(); };
    f.render = render;
    render();
    return api;
  };

  /* ================================================================ horizontal bars */

  /**
   * Horizontal bar chart, optionally on a log scale, with vertical reference lines.
   * @param {HTMLElement} container
   * @param {{items:{label:string, value:number, color?:string, text?:string}[], log?:boolean,
   *   refLines?:{v:number, label?:string, color?:string}[], title?:string, ariaLabel?:string, xLabel?:string,
   *   unit?:string, height?:number}} o height defaults to 30 px per bar plus the axis
   * @returns {Object} p with set({items, refLines}), render, summary, csv, destroy, el
   */
  plot.bars = function (container, o) {
    const opts = Object.assign({ log: false }, o || {});
    let items = opts.items || [], refs = opts.refLines || [];
    function autoHeight() { return 22 + 16 + (opts.xLabel ? 16 : 0) + Math.max(1, items.length) * 30; }
    opts.height = opts.height || autoHeight();
    const fixedH = !!(o && o.height);
    const f = frame(container, opts, 'bars');
    let geo = null, hover = -1;
    const api = { el: f.root, canvas: f.canvas, cursor: null };
    function render() {
      if (!fixedH) f.h = autoHeight();
      f.measure();
      const ctx = f.ctx, col = f.colors();
      f.begin(ctx);
      ctx.font = SANS;
      let lw = 0; items.forEach(function (it) { lw = Math.max(lw, ctx.measureText(it.label).width); });
      const L = Math.min(Math.ceil(lw) + 14, Math.floor(f.w * 0.45)), Rm = 16, T = 22;
      const W = Math.max(30, f.w - L - Rm), Hh = f.h - T - 22 - (opts.xLabel ? 16 : 0);
      const vals = items.map(function (it) { return it.value; }).concat(refs.map(function (r) { return r.v; })).filter(function (v) { return fin(v) && (!opts.log || v > 0); });
      let a, b, X;
      if (opts.log) {
        a = Math.floor(Math.log10(Math.min.apply(null, vals.length ? vals : [1]))); b = Math.ceil(Math.log10(Math.max.apply(null, vals.length ? vals : [10])));
        if (b <= a) b = a + 1;
        X = function (v) { return L + (Math.log10(Math.max(v, Math.pow(10, a))) - a) / (b - a) * W; };
      } else {
        a = Math.min(0, Math.min.apply(null, vals.length ? vals : [0])); b = Math.max.apply(null, vals.length ? vals : [1]) * 1.08 || 1;
        X = function (v) { return L + (v - a) / (b - a) * W; };
      }
      const rowH = Hh / Math.max(1, items.length);
      geo = { L: L, T: T, W: W, H: Hh, rowH: rowH, X: X };
      ctx.fillStyle = col('--plot-bg'); ctx.fillRect(L, T, W, Hh);
      ctx.strokeStyle = col('--grid'); ctx.lineWidth = 1; ctx.beginPath();
      let ticks;
      if (opts.log) { ticks = []; for (let k = a; k <= b; k++) ticks.push({ v: Math.pow(10, k), t: logLabel(k) }); }
      else { const lt = linTicks(a, b, Math.max(2, Math.floor(W / 70))); ticks = lt.ticks.map(function (v) { return { v: v, t: tickLabel(v, lt.step) }; }); }
      ticks.forEach(function (tk) { const x = Math.round(X(tk.v)) + 0.5; ctx.moveTo(x, T); ctx.lineTo(x, T + Hh); });
      ctx.stroke();
      items.forEach(function (it, i) {
        const y = T + i * rowH + rowH * 0.18, bh = rowH * 0.64;
        const x0 = opts.log ? L : X(Math.max(a, 0)), x1 = X(it.value);
        ctx.fillStyle = col(it.color || '--accent'); ctx.globalAlpha = hover === i ? 1 : 0.85;
        ctx.fillRect(Math.min(x0, x1), y, Math.max(1, Math.abs(x1 - x0)), bh); ctx.globalAlpha = 1;
        if (hover === i) { ctx.strokeStyle = col('--text'); ctx.lineWidth = 2; ctx.strokeRect(Math.min(x0, x1) + 1, y + 1, Math.max(1, Math.abs(x1 - x0)) - 2, bh - 2); }
        ctx.fillStyle = col('--text'); ctx.font = SANS; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(fitText(ctx, it.label, L - 10), L - 8, y + bh / 2);
        const txt = it.text || withUnit(num(it.value, 3), opts.unit);
        ctx.font = MONO; const tw = ctx.measureText(txt).width;
        const inside = x1 + 6 + tw > L + W;
        ctx.fillStyle = inside ? col('--mode-contrast') : col('--text'); ctx.textAlign = inside ? 'right' : 'left';
        ctx.fillText(txt, inside ? x1 - 6 : x1 + 6, y + bh / 2);
      });
      ctx.font = SANS_B;
      refs.forEach(function (r, i) {
        if (!fin(r.v) || (opts.log && r.v <= 0)) return;
        const x = Math.round(X(r.v)) + 0.5;
        ctx.strokeStyle = col(r.color || '--line-req'); ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(x, T - 4); ctx.lineTo(x, T + Hh); ctx.stroke(); ctx.setLineDash([]);
        if (r.label) {
          const flip = x > L + W * 0.6;
          ctx.fillStyle = col(r.color || '--line-req'); ctx.textAlign = flip ? 'right' : 'left'; ctx.textBaseline = 'bottom';
          ctx.fillText(r.label, x + (flip ? -4 : 4), T - 4 - (i % 2) * 0);
        }
      });
      ctx.strokeStyle = col('--border-strong'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L + 0.5, T); ctx.lineTo(L + 0.5, T + Hh + 0.5); ctx.lineTo(L + W, T + Hh + 0.5); ctx.stroke();
      ctx.fillStyle = col('--text-2'); ctx.font = MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      let lastX = -Infinity;
      ticks.forEach(function (tk) { const x = X(tk.v); const tw = ctx.measureText(tk.t).width; if (x - tw / 2 > lastX + 4) { ctx.fillText(tk.t, x, T + Hh + 5); lastX = x + tw / 2; } });
      if (opts.xLabel) { ctx.font = SANS; ctx.textBaseline = 'bottom'; ctx.fillText(opts.xLabel, L + W / 2, f.h - 1); }
      autoSummary();
      if (hover >= 0 && items[hover]) f.showTip([{ text: items[hover].label }, { text: items[hover].text || withUnit(num(items[hover].value, 4), opts.unit) }], X(items[hover].value)); else f.hideTip();
    }
    function autoSummary() {
      f.setSummary('Bar chart' + (opts.log ? ' on a log scale' : '') + ': ' + items.map(function (it) { return it.label + ' ' + (it.text || withUnit(num(it.value, 3), opts.unit)); }).join('; ') +
        (refs.length ? '. Reference lines: ' + refs.map(function (r) { return (r.label || '') + ' at ' + withUnit(num(r.v, 3), opts.unit); }).join(', ') : '') + '.');
    }
    function rowAt(py) { if (!geo) return -1; const i = Math.floor((py - geo.T) / geo.rowH); return i >= 0 && i < items.length ? i : -1; }
    f.canvas.addEventListener('pointermove', function (e) { const r = f.canvas.getBoundingClientRect(); const i = rowAt(e.clientY - r.top); if (i !== hover) { hover = i; render(); } });
    f.canvas.addEventListener('pointerleave', function () { if (hover !== -1) { hover = -1; render(); } });
    f.canvas.addEventListener('blur', function () { if (hover !== -1) { hover = -1; render(); } });
    f.canvas.addEventListener('keydown', function (e) {
      if (!items.length) return;
      let i = hover;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') i = Math.min(items.length - 1, i + 1);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') i = Math.max(0, i < 0 ? 0 : i - 1);
      else if (e.key === 'Escape') i = -1;
      else return;
      e.preventDefault(); hover = i; render();
      if (i >= 0) f.say(items[i].label + ': ' + (items[i].text || withUnit(num(items[i].value, 4), opts.unit)));
    });
    api.set = function (d) { if (d.items) items = d.items; if (d.refLines) refs = d.refLines; hover = -1; f.schedule(); return api; };
    api.setCursor = function () { return api; };
    api.onSeek = function () { return api; };
    api.render = function () { render(); return api; };
    api.summary = function (text) { f.setSummary(text, true); return api; };
    api.csv = f.csv = function () {
      const out = ['label,value' + (opts.unit ? ' (' + opts.unit + ')' : '')];
      items.forEach(function (it) { out.push([it.label, it.value].map(csvCell).join(',')); });
      refs.forEach(function (r) { out.push([(r.label || 'reference') + ' (reference)', r.v].map(csvCell).join(',')); });
      return out.join('\n') + '\n';
    };
    api.destroy = function () { f.destroy(); };
    f.render = render;
    render();
    return api;
  };

  /**
   * Mode segments from a mode log (convenience for timeline()).
   * @param {Uint8Array|number[]} modes @param {Float64Array|number[]} t @returns {{t0:number, t1:number, mode:number}[]}
   */
  plot.segmentsFrom = function (modes, t) {
    const out = [];
    const n = Math.min(modes.length, t.length);
    if (!n) return out;
    let start = 0;
    for (let i = 1; i <= n; i++) {
      if (i === n || modes[i] !== modes[start]) {
        out.push({ t0: t[start], t1: i < n ? t[i] : t[n - 1], mode: modes[start] });
        start = i;
      }
    }
    return out;
  };

})(typeof window !== 'undefined' ? window : globalThis);
