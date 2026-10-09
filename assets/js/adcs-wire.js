/**
 * adcs-wire.js: ADCS.wire, a dependency-free 2D canvas wireframe of the spacecraft.
 *
 * Orthographic projection from a camera azimuth/elevation (world = inertial frame, Z up),
 * painter's algorithm with an insertion sort on face depth (cheap thanks to frame coherence),
 * body axes, boresight, inertial axes, a boresight trail, an optional target "ghost" and
 * labelled vector arrows. Drag or the arrow keys rotate the camera; double-click resets it.
 * The renderer never animates by itself: callers drive it with setQuat() + render(), so
 * reduced-motion pages simply call render() from explicit play buttons.
 *
 * Quaternions are scalar-first [q0, q1, q2, q3], active body → inertial (plan §2.2).
 */
(function (root) { 'use strict';
  const ADCS = root.ADCS = root.ADCS || {};
  const wire = ADCS.wire = ADCS.wire || {};

  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const DEFAULTS = {
    size: 'auto', aspect: 1, maxHeight: 420, bus: [0.212, 0.173, 0.274], panels: true, boresight: true,
    inertialAxes: true, bodyAxes: true, trail: 0, view: { az: -35, el: 22 }, zoom: 1, labels: true, autoLabel: true
  };
  /** Bus faces as vertex indices (counter-clockwise seen from outside). */
  const FACES = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]];
  const FACE_NAMES = ['−z', '+z', '−y', '+y', '+x', '−x'];
  const FACE_NORMALS = [[0, 0, -1], [0, 0, 1], [0, -1, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0]];
  wire.FACES = FACES;
  wire.FACE_NAMES = FACE_NAMES;

  function normQ(q) {
    const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  }
  /**
   * Active rotation matrix (body → inertial) of a scalar-first quaternion.
   * @param {number[]} q @returns {number[][]} 3×3 row arrays
   */
  function toR(q) {
    const w = q[0], x = q[1], y = q[2], z = q[3];
    return [
      [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
      [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
      [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]
    ];
  }
  wire.toR = toR;
  function mv(R, v) { return [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function unit(a) { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; }

  /** 8 vertices of a box centred at c with full dimensions d (bit order x, y, z). */
  function boxVerts(d, c) {
    const a = d[0] / 2, b = d[1] / 2, e = d[2] / 2, o = c || [0, 0, 0];
    return [[-a, -b, -e], [a, -b, -e], [a, b, -e], [-a, b, -e], [-a, -b, e], [a, -b, e], [a, b, e], [-a, b, e]]
      .map(function (v) { return [v[0] + o[0], v[1] + o[1], v[2] + o[2]]; });
  }
  /** Camera basis for azimuth/elevation in degrees: toward-camera d, screen right r, screen up u. */
  function camera(view) {
    const az = view.az * D2R, el = Math.max(-89, Math.min(89, view.el)) * D2R;
    const d = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
    const r = unit(cross([-d[0], -d[1], -d[2]], [0, 0, 1]));
    const u = cross(r, [-d[0], -d[1], -d[2]]);
    return { d: d, r: r, u: u };
  }

  /**
   * Create a wireframe renderer on a canvas.
   * @param {HTMLCanvasElement} canvas
   * @param {{size?:('auto'|number), aspect?:number, maxHeight?:number, bus?:number[], panels?:boolean,
   *   boresight?:boolean, inertialAxes?:boolean, bodyAxes?:boolean, trail?:number, view?:{az:number, el:number},
   *   zoom?:number, labels?:boolean, autoLabel?:boolean, ariaLabel?:string}} [o]
   *   size 'auto' fills the parent's width (height = width × aspect, capped at maxHeight); a number gives a square in CSS px.
   *   trail: how many boresight tip positions to keep.
   * @returns {Object} w with setQuat(q), setArrows(list), setGhost(q|null), setView({az, el}), resetView(),
   *   setZoom(z), clearTrail(), render(), pipeline(q), describe(), destroy(), canvas
   */
  wire.create = function (canvas, o) {
    const opts = Object.assign({}, DEFAULTS, o || {});
    const view0 = Object.assign({}, DEFAULTS.view, opts.view || {});
    let view = Object.assign({}, view0);
    let zoom = opts.zoom;
    let q = [1, 0, 0, 0], ghost = null, arrows = [];
    const trailN = Math.max(0, opts.trail | 0);
    const trail = new Float64Array(trailN * 3);
    let trailCount = 0, trailHead = 0;
    const order = FACES.map(function (f, i) { return i; }).concat(opts.panels ? [6, 7] : []);
    const bus = boxVerts(opts.bus);
    const halfY = opts.bus[1] / 2;
    const panelCentres = [[0, halfY + 0.14, 0], [0, -(halfY + 0.14), 0]];
    const panels = panelCentres.map(function (c) {
      const hy = 0.13, hz = 0.075;
      return [[0, c[1] - hy, -hz], [0, c[1] + hy, -hz], [0, c[1] + hy, hz], [0, c[1] - hy, hz]];
    });
    let w = 300, h = 300, dpr = 1, destroyed = false, raf = 0;
    const ctx = canvas.getContext('2d');

    canvas.setAttribute('role', 'img');
    if (!canvas.hasAttribute('tabindex')) canvas.setAttribute('tabindex', '0');
    if (opts.ariaLabel) canvas.setAttribute('aria-label', opts.ariaLabel);

    function measure() {
      const parent = canvas.parentElement;
      let cw, ch;
      if (typeof opts.size === 'number') { cw = ch = opts.size; }
      else {
        cw = Math.max(120, Math.floor((parent && parent.clientWidth) || canvas.clientWidth || 300));
        ch = Math.min(opts.maxHeight, Math.round(cw * opts.aspect));
      }
      const r = Math.min(3, root.devicePixelRatio || 1);
      if (cw === w && ch === h && r === dpr && canvas.width === Math.round(cw * r)) return;
      w = cw; h = ch; dpr = r;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = typeof opts.size === 'number' ? w + 'px' : '100%'; canvas.style.height = h + 'px';
    }
    function colors() {
      const cs = root.getComputedStyle(canvas);
      const cache = {};
      return function (name, fb) {
        if (!name) return fb || '#808080';
        if (name.slice(0, 2) !== '--') return name;
        if (!(name in cache)) cache[name] = cs.getPropertyValue(name).trim() || fb || '#808080';
        return cache[name];
      };
    }
    function projector() {
      const cam = camera(view);
      const s = Math.min(w, h) / 2 / 0.5 * zoom;
      const cx = w / 2, cy = h / 2 + Math.min(w, h) * 0.03;
      return {
        cam: cam, s: s,
        p: function (v) { return { x: cx + s * dot(v, cam.r), y: cy - s * dot(v, cam.u), depth: dot(v, cam.d) }; }
      };
    }

    /**
     * Every stage of the render pipeline for one attitude (used by the m11 widget).
     * @param {number[]} [qq] quaternion (default: the current one)
     * @returns {{R:number[][], vertsBody:number[][], vertsWorld:number[][], verts2D:{x:number, y:number, depth:number}[],
     *   faceDepth:number[], faceOrder:number[], view:{az:number, el:number}}} faceOrder lists bus faces far → near
     */
    function pipeline(qq) {
      measure();
      const R = toR(normQ(qq || q));
      const pr = projector();
      const vertsWorld = bus.map(function (v) { return mv(R, v); });
      const verts2D = vertsWorld.map(pr.p);
      const faceDepth = FACES.map(function (f) { return (verts2D[f[0]].depth + verts2D[f[1]].depth + verts2D[f[2]].depth + verts2D[f[3]].depth) / 4; });
      const faceOrder = FACES.map(function (f, i) { return i; }).sort(function (a, b) { return faceDepth[a] - faceDepth[b]; });
      return { R: R, vertsBody: bus.map(function (v) { return v.slice(); }), vertsWorld: vertsWorld, verts2D: verts2D, faceDepth: faceDepth, faceOrder: faceOrder, view: { az: view.az, el: view.el } };
    }

    function arrow(c, from, to, color, width, label, labelColor) {
      const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
      c.strokeStyle = color; c.fillStyle = color; c.lineWidth = width;
      c.beginPath(); c.moveTo(from.x, from.y); c.lineTo(to.x, to.y); c.stroke();
      if (len > 6) {
        const ux = dx / len, uy = dy / len, hl = Math.min(10, len * 0.35), hw = hl * 0.5;
        c.beginPath(); c.moveTo(to.x, to.y);
        c.lineTo(to.x - ux * hl - uy * hw, to.y - uy * hl + ux * hw);
        c.lineTo(to.x - ux * hl + uy * hw, to.y - uy * hl - ux * hw);
        c.closePath(); c.fill();
      }
      if (label && opts.labels) {
        c.fillStyle = labelColor || color;
        c.font = '600 12px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        const ux = len > 0 ? dx / len : 0, uy = len > 0 ? dy / len : -1;
        c.fillText(label, to.x + ux * 10, to.y + uy * 10);
      }
    }

    function render() {
      if (destroyed) return;
      measure();
      const col = colors();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = col('--bg-3d'); ctx.fillRect(0, 0, w, h);
      const R = toR(q);
      const pr = projector();
      const P = pr.p, O = P([0, 0, 0]);
      const text2 = col('--text-2');
      // inertial axes (behind the body)
      if (opts.inertialAxes) {
        ctx.setLineDash([4, 3]);
        [['X', [0.4, 0, 0]], ['Y', [0, 0.4, 0]], ['Z', [0, 0, 0.4]]].forEach(function (a) { arrow(ctx, O, P(a[1]), text2, 1, a[0], text2); });
        ctx.setLineDash([]);
      }
      // trail
      if (trailN && trailCount > 1) {
        ctx.strokeStyle = col('--accent'); ctx.lineWidth = 1.5; ctx.globalAlpha = 0.55; ctx.beginPath();
        for (let i = 0; i < trailCount; i++) {
          const k = (trailHead - trailCount + i + trailN) % trailN;
          const p = P([trail[3 * k], trail[3 * k + 1], trail[3 * k + 2]]);
          if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
        }
        ctx.stroke(); ctx.globalAlpha = 1;
      }
      // ghost (target attitude) as dashed edges
      if (ghost) {
        const G = toR(ghost);
        const gv = bus.map(function (v) { return P(mv(G, v)); });
        ctx.strokeStyle = text2; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.globalAlpha = 0.8;
        FACES.forEach(function (f) { ctx.beginPath(); ctx.moveTo(gv[f[0]].x, gv[f[0]].y); for (let i = 1; i < 4; i++) ctx.lineTo(gv[f[i]].x, gv[f[i]].y); ctx.closePath(); ctx.stroke(); });
        ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      // faces: bus (0-5) and panels (6, 7), painter's algorithm
      const v2 = bus.map(function (v) { return P(mv(R, v)); });
      const p2 = panels.map(function (pn) { return pn.map(function (v) { return P(mv(R, v)); }); });
      const depth = {};
      FACES.forEach(function (f, i) { depth[i] = (v2[f[0]].depth + v2[f[1]].depth + v2[f[2]].depth + v2[f[3]].depth) / 4; });
      p2.forEach(function (pp, j) { depth[6 + j] = (pp[0].depth + pp[1].depth + pp[2].depth + pp[3].depth) / 4; });
      for (let i = 1; i < order.length; i++) {
        const k = order[i]; let j = i - 1;
        while (j >= 0 && depth[order[j]] > depth[k]) { order[j + 1] = order[j]; j--; }
        order[j + 1] = k;
      }
      const faceFill = col('--surface-3D'), panelFill = col('--panel'), cell = col('--bg-3d');
      ctx.lineJoin = 'round';
      order.forEach(function (fi) {
        const pts = fi < 6 ? FACES[fi].map(function (k) { return v2[k]; }) : p2[fi - 6];
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath();
        if (fi < 6) {
          ctx.fillStyle = faceFill; ctx.fill();
          const facing = dot(mv(R, FACE_NORMALS[fi]), pr.cam.d);
          ctx.fillStyle = 'rgba(0,0,0,' + (0.22 * (1 - Math.max(0, facing))).toFixed(3) + ')'; ctx.fill();
          ctx.strokeStyle = text2; ctx.lineWidth = 1.3; ctx.stroke();
          if (fi === 1 && facing > 0) {
            const c = { x: (pts[0].x + pts[2].x) / 2, y: (pts[0].y + pts[2].y) / 2 };
            ctx.strokeStyle = col('--accent'); ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(2, pr.s * 0.025), 0, 2 * Math.PI); ctx.stroke();
          }
        } else {
          ctx.fillStyle = panelFill; ctx.fill();
          ctx.strokeStyle = cell; ctx.lineWidth = 0.8; ctx.beginPath();
          for (let k = 1; k < 4; k++) {
            const t = k / 4;
            ctx.moveTo(pts[0].x + (pts[1].x - pts[0].x) * t, pts[0].y + (pts[1].y - pts[0].y) * t);
            ctx.lineTo(pts[3].x + (pts[2].x - pts[3].x) * t, pts[3].y + (pts[2].y - pts[3].y) * t);
          }
          ctx.moveTo((pts[0].x + pts[3].x) / 2, (pts[0].y + pts[3].y) / 2); ctx.lineTo((pts[1].x + pts[2].x) / 2, (pts[1].y + pts[2].y) / 2);
          ctx.stroke();
          ctx.strokeStyle = text2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath(); ctx.stroke();
        }
      });
      // body axes and boresight on top
      if (opts.bodyAxes) {
        [['x', [0.25, 0, 0], '--axis-x'], ['y', [0, 0.25, 0], '--axis-y'], ['z', [0, 0, 0.25], '--axis-z']].forEach(function (a) {
          arrow(ctx, O, P(mv(R, a[1])), col(a[2]), 2.5, a[0]);
        });
      }
      if (opts.boresight) {
        ctx.setLineDash([6, 3]);
        arrow(ctx, P(mv(R, [0, 0, opts.bus[2] / 2])), P(mv(R, [0, 0, 0.35])), col('--accent'), 2, null);
        ctx.setLineDash([]);
      }
      arrows.forEach(function (a) {
        if (!a || !a.v) return;
        const v = a.frame === 'body' ? mv(R, a.v) : a.v;
        arrow(ctx, O, P(v), col(a.color || '--accent'), a.width || 2.5, a.label || null);
      });
      if (opts.autoLabel) canvas.setAttribute('aria-label', describe());
    }
    function describe() {
      const R = toR(q);
      const roll = Math.atan2(R[2][1], R[2][2]) * R2D;
      const pitch = -Math.asin(Math.max(-1, Math.min(1, R[2][0]))) * R2D;
      const yaw = Math.atan2(R[1][0], R[0][0]) * R2D;
      const f = function (v) { return (Math.round(v * 10) / 10).toFixed(1).replace('-', '−') + '°'; };
      return (opts.ariaLabel ? opts.ariaLabel + '. ' : 'Wireframe view of the spacecraft. ') +
        'Attitude (3-2-1): roll ' + f(roll) + ', pitch ' + f(pitch) + ', yaw ' + f(yaw) +
        '. Drag or use the arrow keys to rotate the view; double-click or press Home to reset it.';
    }
    function schedule() {
      if (raf || destroyed) return;
      raf = root.requestAnimationFrame(function () { raf = 0; render(); });
    }

    // camera interaction
    let drag = null;
    canvas.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY, az: view.az, el: view.el, touch: e.pointerType === 'touch' };
      if (!drag.touch && canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* capture unsupported */ } }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag) return;
      view.az = drag.az - (e.clientX - drag.x) * 0.5;
      if (!drag.touch) view.el = Math.max(-89, Math.min(89, drag.el + (e.clientY - drag.y) * 0.4));
      schedule();
    });
    function endDrag() { drag = null; }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('dblclick', function () { resetView(); });
    canvas.addEventListener('keydown', function (e) {
      const step = e.shiftKey ? 15 : 5;
      if (e.key === 'ArrowLeft') view.az += step;
      else if (e.key === 'ArrowRight') view.az -= step;
      else if (e.key === 'ArrowUp') view.el = Math.min(89, view.el + step);
      else if (e.key === 'ArrowDown') view.el = Math.max(-89, view.el - step);
      else if (e.key === 'Home') { resetView(); e.preventDefault(); return; }
      else if (e.key === '+' || e.key === '=') zoom = Math.min(3, zoom * 1.1);
      else if (e.key === '-' || e.key === '_') zoom = Math.max(0.4, zoom / 1.1);
      else return;
      e.preventDefault();
      schedule();
    });
    function onTheme() { schedule(); }
    root.addEventListener('adcs:themechange', onTheme);
    let ro = null;
    if (typeof root.ResizeObserver === 'function' && canvas.parentElement && opts.size === 'auto') {
      ro = new root.ResizeObserver(function () { const pw = Math.floor(canvas.parentElement ? canvas.parentElement.clientWidth : 0); if (pw && pw !== w) schedule(); });
      ro.observe(canvas.parentElement);
    }
    function resetView() { view = Object.assign({}, view0); zoom = opts.zoom; schedule(); }

    const api = {
      canvas: canvas,
      /** @param {number[]} qq quaternion (normalised on the way in); also records the boresight trail */
      setQuat: function (qq) {
        q = normQ(qq);
        if (trailN) {
          const tip = mv(toR(q), [0, 0, 0.35]);
          trail[3 * trailHead] = tip[0]; trail[3 * trailHead + 1] = tip[1]; trail[3 * trailHead + 2] = tip[2];
          trailHead = (trailHead + 1) % trailN; trailCount = Math.min(trailN, trailCount + 1);
        }
        return api;
      },
      /** @returns {number[]} the current quaternion */
      getQuat: function () { return q.slice(); },
      /** @param {{v:number[], frame:('body'|'inertial'), color?:string, label?:string, width?:number}[]} list vectors in metres */
      setArrows: function (list) { arrows = Array.isArray(list) ? list.slice() : []; return api; },
      /** @param {number[]|null} qq target attitude drawn as a dashed ghost, or null */
      setGhost: function (qq) { ghost = qq ? normQ(qq) : null; return api; },
      /** @param {{az?:number, el?:number}} v camera angles in degrees */
      setView: function (v) { view = Object.assign(view, v || {}); schedule(); return api; },
      getView: function () { return { az: view.az, el: view.el }; },
      resetView: function () { resetView(); return api; },
      setZoom: function (z) { zoom = Math.max(0.2, Math.min(4, z)); schedule(); return api; },
      clearTrail: function () { trailCount = 0; trailHead = 0; return api; },
      render: function () { render(); return api; },
      pipeline: pipeline,
      describe: describe,
      destroy: function () {
        destroyed = true;
        if (raf) root.cancelAnimationFrame(raf);
        root.removeEventListener('adcs:themechange', onTheme);
        if (ro) ro.disconnect();
      }
    };
    render();
    return api;
  };

})(typeof window !== 'undefined' ? window : globalThis);
