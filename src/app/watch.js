// Kijken: rustig, eindeloos; oneindig inzoomen naar het volgende doolhof.
(function (ML) {
  'use strict';
  const A = ML.App;
  const { $, S, Runner, byId, GRID_NAMES, isSwarmSolver } = A;

  // ---- Kijken (rustig, eindeloos) ----
  const W = { on: false, runner: null, stage: '', t: 0 };
  const AMB = [['#3a0ca3', '#f72585'], ['#023e8a', '#48cae4'], ['#1b4332', '#95d5b2'], ['#6a040f', '#ffba08'], ['#240046', '#ff9e00'], ['#03045e', '#00f5d4'], ['#10002b', '#e0aaff']];
  const AMB_WALL = ['#7df9ff', '#ffffff', '#ffd6ff', '#caffbf', '#fdffb6'];
  function watchStart() {
    W.on = true;
    $('#watch').hidden = false;
    if (!W.runner) { W.runner = new Runner($('#cv-watch')); W.runner.isWatch = true; }
    W.runner.resize();
    watchNext();
  }
  function watchMineBtn() { const b = $('#watch-mine'); if (b) { b.classList.toggle('on', !!S.watchMine); b.textContent = S.watchMine ? '🧬 Alleen mijn algoritmes ✓' : '🧬 Alleen mijn algoritmes'; } }
  function watchStop() { W.on = false; $('#watch').hidden = true; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }

  function watchNext() {
    const rng = ML.makeRng(ML.randomSeed()), r = W.runner;
    const grid = rng.pick(['square', 'hex', 'tri', 'polar', 'square', 'hex']);
    const torus = grid === 'square' && rng() < 0.2;
    const shape = grid === 'polar' || torus ? 'rect' : rng.pick(['rect', 'rect', 'circle', 'ring', 'heart', 'star']);
    const gens = ML.GENERATORS.filter(g => !g.grid || (grid === 'square' && shape === 'rect'));
    const s = {
      ...S, grid, shape, torus,
      size: grid === 'polar' ? 24 + rng.int(28) : 14 + rng.int(28),
      levels: grid !== 'polar' && rng() < 0.15 ? 2 : 1,
      gen: rng.pick(gens).id, mix: rng.int(100),
      braid: rng() < 0.35 ? 5 + rng.int(25) : 0,
      terrain: rng() < 0.2 ? 15 + rng.int(30) : 0,
      keys: rng() < 0.25 ? 1 + rng.int(3) : 0, oneways: 0, teleports: rng() < 0.2 ? 1 + rng.int(2) : 0,
      switches: rng() < 0.12 ? 1 : 0, timed: rng() < 0.12 ? 1 + rng.int(3) : 0,
      seed: ML.randomSeed()
    };
    const plain = s.braid === 0 && !s.torus && s.levels === 1 && !s.timed;
    const sr = rng();
    const evoS = ML.SOLVERS.filter(x => x.evo); // eigen algoritmes: 14% kans; stand "alleen mijn algoritmes" (S.watchMine) = altijd
    const mine = S.watchMine && evoS.length;
    s.solver = mine ? rng.pick(evoS).id : sr < 0.22 ? 'swarm' : sr < 0.36 ? 'ants' : sr < 0.5 && evoS.length ? rng.pick(evoS).id : rng.pick(ML.SOLVERS.filter(x => !x.evo && (plain || x.id !== 'wall'))).id;
    if (rng() < 0.18 && grid !== 'polar') s.gen = 'patchwork';
    if (s.solver === 'ants' && !s.braid) s.braid = 12 + rng.int(20); // mieren leren pas echt iets als er lussen zijn
    const [a, b] = rng.pick(AMB);
    const pr = rng();
    if (pr < 0.2) r.setPalette(ML.PALETTES.aurora); else if (pr < 0.32) r.setPalette(ML.PALETTES.zon);
    else r.setPalette({ ...ML.PALETTES.neon, visitA: a, visitB: b, wall: rng.pick(AMB_WALL) });
    r.generate(s, s.gen, true);
    W.s = s;
    const n = r.m.cells.length, g = byId(ML.GENERATORS, s.gen);
    W.genSpf = Math.max(0.5, n * (g.slow || (s.gen === 'wilson' ? 5 : 2)) / (2.5 * 60)); r.genX = 1;
    W.solveSpf = Math.max(0.5, n / (6 * 60));
    W.stage = 'gen'; W.enterT = performance.now() / 1000;
    $('#cv-watch').style.opacity = 1;
    watchMineBtn();
    $('#watch-info').textContent = (S.watchMine && !evoS.length ? 'Nog geen eigen algoritmes bewaard · ' : '') + `${GRID_NAMES[grid]} · ${g.name} → ${s.solver === 'swarm' ? 'Zwerm van 100 lopers' : s.solver === 'ants' ? 'Mierenkolonie van 60' : byId(ML.SOLVERS, s.solver).name}`;
  }
  function watchFrame(t) {
    const r = W.runner;
    if (W.stage === 'gen') { r.tick(W.genSpf, t); if (r.phase === 'ready') { W.stage = 'pause'; W.t = t + 0.9; } }
    else if (W.stage === 'pause' && t > W.t) { if (isSwarmSolver(W.s.solver)) { W.solveSpf = Math.max(8, r.m.cells.length / 60); r.swarm(W.s.solver === 'ants' ? 60 : 100, W.s.solver === 'ants'); } else r.solve(W.s.solver); W.stage = 'solve'; }
    else if (W.stage === 'solve') { r.tick(W.solveSpf, t); if (r.phase === 'done') { W.stage = 'hold'; W.t = t + 3.9; } }
    else if (W.stage === 'hold' && t > W.t) {
      if (r.m && r.m.ready && r.r.s) { W.stage = 'zoom'; W.t = t; } // oneindig inzoomen: de doelcel wordt het volgende doolhof
      else { $('#cv-watch').style.opacity = 0; W.stage = 'fade'; W.t = t + 0.8; }
    }
    else if (W.stage === 'fade' && t > W.t) watchNext();
    const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    if (W.stage === 'zoom') {
      const e = Math.min(1, (t - W.t) / 2), k = ease(e), R = r.r, cv = r.cv, gc = r.m.cells[r.m.goal].center;
      const zmax = Math.max(cv.width, cv.height) / R.s * 1.6;
      r.vs.cam = { x: gc[0], y: gc[1], z: Math.exp(Math.log(zmax) * k), px: R.X(gc[0]) + (cv.width / 2 - R.X(gc[0])) * Math.min(1, k * 1.6), py: R.Y(gc[1]) + (cv.height / 2 - R.Y(gc[1])) * Math.min(1, k * 1.6) };
      r.dirty = true;
      if (e >= 1) watchNext();
    } else if (W.enterT != null) {
      const e = (t - W.enterT) / 1.3;
      if (e < 1) { r.vs.cam = { z: Math.exp(Math.log(0.04) * (1 - ease(Math.max(0, e)))) }; r.dirty = true; }
      else if (r.vs.cam) { delete r.vs.cam; r.dirty = true; W.enterT = null; }
      else W.enterT = null;
    }
    r.draw(t);
    if (S.view3d) { A.v3of(r).render(t); r.v3.cv.style.opacity = r.cv.style.opacity || 1; }
  }


  Object.assign(A, { W, watchStart, watchStop, watchMineBtn, watchNext, watchFrame });
})(window.ML = window.ML || {});
