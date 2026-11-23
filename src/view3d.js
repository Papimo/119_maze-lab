// Maze Lab 2.0 — 3D-weergave (three.js r160, UMD). De 2D-tekenaar tekent dan alleen de vloer (r.noWalls);
// dat canvas is de levende vloertextuur (bezochte cellen, pad, zwermgloed…). Muren = InstancedMesh, één blok
// per muurstuk; tijdens het bouwen zakken ze weg / veren ze omhoog. Camera: 'orbit' | 'chase' | 'first'.
// Wereldeenheid = 1 cel; x = model-x, z = model-y (zelfde assen als de JSON-export).
(function (ML) {
  'use strict';
  const WALL_H = 0.62, WALL_T = 0.13;
  const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const spring = x => x >= 1 ? 1 : 1 - Math.exp(-5 * x) * Math.cos(9 * x);
  const lerp = (a, b, k) => a + (b - a) * k;

  class View3D {
    constructor(runner) {
      const T = window.THREE;
      this.run = runner; this.ok = !!T;
      if (!T) return;
      this.T = T;
      const host = runner.cv.parentElement;
      this.cv = document.createElement('canvas'); this.cv.className = 'v3';
      host.insertBefore(this.cv, runner.cv.nextSibling);
      const ren = this.ren = new T.WebGLRenderer({ canvas: this.cv, antialias: true });
      ren.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      ren.shadowMap.enabled = true; ren.shadowMap.type = T.PCFSoftShadowMap;
      ren.outputColorSpace = T.SRGBColorSpace; ren.toneMapping = T.ACESFilmicToneMapping; ren.toneMappingExposure = 1.05;
      const sc = this.scene = new T.Scene();
      this.cam = new T.PerspectiveCamera(45, 1, 0.03, 4000);
      this.hemi = new T.HemisphereLight(0xffffff, 0x556070, 0.95); sc.add(this.hemi);
      const sun = this.sun = new T.DirectionalLight(0xfff0dc, 1.7);
      sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
      sc.add(sun); sc.add(sun.target);
      this.lamp = new T.PointLight(0xffc27a, 0, 9, 1.4); this.lamp.castShadow = false; sc.add(this.lamp);
      // vloer = live 2D-canvas
      this.tex = new T.CanvasTexture(runner.cv); this.tex.colorSpace = T.SRGBColorSpace; this.tex.anisotropy = ren.capabilities.getMaxAnisotropy();
      this.floor = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ map: this.tex, roughness: 0.92, metalness: 0 }));
      this.floor.rotation.x = -Math.PI / 2; this.floor.receiveShadow = true; sc.add(this.floor);
      // zoeker: gloeiende bol
      this.head = new T.Mesh(new T.SphereGeometry(0.2, 24, 16), new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.3 }));
      this.head.castShadow = true; this.head.visible = false; sc.add(this.head);
      // doel: lichtbaken
      this.beacon = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 6, 24, 1, true),
        new T.MeshBasicMaterial({ color: 0xff6688, transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      sc.add(this.beacon);
      // zwerm
      this.dots = null; this.dotN = 0;
      this.dummy = new T.Object3D();
      this.hp = null; this.dir = [1, 0]; this.yaw = 0.7; this.pitch = 0.95; this.zoom = 1; this.userT = -99;
      this.ctrl();
      new ResizeObserver(() => this.resize()).observe(host);
      this.resize();
    }
    ctrl() {
      let drag = null;
      this.cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; this.cv.setPointerCapture(e.pointerId); this.cv.style.cursor = 'grabbing'; });
      this.cv.addEventListener('pointermove', e => {
        if (!drag) return;
        this.yaw -= (e.clientX - drag.x) * 0.006; this.pitch = Math.min(1.45, Math.max(0.18, this.pitch + (e.clientY - drag.y) * 0.005));
        drag = { x: e.clientX, y: e.clientY }; this.userT = performance.now() / 1000;
      });
      const up = () => { drag = null; this.cv.style.cursor = ''; };
      this.cv.addEventListener('pointerup', up); this.cv.addEventListener('pointercancel', up);
      this.cv.addEventListener('wheel', e => { e.preventDefault(); this.zoom = Math.min(3, Math.max(0.25, this.zoom * Math.exp(e.deltaY * 0.001))); this.userT = performance.now() / 1000; }, { passive: false });
    }
    resize() {
      if (!this.ok) return;
      const r = this.cv.parentElement.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
      this.ren.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    }
    show(on) { if (this.ok) this.cv.style.display = on ? 'block' : 'none'; }
    // muurstukken voor een nieuw doolhof
    build(m) {
      const T = this.T;
      if (this.walls) { this.scene.remove(this.walls); this.walls.geometry.dispose(); this.walls.material.dispose(); }
      const segs = [];
      for (const w of m.walls) { if (w.stair) continue; for (const q of w.segs) segs.push([w.i, q[0], q[1], q[2], q[3]]); }
      this.segs = segs;
      const geo = new T.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
      const P = this.run.r.pal, M = P.maq, col = new T.Color(M ? M.top : P.wall);
      const mat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: M ? 0.85 : 0.45, metalness: 0,
        emissive: P.glow ? col.clone() : new T.Color(0), emissiveIntensity: P.glow ? 0.55 : 0 });
      const im = this.walls = new T.InstancedMesh(geo, mat, Math.max(1, segs.length));
      im.castShadow = true; im.receiveShadow = true;
      const c = new T.Color();
      segs.forEach((s, i) => {
        const w = m.walls[s[0]];
        if (m.blocks && w.b !== null && m.blocks[w.a] !== m.blocks[w.b]) c.set(P.accent || '#c8322f');
        else if (m.blocks) c.setHSL(((m.blocks[w.a] * 137.5) % 360) / 360, M ? 0.35 : 0.6, M ? 0.86 : 0.62);
        else c.copy(col);
        if (w.b === null) c.multiplyScalar(0.86);
        im.setColorAt(i, c);
      });
      this.scene.add(im);
      this.m = m; this.wallsDirty = true;
    }
    wallsUpdate(m, vs, now) {
      const D = this.dummy, A = vs.wallAnim, rise = vs.riseT != null ? Math.max(0, spring(Math.max(0, (now - vs.riseT) / 0.9))) : 1;
      const WA = (ML.ANIM && ML.ANIM.WALL) || 0.42;
      let busy = rise < 1, k = 0;
      const H0 = WALL_H * (this.run.r.pal.maq ? 1 : 0.8);
      for (const s of this.segs) {
        const w = m.walls[s[0]];
        let h = (!w.open && !w.door && w.sw == null && !w.timed) ? H0 : 0;
        const a = A && A.get(w.i);
        if (a) {
          const x = (now - a.t0) / WA;
          if (x >= 0 && x < 1) { busy = true; h = a.dir < 0 ? H0 * (1 - ease(x)) : H0 * spring(x); }
        }
        h *= rise;
        const x1 = s[1] + this.ox, z1 = s[2] + this.oz, x2 = s[3] + this.ox, z2 = s[4] + this.oz, len = Math.hypot(x2 - x1, z2 - z1);
        D.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2); D.rotation.set(0, -Math.atan2(z2 - z1, x2 - x1), 0);
        if (h > 0.002) D.scale.set(len + WALL_T, h, WALL_T); else D.scale.set(0, 0, 0);
        D.updateMatrix(); this.walls.setMatrixAt(k++, D.matrix);
      }
      this.walls.instanceMatrix.needsUpdate = true;
      return busy;
    }
    // schermpunt → wereld (cel-eenheden)
    W(p) { return [p[0] + this.ox, p[1] + this.oz]; }
    lighting(now) {
      const T = this.T, S = ML.V2.S, md = S.mood || 'dag', P = this.run.r.pal;
      let night = { dag: 0, avond: 0.35, nacht: 0.9, zaklamp: 1 }[md];
      let warm = md === 'avond' ? 1 : 0;
      if (md === 'cyclus') { const f = now / 90 % 1; night = Math.max(0, Math.sin((f - 0.25) * Math.PI * 2)) * 0.9; warm = Math.max(0, 1 - Math.abs(f - 0.42) * 8); }
      if (night == null) night = 0;
      const dark = !P.maq && /^#[0-3]/.test(P.bg);
      this.hemi.intensity = lerp(dark ? 0.55 : 0.95, md === 'zaklamp' ? 0.03 : 0.12, night);
      this.sun.intensity = lerp(dark ? 0.9 : 1.7, md === 'zaklamp' ? 0 : 0.25, night);
      this.sun.color.setRGB(1, lerp(0.94, 0.62, warm), lerp(0.86, 0.42, warm));
      if (night > 0.5) this.sun.color.setRGB(0.55, 0.65, 1);
      this.lamp.intensity = night * (md === 'zaklamp' ? 6 : 3.2) + (dark ? 0.8 : 0);
      this.lamp.distance = md === 'zaklamp' ? 6 : 9;
      const bg = new T.Color(P.maq ? P.maq.bg2 : P.bg).lerp(new T.Color(0x070a18), night * 0.9);
      this.scene.background = bg;
      const span = this.span || 30;
      this.scene.fog = new T.Fog(bg, span * (md === 'zaklamp' ? 0.12 : 0.9), span * (md === 'zaklamp' ? 0.6 : 2.6));
    }
    render(now) {
      if (!this.ok) return;
      const run = this.run, r = run.r, m = run.m, vs = run.vs;
      if (!m || !r.s) return;
      const W = run.cv.width, H = run.cv.height;
      this.ox = (r.ox - W / 2) / r.s; this.oz = (r.oy - H / 2) / r.s;
      const fw = W / r.s, fh = H / r.s;
      this.floor.scale.set(fw, fh, 1);
      if (run.drew) { this.tex.needsUpdate = true; run.drew = false; }
      if (this.m !== m || this.pal !== r.pal) { this.pal = r.pal; this.build(m); }
      const b = m.bounds, cx = (b.minx + b.maxx) / 2 + this.ox, cz = (b.miny + b.maxy) / 2 + this.oz, span = Math.max(b.maxx - b.minx, b.maxy - b.miny, 4);
      this.span = span;
      const animating = run.phase === 'gen' || (vs.wallAnim && vs.wallAnim.size) || vs.riseT != null;
      if (this.wallsDirty || animating || this.lastPhase !== run.phase) { const busy = this.wallsUpdate(m, vs, now); this.wallsDirty = false; if (!busy && vs.riseT != null && run.phase !== 'gen') vs.riseT = null; }
      this.lastPhase = run.phase;
      // zon + schaduwkader
      const sh = this.sun.shadow.camera, e = span * 0.75;
      sh.left = -e; sh.right = e; sh.top = e; sh.bottom = -e; sh.near = 0.5; sh.far = span * 4; sh.updateProjectionMatrix();
      this.sun.position.set(cx + span * 0.45, span * 1.1, cz + span * 0.3); this.sun.target.position.set(cx, 0, cz);
      this.lighting(now);
      // zoeker / koploper
      let tgt = null;
      if (run.phase === 'swarm' && run.sw) { const L = run.sw.leader(); if (L) tgt = run.sw.winner ? m.cells[L.nc].center : run.sw.pos(L); }
      else if (r.headPos) tgt = r.headPos;
      const P = r.pal;
      if (tgt) {
        const [x, z] = this.W(tgt);
        if (!this.hp) this.hp = [x, z];
        const dx = x - this.hp[0], dz = z - this.hp[1], d = Math.hypot(dx, dz);
        if (d > 3) { this.hp = [x, z]; } else { this.hp[0] = lerp(this.hp[0], x, 0.35); this.hp[1] = lerp(this.hp[1], z, 0.35); }
        if (d > 0.02 && d < 3) { this.dir[0] = lerp(this.dir[0], dx / d, 0.12); this.dir[1] = lerp(this.dir[1], dz / d, 0.12); }
        this.head.visible = true;
        const col = run.phase === 'swarm' ? 0xffd34d : new this.T.Color(run.phase === 'gen' ? P.cur : P.path);
        this.head.material.color.set(col); this.head.material.emissive.set(col);
        this.head.position.set(this.hp[0], 0.24 + Math.sin(now * 5) * 0.04, this.hp[1]);
        this.lamp.position.set(this.hp[0], 0.7, this.hp[1]);
      } else { this.head.visible = false; this.lamp.position.set(cx, 2, cz); }
      // zwerm-bolletjes
      this.swarmDots(run, m);
      // baken op het doel
      if (m.ready) {
        const g = this.W(m.cells[m.goal].center);
        this.beacon.visible = true; this.beacon.position.set(g[0], 3, g[1]);
        this.beacon.material.color.set(P.goal); this.beacon.material.opacity = 0.16 + Math.sin(now * 2.4) * 0.06;
      } else this.beacon.visible = false;
      this.camera(now, cx, cz, span);
      this.ren.render(this.scene, this.cam);
    }
    swarmDots(run, m) {
      const T = this.T, sw = run.phase === 'swarm' || (run.sw && !run.sw.overAt) ? run.sw : (run.sw && run.sw.overAt != null && performance.now() / 1000 - run.sw.overAt < 1.2 ? run.sw : null);
      if (!sw) { if (this.dots) this.dots.visible = false; return; }
      if (!this.dots || this.dotN < sw.n) {
        if (this.dots) { this.scene.remove(this.dots); this.dots.geometry.dispose(); }
        this.dotN = Math.max(200, sw.n);
        this.dots = new T.InstancedMesh(new T.SphereGeometry(0.075, 10, 8), new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5 }), this.dotN);
        this.scene.add(this.dots);
      }
      this.dots.visible = true;
      this.dots.material.color.set(sw.ants ? 0x9dffc0 : 0xfff3d6); this.dots.material.emissive.set(sw.ants ? 0x2aff88 : 0xffc070);
      const D = this.dummy, lead = sw.leader();
      let k = 0;
      for (const a of sw.runners) {
        if (a === lead || (a.done && !sw.ants)) continue;
        const [x, y] = sw.pos(a), [wx, wz] = this.W([x, y]);
        D.position.set(wx, 0.09, wz); D.rotation.set(0, 0, 0); D.scale.set(1, 1, 1); D.updateMatrix();
        this.dots.setMatrixAt(k++, D.matrix);
      }
      this.dots.count = k; this.dots.instanceMatrix.needsUpdate = true;
    }
    camera(now, cx, cz, span) {
      const mode = ML.V2.S.cam3d || 'orbit', C = this.cam, idle = now - this.userT > 4;
      let pos, look, fov = 45;
      if (mode === 'first' && this.hp) {
        const d = Math.hypot(this.dir[0], this.dir[1]) || 1, dx = this.dir[0] / d, dz = this.dir[1] / d;
        pos = [this.hp[0] - dx * 0.35, 0.36, this.hp[1] - dz * 0.35]; look = [this.hp[0] + dx * 2, 0.3, this.hp[1] + dz * 2]; fov = 78;
      } else if (mode === 'chase' && this.hp) {
        const d = Math.hypot(this.dir[0], this.dir[1]) || 1, dist = 5.5 * this.zoom;
        const yaw = Math.atan2(this.dir[1] / d, this.dir[0] / d) + (idle ? 0 : this.yaw - 0.7);
        this.cy = this.cy == null ? yaw : this.cy + Math.atan2(Math.sin(yaw - this.cy), Math.cos(yaw - this.cy)) * 0.04;
        pos = [this.hp[0] - Math.cos(this.cy) * dist * 0.8, dist * 0.75, this.hp[1] - Math.sin(this.cy) * dist * 0.8]; look = [this.hp[0], 0, this.hp[1]]; fov = 55;
      } else {
        if (idle) this.yaw += 0.0016;
        const dist = span * 1.05 * this.zoom, cp = Math.cos(this.pitch);
        pos = [cx + Math.cos(this.yaw) * cp * dist, Math.sin(this.pitch) * dist, cz + Math.sin(this.yaw) * cp * dist]; look = [cx, 0, cz];
      }
      const k = this.camInit ? 0.12 : 1; this.camInit = true;
      this.cp = this.cp || pos.slice(); this.cl = this.cl || look.slice();
      for (let i = 0; i < 3; i++) { this.cp[i] = lerp(this.cp[i], pos[i], k); this.cl[i] = lerp(this.cl[i], look[i], k); }
      C.position.set(this.cp[0], this.cp[1], this.cp[2]); C.lookAt(this.cl[0], this.cl[1], this.cl[2]);
      if (Math.abs(C.fov - fov) > 0.1) { C.fov = lerp(C.fov, fov, 0.1); C.updateProjectionMatrix(); }
    }
  }
  ML.View3D = View3D;
})(window.ML = window.ML || {});
