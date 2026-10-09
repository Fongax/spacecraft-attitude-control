/**
 * simulator-3d.js: the simulator's 3D view, its HUD and the 2D fallback (package P2).
 *
 * ADCS.simPage.createView(host, {onToggle}) builds, inside host:
 *   - a three.js r128 scene (world = inertial frame, Z up) with the spacecraft bus, two solar
 *     panels, a +z boresight, body and inertial axes with HTML labels, a target ghost, a
 *     boresight trail and ω / τ arrows; OrbitControls with damping and a Reset camera button;
 *   - if WebGL or three.js is missing, an ADCS.wire 2D wireframe instead, with a note;
 *   - a HUD (t, mode, error, rate, roll/pitch/yaw, q and |q| − 1) and the view toggles.
 * The view never animates by itself: the page calls update(sample, result) from its playback
 * loop or a scrub. Quaternions are scalar first [q0, q1, q2, q3], body → inertial; three.js
 * receives quaternion.set(q1, q2, q3, q0).
 */
(function () { 'use strict';
  const A = window.ADCS;
  const ui = A.ui;
  const el = ui.el;
  const page = A.simPage = A.simPage || {};

  const BUS = [0.212, 0.173, 0.274];            // m; a uniform 4 kg box of this size has the project J to within 0.2%
  const PANEL = [0.004, 0.26, 0.15];            // m
  const PANEL_Y = BUS[1] / 2 + 0.14;            // panel centres at y = ±0.2265 m
  const BORESIGHT = 0.35, BODY_AXIS = 0.25, INERTIAL_AXIS = 0.4;
  const TRAIL_N = 600;
  const OMEGA_SCALE = 1;                         // m per rad/s
  const TAU_SCALE = 50;                          // m per N m
  const CAM0 = [0.9, -0.9, 0.6];
  const MIN_ARROW = 0.03;                        // m; shorter arrows would hide inside the bus
  const HUD_SHIFT = [0.08, 0.04];                // scene shift (fraction of the view) while the HUD overlays it
  const STORE_KEY = 'adcs-sim-view';
  const SOFT_KEY = 'adcs-sim-soft3d';
  const TOGGLES = [
    { key: 'ghost', label: 'Target ghost', title: 'Translucent wireframe of the bus at the target attitude q_ref' },
    { key: 'trail', label: 'Boresight trail', title: 'The last 600 positions of the boresight tip' },
    { key: 'omega', label: 'ω arrow', title: 'Body rate vector, 1 m per rad/s' },
    { key: 'torque', label: 'Torque arrow', title: 'Delivered torque vector, 50 m per N m' },
    { key: 'stars', label: 'Stars', title: 'Background star points' },
    { key: 'hud', label: 'HUD', title: 'Show the heads-up display' }
  ];
  const DEFAULT_TOGGLES = { ghost: true, trail: true, omega: true, torque: true, stars: false, hud: true };

  function fmtDeg(x, d) { return ui.fmt(x, { fixed: d === undefined ? 2 : d, unit: '°' }); }

  /* ---------------------------------------------------------------- colours */

  let probeCtx = null;
  /** Resolve a CSS custom property to [r, g, b] in 0..1 (any CSS colour syntax). */
  function rgbOf(name) {
    if (!probeCtx) probeCtx = document.createElement('canvas').getContext('2d');
    const raw = ui.cssVar(name) || '#808080';
    probeCtx.fillStyle = '#808080';
    probeCtx.fillStyle = raw;
    const s = String(probeCtx.fillStyle);
    let r = 128, g = 128, b = 128;
    if (s.charAt(0) === '#' && s.length >= 7) {
      r = parseInt(s.slice(1, 3), 16); g = parseInt(s.slice(3, 5), 16); b = parseInt(s.slice(5, 7), 16);
    } else {
      const m = s.match(/[\d.]+/g);
      if (m && m.length >= 3) { r = Number(m[0]); g = Number(m[1]); b = Number(m[2]); }
    }
    return [r / 255, g / 255, b / 255];
  }

  /* ---------------------------------------------------------------- WebGL detection */

  function threeLoaded() {
    return !!(window.THREE && typeof THREE.WebGLRenderer === 'function' && typeof THREE.OrbitControls === 'function');
  }
  /**
   * Create a WebGL context on canvas, or return null. Checking first keeps three.js from
   * logging its own error when WebGL is unavailable. Unless software is true, a context that
   * would fall back to software rendering counts as unavailable (failIfMajorPerformanceCaveat):
   * the 2D wireframe is faster there, and the reader can still opt in to software 3D.
   */
  function webglContext(canvas, software) {
    if (!threeLoaded()) return null;
    const attrs = { alpha: false, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false,
      powerPreference: 'default', failIfMajorPerformanceCaveat: !software };
    try {
      return canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs) || null;
    } catch (e) {
      return null;
    }
  }

  /* ---------------------------------------------------------------- HUD */

  function buildHud() {
    const rows = {};
    function row(key, label, wide) {
      const dd = el('dd');
      rows[key] = dd;
      return el('div', { class: wide ? 'hud-wide' : null }, el('dt', null, label), dd);
    }
    const est = row('est', 'Estimate error');
    est.hidden = true;
    const box = el('dl', { class: 'sim-hud', 'aria-label': 'Heads-up display at the cursor time' },
      row('mode', 'Mode', true), row('t', 't'), row('err', 'Error'), row('rate', '|ω|'),
      row('eul', 'Roll, pitch, yaw', true), row('q', 'q', true), row('qn', '|q| − 1'), est);
    let lastMode = -1;
    function update(s, result) {
      rows.t.textContent = ui.fmt(s.t, { fixed: 2, unit: 's' });
      if (s.mode !== lastMode) {
        rows.mode.textContent = '';
        rows.mode.appendChild(ui.modePill(s.mode));
        lastMode = s.mode;
      }
      rows.err.textContent = fmtDeg(s.errDeg);
      rows.rate.textContent = ui.fmt(s.rateDeg, { fixed: 2, unit: 'deg/s' });
      rows.eul.textContent = s.eulerDeg.map(function (v) { return fmtDeg(v, 1); }).join(', ');
      rows.q.textContent = '[' + s.q.map(function (v) { return ui.fmt(v, { fixed: 4 }); }).join(', ') + ']';
      // |q| − 1 of the logged sample (not of the interpolated attitude), so integrator drift shows
      const k = Math.max(0, Math.min(result.n - 1, s.k));
      const qn = Math.hypot(result.q[4 * k], result.q[4 * k + 1], result.q[4 * k + 2], result.q[4 * k + 3]) - 1;
      rows.qn.textContent = qn === 0 ? '0' : ui.fmtSci(qn, 2);
      const hasEst = s.estErrDeg !== null && s.estErrDeg !== undefined;
      est.hidden = !hasEst;
      if (hasEst) rows.est.textContent = fmtDeg(s.estErrDeg, 3);
    }
    return { el: box, update: update };
  }

  /* ---------------------------------------------------------------- three.js view */

  function make3D(wrap, labelsLayer, state, software) {
    const canvas = el('canvas', { tabindex: '0', role: 'img', 'aria-label': '3D view of the spacecraft' });
    const gl = webglContext(canvas, software);
    if (!gl) return null;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, context: gl, antialias: true });
    } catch (e) {
      return null;
    }
    wrap.appendChild(canvas);
    wrap.appendChild(labelsLayer);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    const reduced = ui.prefersReducedMotion();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1.6, 0.01, 60);
    camera.up.set(0, 0, 1);
    camera.position.set(CAM0[0], CAM0[1], CAM0[2]);
    camera.lookAt(0, 0, 0);

    const controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = !reduced;
    controls.dampingFactor = 0.12;
    controls.minDistance = 0.4;
    controls.maxDistance = 3;
    controls.enablePan = false;
    controls.enableZoom = false;     // switched on while the view has focus, so page scrolling is never captured
    controls.target.set(0, 0, 0);
    controls.update();
    controls.saveState();

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(1, -1, 2);
    scene.add(sun);

    /* materials (colours applied by applyColours) */
    const mats = {
      bus: new THREE.MeshLambertMaterial({ color: 0xdfe5ee }),
      edge: new THREE.LineBasicMaterial({ color: 0x4a5361 }),
      panel: new THREE.MeshLambertMaterial({ color: 0x2b4c7e }),
      inertial: new THREE.LineBasicMaterial({ color: 0x4a5361, transparent: true, opacity: 0.8 }),
      ghost: new THREE.LineBasicMaterial({ color: 0x1f5fbf, transparent: true, opacity: 0.5, depthWrite: false }),
      trail: new THREE.LineBasicMaterial({ color: 0x1f5fbf, transparent: true, opacity: 0.65 }),
      stars: new THREE.PointsMaterial({ color: 0x9aa7b4, size: 2, sizeAttenuation: false })
    };

    /* spacecraft */
    const craft = new THREE.Group();
    scene.add(craft);
    const busGeo = new THREE.BoxGeometry(BUS[0], BUS[1], BUS[2]);
    craft.add(new THREE.Mesh(busGeo, mats.bus));
    const busEdges = new THREE.EdgesGeometry(busGeo);
    craft.add(new THREE.LineSegments(busEdges, mats.edge));
    const panelGeo = new THREE.BoxGeometry(PANEL[0], PANEL[1], PANEL[2]);
    const panelEdges = new THREE.EdgesGeometry(panelGeo);
    [1, -1].forEach(function (s) {
      const p = new THREE.Mesh(panelGeo, mats.panel);
      p.position.set(0, s * PANEL_Y, 0);
      craft.add(p);
      const pe = new THREE.LineSegments(panelEdges, mats.edge);
      pe.position.copy(p.position);
      craft.add(pe);
    });
    const ORIGIN = new THREE.Vector3(0, 0, 0);
    const boresight = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), ORIGIN, BORESIGHT, 0x1f5fbf, 0.05, 0.026);
    craft.add(boresight);
    const bodyAxes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(function (d) {
      const a = new THREE.ArrowHelper(new THREE.Vector3(d[0], d[1], d[2]), ORIGIN, BODY_AXIS, 0xff0000, 0.035, 0.018);
      craft.add(a);
      return a;
    });
    const omegaArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), ORIGIN, 0.1, 0x9a6700, 0.03, 0.016);
    const tauArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), ORIGIN, 0.1, 0x6a3fb5, 0.03, 0.016);
    craft.add(omegaArrow);
    craft.add(tauArrow);
    /*
     * Draw every arrow over the bus and panels: the 0.25 m body y axis lies inside the 4 mm solar
     * panel and the ω and τ arrows start inside the bus, so with depth testing they would be hidden.
     * Later render orders draw on top, so the short body z axis shows over the longer boresight.
     */
    function overlay(arrow, order) {
      arrow.line.material.depthTest = false;
      arrow.cone.material.depthTest = false;
      arrow.line.renderOrder = arrow.cone.renderOrder = order;
    }
    overlay(boresight, 3);
    bodyAxes.forEach(function (a) { overlay(a, 4); });
    overlay(omegaArrow, 5);
    overlay(tauArrow, 5);

    /* inertial axes (world frame) */
    const inGeo = new THREE.BufferGeometry();
    inGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, INERTIAL_AXIS, 0, 0, 0, 0, 0, 0, INERTIAL_AXIS, 0, 0, 0, 0, 0, 0, INERTIAL_AXIS], 3));
    scene.add(new THREE.LineSegments(inGeo, mats.inertial));

    /* target ghost */
    const ghost = new THREE.Group();
    ghost.add(new THREE.LineSegments(busEdges, mats.ghost));
    [1, -1].forEach(function (s) {
      const g = new THREE.LineSegments(panelEdges, mats.ghost);
      g.position.set(0, s * PANEL_Y, 0);
      ghost.add(g);
    });
    const ghostBore = new THREE.BufferGeometry();
    ghostBore.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, BORESIGHT], 3));
    ghost.add(new THREE.LineSegments(ghostBore, mats.ghost));
    scene.add(ghost);

    /* boresight trail: an ordered ring buffer of tip positions */
    const trailPos = new Float32Array(TRAIL_N * 3);
    const trailGeo = new THREE.BufferGeometry();
    const trailAttr = new THREE.BufferAttribute(trailPos, 3);
    trailAttr.setUsage(THREE.DynamicDrawUsage);
    trailGeo.setAttribute('position', trailAttr);
    trailGeo.setDrawRange(0, 0);
    const trail = new THREE.Line(trailGeo, mats.trail);
    trail.frustumCulled = false;
    scene.add(trail);
    let trailCount = 0;
    function clearTrail() { trailCount = 0; trailGeo.setDrawRange(0, 0); }
    function pushTrail(v) {
      if (trailCount === TRAIL_N) { trailPos.copyWithin(0, 3); trailCount--; }
      if (trailCount > 0) {
        const j = 3 * (trailCount - 1);
        const dx = trailPos[j] - v.x, dy = trailPos[j + 1] - v.y, dz = trailPos[j + 2] - v.z;
        if (dx * dx + dy * dy + dz * dz < 1e-10) return;
      }
      trailPos[3 * trailCount] = v.x; trailPos[3 * trailCount + 1] = v.y; trailPos[3 * trailCount + 2] = v.z;
      trailCount++;
      trailAttr.needsUpdate = true;
      trailGeo.setDrawRange(0, trailCount);
    }

    /* stars: deterministic points on a large sphere */
    const starPos = [];
    const rnd = A.rng.mulberry32(7);
    for (let i = 0; i < 420; i++) {
      const a = A.rng.normalPair(rnd), b = A.rng.normalPair(rnd);
      const n = Math.hypot(a[0], a[1], b[0]) || 1, r = 8 + 4 * rnd();
      starPos.push(r * a[0] / n, r * a[1] / n, r * b[0] / n);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, mats.stars);
    scene.add(stars);

    /* HTML labels projected every frame */
    const labelDefs = [
      { text: 'X', inertial: true, pos: new THREE.Vector3(INERTIAL_AXIS * 1.08, 0, 0) },
      { text: 'Y', inertial: true, pos: new THREE.Vector3(0, INERTIAL_AXIS * 1.08, 0) },
      { text: 'Z', inertial: true, pos: new THREE.Vector3(0, 0, INERTIAL_AXIS * 1.08) },
      { text: 'x', color: '--axis-x', local: new THREE.Vector3(BODY_AXIS * 1.12, 0, 0) },
      { text: 'y', color: '--axis-y', local: new THREE.Vector3(0, BODY_AXIS * 1.12, 0) },
      { text: 'z', color: '--axis-z', local: new THREE.Vector3(0, 0, BODY_AXIS * 0.92) },
      { text: 'boresight', color: '--accent', local: new THREE.Vector3(0, 0, BORESIGHT * 1.1) },
      { text: 'ω', color: '--warn', local: new THREE.Vector3(), arrow: 'omega' },
      { text: 'τ', color: '--ext', local: new THREE.Vector3(), arrow: 'torque' }
    ];
    labelDefs.forEach(function (d) {
      d.el = el('span', { class: 'sim-label' + (d.inertial ? ' inertial' : '') },
        d.color ? el('span', { class: 'sw', style: { '--sw': 'var(' + d.color + ')' } }) : null, d.text);
      labelsLayer.appendChild(d.el);
    });

    let W = 640, H = 400;
    const tmp = new THREE.Vector3();
    const LABEL_H = 18, LABEL_GAP = 2, NUDGE = 15;
    const boxes = [];      // label boxes already placed in this frame, as [x, y, w, h]
    function hits(x, y, w) {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (x < b[0] + b[2] + LABEL_GAP && x + w + LABEL_GAP > b[0] && y < b[1] + b[3] + LABEL_GAP && y + LABEL_H + LABEL_GAP > b[1]) return true;
      }
      return false;
    }
    /**
     * Project each label to the screen. A label that would overlap one placed earlier (for example
     * ω on the boresight when ω points along +z) is nudged sideways, perpendicular to its arrow.
     */
    function placeLabels() {
      boxes.length = 0;
      tmp.set(0, 0, 0).project(camera);
      const ox = (tmp.x + 1) / 2 * W, oy = (1 - tmp.y) / 2 * H;
      labelDefs.forEach(function (d) {
        let visible = true;
        if (d.arrow === 'omega') visible = omegaArrow.visible;
        if (d.arrow === 'torque') visible = tauArrow.visible;
        if (!visible) { d.el.hidden = true; return; }
        if (d.inertial) tmp.copy(d.pos); else { tmp.copy(d.local); craft.localToWorld(tmp); }
        tmp.project(camera);
        if (tmp.z > 1 || tmp.z < -1) { d.el.hidden = true; return; }
        d.el.hidden = false;
        if (!d.w) d.w = d.el.offsetWidth;       // the text never changes, so measure once
        const w = d.w || 8 * d.text.length + 14;
        const x = (tmp.x + 1) / 2 * W - 4, y = (1 - tmp.y) / 2 * H - 9;
        const dx = x - ox, dy = y - oy, len = Math.hypot(dx, dy);
        const px = len > 1 ? -dy / len : 0, py = len > 1 ? dx / len : 1;
        let bx = x, by = y;
        for (let k = 1; k <= 4 && hits(bx, by, w); k++) {
          const s = (k % 2 ? 1 : -1) * NUDGE * Math.ceil(k / 2);
          bx = x + px * s; by = y + py * s;
        }
        boxes.push([bx, by, w, LABEL_H]);
        d.el.style.transform = 'translate(' + bx.toFixed(1) + 'px,' + by.toFixed(1) + 'px)';
      });
    }

    function applyColours() {
      function set(mat, name) { const c = rgbOf(name); mat.color.setRGB(c[0], c[1], c[2]); }
      const bg = rgbOf('--bg-3d');
      scene.background = new THREE.Color(bg[0], bg[1], bg[2]);
      set(mats.bus, '--surface-3D');
      set(mats.edge, '--text-2');
      set(mats.panel, '--panel');
      set(mats.inertial, '--text-2');
      set(mats.ghost, '--accent');
      set(mats.trail, '--accent');
      set(mats.stars, '--text-2');
      const acc = rgbOf('--accent');
      boresight.setColor(new THREE.Color(acc[0], acc[1], acc[2]));
      ['--axis-x', '--axis-y', '--axis-z'].forEach(function (name, i) { const c = rgbOf(name); bodyAxes[i].setColor(new THREE.Color(c[0], c[1], c[2])); });
      const w = rgbOf('--warn'), e = rgbOf('--ext');
      omegaArrow.setColor(new THREE.Color(w[0], w[1], w[2]));
      tauArrow.setColor(new THREE.Color(e[0], e[1], e[2]));
    }

    function render() {
      renderer.render(scene, camera);
      placeLabels();
    }

    /* render loop only while the camera is moving (damping) */
    let raf = 0;
    function requestRender() {
      if (raf) return;
      raf = window.requestAnimationFrame(function () {
        raf = 0;
        if (controls.enableDamping) controls.update();    // dispatches 'change' (and so another frame) while still moving
        render();
      });
    }
    controls.addEventListener('change', requestRender);

    /**
     * While the HUD overlays the top-left corner, shift the projection so the craft sits a little
     * right of and below the centre, away from the HUD. The camera and its orbit are unchanged.
     */
    function applyInset() {
      camera.aspect = W / H;
      if (state.hudOverlay && state.hudOverlay()) camera.setViewOffset(W, H, -Math.round(HUD_SHIFT[0] * W), -Math.round(HUD_SHIFT[1] * H), W, H);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    }
    function resize() {
      const w = Math.max(1, Math.floor(wrap.clientWidth)), h = Math.max(1, Math.floor(wrap.clientHeight));
      if (w === W && h === H) return;
      W = w; H = h;
      renderer.setSize(w, h, false);
      applyInset();
      render();
    }
    let ro = null;
    if (typeof window.ResizeObserver === 'function') { ro = new window.ResizeObserver(resize); ro.observe(wrap); }
    else window.addEventListener('resize', resize);

    /* zoom only while focused; touch orbit only when asked for, so the page still scrolls */
    canvas.addEventListener('focus', function () { controls.enableZoom = true; });
    canvas.addEventListener('blur', function () { controls.enableZoom = false; });
    function zoomBy(f) {
      const off = camera.position.clone().sub(controls.target);
      const d = Math.min(controls.maxDistance, Math.max(controls.minDistance, off.length() * f));
      off.setLength(d);
      camera.position.copy(controls.target).add(off);
      controls.update();
      render();
    }
    canvas.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(0.85); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(1 / 0.85); }
      else if (e.key === 'Home') { e.preventDefault(); resetCamera(); }
    });
    function blockTouch(e) {
      if (!state.touchOrbit && e.touches && e.touches.length < 2) e.stopPropagation();
    }
    ['touchstart', 'touchmove', 'touchend'].forEach(function (t) { wrap.addEventListener(t, blockTouch, { capture: true, passive: true }); });
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); });
    canvas.addEventListener('webglcontextrestored', function () { applyColours(); render(); });

    function resetCamera() {
      controls.reset();
      camera.up.set(0, 0, 1);
      camera.position.set(CAM0[0], CAM0[1], CAM0[2]);
      controls.target.set(0, 0, 0);
      controls.update();
      render();
    }

    const qT = new THREE.Quaternion();
    const v3 = new THREE.Vector3();
    function setArrow(arrow, def, vec, scale, on) {
      const len = Math.hypot(vec[0], vec[1], vec[2]) * scale;
      if (!on || !(len > MIN_ARROW)) { arrow.visible = false; return; }
      arrow.visible = true;
      v3.set(vec[0], vec[1], vec[2]).normalize();
      arrow.setDirection(v3);
      const head = Math.min(0.045, 0.35 * len);
      arrow.setLength(len, head, head * 0.55);
      def.local.copy(v3).multiplyScalar(len + 0.03);
    }
    const tip = new THREE.Vector3();
    function update(s, result, toggles) {
      qT.set(s.q[1], s.q[2], s.q[3], s.q[0]).normalize();
      craft.quaternion.copy(qT);
      craft.updateMatrixWorld(true);
      setArrow(omegaArrow, labelDefs[7], s.w, OMEGA_SCALE, toggles.omega);
      setArrow(tauArrow, labelDefs[8], s.tau, TAU_SCALE, toggles.torque);
      ghost.visible = !!toggles.ghost;
      const qr = result.config.qRef;
      ghost.quaternion.set(qr[1], qr[2], qr[3], qr[0]).normalize();
      trail.visible = !!toggles.trail;
      if (toggles.trail) { tip.set(0, 0, BORESIGHT).applyQuaternion(qT); pushTrail(tip); }
      stars.visible = !!toggles.stars;
      render();
    }

    applyColours();
    resize();
    applyInset();
    render();

    return {
      kind: '3d', canvas: canvas,
      update: update, render: render, clearTrail: clearTrail, resetCamera: resetCamera,
      theme: function () { applyColours(); render(); },
      inset: function () { applyInset(); render(); },
      refresh: function (toggles) { ghost.visible = !!toggles.ghost; trail.visible = !!toggles.trail; stars.visible = !!toggles.stars; if (!toggles.omega) omegaArrow.visible = false; if (!toggles.torque) tauArrow.visible = false; render(); },
      destroy: function () { if (ro) ro.disconnect(); controls.dispose(); renderer.dispose(); canvas.remove(); labelsLayer.remove(); }
    };
  }

  /* ---------------------------------------------------------------- 2D fallback */

  function make2D(wrap) {
    wrap.classList.add('is-2d');
    const canvas = el('canvas');
    wrap.appendChild(canvas);
    const w = A.wire.create(canvas, { size: 'auto', aspect: 0.625, maxHeight: 460, trail: TRAIL_N, ariaLabel: '2D wireframe of the spacecraft' });
    let trailOn = true;
    return {
      kind: '2d', canvas: canvas,
      update: function (s, result, toggles) {
        w.setGhost(toggles.ghost ? result.config.qRef : null);
        w.setQuat(s.q);
        const arrows = [];
        const wv = s.w.map(function (x) { return x * OMEGA_SCALE; }), tv = s.tau.map(function (x) { return x * TAU_SCALE; });
        if (toggles.omega && Math.hypot(wv[0], wv[1], wv[2]) > MIN_ARROW) arrows.push({ v: wv, frame: 'body', color: '--warn', label: 'ω' });
        if (toggles.torque && Math.hypot(tv[0], tv[1], tv[2]) > MIN_ARROW) arrows.push({ v: tv, frame: 'body', color: '--ext', label: 'τ' });
        w.setArrows(arrows);
        trailOn = !!toggles.trail;
        if (!trailOn) w.clearTrail();
        w.render();
      },
      render: function () { w.render(); },
      clearTrail: function () { w.clearTrail(); },
      resetCamera: function () { w.resetView(); },
      theme: function () { w.render(); },
      inset: function () {},
      refresh: function (toggles) { if (!toggles.trail) w.clearTrail(); w.render(); },
      destroy: function () { w.destroy(); canvas.remove(); wrap.classList.remove('is-2d'); }
    };
  }

  /* ---------------------------------------------------------------- public factory */

  /**
   * Build the simulator view inside host.
   * @param {HTMLElement} host
   * @returns {{kind:string, update:function(Object, Object, {dom:boolean}=):void, clearTrail:Function,
   *   resetCamera:Function, toggles:Object, el:HTMLElement}}
   */
  page.createView = function (host) {
    const stored = ui.storage.get(STORE_KEY, null);
    const toggles = Object.assign({}, DEFAULT_TOGGLES, stored && typeof stored === 'object' ? stored : {});
    // the HUD overlays the view from 600px (see simulator.css); below that it sits under the view
    const overlayMq = window.matchMedia ? window.matchMedia('(min-width: 600px)') : null;
    const state = { touchOrbit: false, hudOverlay: function () { return !!toggles.hud && !!(overlayMq && overlayMq.matches); } };
    const wrap = el('div', { class: 'sim-canvas-wrap' });
    const labels = el('div', { class: 'sim-labels', 'aria-hidden': 'true' });
    const fallback = el('div', { class: 'sim-view-fallback', role: 'note' });
    fallback.hidden = true;
    host.appendChild(fallback);
    host.appendChild(wrap);
    const softPref = ui.storage.get(SOFT_KEY, false) === true;
    let impl = make3D(wrap, labels, state, softPref);
    if (!impl) impl = make2D(wrap);

    const hud = buildHud();
    host.appendChild(hud.el);
    hud.el.hidden = !toggles.hud;

    const tools = el('div', { class: 'sim-view-tools', role: 'group', 'aria-label': 'View options' });
    tools.appendChild(ui.button({ label: 'Reset camera', icon: 'reset', small: true, onClick: function () { impl.resetCamera(); ui.announce('Camera reset.'); } }));
    const chips = {};
    TOGGLES.forEach(function (t) {
      const c = ui.chip({ label: t.label, pressed: !!toggles[t.key], title: t.title });
      c.on('change', function (v) {
        toggles[t.key] = v;
        ui.storage.set(STORE_KEY, toggles);
        if (t.key === 'hud') { hud.el.hidden = !v; impl.inset(); }
        if (t.key === 'trail' && !v) impl.clearTrail();
        if (last) apply(last.s, last.r, true); else impl.refresh(toggles);
      });
      chips[t.key] = c;
      tools.appendChild(c.el);
    });
    const touchChip = ui.chip({ label: 'Drag to orbit', pressed: false, title: 'When on, dragging one finger on the view orbits the camera instead of scrolling the page' });
    touchChip.on('change', function (v) { state.touchOrbit = v; });
    tools.appendChild(touchChip.el);
    host.appendChild(tools);
    const note = el('p', { class: 'sim-view-note' });
    host.appendChild(note);

    function describeKind() {
      const is3d = impl.kind === '3d';
      host.classList.toggle('is-2d', !is3d);
      chips.stars.el.hidden = !is3d;
      touchChip.el.hidden = !(is3d && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      note.textContent = '';
      fallback.textContent = '';
      fallback.hidden = is3d;
      note.appendChild(document.createTextNode(is3d
        ? 'Drag to orbit. Select the view, then scroll or press + and − to zoom; Home resets the camera. '
        : 'Drag or use the arrow keys on the view to turn the camera; double-click or press Home to reset it. '));
      note.appendChild(document.createTextNode('The bus is a uniform 4 kg box of 0.212 × 0.173 × 0.274 m, which has the project’s inertia J = diag(0.035, 0.040, 0.025) kg m² to within 0.2% '));
      note.appendChild(ui.tag('derived'));
      note.appendChild(document.createTextNode(' Arrows: ω at 1 m per rad/s, τ at 50 m per N m.'));
      if (is3d) return;
      fallback.appendChild(el('strong', null, '3D unavailable; showing 2D wireframe.'));
      if (threeLoaded()) {
        fallback.appendChild(document.createTextNode(' This browser offers WebGL only through slow software rendering, if at all. '));
        fallback.appendChild(ui.button({ label: 'Try software 3D', icon: 'sim', small: true, onClick: function () {
          const next = make3D(wrap, labels, state, true);
          if (!next) { fallback.appendChild(el('span', null, ' WebGL is not available at all here.')); this.disabled = true; return; }
          impl.destroy();
          impl = next;
          // make3D appended its canvas after the 2D one was removed; keep the HUD order intact
          ui.storage.set(SOFT_KEY, true);
          describeKind();
          if (last) apply(last.s, last.r, true);
          ui.announce('Switched to the 3D view.');
        } }));
      }
    }
    describeKind();

    window.addEventListener('adcs:themechange', function () { impl.theme(); });
    if (overlayMq) {
      const onMq = function () { impl.inset(); };
      if (overlayMq.addEventListener) overlayMq.addEventListener('change', onMq); else if (overlayMq.addListener) overlayMq.addListener(onMq);
    }

    let last = null;
    function apply(s, result, dom) {
      impl.update(s, result, toggles);
      if (dom && toggles.hud) hud.update(s, result);
      if (dom && impl.kind === '3d') {
        impl.canvas.setAttribute('aria-label', '3D view of the spacecraft at t = ' + ui.fmt(s.t, { fixed: 2, unit: 's' }) +
          ': roll ' + fmtDeg(s.eulerDeg[0], 1) + ', pitch ' + fmtDeg(s.eulerDeg[1], 1) + ', yaw ' + fmtDeg(s.eulerDeg[2], 1) +
          ', ' + fmtDeg(s.errDeg) + ' from the target, mode ' + A.modes.NAMES[s.mode] +
          '. Press + or − to zoom and Home to reset the camera.');
      }
    }

    return {
      get kind() { return impl.kind; },
      el: host,
      toggles: toggles,
      /**
       * Show the attitude of one sample. dom:false skips the HUD text (used to throttle playback).
       * @param {Object} s ADCS.sim.sampleAt output @param {Object} result the run @param {{dom?:boolean}} [o]
       */
      update: function (s, result, o) {
        last = { s: s, r: result };
        apply(s, result, !o || o.dom !== false);
      },
      clearTrail: function () { impl.clearTrail(); },
      resetCamera: function () { impl.resetCamera(); },
      get canvas() { return impl.canvas; }
    };
  };
})();
