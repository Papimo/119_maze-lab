// UI, standen (Bouwen / Lab / Kijken) en de animatielus.
(function (ML) {
  'use strict';
  const $ = s => document.querySelector(s);
  const SQ3 = Math.sqrt(3);
  const STORE = 'mazelab.settings';

  const S = {
    mode: 'build', grid: 'square', shape: 'rect', text: 'MAZE', size: 24,
    gen: 'backtracker', mix: 75, braid: 0, seed: ML.randomSeed(),
    keys: 0, oneways: 0, teleports: 0,
    solver: 'bfs', speed: 45, palette: 'blauwdruk',
    compare: 'solvers', panes: 2,
    paneSel: ['bfs', 'astar', 'dfs', 'wall'], paneGen: ['backtracker', 'prim', 'kruskal', 'wilson']
  };
  try { Object.assign(S, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* geen opslag */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* geen opslag */ } };

  const speedToSpf = v => Math.pow(10, v / 25 - 1); // 0.1 … 1000 stappen per beeld
  const pal = () => ML.PALETTES[S.palette] || ML.PALETTES.blauwdruk;
  const byId = (list, id) => list.find(x => x.id === id) || list[0];

  function makeMaze(s, aspect) {
    const size = s.size | 0;
    let polys;
    if (s.grid === 'polar') polys = ML.TOPO.polar(Math.max(3, Math.round(size / 2)));
    else {
      const a = s.shape === 'text' ? 0.32 : s.shape !== 'rect' ? 1 : aspect;
      const rowsHex = Math.max(3, Math.round(size * a / (SQ3 / 2)));
      if (s.grid === 'hex') polys = ML.TOPO.hex(size, rowsHex);
      else if (s.grid === 'tri') polys = ML.TOPO.tri(size * 2, rowsHex);
      else polys = ML.TOPO.square(size, Math.max(3, Math.round(size * a)));
      if (s.shape !== 'rect') polys = ML.applyMask(polys, s.shape, s.text);
    }
    polys = ML.largestComponent(polys);
    return ML.buildMaze(polys, s.grid);
  }

  // ---- Runner: één doolhof + animatie op één canvas ----
  class Runner {
    constructor(canvas) {
      this.cv = canvas; this.r = new ML.Render2D(canvas);
      this.m = null; this.phase = 'idle'; this.vs = { cur: -1 }; this.acc = 0; this.steps = 0;
      this.dirty = true; this.onChange = null;
      new ResizeObserver(() => this.resize()).observe(canvas);
      this.resize();
    }
    resize() {
      const d = window.devicePixelRatio || 1;
      const w = Math.round(this.cv.clientWidth * d), h = Math.round(this.cv.clientHeight * d);
      if (w && h && (w !== this.cv.width || h !== this.cv.height)) { this.cv.width = w; this.cv.height = h; this.dirty = true; }
    }
    aspect() { const w = this.cv.clientWidth, h = this.cv.clientHeight; return w && h ? h / w : 0.66; }
    setPalette(p) { this.r.setPalette(p); this.dirty = true; }
    emit(e) { if (this.onChange) this.onChange(this, e); }

    generate(s, genId, animate) {
      this.s = { ...s }; this.genId = genId;
      const m = this.m = makeMaze(this.s, this.aspect());
      this.genIt = byId(ML.GENERATORS, genId).fn(m, ML.makeRng(s.seed + '|' + genId), { mix: s.mix / 100 });
      this.vs = { inMaze: new Uint8Array(m.cells.length), cur: -1 };
      this.phase = 'gen'; this.steps = 0; this.result = null; this.stats = null; this.acc = 0;
      if (!animate) this.finishGen(); else { this.dirty = true; this.emit('gen'); }
    }
    finishGen() {
      for (let r = this.genIt.next(); !r.done; r = this.genIt.next());
      const m = this.m, s = this.s, prng = ML.makeRng(s.seed + '|p|' + this.genId);
      ML.braid(m, prng, s.braid / 100);
      ML.placeEnds(m, prng);
      ML.placePuzzle(m, prng, { keys: s.keys, oneways: s.oneways, teleports: s.teleports });
      m.solution = ML.solvePath(ML.makeProblem(m));
      m.ready = true;
      this.stats = ML.mazeStats(m);
      this.vs = { cur: -1 }; this.phase = 'ready'; this.dirty = true;
      this.emit('ready');
    }
    solve(solverId) {
      if (!this.m) return;
      if (this.phase === 'gen') this.finishGen();
      const m = this.m, n = m.cells.length;
      this.solverId = solverId;
      this.solIt = byId(ML.SOLVERS, solverId).fn(m, ML.makeProblem(m));
      this.vs = { order: new Int32Array(n).fill(-1), nOrder: 0, front: new Uint8Array(n), cur: -1, path: null };
      this.steps = 0; this.result = null; this.phase = 'solve'; this.acc = 0; this.dirty = true;
      this.emit('solve');
    }
    clearSolve() {
      if (!this.m || this.phase === 'gen') return;
      this.vs = { cur: -1 }; this.phase = 'ready'; this.result = null; this.steps = 0; this.dirty = true;
      this.emit('clear');
    }
    tick(spf) {
      const ph = this.phase;
      if (ph !== 'gen' && ph !== 'solve' && ph !== 'path') return;
      if (ph === 'path') {
        const L = this.vs.path.length;
        this.vs.pathT = Math.min(1, (this.vs.pathT || 0) + 1 / Math.max(20, Math.min(90, L)));
        if (this.vs.pathT >= 1) { this.phase = 'done'; this.emit('done'); }
        this.dirty = true; return;
      }
      this.acc += spf;
      let k = Math.floor(this.acc);
      this.acc -= k;
      if (k <= 0) return;
      const v = this.vs;
      if (ph === 'gen') {
        while (k-- > 0) {
          const r = this.genIt.next();
          if (r.done) { this.finishGen(); return; }
          const e = r.value;
          if (e.add !== undefined) v.inMaze[e.add] = 1;
          if (e.add2 !== undefined) v.inMaze[e.add2] = 1;
          if (e.cur !== undefined) v.cur = e.cur;
          v.walk = e.walk || null; v.walkFrom = e.walkFrom || 0;
        }
      } else {
        while (k-- > 0) {
          const r = this.solIt.next();
          if (r.done) {
            this.result = r.value; v.path = r.value.path; v.pathT = 0; v.cur = -1;
            this.phase = v.path.length > 1 ? 'path' : 'done';
            this.emit('solved'); break;
          }
          const e = r.value;
          if (v.order[e.visit] < 0) v.order[e.visit] = v.nOrder++;
          v.cur = e.visit;
          for (const f of e.front) v.front[f] = 1;
          this.steps++;
        }
      }
      this.dirty = true;
    }
    draw() { if (this.dirty) { this.dirty = false; this.r.draw(this.m, this.vs); } }
  }

  function statusText(r, withMaze) {
    if (!r || !r.m) return '';
    const p = [`${r.m.cells.length} cellen`];
    if (r.phase === 'gen') p.push('bouwen…');
    else if (withMaze && r.stats) p.push(`${r.stats.deadEnds} doodlopend`, `${r.stats.junctions} kruisingen`, `kortste route ${r.stats.route || '—'}`);
    if (r.vs.order) p.push(`bezocht ${r.vs.nOrder}`, `stappen ${r.steps}`);
    if (r.result) p.push(r.result.found ? `pad ${r.result.path.length}` : 'vastgelopen');
    return p.join(' · ');
  }

  // ---- Bouwen ----
  const build = new Runner($('#cv-build'));
  build.onChange = () => { hudDirty = true; };
  let hudDirty = true, paused = false;

  // ---- Lab ----
  let panes = [];
  const paneGen = i => S.compare === 'solvers' ? S.gen : S.paneGen[i];
  const paneSolver = i => S.compare === 'solvers' ? S.paneSel[i] : S.solver;

  function makeLab() {
    const grid = $('#lab-grid');
    grid.innerHTML = '';
    grid.dataset.n = S.panes;
    panes = [];
    const list = S.compare === 'solvers' ? ML.SOLVERS : ML.GENERATORS;
    const arr = S.compare === 'solvers' ? S.paneSel : S.paneGen;
    for (let i = 0; i < S.panes; i++) {
      const el = document.createElement('div');
      el.className = 'pane';
      el.innerHTML = `<div class="pane-head"><select aria-label="Kies voor paneel ${i + 1}"></select><span class="rank"></span></div>
        <div class="pane-cv"><canvas></canvas></div><div class="pane-stats"></div>`;
      grid.appendChild(el);
      const sel = el.querySelector('select');
      sel.innerHTML = list.map(x => `<option value="${x.id}">${x.name} — ${x.desc}</option>`).join('');
      sel.value = arr[i];
      const r = new Runner(el.querySelector('canvas'));
      r.el = el; r.setPalette(pal());
      r.onChange = () => paneInfo();
      sel.addEventListener('change', () => {
        arr[i] = sel.value; save(); refreshPanel();
        if (S.compare === 'makers') r.generate(S, sel.value, false); else r.clearSolve();
      });
      panes.push(r);
    }
    panes.forEach((r, i) => r.generate(S, paneGen(i), false));
  }
  function paneInfo() {
    const done = panes.filter(r => r.result).sort((a, b) => (b.result.found - a.result.found) || (a.steps - b.steps));
    panes.forEach(r => {
      const rank = done.indexOf(r);
      r.el.querySelector('.rank').textContent = rank < 0 ? '' : r.result.found ? `${rank + 1}e` : 'vast';
      r.el.classList.toggle('winner', rank === 0 && r.result.found && done.length === panes.length && panes.length > 1);
      r.el.querySelector('.pane-stats').textContent = statusText(r, S.compare === 'makers');
    });
  }

  // ---- Kijken (rustig, eindeloos) ----
  const W = { on: false, runner: null, stage: '', t: 0 };
  const AMB = [['#3a0ca3', '#f72585'], ['#023e8a', '#48cae4'], ['#1b4332', '#95d5b2'], ['#6a040f', '#ffba08'], ['#240046', '#ff9e00'], ['#03045e', '#00f5d4'], ['#10002b', '#e0aaff']];
  const AMB_WALL = ['#7df9ff', '#ffffff', '#ffd6ff', '#caffbf', '#fdffb6'];
  function watchStart() {
    W.on = true;
    $('#watch').hidden = false;
    if (!W.runner) W.runner = new Runner($('#cv-watch'));
    W.runner.resize();
    watchNext();
  }
  function watchStop() { W.on = false; $('#watch').hidden = true; }
  function watchNext() {
    const rng = ML.makeRng(ML.randomSeed()), r = W.runner;
    const grid = rng.pick(['square', 'hex', 'tri', 'polar', 'square', 'hex']);
    const s = {
      ...S, grid,
      shape: grid === 'polar' ? 'rect' : rng.pick(['rect', 'rect', 'circle', 'ring', 'heart', 'star']),
      size: grid === 'polar' ? 24 + rng.int(28) : 14 + rng.int(28),
      gen: rng.pick(ML.GENERATORS).id, mix: rng.int(100),
      braid: rng() < 0.35 ? 5 + rng.int(25) : 0,
      keys: rng() < 0.25 ? 1 + rng.int(3) : 0, oneways: 0, teleports: rng() < 0.2 ? 1 + rng.int(2) : 0,
      seed: ML.randomSeed()
    };
    s.solver = rng.pick(ML.SOLVERS.filter(x => s.braid === 0 || x.id !== 'wall')).id;
    const [a, b] = rng.pick(AMB);
    r.setPalette({ ...ML.PALETTES.neon, visitA: a, visitB: b, wall: rng.pick(AMB_WALL) });
    r.generate(s, s.gen, true);
    W.s = s;
    const n = r.m.cells.length;
    W.genSpf = Math.max(0.5, n * (s.gen === 'wilson' ? 5 : 2) / (8 * 60));
    W.solveSpf = Math.max(0.5, n / (6 * 60));
    W.stage = 'gen';
    $('#cv-watch').style.opacity = 1;
    const names = { square: 'Vierkant', hex: 'Zeshoek', tri: 'Driehoek', polar: 'Ringen' };
    $('#watch-info').textContent = `${names[grid]} · ${byId(ML.GENERATORS, s.gen).name} → ${byId(ML.SOLVERS, s.solver).name}`;
  }
  function watchFrame(now) {
    const r = W.runner;
    if (W.stage === 'gen') { r.tick(W.genSpf); if (r.phase === 'ready') { W.stage = 'pause'; W.t = now + 900; } }
    else if (W.stage === 'pause' && now > W.t) { r.solve(W.s.solver); W.stage = 'solve'; }
    else if (W.stage === 'solve') { r.tick(W.solveSpf); if (r.phase === 'done') { W.stage = 'hold'; W.t = now + 2800; } }
    else if (W.stage === 'hold' && now > W.t) { $('#cv-watch').style.opacity = 0; W.stage = 'fade'; W.t = now + 800; }
    else if (W.stage === 'fade' && now > W.t) watchNext();
    r.draw();
  }

  // ---- Paneel ----
  const REBUILD = new Set(['grid', 'shape', 'text', 'size', 'gen', 'mix', 'braid', 'seed', 'keys', 'oneways', 'teleports']);
  function fillSelect(el, list) { el.innerHTML = list.map(x => `<option value="${x.id}">${x.name} — ${x.desc}</option>`).join(''); }
  fillSelect($('[data-key="gen"]'), ML.GENERATORS);
  fillSelect($('[data-key="solver"]'), ML.SOLVERS);
  $('[data-key="palette"]').innerHTML = Object.entries(ML.PALETTES).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('');

  function outputs() {
    const out = {
      size: S.grid === 'polar' ? `${Math.max(3, Math.round(S.size / 2))} ringen` : S.size,
      mix: `${S.mix}%`, braid: `${S.braid}%`, keys: S.keys, oneways: S.oneways, teleports: S.teleports,
      speed: (() => { const v = speedToSpf(S.speed) * 60; return v < 10 ? `${v.toFixed(1)}/s` : `${Math.round(v)}/s`; })()
    };
    document.querySelectorAll('[data-out]').forEach(o => { o.textContent = out[o.dataset.out]; });
  }
  function show(sel, on) { const el = $(sel); if (el) el.hidden = !on; }
  function refreshPanel() {
    const lab = S.mode === 'lab';
    show('#row-gen', !lab || S.compare === 'solvers');
    show('#row-solver', !lab || S.compare === 'makers');
    const growing = (!lab || S.compare === 'solvers') ? S.gen === 'growing' : S.paneGen.slice(0, S.panes).includes('growing');
    show('#row-mix', growing);
    show('#row-shape', S.grid !== 'polar');
    show('#row-text', S.grid !== 'polar' && S.shape === 'text');
    show('#sec-lab', lab);
    document.querySelectorAll('.tabs [data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
    show('#view-build', !lab); show('#view-lab', lab);
    $('#btn-pause').textContent = paused ? 'Verder' : 'Pauze';
  }
  function setPalette() { build.setPalette(pal()); panes.forEach(r => r.setPalette(pal())); }

  function regenerate(animate) {
    if (S.mode === 'lab') panes.forEach((r, i) => r.generate(S, paneGen(i), animate));
    else build.generate(S, S.gen, animate);
    hudDirty = true;
  }
  function solveAll() {
    if (S.mode === 'lab') panes.forEach((r, i) => r.solve(paneSolver(i)));
    else build.solve(S.solver);
    paused = false; refreshPanel();
  }
  function newSeed() { S.seed = ML.randomSeed(); $('[data-key="seed"]').value = S.seed; save(); }

  document.querySelectorAll('[data-key]').forEach(el => {
    const k = el.dataset.key, num = el.type === 'range' || el.dataset.num !== undefined;
    el.value = S[k];
    el.addEventListener('input', () => {
      S[k] = num ? Number(el.value) : el.value;
      save(); outputs(); refreshPanel();
      if (k === 'palette') setPalette();
    });
    el.addEventListener('change', () => {
      if (REBUILD.has(k)) regenerate(false);
      if (k === 'compare' || k === 'panes') { S.panes = Number(S.panes); makeLab(); refreshPanel(); }
      if (k === 'solver' && S.mode === 'lab') panes.forEach(r => r.clearSolve());
    });
  });

  document.querySelectorAll('.tabs [data-mode]').forEach(b => b.addEventListener('click', () => {
    const md = b.dataset.mode;
    if (md === 'watch') { watchStart(); return; }
    S.mode = md; save(); refreshPanel();
    if (md === 'lab' && !panes.length) makeLab();
    if (md === 'build' && !build.m) build.generate(S, S.gen, false);
  }));
  $('#dice').addEventListener('click', () => { newSeed(); regenerate(false); });
  $('#btn-new').addEventListener('click', () => { newSeed(); paused = false; refreshPanel(); regenerate(true); });
  $('#btn-instant').addEventListener('click', () => { newSeed(); regenerate(false); });
  $('#btn-solve').addEventListener('click', solveAll);
  $('#btn-pause').addEventListener('click', () => { paused = !paused; refreshPanel(); });
  $('#btn-clear').addEventListener('click', () => { (S.mode === 'lab' ? panes : [build]).forEach(r => r.clearSolve()); });
  $('#watch-exit').addEventListener('click', watchStop);

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const current = () => S.mode === 'lab' ? panes[0] : build;
  $('#btn-json').addEventListener('click', () => {
    const r = current();
    if (!r || !r.m || !r.m.ready) return;
    const { grid, shape, text, size, mix, braid, keys, oneways, teleports } = r.s;
    const data = ML.toJSON(r.m, { seed: r.s.seed, generator: r.genId, settings: { grid, shape, text, size, mix, braid, keys, oneways, teleports } });
    download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `maze-${r.s.seed}.json`);
  });
  $('#btn-png').addEventListener('click', () => { const r = current(); if (r) r.cv.toBlob(b => download(b, `maze-${r.s ? r.s.seed : 'leeg'}.png`)); });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && W.on) { watchStop(); return; }
    if (W.on || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === 'n') $('#btn-new').click();
    else if (e.key === 's' || e.key === 'Enter') solveAll();
    else if (e.key === ' ') { e.preventDefault(); $('#btn-pause').click(); }
  });

  // ---- Lus ----
  function frame(now) {
    const spf = paused ? 0 : speedToSpf(S.speed);
    if (W.on) watchFrame(now);
    else if (S.mode === 'lab') { panes.forEach(r => { r.tick(spf); r.draw(); }); if (panes.some(r => r.phase === 'solve' || r.phase === 'gen')) paneInfo(); }
    else {
      build.tick(spf); build.draw();
      if (hudDirty || build.phase === 'gen' || build.phase === 'solve') { $('#hud-build').textContent = statusText(build, true); hudDirty = false; }
    }
    requestAnimationFrame(frame);
  }

  outputs(); refreshPanel(); setPalette();
  if (S.mode === 'lab') makeLab(); else build.generate(S, S.gen, false);
  requestAnimationFrame(frame);
})(window.ML = window.ML || {});
