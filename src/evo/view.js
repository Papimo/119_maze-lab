// Tonelen: panelen, lopers in doolhoven, frame/stepView, einde generatie of taak.
(function (ML) {
  'use strict';
  const U = ML.EvoUI._;
  const { $, A, E, EV, GRID_NAMES, HUNT_ASP, T, V, colorFor, huntSet, mazeSeed, mm, nEval, nPanes, opts, runs, toast } = U;
  let advance, drawRun, heatAdd, legend, mutCheck, mutRate, paneStats, seed, status, taskEnded, taskLegend, taskTick, turbo;
  U.link(() => ({ advance, drawRun, heatAdd, legend, mutCheck, mutRate, paneStats, seed, status, taskEnded, taskLegend, taskTick, turbo } = U));

  // ---- panelen ----
  function makePanes() {
    const grid = $('#evo-grid'), n = nPanes();
    grid.innerHTML = ''; grid.dataset.n = n;
    V.panes = [];
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'pane';
      el.innerHTML = '<div class="pane-head"><span class="ev-lab"></span><span class="rank"></span></div><div class="pane-cv"><canvas></canvas></div><div class="pane-stats"></div>';
      grid.appendChild(el);
      const r = new A.Runner(el.querySelector('canvas'));
      r.el = el; r.setPalette(A.pal());
      V.panes.push(r);
    }
  }
  function ensureTaskPane() {
    if (T.panes.length) return;
    const el = $('#task-pane'), r = new A.Runner(el.querySelector('canvas'));
    r.el = el; r.setPalette(A.pal()); T.panes = [r];
  }
  // verhouding van het paneel; verborgen pagina → laatst bekende
  function viewAspect(v) {
    const r = v.panes[0], cv = r && r.cv;
    if (cv && cv.clientWidth && cv.clientHeight) v.aspect = r.aspect();
    return v.aspect || 0.66;
  }
  function mazesFor(gen) { // turbo: zonder panelen
    if (mm() === 'hunt') return huntMazes();
    const asp = V.aspect || 0.66, out = [];
    for (let i = 0; i < nEval(); i++) { const sd = mazeSeed(i, gen); E.seen.add(sd + '|' + i); out.push(EV().buildMaze(opts(), sd, i, asp)); }
    return out;
  }
  // zelfde doolhoven als mazesFor, maar als beschrijving: de workers bouwen ze zelf
  function specsFor(gen, look) { // look = alleen vooruitkijken (niet als gezien tellen)
    const asp = V.aspect || 0.66, o = opts(), out = [];
    for (let i = 0; i < nEval(); i++) { const sd = mazeSeed(i, gen); if (!look) E.seen.add(sd + '|' + i); out.push({ o, sd, i, asp }); }
    return out;
  }
  function huntMazes() { const l = huntSet().map(sp => EV().specMaze(sp, HUNT_ASP)); l.forEach(mz => E.seen.add(mz.key)); return l; }

  // lopers in de doolhoven van een toneel zetten
  function loadRuns(v, list, seedOf, colOf, hkOf) {
    v.runs = v.mazes.slice(0, v.panes.length).map((mz, i) => {
      const r = v.panes[i], P = mz.ctx.P;
      r.s = mz.s; r.genId = mz.gen; r.m = mz.m; r.P = P; r.phase = 'evo'; r.racers = null; r.sw = null; r.fx.length = 0;
      const run = { v, mz, heat: new Float32Array(mz.m.cells.length), heatBy: new Map(), flash: [], order: [], cut: 0,
        ws: list.map((ge, k) => {
          const seed = seedOf(ge, i, k), w = new (EV().Walker)(mz.ctx, ge.genes, seed);
          w.seed = seed; w.ge = ge; w.col = colOf(ge, k); w.hk = hkOf(ge, k); return w;
        }) };
      run.heat[mz.ctx.cellOf[P.start]] = list.length;
      r.vs = { cur: -1, readyT: performance.now() / 1000, floorFx: (g, rr, now) => drawRun(run, g, rr, now) };
      r.dirty = true;
      const gd = ML.GENERATORS.find(x => x.id === mz.gen), lab = r.el.querySelector('.ev-lab');
      if (lab) lab.textContent = `${GRID_NAMES[mz.s.grid] || mz.s.grid} · ${gd ? gd.name : mz.gen} · kortste ${mz.ctx.opt}`;
      return run;
    });
  }

  // ---- evolutie: generatie zichtbaar laten lopen ----
  function startGen() {
    if (!V.panes.length) return;
    const asp = viewAspect(V), cnt = nEval();
    V.mazes = [];
    if (mm() === 'hunt' && huntSet().length) V.mazes = huntMazes().slice(0, cnt);
    else for (let i = 0; i < cnt; i++) { const sd = mazeSeed(i, E.gen); E.seen.add(sd + '|' + i); V.mazes.push(EV().buildMaze(opts(), sd, i, asp)); }
    loadRuns(V, E.pop, (ge, i) => `${ge.id}|${E.gen}|${i}`, ge => colorFor(ge), ge => ge.sp);
    V.phase = 'run'; V.firstT = null;
    V.champId = E.pop.length ? E.pop.slice().sort((a, b) => (b.fit || 0) - (a.fit || 0))[0].id : null;
    if (V.heatSel != null && !E.species.some(s => s.id === V.heatSel)) V.heatSel = null;
    paneStats(V); status(); legend();
  }
  // ---- taak: één groot doolhof met 1–41 lopers ----
  // kind: solo (werkbank/uitleg/zoeker), duel, mut, preview (voorproefje vóór de start)
  function startShow(kind, list, keep) {
    ensureTaskPane();
    if (!keep || !T.mazes.length) T.mazes = [T.forced || EV().buildMaze(opts(), `${E.base}|taak|${T.salt}`, T.salt, viewAspect(T))];
    T.show = { kind, list };
    loadRuns(T, list, (ge, i) => `${ge.id}|show|${T.salt}|${i}`, ge => ge.col, (ge, k) => 'w' + k);
    T.phase = 'run'; T.firstT = null; T.running = true; T.t0 = performance.now() / 1000; T.champId = null; T.heatSel = null;
    if (E.xp) E.xp.last = null;
    paneStats(T); taskLegend();
  }
  const rate = v => 2 * Math.pow(10, v / 33); // stappen per seconde per loper (max 133 → ~21 000/s)
  function frame(t) {
    const dt = E.lastT ? Math.min(0.05, t - E.lastT) : 0;
    E.lastT = t;
    stepView(V, t, dt, rate(A.S.evoSpeed));
    stepView(T, t, dt, mutRate(rate(A.S.evoTaskSpeed == null ? 75 : A.S.evoTaskSpeed)));
    const vis = E.page === 'evolve' ? V : E.page === 'task' && E.task ? T : null;
    if (vis) vis.panes.forEach(r => { if (vis.phase === 'run') r.dirty = true; r.draw(t); });
    if (E.msg && t - E.msgT > 6) { E.msg = ''; toast(); }
  }
  function stepView(v, t, dt, spd) {
    if (v.phase === 'run' && v.running && v.runs) {
      let u = spd * dt;
      if (v.firstT != null) u *= 1 + Math.max(0, t - v.firstT) * 0.9; // na de eerste aankomst versnellen
      let alive = 0;
      for (const run of v.runs) {
        for (const w of run.ws) {
          if (w.done) continue;
          w.p += u;
          let k = 0;
          while (w.p >= 1 && !w.done && k++ < 2000) {
            w.p -= 1; w.step(); run.heat[w.nc]++; heatAdd(run, w);
            if (w.done && w.reached) { run.order.push(w); run.flash.push({ t, col: w.col }); if (v.firstT == null) v.firstT = t; }
          }
          if (w.done) w.p = 1; else alive++;
        }
      }
      if (v === T && v.show && v.show.kind === 'mut') alive = mutCheck(t, alive);
      if (!alive) endView(v, t);
      else if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) { paneStats(v); if (v === T) taskTick(); }
    } else if (v.phase === 'pause' && v.running && t > v.endT) {
      if (v === V) { if (!E.busy) startGen(); } else { v.phase = 'idle'; v.running = false; }
    }
  }
  function finishNow() { // "volgende generatie": rest direct uitrekenen
    if (V.phase !== 'run' || !V.runs) return;
    const t = performance.now() / 1000;
    for (const run of V.runs) for (const w of run.ws) { while (!w.done) { w.step(); run.heat[w.nc]++; heatAdd(run, w); } w.p = 1; if (w.reached && !run.order.includes(w)) run.order.push(w); }
    endView(V, t);
  }
  function endView(v, t) {
    v.phase = 'pause'; v.endT = t + (v === T ? 0.1 : 1.1);
    paneStats(v, true);
    if (v === T) { taskEnded(); return; }
    // fitness = gemiddelde score over alle doolhoven × runs (zichtbare + verborgen; zelfde zaadjes als turbo/evalList)
    const vis = V.runs.length, hidden = V.mazes.slice(vis), R = runs();
    E.pop.forEach((ge, j) => {
      let s = 0, ok = 0, st = 0;
      const add = w => { s += w.score(); if (w.reached) ok++; st += w.steps; };
      V.runs.forEach((run, i) => { add(run.ws[j]); for (let r = 1; r < R; r++) add(EV().evalOne(run.mz.ctx, ge.genes, `${ge.id}|${E.gen}|${i}|r${r}`)); });
      hidden.forEach((mz, k) => { for (let r = 0; r < R; r++) add(EV().evalOne(mz.ctx, ge.genes, `${ge.id}|${E.gen}|${vis + k}` + (r ? '|r' + r : ''))); });
      ge.fit = s / (V.mazes.length * R); ge.ok = ok; ge.steps = st;
    });
    advance();
  }

  Object.assign(U, { makePanes, ensureTaskPane, viewAspect, mazesFor, specsFor, huntMazes, loadRuns, startGen, startShow, rate, frame, stepView, finishNow, endView });
})(window.ML = window.ML || {});
