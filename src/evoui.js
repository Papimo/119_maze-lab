// Tab Evolutie: vier vaste pagina's — Algoritmes (startscherm) · Evolueren · Taak · Analyse.
// Twee "tonelen": V = de evolutie (loopt op de achtergrond door, ook op andere pagina's), T = de taak (eigen groot doolhof).
// Kaart open → "Wat wil je doen?" → taak als volledig scherm: links In, midden doolhof, rechts Uit; stappen Kiezen → Bezig → Uitkomst.
// Taken: Werkbank, Mutantenlab (stopregel), Duel, Uitleg, Zoeker. Analyse: stamboom, eregalerij, rapport.
(function (ML) {
  'use strict';
  const $ = s => document.querySelector(s);
  const TAU = Math.PI * 2;
  const EV = () => ML.Evo;
  const STORE = 'mazelab.evo';
  const GRID_NAMES = { square: 'Vierkant', hex: 'Zeshoek', tri: 'Driehoek', polar: 'Ringen' };
  const SP_COLS = ['#4cc9f0', '#ffd166', '#ff6b6b', '#80ed99', '#b388ff', '#f4a261', '#2ec4b6', '#ff8fab', '#e9ff70', '#a0c4ff'];
  const DUEL_COLS = ['#ffd166', '#4cc9f0', '#ff6b6b', '#80ed99'];
  const SP_THR = 1.15, SP_MAX = 10; // begin-drempel soort (DNA-afstand; past zich aan → 3–7 soorten) en maximaal aantal soorten
  const TASKS = { bench: { name: 'Werkbank', icon: '🔧' }, mut: { name: 'Mutantenlab', icon: '🧬' }, duel: { name: 'Duel', icon: 'vs' }, why: { name: 'Uitleg', icon: '❔' }, hunt: { name: 'Zoeker', icon: '🎯' } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let A = null; // { Runner, S, save, pal }

  // E = evolutie + pagina-toestand
  const E = { pop: [], gen: 0, hist: [], base: '', champ: null, species: [], spSeq: 0, spMap: new Map(), spThr: SP_THR,
    turbo: 0, turboN: 0, turboDone: 0, turboT0: 0, uiT: 0, rankT: 0, saveT: 0, lastT: 0, pend: null,
    msg: '', msgT: 0, seen: new Set(), page: 'algos', sel: null, libQ: '', libFolder: '', libSort: 'score',
    task: null, bench: null, mut: null, duel: null, hunt: null, xp: null, treeSel: null };
  // toneel: panelen + lopers in doolhoven
  const mkView = name => ({ name, panes: [], runs: null, mazes: [], show: null, phase: 'idle', running: true, firstT: null, endT: 0, t0: 0, forced: null, salt: 0, heatSel: null, champId: null, aspect: 0 });
  const V = mkView('evo'), T = mkView('task');

  const opts = () => ({ grid: A.S.evoGrid, size: A.S.evoSize, braid: A.S.evoBraid, puzzle: A.S.evoPuzzle, makers: A.S.evoMakers });
  const rng = () => ML.makeRng(E.base + '|ga|' + E.gen);
  const mm = () => A.S.evoMazeMode || 'new';
  // nieuw per generatie: minstens 4 doolhoven tellen mee (anders is de fitness vooral geluk); de rest rekent op de achtergrond
  const nEval = () => mm() === 'hunt' ? Math.max(1, huntSet().length) : mm() === 'set' ? Number(A.S.evoSetN) || 6 : mm() === 'new' ? Math.max(4, Number(A.S.evoMazes) || 1) : Number(A.S.evoMazes) || 1;
  const nPanes = () => mm() === 'set' || mm() === 'hunt' ? Math.min(Number(A.S.evoMazes) || 1, nEval()) : Number(A.S.evoMazes) || 1;
  const runs = () => Number(A.S.evoRuns) || 1;          // runs per doolhof (gemiddelde → minder geluk)
  const isl = () => Number(A.S.evoIslands) || 1;        // aantal eilanden
  const huntSet = () => Array.isArray(A.S.evoHunt) ? A.S.evoHunt : [];
  const HUNT_ASP = 0.66;                                 // doolhof-zoeker: vaste verhouding → zelfde doolhof overal
  const mazeSeed = (i, gen) => mm() === 'new' ? `${E.base}|g${gen}|${i}` : `${E.base}|vast|${i}`;

  // ---- opslag van de lopende evolutie ----
  function persist() {
    E.saveT = performance.now();
    try {
      const slim = g => ({ id: g.id, name: g.name, genes: g.genes, born: g.born, parents: g.parents, fit: g.fit, age: g.age, from: g.from, sp: g.sp, isl: g.isl });
      const sp = E.species.map(s => ({ id: s.id, name: s.name, col: s.col, c: s.c }));
      localStorage.setItem(STORE, JSON.stringify({ gen: E.gen, base: E.base, pop: E.pop.map(slim), hist: E.hist.slice(-1500), champ: E.champ, species: sp, spSeq: E.spSeq, spThr: E.spThr }));
    } catch (e) { /* geen opslag */ }
  }
  function restore() {
    try {
      const o = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (o && Array.isArray(o.pop) && o.pop.length && o.pop[0].genes && o.pop[0].genes.length === EV().GENES.length) {
        Object.assign(E, { gen: o.gen | 0, base: o.base || ML.randomSeed(), pop: o.pop, hist: o.hist || [], champ: o.champ || null,
          species: Array.isArray(o.species) ? o.species : [], spSeq: o.spSeq | 0, spThr: o.spThr || SP_THR });
        return true;
      }
    } catch (e) { /* kapot */ }
    return false;
  }
  function fresh(seeds) {
    E.base = String(ML.randomSeed()); E.gen = 0; E.hist = []; E.champ = null; E.species = []; E.spSeq = 0; E.spThr = SP_THR;
    E.pop = EV().assignIslands(EV().initPop({ pop: A.S.evoPop, classics: A.S.evoClassics, seeds, rng: rng() }), isl());
    speciate(); persist();
  }

  // ---- soorten: lopers met lijkend DNA horen bij één familie (eigen kleur + naam) ----
  const nv = genes => genes.map((v, i) => EV().norm(v, i));
  const vd = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); };
  function speciate() {
    const sps = E.species;
    sps.forEach(s => { s.n = 0; s.sum = s.c.map(() => 0); s.best = -1; });
    const sorted = E.pop.slice().sort((a, b) => (b.fit || 0) - (a.fit || 0));
    for (const ge of sorted) {
      const v = nv(ge.genes);
      let best = null, bd = 1e9;
      for (const s of sps) { const d = vd(v, s.c); if (d < bd) { bd = d; best = s; } }
      // erfde soort nog dichtbij? dan blijven (kleur springt niet)
      const own = ge.sp != null ? sps.find(s => s.id === ge.sp) : null;
      if (own && vd(v, own.c) < E.spThr * 1.25) best = own;
      else if (!best || (bd > E.spThr && sps.length < SP_MAX)) {
        const used = new Set(sps.map(s => s.col));
        best = { id: ++E.spSeq, name: ge.from || ge.name, col: SP_COLS.find(c => !used.has(c)) || SP_COLS[E.spSeq % SP_COLS.length], c: v.slice(), n: 0, sum: v.map(() => 0), best: -1 };
        sps.push(best);
      }
      ge.sp = best.id; best.n++; best.sum.forEach((_, i) => { best.sum[i] += v[i]; });
      if ((ge.fit || 0) > best.best) best.best = ge.fit || 0;
    }
    E.species = sps.filter(s => s.n > 0);
    E.species.forEach(s => { s.c = s.sum.map(x => x / s.n); delete s.sum; });
    E.species.sort((a, b) => b.n - a.n);
    E.spMap = new Map(E.species.map(s => [s.id, s]));
    // drempel bijsturen: te weinig soorten → strenger, te veel → ruimer
    if (E.species.length < 3) E.spThr = Math.max(0.2, E.spThr * 0.85);
    else if (E.species.length > 7) E.spThr = Math.min(2.5, E.spThr * 1.1);
  }
  const colorFor = ge => A.S.evoColor === 'gene' ? EV().colorOf(ge.genes) : (E.spMap.get(ge.sp) || { col: '#cfd8e3' }).col;

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
    stepView(T, t, dt, rate(A.S.evoTaskSpeed == null ? 75 : A.S.evoTaskSpeed));
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
      if (v === V) startGen(); else { v.phase = 'idle'; v.running = false; }
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
  // na een geëvalueerde generatie: geschiedenis, kampioen, kinderen, soorten
  // later = testbaan-score volgt (turbo: rekent in een worker tijdens de volgende generatie) → E.pend, daarna record()
  function advance(quiet, later) {
    const sorted = E.pop.slice().sort((a, b) => b.fit - a.fit), best = sorted[0];
    const rec = { gen: E.gen, best, base: E.base, mean: E.pop.reduce((s, g) => s + g.fit, 0) / E.pop.length };
    if (later) E.pend = rec; else record(rec, EV().testScore(best.genes), quiet);
    E.gen++;
    E.pop = EV().nextGenIslands(E.pop, { pop: Number(A.S.evoPop), mut: A.S.evoMut / 100, elite: 2, rng: rng(), gen: E.gen }, isl(), 8);
    speciate();
    if (!quiet) { persist(); refreshUI(true); }
  }
  function flushPend() { if (E.pend) { const p = E.pend; E.pend = null; record(p, EV().testScore(p.best.genes), true); } }
  // geschiedenis + kampioen + eregalerij voor één generatie
  function record(rec, tb, quiet) {
    if (rec.base !== E.base) return; // intussen een nieuwe evolutie gestart
    const Ev = EV(), best = rec.best;
    E.hist.push({ gen: rec.gen, best: Math.round(best.fit * 1000) / 10, mean: Math.round(rec.mean * 1000) / 10, test: tb.score });
    if (E.hist.length > 6000) E.hist.splice(0, E.hist.length - 6000);
    const bc = Ev.bestClassic();
    if (!E.champ || tb.score > E.champ.test) {
      const beat = tb.score > bc.t.score && (!E.champ || E.champ.test <= bc.t.score);
      E.champ = { id: best.id, name: best.name, genes: best.genes.slice(), born: best.born, parents: best.parents, test: tb.score, gen: rec.gen, from: best.from,
        heavy: Ev.heavyReady() ? Ev.heavyScore(best.genes).score : null };
      if (beat && !best.from) { note(`🏆 ${best.name} verslaat alle klassiekers (${tb.score} tegen ${bc.t.score} van ${bc.p.name})!`); if (A.S.sound && ML.Sound) ML.Sound.chord(); }
      // eregalerij: elk nieuw record (geen klassiekers/gezaaiden)
      if (!best.from) {
        const pos = Ev.addFame({ ...E.champ, run: E.base });
        if (pos && pos <= 3 && !beat) note(`🏅 ${best.name} staat op plek ${pos} in de eregalerij (${tb.score}).`);
        if (pos && E.page === 'ana' && !quiet) famRender();
      }
    }
  }
  function refreshUI(rank) {
    drawChart(); champCard(); legend(); status(); tabsInfo(); liveCard();
    if (rank) { rankList(); if (E.page === 'ana') famRender(); }
  }
  function note(s) { E.msg = s; E.msgT = performance.now() / 1000; toast(); }
  function toast() { const el = $('#evo-toast'); if (!el) return; if (E.msg) el.textContent = E.msg; el.classList.toggle('show', !!E.msg); }

  // ---- turbo: generaties zonder animatie (×25 / ×100 / ×1000 / tot ik stop) ----
  async function turbo(n) {
    if (E.turbo) { E.turbo = 0; return; }
    V.phase = 'idle'; E.turbo = n || Infinity; E.turboN = n || 0; E.turboDone = 0; E.turboT0 = performance.now();
    viewAspect(V);
    evoBar();
    const pool = A.S.evoFast === 'max' && EV().Pool.ensure();
    while (E.turbo && A.S.mode === 'evo') {
      const t0 = performance.now();
      if (pool && !EV().Pool.broken) {
        const P = EV().Pool, g0 = E.gen, pend = E.pend;
        let tRes = null;
        E.pend = null;
        // doolhoven bouwen in de workers; volgende generatie alvast bouwen; testbaan van de vorige beste rekent mee in een worker
        const pr = mm() !== 'hunt' && P.evaluateSpecs(E.pop, specsFor(g0), g0, runs(), () => mazesFor(g0),
          { next: mm() === 'new' ? specsFor(g0 + 1, true) : null, test: pend && pend.best.genes, onTest: t => { tRes = t; } });
        if (!pr && pend) record(pend, EV().testScore(pend.best.genes), true);
        await (pr || P.evaluate(E.pop, mazesFor(g0), g0, runs()));
        if (pr && pend) record(pend, tRes || EV().testScore(pend.best.genes), true);
        if (!E.turbo) break;
        advance(true, !!pr); E.turbo--; E.turboDone++;
      } else {
        while (E.turbo && performance.now() - t0 < 40) { EV().evaluate(E.pop, mazesFor(E.gen), E.gen, runs()); advance(true); E.turbo--; E.turboDone++; }
        await new Promise(r => setTimeout(r, 0));
      }
      const now = performance.now();
      if (now - E.uiT > 250) { E.uiT = now; refreshUI(now - E.rankT > 1200); if (now - E.rankT > 1200) E.rankT = now; }
      if (now - E.saveT > 2000) persist();
    }
    flushPend(); E.turbo = 0; persist(); refreshUI(true); evoBar(); startGen();
  }

  // ---- tekenen in een paneel ----
  // hittekaart per soort (evolutie) of per deelnemer (taak): sleutel w.hk
  function heatAdd(run, w) {
    let h = run.heatBy.get(w.hk);
    if (!h) { h = new Float32Array(run.heat.length); h[run.mz.ctx.cellOf[run.mz.ctx.start]] = 1; run.heatBy.set(w.hk, h); }
    h[w.nc]++;
  }
  function drawRun(run, g, r, now) {
    const v = run.v, m = run.mz.m, C = m.cells, s = r.s, show = v.show, many = show && run.ws.length > 4;
    const rad = Math.max(1.6, s * (show && !many ? 0.17 : show ? 0.13 : 0.1)), hs = v.heatSel;
    ML.drawHeat(g, r, m, hs != null ? run.heatBy.get(hs) || new Float32Array(run.heat.length) : run.heat, show ? 0.4 : 0.5);
    const by = new Map();
    let lead = null, ld = 1e9, champ = null;
    for (const w of run.ws) {
      if (w.done && !w.reached) continue;
      if (hs != null && w.hk !== hs) continue; // alleen de gekozen soort
      if (w.ge.id === v.champId) champ = w;
      if (w.reached) continue;
      const d = run.mz.ctx.dist[w.nc]; if (d < ld) { ld = d; lead = w; }
      const p = posOf(w, C), X = r.X(p[0]), Y = r.Y(p[1]);
      let path = by.get(w.col); if (!path) by.set(w.col, path = new Path2D());
      path.moveTo(X + rad, Y); path.arc(X, Y, rad, 0, TAU);
    }
    g.save();
    // taak: het pad dat elke loper nu "denkt" (stapel), elk in eigen kleur, iets verschoven
    if (show && !many) {
      const cellOf = run.mz.ctx.cellOf, k0 = (run.ws.length - 1) / 2;
      g.lineCap = g.lineJoin = 'round'; g.lineWidth = Math.max(2, s * (run.ws.length > 1 ? 0.1 : 0.14));
      run.ws.forEach((w, k) => {
        if (hs != null && w.hk !== hs) return;
        const o = (k - k0) * s * 0.12, pl = new Path2D();
        let first = true, pc = -1;
        for (const st of w.st) { const c = cellOf[st]; if (c === pc) continue; const ce = C[c].center; const X = r.X(ce[0]) + o, Y = r.Y(ce[1]) + o; if (first) pl.moveTo(X, Y); else pl.lineTo(X, Y); first = false; pc = c; }
        g.globalAlpha = 0.85; g.strokeStyle = w.col; g.stroke(pl);
      });
      g.globalAlpha = 1;
    }
    for (const [col, path] of by) { g.fillStyle = col; g.fill(path); g.strokeStyle = 'rgba(15,10,20,0.55)'; g.lineWidth = 1; g.stroke(path); }
    const ring = (w, colr, k) => {
      const p = w.reached ? C[m.goal].center : posOf(w, C), X = r.X(p[0]), Y = r.Y(p[1]);
      g.beginPath(); g.arc(X, Y, rad * k * (1 + Math.sin(now * 6) * 0.12), 0, TAU); g.strokeStyle = colr; g.lineWidth = Math.max(1.5, s * 0.04); g.stroke();
    };
    if (lead && (!show || many)) ring(lead, 'rgba(255,243,176,0.9)', 2.2);
    if (champ && !show && !champ.reached) ring(champ, '#ffffff', 1.7);
    // aankomst-flitsen bij het doel
    const gc = C[m.goal].center, gx = r.X(gc[0]), gy = r.Y(gc[1]);
    run.flash = run.flash.filter(f => now - f.t < 0.9);
    for (const f of run.flash) { const e = (now - f.t) / 0.9; g.globalAlpha = 0.8 * (1 - e); g.strokeStyle = f.col; g.lineWidth = Math.max(1.5, s * 0.07); g.beginPath(); g.arc(gx, gy, s * (0.3 + e * 1.6), 0, TAU); g.stroke(); }
    g.globalAlpha = 1;
    if (v === T && E.task && E.task.kind === 'why' && show && show.kind === 'solo' && run === v.runs[0]) drawWhy(run, g, r);
    g.restore();
    return v.phase === 'run' || run.flash.length > 0;
  }
  function posOf(w, C) {
    const a = C[w.c].center, b = C[w.nc].center;
    let e = Math.min(1, w.p);
    if (w.jump) e = e < 0.5 ? 0 : 1;
    return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
  }
  function paneStats(v, final) {
    if (!v.runs) return;
    v.runs.forEach((run, i) => {
      const el = v.panes[i] && v.panes[i].el; if (!el) return;
      const n = run.ws.length, ok = run.order.length, f = run.order[0], show = v.show;
      let txt;
      if (show && show.kind === 'mut') txt = `${ok}/${n} binnen` + (run.cut ? ` · ${run.cut} niet afgewacht` : '') + (f ? ` · eerste: ${f.ge.name} (${f.steps} st.)` : '');
      else if (show && show.kind === 'duel') txt = run.ws.map(w => `${w.ge.name}: ${w.reached ? w.steps + ' ✓' : w.done ? '✗' : w.steps + '…'}`).join(' · ');
      else if (show) { const w = run.ws[0]; txt = (show.kind === 'preview' ? 'Voorproefje · ' : '') + (w.reached ? `Gehaald in ${w.steps} stappen (kortste ${run.mz.ctx.opt}) · score ${Math.round(w.score() * 100)}` : final ? 'Niet gehaald binnen de limiet' : `${w.steps} stappen…`); }
      else txt = `${ok}/${n} gehaald` + (f ? ` · eerste: ${f.ge.name} (${f.steps} st.)` : '') + (i === 0 && V.mazes.length > V.runs.length ? ` · +${V.mazes.length - V.runs.length} doolhoven op de achtergrond` : '');
      el.querySelector('.pane-stats').textContent = txt;
      el.classList.toggle('winner', !!final && ok > 0 && !show && ok === n);
    });
  }

  // ---- grafiek ----
  function drawChart() {
    const cv = $('#cv-evo'); if (!cv || !cv.clientWidth) return;
    const d = window.devicePixelRatio || 1, W = cv.width = Math.round(cv.clientWidth * d), H = cv.height = Math.round(cv.clientHeight * d);
    const g = cv.getContext('2d'), css = getComputedStyle(document.body), muted = css.getPropertyValue('--muted').trim() || '#8b98a8', line = css.getPropertyValue('--line').trim() || '#263040';
    g.clearRect(0, 0, W, H);
    const L = 34 * d, R = 10 * d, T_ = 22 * d, B = 20 * d, hs = E.hist, bc = EV().bestClassic();
    let top = bc.t.score; for (const h of hs) { if (h.best > top) top = h.best; if (h.test > top) top = h.test; }
    const ymax = Math.min(100, Math.max(40, Math.ceil(top / 10) * 10 + 5));
    const n = Math.max(2, hs.length), X = i => L + (W - L - R) * i / (n - 1), Y = v => T_ + (H - T_ - B) * (1 - v / ymax);
    g.font = `${11 * d}px system-ui, sans-serif`; g.fillStyle = muted; g.strokeStyle = line; g.lineWidth = d;
    for (let v = 0; v <= ymax; v += ymax > 60 ? 20 : 10) { g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - R, Y(v)); g.stroke(); g.fillText(v, 6 * d, Y(v) + 4 * d); }
    // klassieker-lat
    g.setLineDash([6 * d, 5 * d]); g.strokeStyle = '#ff6b6b'; g.lineWidth = 1.5 * d;
    g.beginPath(); g.moveTo(L, Y(bc.t.score)); g.lineTo(W - R, Y(bc.t.score)); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#ff6b6b'; g.fillText(`beste klassieker: ${bc.p.name} ${bc.t.score}`, L + 6 * d, Y(bc.t.score) - 5 * d);
    const stride = Math.max(1, Math.floor(hs.length / (W / d))); // lange geschiedenis: niet elk punt tekenen
    const plot = (key, col, w) => {
      if (!hs.length) return;
      g.strokeStyle = col; g.lineWidth = w * d; g.lineJoin = 'round'; g.beginPath();
      for (let i = 0; i < hs.length; i += stride) { const x = X(i), y = Y(hs[i][key]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    };
    plot('mean', muted, 1.2); plot('best', '#ffd166', 1.2);
    g.globalAlpha = 0.45; plot('test', '#4cc9f0', 1.2); g.globalAlpha = 1;
    if (hs.length) { // record = beste testscore tot nu toe (traplijn)
      let rec = -1; g.strokeStyle = '#4cc9f0'; g.lineWidth = 2.6 * d; g.beginPath();
      hs.forEach((h, i) => { const x = X(i); if (h.test > rec) { if (i) g.lineTo(x, Y(rec)); rec = h.test; } if (i) g.lineTo(x, Y(rec)); else g.moveTo(x, Y(rec)); });
      g.stroke();
    }
    let lx = L; g.textBaseline = 'middle';
    [['#4cc9f0', 'kampioen (record testbaan)'], ['#4cc9f077', 'beste v.d. generatie op testbaan'], ['#ffd166', 'fitness beste'], [muted, 'gemiddelde']].forEach(([c, s]) => {
      g.fillStyle = c; g.fillRect(lx, 8 * d, 14 * d, 3 * d); g.fillStyle = muted; g.fillText(s, lx + 18 * d, 10 * d); lx += g.measureText(s).width + 34 * d;
    });
    g.textBaseline = 'alphabetic';
    if (hs.length) { g.fillStyle = muted; g.textAlign = 'right'; g.fillText(`generatie ${hs[hs.length - 1].gen}`, W - R, H - 5 * d); g.textAlign = 'left'; g.fillText(`generatie ${hs[0].gen}`, L, H - 5 * d); }
  }

  // ---- DNA-balkjes ----
  const geneZ = (G, v) => G.k === 'chaos' ? (v - G.lo) / (G.hi - G.lo) : v / G.hi;
  function dnaHtml(genes) {
    return '<div class="dna">' + EV().GENES.map((G, i) => {
      const v = genes[i], z = geneZ(G, v), w = Math.abs(z) * 50;
      const st = G.k === 'chaos' ? `left:0;width:${z * 100}%` : z >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`;
      return `<div class="gene" title="${esc(G.name)}: ${v.toFixed(2)}"><span>${esc(G.name)}</span><b><i style="${st};background:${G.col}"></i></b></div>`;
    }).join('') + '</div>';
  }
  // mini-versie voor kaarten: 9 staafjes (doorschijnend = negatief)
  function dnaStrip(genes) {
    return '<div class="dstrip">' + EV().GENES.map((G, i) => { const z = geneZ(G, genes[i]);
      return `<i style="height:${Math.max(8, Math.abs(z) * 100)}%;background:${G.col};opacity:${z < 0 ? 0.4 : 1}" title="${esc(G.name)} ${genes[i].toFixed(1)}"></i>`; }).join('') + '</div>';
  }
  const isSaved = genes => EV().loadAlgos().some(a => a.genes.join() === genes.join());

  // ---- alle algoritmes (klassiekers + bibliotheek + kampioen) ----
  function entries() {
    const Ev = EV(), mine = Ev.loadAlgos().map(a => ({ ...a, mine: true }));
    const list = [...Ev.PRESETS, ...mine];
    if (E.champ && !E.champ.from && !mine.some(a => a.genes.join() === E.champ.genes.join())) list.push({ ...E.champ, live: true });
    const hv = Ev.heavyReady();
    list.forEach(a => { a.t = Ev.testScore(a.genes); a.h = hv ? Ev.heavyScore(a.genes) : null; });
    return list.sort((a, b) => b.t.score - a.t.score || (b.t.solved - a.t.solved));
  }
  const entryById = id => entries().find(a => a.id === id) || (E.champ && E.champ.id === id ? E.champ : null)
    || (E.task && E.task.algo.id === id ? E.task.algo : null) || EV().loadFame().find(a => a.id === id) || null;
  function subOf(a) {
    if (a.classic) return a.desc;
    if (a.live) return 'kampioen, nog niet bewaard';
    return [a.ver > 1 ? 'v' + a.ver : '', a.folder, a.born != null ? `gen ${a.born}` : '', a.created].filter(Boolean).join(' · ');
  }
  const pick = a => ({ id: a.id, name: a.name, genes: a.genes.slice(), ver: a.ver || 1, mine: !!a.mine || isSaved(a.genes), classic: !!a.classic, folder: a.folder || '', tags: a.tags || [] });

  // ======================= pagina's =======================
  function setPage(p) {
    E.page = p;
    document.querySelectorAll('#evo-tabs [data-page]').forEach(b => b.classList.toggle('on', b.dataset.page === p));
    document.querySelectorAll('#view-evo .evo-page').forEach(el => { el.hidden = el.dataset.page !== p; });
    if (p === 'algos') algosRender();
    else if (p === 'evolve') { evoBar(); champCard(); rankList(); legend(); requestAnimationFrame(() => { drawChart(); V.panes.forEach(r => { r.dirty = true; }); }); }
    else if (p === 'task') { ensureTaskPane(); taskRender(); T.panes.forEach(r => { r.dirty = true; }); }
    else if (p === 'ana') anaRender();
    tabsInfo();
  }
  function tabsInfo() {
    const g = $('#evo-gen'); if (g) g.textContent = `gen ${E.gen}`;
    const d = $('#evo-dot'); if (d) { d.className = 'dot ' + (E.turbo ? 'turbo' : V.running ? 'on' : 'off'); d.title = E.turbo ? 'turbo' : V.running ? 'loopt' : 'gepauzeerd'; }
    const tn = $('#evo-tname'); if (tn) tn.textContent = E.task ? `${TASKS[E.task.kind].name} · ${E.task.algo.name}` : '';
  }
  const dotCls = () => 'dot ' + (E.turbo ? 'turbo' : V.running ? 'on' : 'off');

  // "Wat wil je doen?" met het algoritme al gekozen
  function todoHtml(a) {
    const id = esc(a.id), b = (ev, t, s) => `<button class="todo-b" data-ev="${ev}" data-id="${id}"><b>${t}</b><small>${s}</small></button>`;
    return `<div class="todo"><h4>Wat wil je doen met ${esc(a.name)}?</h4>
      <div class="todo-g"><span>Verbeteren</span>${b('task-bench', '🔧 Werkbank', 'genen zelf bijschuiven + proefrit')}${b('task-mut', '🧬 Mutanten', 'varianten racen, de beste gaat door')}</div>
      <div class="todo-g"><span>Laten strijden</span>${b('task-duel', 'vs Duel', '2–4 algoritmes in hetzelfde doolhof')}</div>
      <div class="todo-g"><span>Begrijpen</span>${b('task-why', '❔ Uitleg', 'stap voor stap: waarom die kant op?')}${b('tree', '🌳 Stamboom', 'versies en ouders (Analyse)')}</div>
      <div class="todo-g"><span>Zwakte zoeken</span>${b('task-hunt', '🎯 Zoeker', 'de moeilijkste doolhoven voor dit algoritme')}</div>
      <div class="todo-g"><span>Verder kweken</span>${b('seed', '＋ Zaai in evolutie', 'doet mee vanaf de volgende generatie')}</div></div>`;
  }

  // ---------------- Algoritmes (startscherm) ----------------
  function algosRender() {
    const algos = EV().loadAlgos();
    let dirty = false; algos.forEach(a => { if (EV().stampHist(a)) dirty = true; });
    if (dirty) EV().saveAlgos(algos);
    const folders = [...new Set(algos.map(a => a.folder).filter(Boolean))].sort();
    const fs = $('#lib-folder');
    fs.innerHTML = `<option value="">Alles</option><option value="*mine">Alleen eigen</option><option value="*classic">Alleen klassiekers</option>${folders.map(f => `<option value="${esc(f)}">📁 ${esc(f)}</option>`).join('')}`;
    fs.value = folders.includes(E.libFolder) || E.libFolder.startsWith('*') ? E.libFolder : '';
    $('#lib-folders').innerHTML = folders.map(f => `<option value="${esc(f)}">`).join('');
    $('#lib-sort').value = E.libSort;
    if (document.activeElement !== $('#lib-q')) $('#lib-q').value = E.libQ;
    algoGrid(); algoDetail();
  }
  function algoCard(a) {
    const tags = (a.tags || []).slice(0, 3).map(t => `<em class="tag">${esc(t)}</em>`).join('');
    return `<div class="acard${a.classic ? ' classic' : ''}${E.sel === a.id ? ' sel' : ''}" data-ev="sel" data-id="${esc(a.id)}" title="${esc(EV().describe(a.genes))}">
      <div class="ac-top"><i class="sw" style="background:${EV().colorOf(a.genes)}"></i><b>${esc(a.name)}</b>${a.ver > 1 && !/ v\d+$/.test(a.name) ? `<em class="ver">v${a.ver}</em>` : ''}</div>
      <div class="ac-sc"><b>${a.t.score}</b><span>testbaan · ${a.t.solved}/${a.t.of}${a.h ? `<br>zwaar ${a.h.score}` : ''}</span></div>
      <small class="ac-sub">${esc(subOf(a))}</small>${tags ? `<div class="ac-tags">${tags}</div>` : ''}${dnaStrip(a.genes)}</div>`;
  }
  function algoGrid() {
    const el = $('#algo-grid'); if (!el) return;
    const q = E.libQ.trim().toLowerCase(), f = E.libFolder;
    const list = entries().filter(a => !a.live).filter(a => {
      if (f === '*mine' && !a.mine) return false;
      if (f === '*classic' && !a.classic) return false;
      if (f && !f.startsWith('*') && a.folder !== f) return false;
      if (!q) return true;
      return [a.name, a.note, a.folder, (a.tags || []).join(' '), a.desc].join(' ').toLowerCase().includes(q);
    });
    if (E.libSort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (E.libSort === 'new') list.sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
    const mine = list.filter(a => a.mine), cls = list.filter(a => a.classic);
    el.innerHTML = `<div class="ag-h">Lopende evolutie</div><div class="acards"><div class="acard live${E.sel === '*evo' ? ' sel' : ''}" id="ac-live" data-ev="sel" data-id="*evo"></div></div>`
      + (f === '*classic' ? '' : `<div class="ag-h">Mijn algoritmes <small>${mine.length}</small></div>` + (mine.length ? `<div class="acards">${mine.map(algoCard).join('')}</div>`
        : `<p class="hint">${q || f ? 'Niets gevonden.' : 'Nog niets bewaard. Bewaar een kampioen bij Evolueren, of importeer / plak een deelcode (rechtsboven).'}</p>`))
      + (f === '*mine' || (f && !f.startsWith('*')) ? '' : `<div class="ag-h">Klassiekers <small>${cls.length}</small></div>` + (cls.length ? `<div class="acards">${cls.map(algoCard).join('')}</div>` : '<p class="hint">Niets gevonden.</p>'));
    liveCard();
  }
  function spark() {
    const hs = E.hist; if (hs.length < 2) return '';
    const n = hs.length, st = Math.max(1, Math.floor(n / 120)), pts = [];
    let rec = -1, mx = 1;
    hs.forEach(h => { if (h.test > mx) mx = h.test; });
    for (let i = 0; i < n; i++) { if (hs[i].test > rec) rec = hs[i].test; if (i % st === 0 || i === n - 1) pts.push(`${(i / (n - 1) * 200).toFixed(1)},${(38 - rec / mx * 34).toFixed(1)}`); }
    return `<svg class="spark" viewBox="0 0 200 40" preserveAspectRatio="none"><polyline points="${pts.join(' ')}"/></svg>`;
  }
  function liveCard() {
    const el = $('#ac-live'); if (!el) return;
    const c = E.champ, bc = EV().bestClassic();
    el.innerHTML = `<div class="ac-top"><i class="${dotCls()}"></i><b>Generatie ${E.gen}</b><small>${E.pop.length} lopers · ${E.species.length} soorten${E.turbo ? ' · turbo' : V.running ? '' : ' · gepauzeerd'}</small></div>
      ${c ? `<div class="ac-sc"><b>${c.test}</b><span>kampioen <b>${esc(c.name)}</b><br>${c.test > bc.t.score ? '🏆 boven' : 'nog onder'} ${esc(bc.p.name)} (${bc.t.score})</span></div>` : '<p class="hint">Nog geen generatie klaar.</p>'}
      ${spark()}`;
  }
  function markSel() { document.querySelectorAll('#algo-grid .acard').forEach(c => c.classList.toggle('sel', c.dataset.id === E.sel)); }
  function algoDetail() {
    const el = $('#algo-det'); if (!el) return;
    if (E.sel === '*evo') { el.innerHTML = evoDetail(); return; }
    const a = E.sel ? entryById(E.sel) : null;
    if (!a) { el.innerHTML = '<div class="det-empty"><h3>Kies een algoritme</h3><p class="hint">Klik een kaart. Daarna kies je wat je ermee wilt: verbeteren, laten strijden, begrijpen, een zwakte zoeken of verder kweken in de evolutie. De evolutie loopt intussen gewoon door.</p></div>'; return; }
    const Ev = EV(), t = a.t || Ev.testScore(a.genes), h = Ev.heavyReady() ? Ev.heavyScore(a.genes) : null, id = esc(a.id);
    const mine = a.mine ? a : null, saved = !!mine || isSaved(a.genes);
    const cats = Ev.TEST_CATS.map(c => `<span>${esc(c.name)} <b>${t.cats[c.k]}</b></span>`).join('') + (h ? `<span>Zware testbaan <b>${h.score}</b> (${h.solved}/${h.of})</span>` : '')
      + (mine ? '<span>🧬 ook als oplosser in Bouwen, Lab en Kijken</span>' : '');
    let html = `<div class="det-head"><i class="sw" style="background:${Ev.colorOf(a.genes)}"></i><h3>${esc(a.name)}</h3><button class="btn x" data-ev="unsel" title="Sluiten (Esc)">✕</button></div>
      <small class="det-sub0">${esc(a.classic ? 'klassieker · ' + a.desc : mine ? subOf(a) : a.live ? 'kampioen van de lopende evolutie, nog niet bewaard' : 'uit de eregalerij')}</small>
      <div class="evo-score"><b>${t.score}</b><span>testbaan<br>${t.solved}/${t.of} gehaald</span>${h ? `<b class="hv">${h.score}</b><span>zware<br>testbaan</span>` : ''}</div>
      <p class="desc">${esc(Ev.describe(a.genes))}</p>${dnaHtml(a.genes)}<div class="cats">${cats}</div>`;
    if (!saved) html += `<div class="btns"><button class="btn primary" data-ev="save-any" data-id="${id}">Bewaar in mijn algoritmes</button></div>`;
    html += todoHtml(a);
    if (mine) {
      const { chain, kids } = lineage(a);
      html += `<h4 class="det-sub">Gegevens</h4><div class="det-fields" data-id="${id}">
        <label class="frow"><span>Naam</span><input data-f="name" value="${esc(a.name)}" maxlength="40"></label>
        <label class="frow"><span>Map</span><input data-f="folder" list="lib-folders" value="${esc(a.folder)}" placeholder="bv. Snelle lopers"></label>
        <label class="frow"><span>Labels</span><input data-f="tags" value="${esc((a.tags || []).join(', '))}" placeholder="komma's ertussen"></label>
        <label class="frow"><span>Notitie</span><textarea data-f="note" rows="2" placeholder="Wat is er bijzonder aan?">${esc(a.note)}</textarea></label></div>
        <div class="tree"><b>Stamboom</b> ${chain.length ? chain.map(p => esc(p.name) + (p.ver > 1 ? ' v' + p.ver : '')).join(' → ') + ' → ' : ''}<u>${esc(a.name)}</u>${kids.length ? ` · nieuwere versies: ${kids.map(k => esc(k.name)).join(', ')}` : ''}${a.parents && a.parents.length && !a.parent ? ` · ouders ${a.parents.map(esc).join(' × ')}` : ''}</div>
        <div class="tree"><b>Testscore</b> ${(a.hist || []).slice(-6).map(x => `${esc(x.d)}: ${x.s}`).join(' · ') || '—'}</div>
        <div class="btns"><button class="btn" data-ev="code" data-id="${id}">Deelcode kopiëren</button><button class="btn" data-ev="del" data-id="${id}">Verwijder</button></div>`;
    }
    el.innerHTML = html;
  }
  function evoDetail() {
    const c = E.champ;
    let html = `<div class="det-head"><i class="${dotCls()}"></i><h3>Lopende evolutie</h3><button class="btn x" data-ev="unsel" title="Sluiten (Esc)">✕</button></div>
      <small class="det-sub0">generatie ${E.gen} · ${E.pop.length} lopers · ${E.species.length} soorten</small>
      <p class="hint">Loopt op de achtergrond door, ook als je hier of met een taak bezig bent. Instellingen, turbo en de ranglijst staan bij Evolueren.</p>
      <div class="btns"><button class="btn primary" data-ev="page" data-page="evolve">Naar Evolueren →</button></div>`;
    if (c) {
      const saved = !!c.from || isSaved(c.genes);
      html += `<h4 class="det-sub">Kampioen: ${esc(c.name)}</h4><div class="evo-score"><b>${c.test}</b><span>testbaan${c.heavy != null ? `<br>zwaar ${c.heavy}` : ''}</span></div>
        <p class="desc">${esc(EV().describe(c.genes))}</p>${dnaHtml(c.genes)}
        ${saved ? '' : '<div class="btns"><button class="btn primary" data-ev="save-champ">Bewaar kampioen</button></div>'}${todoHtml(c)}`;
    }
    return html;
  }
  function lineage(a) {
    const algos = EV().loadAlgos(), find = id => algos.find(x => x.id === id) || EV().PRESETS.find(p => p.id === id);
    const chain = []; let cur = a, guard = 0;
    while (cur && cur.parent && guard++ < 20) { const p = find(cur.parent); if (!p) break; chain.unshift(p); cur = p; }
    const kids = a.id ? algos.filter(x => x.parent === a.id) : [];
    return { chain, kids };
  }
  function libField(el) {
    const det = el.closest('.det-fields'); if (!det) return;
    const algos = EV().loadAlgos(), a = algos.find(x => x.id === det.dataset.id); if (!a) return;
    const f = el.dataset.f, v = el.value;
    if (f === 'name') { if (!v.trim()) return; a.name = v.trim().slice(0, 40); }
    else if (f === 'folder') a.folder = v.trim().slice(0, 30);
    else if (f === 'tags') a.tags = v.split(',').map(s => s.trim()).filter(Boolean).slice(0, 8).map(s => s.slice(0, 20));
    else if (f === 'note') a.note = v.slice(0, 500);
    EV().saveAlgos(algos);
    if (f === 'folder') algosRender(); else algoGrid();
    rankList();
  }

  // ---------------- Evolueren ----------------
  function champCard() {
    const el = $('#evo-champ'); if (!el) return;
    const c = E.champ, bc = EV().bestClassic();
    if (!c) { el.innerHTML = '<h4>Kampioen</h4><p class="hint">Nog geen generatie klaar. Kijk mee, of druk op een Turbo-knop.</p>'; return; }
    const saved = !!c.from || isSaved(c.genes), diff = Math.round((c.test - bc.t.score) * 10) / 10;
    el.innerHTML = `<h4><i class="sw" style="background:${EV().colorOf(c.genes)}"></i>${esc(c.name)} <small>${c.from ? 'klassieker ' + esc(c.from) : 'geboren in generatie ' + c.born}${c.parents && c.parents.length ? ' · ouders ' + c.parents.map(esc).join(' × ') : ''}</small></h4>
      <div class="evo-score"><b>${c.test}</b><span>testbaan<br>${diff >= 0 ? `<em class="up">+${diff}</em>` : `<em class="down">${diff}</em>`} t.o.v. ${esc(bc.p.name)}</span>${c.heavy != null ? `<b class="hv">${c.heavy}</b><span>zware<br>testbaan</span>` : ''}</div>
      <p class="desc">${esc(EV().describe(c.genes))}</p>
      ${dnaHtml(c.genes)}
      <div class="btns"><button class="btn${saved ? '' : ' primary'}" data-ev="save-champ"${saved ? ' disabled' : ''}>${c.from ? 'Klassieker' : saved ? 'Bewaard ✓' : 'Bewaar kampioen'}</button><button class="btn" data-ev="sel-go" data-id="${esc(c.id)}">Wat wil je doen? →</button></div>`;
  }
  function rankList() {
    const el = $('#evo-rank'); if (!el) return;
    const list = entries(), bc = EV().bestClassic(), top = list.length ? list[0].t.score : 1;
    el.innerHTML = list.slice(0, 12).map((a, i) => {
      const beat = !a.classic && a.t.score > bc.t.score;
      return `<div class="erow${a.classic ? ' classic' : ''}${a.live ? ' live' : ''}" data-ev="sel-go" data-id="${esc(a.id)}" title="${esc(EV().describe(a.genes))} · klik: openen in Algoritmes">
        <b class="pos">${i + 1}</b><i class="sw" style="background:${EV().colorOf(a.genes)}"></i>
        <span class="nm">${beat ? '🏆 ' : ''}${esc(a.name)}<small>${esc(subOf(a))}</small></span>
        <span class="sc">${a.t.score}<small title="zware testbaan">${a.h ? 'zwaar ' + a.h.score : a.t.solved + '/' + a.t.of}</small></span>
        <span class="bar"><i style="width:${Math.max(2, a.t.score / Math.max(1, top) * 100)}%"></i></span></div>`;
    }).join('') + (list.length > 12 ? `<p class="hint">+${list.length - 12} meer bij Algoritmes</p>` : '');
  }
  function status() {
    const el = $('#evo-status'); if (!el) return;
    if (E.turbo) {
      const sec = (performance.now() - E.turboT0) / 1000, gps = sec > 0.3 ? Math.round(E.turboDone / sec) : 0;
      el.textContent = `Turbo${A.S.evoFast === 'max' && !EV().Pool.broken ? ` (${EV().Pool.size()} kernen${EV().Pool.canBuild && mm() !== 'hunt' ? ', bouwen in workers' : ''})` : ''}: ${E.turboDone}${E.turboN ? '/' + E.turboN : ''} generaties · ${gps}/s · generatie ${E.gen} · ${E.seen.size} verschillende doolhoven`;
      return;
    }
    const nm = V.mazes.length || nEval(), dz = nm > 1 ? 'doolhoven' : 'doolhof', h = E.hist[E.hist.length - 1];
    el.textContent = `Generatie ${E.gen} · ${E.pop.length} lopers × ${nm} ${dz}${runs() > 1 ? ' × ' + runs() + ' runs' : ''}${mm() === 'hunt' ? ' (zoeker-set)' : ''} · ${E.species.length} ${E.species.length === 1 ? 'soort' : 'soorten'}${isl() > 1 ? ' op ' + isl() + ' eilanden' : ''} · ${E.seen.size} verschillende doolhoven`
      + (h ? ` · vorige: beste ${h.best}, gem. ${h.mean}` : '');
  }
  function evoBar() {
    const run = $('#evo-run');
    if (run) run.textContent = E.turbo ? 'Stop turbo' : V.running ? 'Pauze' : 'Start';
    document.querySelectorAll('[data-turbo]').forEach(b => {
      const n = +b.dataset.turbo, on = E.turbo && E.turboN === n;
      b.classList.toggle('on', !!on); b.textContent = on ? 'Stop' : n ? '×' + n : '∞';
    });
    document.querySelectorAll('#evo-mm [data-mm]').forEach(b => b.classList.toggle('on', b.dataset.mm === mm()));
    const sn = $('#row-setn'); if (sn) sn.hidden = mm() !== 'set';
    const hb = $('#evo-mm [data-mm="hunt"]'); if (hb) { hb.hidden = !huntSet().length; hb.title = `Train op de ${huntSet().length} moeilijkste doolhoven uit de doolhof-zoeker`; }
    status(); tabsInfo(); liveCard();
  }
  function outputs() {
    const S = A.S, set = (k, v) => { const o = document.querySelector(`[data-out="${k}"]`); if (o) o.textContent = v; };
    const sp = v => { const r = rate(v); return r < 10 ? r.toFixed(1) + '/s' : Math.round(r) + '/s'; };
    set('evoSize', S.evoSize); set('evoBraid', S.evoBraid + '%'); set('evoMut', S.evoMut + '%');
    set('evoSpeed', sp(S.evoSpeed)); set('evoTaskSpeed', sp(S.evoTaskSpeed == null ? 75 : S.evoTaskSpeed));
  }
  // legenda evolutie: soorten (klik = hittekaart van alleen die soort)
  function legend() {
    const el = $('#evo-species'); if (!el) return;
    let items;
    const hs = V.heatSel, on = k => hs === k ? ' class="on"' : '', tip = 'klik: hittekaart van alleen deze soort';
    if (A.S.evoColor === 'gene') items = EV().GENES.slice(0, -1).map(G => `<span><i class="sw" style="background:${G.col}"></i>${esc(G.name)}</span>`);
    else items = E.species.slice(0, 8).map(s => `<span data-heat="${s.id}"${on(s.id)} title="${s.n} lopers · beste fitness ${Math.round((s.best || 0) * 100)} · ${tip}"><i class="sw" style="background:${s.col}"></i>${esc(s.name)} <small>${s.n}</small></span>`)
      .concat(E.species.length > 8 ? [`<span><small>+${E.species.length - 8}</small></span>`] : []);
    if (hs != null) items.unshift('<span data-heat="" class="all" title="Hittekaart van iedereen">✕ alle</span>');
    el.innerHTML = items.join('');
  }
  // legenda taak: deelnemers
  function taskLegend() {
    const el = $('#task-legend'); if (!el) return;
    const L = T.show ? T.show.list : [], hs = T.heatSel;
    const items = L.slice(0, 10).map((a, k) => `<span data-heat="w${k}"${hs === 'w' + k ? ' class="on"' : ''} title="klik: hittekaart van alleen deze"><i class="sw" style="background:${a.col}"></i>${esc(a.name)}</span>`);
    if (L.length > 10) items.push(`<span><small>+${L.length - 10}</small></span>`);
    if (hs != null) items.unshift('<span data-heat="" class="all">✕ alle</span>');
    el.innerHTML = items.join('');
  }

  // ======================= Taak =======================
  function stopTask() {
    if (E.mut) E.mut.busy = false;
    if (E.hunt) E.hunt.running = false;
    T.phase = 'idle'; T.running = false;
  }
  function openTask(kind, a) {
    if (!a) return;
    const algo = pick(a);
    stopTask();
    E.task = { kind, algo, step: 'pick' }; E.sel = algo.id;
    T.forced = null; T.mazes = []; T.show = null; T.runs = null;
    setPage('task'); // eerst zichtbaar: dan heeft het doolhof een maat
    const preview = () => startShow('preview', [{ id: 'prev', name: algo.name, genes: algo.genes.slice(), col: '#ffd34d' }]);
    if (kind === 'bench') {
      E.bench = { src: algo, genes: algo.genes.slice(), name: `${algo.name.replace(/ v\d+$/, '')} v${algo.ver + 1}` };
      benchRide();
    } else if (kind === 'mut') {
      const o = E.mut || {};
      E.mut = { src: { ...algo, name: algo.name.replace(/ M\d+\.\d+$/, '') }, orig: algo.genes.slice(), orig0: algo.genes.slice(), origName: algo.name,
        n: o.n || 16, str: o.str || 'middel', rounds: o.rounds || 3, heavy: !!o.heavy, need: o.need != null ? o.need : 3, maxT: o.maxT || 8,
        round: 0, res: null, log: [], busy: false, bestName: null };
      preview();
    } else if (kind === 'duel') {
      const Ev = EV(), bc = Ev.bestClassic().p, other = bc.genes.join() !== algo.genes.join() ? bc : Ev.PRESETS.find(p => p.genes.join() !== algo.genes.join());
      E.duel = { pick: [algo, pick(other)], list: null, done: false, res: null };
      preview();
    } else if (kind === 'why') {
      E.xp = { last: null };
      startShow('solo', [{ id: 'why', name: algo.name, genes: algo.genes.slice(), col: '#ffd34d' }]); T.running = false;
    } else if (kind === 'hunt') {
      E.hunt = { target: algo, found: [], tried: 0, running: false, grids: A.S.evoGrid === 'mix' ? 'all' : A.S.evoGrid };
      preview();
    }
    taskRender();
  }
  // direct een duel starten vanuit een andere taak (zelfde doolhof)
  function duelNow(list) {
    stopTask();
    E.task = { kind: 'duel', algo: pick(list[0]), step: 'pick' };
    E.duel = { pick: list.map(pick), list: null, done: false, res: null };
    taskRender(); startDuel(E.duel.pick, true);
  }
  function taskRender() {
    const K = E.task, page = $('#ep-task');
    tabsInfo();
    page.classList.toggle('none', !K);
    if (!K) {
      const a = (E.sel && E.sel !== '*evo' && entryById(E.sel)) || E.champ || EV().bestClassic().p;
      $('#task-empty').innerHTML = `<h3>Kies een taak</h3><p class="hint">Een taak werkt altijd met één algoritme. Kies er een in <a href="#" data-ev="page" data-page="algos">Algoritmes</a>, of begin hier meteen met <b>${esc(a.name)}</b>:</p>` + todoHtml(a);
      return;
    }
    stepsRender(); taskIn(); taskOut();
  }
  function stepsRender() {
    const K = E.task, el = $('#task-steps'); if (!K || !el) return;
    const cur = ['pick', 'busy', 'done'].indexOf(K.step);
    el.innerHTML = `<b class="tk-name">${TASKS[K.kind].icon} ${TASKS[K.kind].name} <small>· ${esc(K.algo.name)}</small></b>
      <ol>${['Kiezen', 'Bezig', 'Uitkomst'].map((n, i) => `<li class="${i < cur ? 'past' : i === cur ? 'on' : ''}">${i + 1} · ${n}</li>`).join('')}</ol><span class="sp"></span>
      <button class="btn" data-ev="task-maze" title="Zelfde taak op een ander doolhof">Ander doolhof</button><button class="btn" data-ev="next-task">Andere taak</button><button class="btn" data-ev="page" data-page="algos">← Overzicht</button>`;
  }
  function setStep(s) { const K = E.task; if (!K) return; if (K.step !== s) { K.step = s; stepsRender(); } taskOut(); }
  function taskIn() {
    const el = $('#task-in'), K = E.task; if (!el || !K) return;
    el.innerHTML = '<h4 class="col-h">In</h4>' + ({ bench: benchIn, mut: mutIn, duel: duelIn, why: whyIn, hunt: huntIn }[K.kind])();
  }
  function taskOut() {
    const el = $('#task-out'), K = E.task; if (!el || !K) return;
    el.innerHTML = '<h4 class="col-h">Uit</h4>' + ({ bench: benchOut, mut: mutOut, duel: duelOut, why: whyOut, hunt: huntOut }[K.kind])() + afterHtml();
  }
  function taskTick() { // 4×/s tijdens het lopen
    const K = E.task; if (!K || E.page !== 'task') return;
    if (K.kind === 'mut' && E.mut && E.mut.busy) taskOut();
    else if (K.kind === 'why') whyTable();
  }
  function taskEnded() {
    const K = E.task, k = T.show && T.show.kind; if (!K || k === 'preview') return;
    if (K.kind === 'duel' && k === 'duel') duelDone();
    else if (K.kind === 'mut' && k === 'mut') mutDone();
    else if (K.kind === 'why') { T.running = false; setStep('done'); taskIn(); }
    else if (K.kind === 'bench') setStep('done');
  }
  function afterHtml() {
    const K = E.task; if (!K || (K.step !== 'done' && K.kind !== 'bench')) return '';
    const changed = (K.kind === 'bench' && E.bench && E.bench.genes.join() !== E.bench.src.genes.join()) || (K.kind === 'mut' && E.mut && !E.mut.busy && E.mut.src.genes.join() !== E.mut.orig0.join());
    return `<div class="after"><h4>${K.step === 'done' ? 'Klaar. En nu?' : 'En nu?'}</h4>${changed ? '<button class="btn primary" data-ev="save-ver">Bewaar als nieuwe versie</button>' : ''}<button class="btn" data-ev="next-task">Volgende taak</button><button class="btn" data-ev="page" data-page="algos">Terug naar overzicht</button></div>`;
  }
  // nieuw bewaarde versie: krijgt de kaart, en is het algoritme voor de volgende taak
  function saveVersion(o) {
    const list = EV().loadAlgos();
    if (list.some(a => a.genes.join() === o.genes.join())) { note('Dit DNA staat al in je algoritmes.'); return null; }
    const a = EV().newAlgo(o); EV().stampHist(a); list.push(a); EV().saveAlgos(list);
    E.sel = a.id; rankList(); champCard();
    return a;
  }

  // ---- Werkbank ----
  function benchRide() {
    const B = E.bench; if (!B) return;
    startShow('solo', [{ id: 'bench', name: B.name, genes: B.genes.slice(), col: '#ffd34d' }], true);
    setStep('busy');
  }
  function benchIn() {
    const B = E.bench; if (!B) return '';
    return `<p class="hint" style="margin-top:0">Schuif aan de genen van <b>${esc(B.src.name)}</b>. Elke wijziging start meteen een proefrit in het doolhof; de testbaan rekent rechts mee. Streepje = origineel.</p>
      <label class="frow"><span>Naam</span><input id="bench-name" value="${esc(B.name)}" maxlength="40"></label>
      <div class="bench-sl">${EV().GENES.map((G, i) => `<label class="bsl" title="+ ${esc(G.pos)} · − ${esc(G.neg)}"><span><i class="sw" style="background:${G.col}"></i>${esc(G.name)}</span>
        <span class="bw"><input type="range" data-g="${i}" min="${G.lo}" max="${G.hi}" step="0.1" value="${B.genes[i]}"><s style="left:${(B.src.genes[i] - G.lo) / (G.hi - G.lo) * 100}%" title="origineel ${B.src.genes[i].toFixed(1)}"></s></span><output>${B.genes[i].toFixed(1)}</output></label>`).join('')}</div>
      <p class="desc" id="bench-desc">${esc(EV().describe(B.genes))}</p>
      <div class="btns"><button class="btn" data-ev="bench-nudge">Kleine mutatie</button><button class="btn" data-ev="bench-reset">Terug naar origineel</button><button class="btn" data-ev="bench-ride">Proefrit opnieuw</button></div>`;
  }
  function benchOut() {
    const B = E.bench; if (!B) return '';
    const t = EV().testScore(B.genes), o = EV().testScore(B.src.genes), d = Math.round((t.score - o.score) * 10) / 10;
    const sign = v => v > 0 ? `<em class="up">+${v}</em>` : v < 0 ? `<em class="down">${v}</em>` : '<em>±0</em>';
    const w = T.runs && T.runs[0] && T.runs[0].ws[0];
    return `<div class="evo-score"><b>${t.score}</b><span>testbaan (${t.solved}/${t.of} gehaald)<br>${sign(d)} t.o.v. origineel ${o.score}</span></div>
      <div class="cats">${EV().TEST_CATS.map(c => `<span>${esc(c.name)} <b>${t.cats[c.k]}</b> ${sign(Math.round((t.cats[c.k] - o.cats[c.k]) * 10) / 10)}</span>`).join('')}</div>
      <p class="hint">Proefrit: ${!w ? '—' : w.reached ? `gehaald in ${w.steps} stappen (kortste ${T.runs[0].mz.ctx.opt})` : w.done ? 'niet gehaald binnen de limiet' : 'bezig…'}</p>
      <div class="btns"><button class="btn" data-ev="bench-duel">Vergelijk met origineel (duel)</button></div>`;
  }
  let benchTimer = 0;
  function benchInput(inp) {
    const B = E.bench; if (!B) return;
    const i = +inp.dataset.g; B.genes[i] = Number(inp.value);
    inp.closest('.bsl').querySelector('output').textContent = B.genes[i].toFixed(1);
    $('#bench-desc').textContent = EV().describe(B.genes);
    clearTimeout(benchTimer); benchTimer = setTimeout(benchRide, 160);
  }
  function benchSave() {
    const B = E.bench; if (!B) return;
    const name = (B.name || '').trim().slice(0, 40) || B.src.name + ' v' + (B.src.ver + 1);
    const a = saveVersion({ name, genes: B.genes.map(v => Math.round(v * 1000) / 1000), parent: B.src.id, ver: B.src.ver + 1, parents: [B.src.name], folder: B.src.folder, tags: B.src.tags, born: E.gen, note: `Getweakt vanaf ${B.src.name}` });
    if (!a) return;
    note(`${a.name} bewaard als versie ${a.ver} van ${B.src.name}.`);
    E.bench = { src: pick({ ...a, mine: true }), genes: a.genes.slice(), name: `${name.replace(/ v\d+$/, '')} v${a.ver + 1}` };
    E.task.algo = E.bench.src; stepsRender(); taskIn(); taskOut();
  }

  // ---- Duel ----
  function startDuel(list, keepMaze) {
    if (!list || list.length < 2) return;
    E.duel.list = list.slice(0, 4).map((a, k) => ({ id: a.id || 'duel-' + k, name: a.name, genes: a.genes.slice(), col: DUEL_COLS[k] }));
    E.duel.done = false; E.duel.res = null;
    startShow('duel', E.duel.list, keepMaze);
    setStep('busy'); taskIn();
  }
  function duelDone() {
    const D = E.duel; if (!D || !D.list) return;
    D.done = true;
    D.res = D.list.map((_, k) => T.runs.map(run => { const w = run.ws[k]; return { steps: w.steps, ok: w.reached, opt: run.mz.ctx.opt }; }));
    setStep('done'); taskIn();
  }
  function duelIn() {
    const D = E.duel; if (!D) return '';
    const ids = new Set(D.pick.map(p => p.id)), cand = entries();
    D.pick.forEach(p => { if (!cand.some(c => c.id === p.id)) cand.unshift({ ...p, t: EV().testScore(p.genes) }); });
    const busy = T.show && T.show.kind === 'duel' && T.phase === 'run';
    return `<p class="hint" style="margin-top:0">Kies 2–4 deelnemers. Ze lopen tegelijk door hetzelfde doolhof, elk met eigen kleur en spoor.</p>
      <div class="dpick">${cand.slice(0, 24).map(a => { const on = ids.has(a.id), fixed = a.id === E.task.algo.id;
        return `<label class="${on ? 'on' : ''}"><input type="checkbox" data-duel="${esc(a.id)}"${on ? ' checked' : ''}${fixed ? ' disabled' : ''}><i class="sw" style="background:${EV().colorOf(a.genes)}"></i>${esc(a.name)}<small>${a.t.score}</small></label>`; }).join('')}</div>
      <div class="btns"><button class="btn primary" data-ev="duel-start"${D.pick.length < 2 || busy ? ' disabled' : ''}>${D.list ? 'Opnieuw (zelfde doolhof)' : 'Start duel'}</button>${D.done ? '<button class="btn" data-ev="duel-again">Ander doolhof</button>' : ''}</div>`;
  }
  function duelOut() {
    const D = E.duel;
    if (!D || !D.list) return '<p class="hint" style="margin-top:0">Nog niet gestart. Kies links de deelnemers en druk op Start duel. Hier verschijnt dan per deelnemer: stappen in dit doolhof, testbaan en score per doolhof-soort.</p>';
    const cats = EV().TEST_CATS, ts = D.list.map(a => EV().testScore(a.genes));
    const best = key => Math.max(...ts.map(key));
    const cell = (v, b, base, k) => `<td class="${v === b ? 'best' : ''}">${v}${k && base != null ? `<small>${v - base > 0 ? '+' : ''}${Math.round((v - base) * 10) / 10}</small>` : ''}</td>`;
    const mazeCol = k => {
      if (!D.done || !D.res) return '<td>…</td>';
      const r = D.res[k], tot = r.reduce((s, x) => s + (x.ok ? x.steps : 0), 0), ok = r.every(x => x.ok);
      const bestTot = Math.min(...D.res.map(rr => rr.every(x => x.ok) ? rr.reduce((s, x) => s + x.steps, 0) : 1e9));
      return `<td class="${ok && tot === bestTot ? 'best' : ''}">${ok ? tot + ' st.' : '✗'}</td>`;
    };
    let win = '';
    if (D.done && D.res) { const tots = D.res.map(r => r.every(x => x.ok) ? r.reduce((s, x) => s + x.steps, 0) : 1e9), m = Math.min(...tots); win = m < 1e9 ? `🏁 Dit doolhof: <b>${esc(D.list[tots.indexOf(m)].name)}</b> was het snelst.` : 'Niemand haalde het doel binnen de limiet.'; }
    const tw = ts.indexOf(ts.reduce((a, b) => b.score > a.score ? b : a));
    return `<p style="margin-top:0">${D.done ? win : 'Bezig…'}${D.done ? `<br>📏 Testbaan: <b>${esc(D.list[tw].name)}</b> is algemeen het sterkst.` : ''}</p>
      <div class="duel-wrap"><table class="duel"><thead><tr><th></th><th>Dit doolhof</th><th>Testbaan</th>${cats.map(c => `<th>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>
      ${D.list.map((a, k) => `<tr><th><i class="sw" style="background:${a.col}"></i>${esc(a.name)}</th>${mazeCol(k)}${cell(ts[k].score, best(t => t.score), ts[0].score, k)}${cats.map(c => cell(ts[k].cats[c.k], best(t => t.cats[c.k]), ts[0].cats[c.k], k)).join('')}</tr>`).join('')}
      </tbody></table></div><p class="hint">Groen = beste in die kolom; kleine getallen = verschil met de eerste rij.</p>`;
  }

  // ---- Mutantenlab: algoritme → N mutanten → race in één doolhof + testbaan; de beste gaat door ----
  // De rangorde komt van de testbaan; de race is om te zien. Daarom stopregel: klaar zodra genoeg binnen zijn of na max tijd.
  const MUT_STR = { klein: 0.06, middel: 0.12, groot: 0.25 };
  function mutRound() {
    const M = E.mut; if (!M) return;
    M.round++; M.busy = true; M.res = null;
    const r = ML.makeRng(M.src.name + '|mut|' + M.round + '|' + Math.random()), G = EV().GENES, f = MUT_STR[M.str] || 0.12;
    const list = [{ id: 'mut-0-' + M.round, name: M.src.name + (M.round > 1 ? ' (beste vorige)' : ' (origineel)'), genes: M.src.genes.slice(), col: '#ffffff', base: true }];
    for (let k = 1; k <= M.n; k++) {
      let genes;
      do { genes = M.src.genes.map((v, i) => r() < 0.5 ? EV().clamp(v + Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(TAU * r()) * (G[i].hi - G[i].lo) * f, i) : v); } while (genes.join() === M.src.genes.join());
      list.push({ id: `mut-${k}-${M.round}`, name: `${M.src.name} M${M.round}.${k}`, genes: genes.map(v => Math.round(v * 100) / 100), col: `hsl(${Math.round(k * 360 / M.n)},85%,62%)` });
    }
    M.list = list; T.salt++; T.forced = null;
    startShow('mut', list, false);
    setStep('busy'); taskIn();
  }
  // stopregel: genoeg binnen of tijd op → rest niet afwachten; kansloos (al 2× zo veel stappen als de eerste) → afkappen
  function mutCheck(t, alive) {
    const M = E.mut, run = T.runs && T.runs[0]; if (!M || !run) return alive;
    const n = run.ws.length, need = M.need ? Math.min(M.need, n) : n, first = run.order[0];
    const cut = w => { w.done = true; w.cut = true; w.p = 1; run.cut++; };
    if (first) for (const w of run.ws) if (!w.done && w.steps > Math.max(first.steps * 2, first.steps + 30)) { cut(w); alive--; }
    if (run.order.length >= need || t - T.t0 > M.maxT) { for (const w of run.ws) if (!w.done) cut(w); return 0; }
    return alive;
  }
  function mutDone() {
    const M = E.mut; if (!M || !M.list) return;
    const run = T.runs[0], Ev = EV();
    M.res = M.list.map((a, k) => {
      const w = run.ws[k], t = Ev.testScore(a.genes), h = M.heavy ? Ev.heavyScore(a.genes) : null;
      return { a, race: w.reached ? w.steps : null, cut: !!w.cut, t: t.score, solved: t.solved, h: h ? h.score : null, score: h ? (t.score + h.score) / 2 : t.score };
    }).sort((x, y) => y.score - x.score || (x.race || 1e9) - (y.race || 1e9));
    const best = M.res[0], base = M.res.find(x => x.a.base);
    M.log.push({ round: M.round, name: best.a.name, score: Math.round(best.score * 10) / 10, gain: Math.round((best.score - base.score) * 10) / 10 });
    if (!best.a.base) { M.src = { ...M.src, genes: best.a.genes.slice() }; M.bestName = best.a.name; }
    if (M.round < M.rounds && M.busy) { M.wait = true; setTimeout(() => { M.wait = false; if (E.mut === M && M.busy) mutRound(); }, 900); taskOut(); }
    else { M.busy = false; setStep('done'); taskIn(); }
  }
  function mutIn() {
    const M = E.mut; if (!M) return '';
    const sel = (id, opts, v) => `<select data-mut="${id}"${M.busy ? ' disabled' : ''}>${opts.map(([k, t]) => `<option value="${k}"${String(k) === String(v) ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
    return `<p class="hint" style="margin-top:0">Het lab maakt varianten van <b>${esc(M.origName)}</b>, laat ze racen en meet ze op de testbaan. De beste gaat door naar de volgende ronde.</p>
      <div class="frow2"><span>Mutanten</span>${sel('n', [[8, 8], [16, 16], [24, 24], [40, 40]], M.n)}</div>
      <div class="frow2"><span>Sterkte</span>${sel('str', [['klein', 'klein'], ['middel', 'middel'], ['groot', 'groot']], M.str)}</div>
      <div class="frow2"><span>Rondes</span>${sel('rounds', [[1, 1], [3, 3], [5, 5], [10, 10]], M.rounds)}</div>
      <div class="frow2"><span></span><label class="check"><input type="checkbox" data-mut="heavy"${M.heavy ? ' checked' : ''}${M.busy ? ' disabled' : ''}> ook zware testbaan</label></div>
      <h4 class="col-h" style="margin-top:12px">Stopregel per ronde</h4>
      <div class="frow2"><span>Klaar als</span>${sel('need', [[1, 'de eerste binnen is'], [3, '3 binnen zijn'], [5, '5 binnen zijn'], [0, 'iedereen klaar is']], M.need)}</div>
      <div class="frow2"><span>of na</span>${sel('maxT', [[4, '4 s'], [8, '8 s'], [15, '15 s'], [30, '30 s']], M.maxT)}</div>
      <p class="hint">Wie al 2× zo veel stappen zette als de eerste aankomer, wordt afgekapt. De race is om te kijken: de rangorde komt van de testbaan, dus wachten op de rest verandert niets.</p>
      <div class="btns"><button class="btn primary" data-ev="mut-go"${M.busy ? ' disabled' : ''}>${M.busy ? 'Bezig…' : M.round ? `Nog ${M.rounds} ronde${M.rounds > 1 ? 's' : ''}` : 'Start'}</button>${M.busy ? '<button class="btn" data-ev="mut-stop">Stop</button>' : ''}</div>`;
  }
  function mutOut() {
    const M = E.mut; if (!M) return '';
    const Ev = EV(), o = Ev.testScore(M.orig0).score, cur = Ev.testScore(M.src.genes).score;
    let html = `<p style="margin-top:0">Bron <b>${esc(M.origName)}</b>: testbaan ${o}${M.round ? ` · beste nu ${cur} ${cur > o ? `<em class="up">+${Math.round((cur - o) * 10) / 10}</em>` : ''}` : ''}</p>`;
    const run = T.runs && T.runs[0];
    if (M.busy && !M.res && run && T.show && T.show.kind === 'mut') {
      const n = run.ws.length, need = M.need ? Math.min(M.need, n) : n, got = run.order.length;
      const el = performance.now() / 1000 - T.t0, left = Math.max(0, Math.ceil(M.maxT - el)), p = Math.min(1, Math.max(got / need, el / M.maxT));
      html += `<div class="wait">Ronde <b>${M.round}/${M.rounds}</b> · wacht op <b>${need}</b> van ${n} · <b>${got}</b> binnen · ${run.cut} afgekapt · nog max ${left} s</div>
        <div class="prog"><i style="width:${Math.round(p * 100)}%"></i></div>
        <div class="wsec">Binnen</div><ol class="arrivals">${run.order.map(w => `<li><i class="sw" style="background:${w.col}"></i>${esc(w.ge.name)}<em>${w.steps} st.</em></li>`).join('') || '<li class="hint">nog niemand…</li>'}</ol>`;
    } else if (M.res) {
      if (M.busy) html += `<div class="wait">Ronde ${M.round} klaar — ronde ${M.round + 1} start zo…</div>`;
      html += `<p><b>Ronde ${M.round}</b> · volgorde op ${M.heavy ? 'gemiddelde van testbaan en zware testbaan' : 'testbaan'}; race = stappen in dit doolhof (– = niet afgewacht).</p>
        <div class="duel-wrap"><table class="duel"><thead><tr><th></th><th>Race</th><th>Test</th>${M.heavy ? '<th>Zwaar</th>' : ''}<th>Δ</th></tr></thead><tbody>
        ${M.res.slice(0, 14).map((x, i) => { const b = M.res.find(y => y.a.base), d = Math.round((x.score - b.score) * 10) / 10;
          return `<tr${i ? '' : ' class="top"'}><th><i class="sw" style="background:${x.a.col}"></i>${esc(x.a.name)}</th><td>${x.race != null ? x.race : x.cut ? '–' : '✗'}</td><td class="${i ? '' : 'best'}">${x.t}</td>${M.heavy ? `<td>${x.h}</td>` : ''}<td>${x.a.base ? '' : (d > 0 ? '+' : '') + d}</td></tr>`; }).join('')}
        </tbody></table></div>`;
    } else if (!M.busy) html += '<p class="hint">Stel links in hoeveel mutanten en rondes, en druk op Start. Het doolhof laat nu een voorproefje van het origineel zien.</p>';
    if (M.log.length) html += `<div class="tree"><b>Verloop</b> ${M.log.map(l => `R${l.round}: ${l.score}${l.gain > 0 ? ` (+${l.gain})` : ' (geen winst)'}`).join(' · ')}</div>`;
    if (!M.busy && M.round && M.src.genes.join() !== M.orig0.join()) html += '<div class="btns"><button class="btn" data-ev="mut-duel">Duel met origineel</button><button class="btn" data-ev="mut-bench">Beste naar werkbank</button></div>';
    return html;
  }
  function mutSave() {
    const M = E.mut; if (!M) return;
    const algos = EV().loadAlgos(), parent = algos.find(a => a.id === M.src.id) || algos.find(a => a.genes.join() === M.orig0.join());
    const ver = parent ? parent.ver + 1 : 2, name = `${M.src.name.replace(/ v\d+$/, '')} v${ver}`;
    const a = saveVersion({ name, genes: M.src.genes, parent: parent ? parent.id : M.src.id, ver, parents: [M.origName], folder: parent ? parent.folder : '', tags: parent ? parent.tags : ['mutant'], born: E.gen, note: `Mutantenlab: ${M.log.length} rondes vanaf ${M.origName}` });
    if (!a) return;
    note(`${name} bewaard.`);
    E.task.algo = pick({ ...a, mine: true }); M.orig0 = a.genes.slice(); M.src = { ...M.src, id: a.id };
    stepsRender(); taskOut();
  }

  // ---- Doolhof-zoeker: welke doolhoven zijn het moeilijkst voor dit algoritme? (zoekt + klimt naar slechtere scores) ----
  function huntScore(genes, mz) { let s = 0; for (let r = 0; r < 3; r++) s += EV().evalOne(mz.ctx, genes, 'jacht|' + r).score(); return Math.round(s / 3 * 1000) / 10; }
  function huntCand(H, r) {
    const Ev = EV(), G = H.grids === 'all' ? Ev.GRIDS : [H.grids], f = H.found;
    if (f.length >= 3 && r() < 0.65) { // klimmen: variant op een van de moeilijkste
      const b = f[Math.floor(r() * Math.min(5, f.length))].sp, sp = { ...b, seed: ML.randomSeed() }, k = r();
      if (k < 0.3) sp.size = Math.max(8, Math.min(44, b.size + Math.round((r() * 2 - 1) * 6)));
      else if (k < 0.55) sp.braid = Math.max(0, Math.min(60, b.braid + Math.round((r() * 2 - 1) * 15)));
      else if (k < 0.7) sp.maker = Ev.MAKERS[Math.floor(r() * Ev.MAKERS.length)];
      else if (k < 0.8) sp.puzzle = sp.puzzle ? 0 : 1;
      return sp;
    }
    return { grid: G[Math.floor(r() * G.length)], size: 10 + Math.floor(r() * 30), braid: [0, 0, 10, 25, 45][Math.floor(r() * 5)], puzzle: r() < 0.3 ? 1 : 0, maker: Ev.MAKERS[Math.floor(r() * Ev.MAKERS.length)], seed: ML.randomSeed() };
  }
  async function huntRun() {
    const H = E.hunt; if (!H || H.running) return;
    H.running = true; setStep('busy'); taskIn();
    const r = ML.makeRng(Math.random()), Ev = EV(), budget = H.tried + 150;
    let shown = 0;
    while (H.running && H.tried < budget && E.hunt === H && A.S.mode === 'evo') {
      const t0 = performance.now();
      while (performance.now() - t0 < 40 && H.tried < budget) {
        const sp = huntCand(H, r), key = Ev.spName(sp) + '|' + sp.maker + '|' + sp.seed;
        let mz; try { mz = Ev.specMaze(sp, HUNT_ASP); } catch (e) { H.tried++; continue; }
        const sc = huntScore(H.target.genes, mz);
        H.tried++;
        if (H.found.length < 8 || sc < H.found[H.found.length - 1].sc) {
          let cb = null; for (const p of Ev.PRESETS) { const v = huntScore(p.genes, mz); if (!cb || v > cb.sc) cb = { name: p.name, sc: v }; }
          H.found.push({ sp, key, sc, opt: mz.ctx.opt, cb });
          H.found.sort((a, b) => a.sc - b.sc); H.found.length = Math.min(8, H.found.length);
        }
      }
      if (E.page === 'task' && E.task && E.task.kind === 'hunt' && performance.now() - shown > 300) { shown = performance.now(); taskOut(); }
      await new Promise(res => setTimeout(res, 0));
    }
    const done = H.running; H.running = false;
    if (E.hunt === H && E.task && E.task.kind === 'hunt') { if (done && H.found.length) huntShow(0, false); setStep(done ? 'done' : 'pick'); taskIn(); }
  }
  function huntIn() {
    const H = E.hunt, Ev = EV(); if (!H) return '';
    const gsel = `<select data-hunt="grids"${H.running ? ' disabled' : ''}>${[['all', 'Alle rasters'], ...Ev.GRIDS.map(g => [g, GRID_NAMES[g]])].map(([k, t]) => `<option value="${k}"${k === H.grids ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
    return `<p class="hint" style="margin-top:0">De zoeker bouwt honderden doolhoven en klimt naar de doolhoven waar <b>${esc(H.target.name)}</b> het slechtst op scoort. Daarna: kijken, duel met de beste klassieker, of de evolutie erop laten trainen.</p>
      <div class="frow2"><span>Raster</span>${gsel}</div>
      <div class="btns"><button class="btn primary" data-ev="hunt-go">${H.running ? 'Stop' : H.tried ? 'Zoek verder (+150)' : 'Zoek (150 doolhoven)'}</button></div>
      ${H.found.length && !H.running ? '<div class="btns" style="margin-top:6px"><button class="btn" data-ev="hunt-train" title="De evolutie (Evolueren) traint vanaf nu op deze doolhoven">Train de evolutie hierop</button></div>' : ''}
      ${huntSet().length ? `<p class="hint">Trainingsset actief: ${huntSet().length} doolhoven (Evolueren → Doolhof → Zoeker-set).</p>` : ''}`;
  }
  function huntOut() {
    const H = E.hunt, Ev = EV(); if (!H) return '';
    if (!H.found.length) return `<p class="hint" style="margin-top:0">${H.running ? `Zoeken… ${H.tried} doolhoven geprobeerd.` : 'Nog niets gezocht. Druk links op Zoek.'}</p>`;
    return `<p style="margin-top:0">${H.running ? 'Zoeken… ' : ''}${H.tried} doolhoven geprobeerd. Score = gemiddelde van 3 runs (0–100); lager = moeilijker. Rood = slechter dan de beste klassieker.</p>
      <div class="duel-wrap"><table class="duel hunt"><thead><tr><th>Doolhof</th><th>Score</th><th>Klassiek</th><th></th></tr></thead><tbody>
      ${H.found.map((f, i) => `<tr${H.sel === i ? ' class="top"' : ''}><th>${esc(Ev.spName(f.sp))}<small>${esc(f.sp.maker)} · kortste ${f.opt}</small></th><td class="${f.sc < f.cb.sc ? 'worse' : ''}">${f.sc}</td><td>${f.cb.sc}<small>${esc(f.cb.name)}</small></td>
        <td class="acts"><button data-ev="hunt-watch" data-i="${i}" title="Bekijk in het doolhof">▶</button><button data-ev="hunt-duel" data-i="${i}" title="Duel met de beste klassieker op dit doolhof">vs</button></td></tr>`).join('')}
      </tbody></table></div>`;
  }
  function huntShow(i, duel) {
    const H = E.hunt, f = H && H.found[i]; if (!f) return;
    H.sel = i; T.forced = EV().specMaze(f.sp, HUNT_ASP); T.mazes = [];
    if (duel) {
      const bc = EV().PRESETS.find(p => p.name === f.cb.name) || EV().bestClassic().p;
      startShow('duel', [{ id: 'h0', name: H.target.name, genes: H.target.genes.slice(), col: DUEL_COLS[0] }, { id: 'h1', name: bc.name, genes: bc.genes.slice(), col: DUEL_COLS[1] }]);
    } else startShow('solo', [{ id: 'hunt', name: H.target.name, genes: H.target.genes.slice(), col: '#ffd34d' }]);
    taskOut();
  }

  // ---- Uitleg-replay: per stap welke zetten er waren, de punten per gen en de kans ----
  function whyWalker() { return E.task && E.task.kind === 'why' && T.show && T.show.kind === 'solo' && T.runs && T.runs[0] ? { run: T.runs[0], w: T.runs[0].ws[0] } : null; }
  function whyStep(n) {
    const o = whyWalker(); if (!o) return;
    const { run, w } = o;
    if (!E.xp) E.xp = { last: null };
    if (n < 0) { // terug: opnieuw vanaf de start met hetzelfde zaadje (deterministisch)
      const k = Math.max(0, w.steps + n);
      w.reset(w.ge.genes, w.seed); run.heat.fill(0); run.heatBy.clear(); run.order.length = 0;
      for (let i = 0; i < k - 1; i++) { w.step(); run.heat[w.nc]++; heatAdd(run, w); }
      if (k > 0) { const ex = w.explain(); w.step(); run.heat[w.nc]++; heatAdd(run, w); E.xp.last = { opts: ex, pick: w.s }; } else E.xp.last = null;
    } else for (let i = 0; i < n && !w.done; i++) { const ex = w.explain(); w.step(); run.heat[w.nc]++; heatAdd(run, w); E.xp.last = { opts: ex, pick: w.s }; }
    w.p = 1; T.running = false; T.phase = w.done ? 'pause' : 'run'; T.endT = Infinity;
    T.panes[0].dirty = true; paneStats(T, w.done);
    E.task.step = w.done ? 'done' : 'busy'; stepsRender(); taskIn(); taskOut();
  }
  function whyIn() {
    return `<p class="hint" style="margin-top:0">Elke zet krijgt punten (gen × kenmerk). Daarna loot de loper met “chaos” als temperatuur: hoe hoger de punten, hoe groter de kans. In het doolhof: cirkel = kans per zet.</p>
      <div class="btns"><button class="btn" data-ev="why-back10">−10</button><button class="btn" data-ev="why-back">◀ Stap</button><button class="btn primary" data-ev="why-step">Stap ▶</button><button class="btn" data-ev="why-10">+10</button></div>
      <div class="btns" style="margin-top:6px"><button class="btn" data-ev="why-play">${T.running && T.phase === 'run' ? 'Pauze' : 'Speel af'}</button><button class="btn" data-ev="why-restart">Vanaf het begin</button></div>`;
  }
  function whyOut() { return `<div id="why-tab">${whyHtml()}</div>`; }
  function whyTable() { const el = $('#why-tab'); if (el) el.innerHTML = whyHtml(); }
  function whyHtml() {
    const o = whyWalker(); if (!o) return '';
    const { w } = o, G = EV().GENES, cur = w.done ? null : w.explain(), L = E.xp && E.xp.last;
    const row = (x, picked) => {
      const chips = x.parts.map((v, i) => Math.abs(v) >= 0.05 ? `<em style="border-color:${G[i].col}" title="${esc(G[i].name)}">${v > 0 ? '+' : ''}${v.toFixed(1)} ${esc(G[i].name)}</em>` : '').join('');
      return `<div class="wrow${picked ? ' pick' : ''}"><b>${Math.round(x.p * 100)}%</b><span>${x.visits ? `al ${x.visits}× geweest` : 'nieuw'}${x.jump ? ' · sprong' : ''} · ${x.sc.toFixed(1)} pt</span><div class="chips">${chips || '<em>geen voorkeur</em>'}</div></div>`;
    };
    let html = `<p style="margin-top:0"><b>Stap ${w.steps}</b>${w.reached ? ' · doel bereikt ✓' : w.done ? ' · gestopt (limiet)' : ''} · temperatuur ${w.T.toFixed(2)}</p>`;
    if (L) html += '<div class="wsec">Vorige keuze</div>' + L.opts.slice().sort((a, b) => b.p - a.p).map(x => row(x, x.s2 === L.pick)).join('');
    if (cur) html += `<div class="wsec">Nu te kiezen (${cur.length})</div>` + cur.slice().sort((a, b) => b.p - a.p).map(x => row(x, false)).join('');
    return html;
  }
  function drawWhy(run, g, r) {
    const w = run.ws[0]; if (!w || w.done) return;
    const C = run.mz.m.cells, s = r.s, G = EV().GENES, opts = w.explain(), pc = C[w.nc].center;
    g.font = `600 ${Math.max(9, s * 0.32)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    opts.forEach(o => {
      const c = C[o.c2].center, X = r.X(c[0]), Y = r.Y(c[1]);
      let bi = 0; o.parts.forEach((v, i) => { if (v > o.parts[bi]) bi = i; });
      g.globalAlpha = 0.85; g.strokeStyle = g.fillStyle = o.parts[bi] > 0 ? G[bi].col : '#cfd8e3'; g.lineWidth = Math.max(1.5, s * 0.06);
      g.beginPath(); g.moveTo(r.X(pc[0]), r.Y(pc[1])); g.lineTo(X, Y); g.stroke();
      g.beginPath(); g.arc(X, Y, s * (0.18 + 0.32 * Math.sqrt(o.p)), 0, TAU); g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1; g.stroke();
      g.fillStyle = '#fff'; g.strokeStyle = '#000a'; g.lineWidth = 3; const t = Math.round(o.p * 100) + '%'; g.strokeText(t, X, Y); g.fillText(t, X, Y);
    });
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }

  // ======================= Analyse =======================
  function anaRender() { treeRender(); famRender(); }
  function famRender() {
    const el = $('#ana-fame'); if (!el) return;
    const list = EV().loadFame(), Ev = EV();
    if (!list.length) { el.innerHTML = '<p class="hint" style="margin-top:0">Nog leeg. Elk nieuw record van een eigen algoritme komt hier vanzelf in (top 20, ook over sessies heen).</p>'; return; }
    const heavy = Ev.heavyReady(), medal = ['🥇', '🥈', '🥉'];
    const acts = a => (isSaved(a.genes) ? '' : `<button title="Bewaar in mijn algoritmes" data-ev="save-fame" data-id="${esc(a.id)}">💾</button>`) + `<button title="Uit de eregalerij" data-ev="del-fame" data-id="${esc(a.id)}">✕</button>`;
    const hv = a => a.heavy != null ? a.heavy : heavy ? Ev.heavyScore(a.genes).score : '…';
    el.innerHTML = `<div class="podium">${list.slice(0, 3).map((a, i) => `<div class="pod p${i + 1}" data-ev="sel-go" data-id="${esc(a.id)}" title="klik: openen in Algoritmes"><span class="md">${medal[i]}</span><i class="sw" style="background:${Ev.colorOf(a.genes)}"></i><b>${esc(a.name)}</b>
        <span class="big">${a.test}</span><small>zwaar ${hv(a)} · gen ${a.gen} · ${esc(a.date)}</small><span class="acts">${acts(a)}</span></div>`).join('')}</div>
      <div class="fame">${list.slice(3).map((a, i) => `<div class="erow" data-ev="sel-go" data-id="${esc(a.id)}" title="${esc(Ev.describe(a.genes))}"><b class="pos">${i + 4}</b><i class="sw" style="background:${Ev.colorOf(a.genes)}"></i>
        <span class="nm">${esc(a.name)}<small>gen ${a.gen} · ${esc(a.date)}${a.parents && a.parents.length ? ' · ' + a.parents.map(esc).join(' × ') : ''}</small></span>
        <span class="sc">${a.test}<small>zwaar ${hv(a)}</small></span><span class="acts">${acts(a)}</span></div>`).join('')}</div>`;
  }
  function treeRender() {
    const el = $('#ana-tree'); if (!el) return;
    const Ev = EV(), algos = Ev.loadAlgos(), byId = new Map(algos.map(a => [a.id, a]));
    Ev.PRESETS.forEach(p => { if (algos.some(a => a.parent === p.id)) byId.set(p.id, { ...p, classic: true }); });
    const nodes = [...byId.values()], kids = new Map();
    nodes.forEach(a => { const p = a.parent && byId.has(a.parent) ? a.parent : null; a._p = p; if (p) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(a); } });
    const roots = nodes.filter(a => !a._p).sort((a, b) => Ev.testScore(b.genes).score - Ev.testScore(a.genes).score);
    if (!nodes.length) { el.innerHTML = '<p class="hint" style="margin-top:0">Nog geen bewaarde algoritmes. Bewaar een kampioen en maak er versies van met de werkbank of het mutantenlab: die verschijnen hier als boom.</p>'; return; }
    const DX = 150, DY = 40, W = 128, H = 30, pos = new Map();
    let row = 0, maxD = 0;
    const place = (a, d) => { maxD = Math.max(maxD, d); const ch = (kids.get(a.id) || []).sort((x, y) => String(x.created).localeCompare(String(y.created)));
      if (!ch.length) pos.set(a.id, { x: 8 + d * DX, y: 8 + row++ * DY }); else { ch.forEach(c => place(c, d + 1)); const ys = ch.map(c => pos.get(c.id).y); pos.set(a.id, { x: 8 + d * DX, y: (Math.min(...ys) + Math.max(...ys)) / 2 }); } };
    roots.forEach(a => place(a, 0));
    const SW = 16 + (maxD + 1) * DX, SH = 16 + row * DY;
    let edges = '', boxes = '';
    nodes.forEach(a => {
      const p = pos.get(a.id); if (!p) return;
      if (a._p) { const q = pos.get(a._p); edges += `<path d="M${q.x + W},${q.y + H / 2} C${q.x + W + 14},${q.y + H / 2} ${p.x - 14},${p.y + H / 2} ${p.x},${p.y + H / 2}"/>`; }
      const sc = Ev.testScore(a.genes).score, par = a._p ? Ev.testScore(byId.get(a._p).genes).score : null, d = par != null ? Math.round((sc - par) * 10) / 10 : null;
      boxes += `<g class="tn${a.classic ? ' classic' : ''}${E.treeSel === a.id ? ' hl' : ''}" data-ev="sel-go" data-id="${esc(a.id)}" transform="translate(${p.x},${p.y})"><title>${esc(Ev.describe(a.genes))}</title><rect width="${W}" height="${H}" rx="7"/>
        <rect width="5" height="${H}" rx="2" fill="${Ev.colorOf(a.genes)}"/><text x="11" y="13">${esc(a.name.length > 17 ? a.name.slice(0, 16) + '…' : a.name)}</text>
        <text x="11" y="25" class="s">${sc}${d != null ? ` <tspan class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}</tspan>` : ''}${a.ver > 1 ? ' · v' + a.ver : ''}</text></g>`;
    });
    el.innerHTML = `<p class="hint" style="margin-top:0">Elke lijn = nieuwe versie (werkbank of mutantenlab). Groen/rood = winst/verlies op de testbaan t.o.v. de ouder. Klik een blokje om het te openen in Algoritmes.</p>
      <div class="treewrap"><svg class="stree" width="${SW}" height="${SH}" viewBox="0 0 ${SW} ${SH}"><g class="edges">${edges}</g>${boxes}</svg></div>`;
    const hl = el.querySelector('.tn.hl'); if (hl) hl.scrollIntoView({ block: 'center', inline: 'center' });
  }

  // ---- Rapport: ranglijst + kampioen + verloop + eregalerij als zelfstandige HTML ----
  function report() {
    const Ev = EV(), list = entries(), fame = Ev.loadFame(), c = E.champ, d = new Date(), heavy = Ev.heavyReady();
    const bars = genes => `<div class="dna">${Ev.GENES.map((G, i) => { const v = genes[i], z = geneZ(G, v), w = Math.abs(z) * 50;
      const st = G.k === 'chaos' ? `left:0;width:${z * 100}%` : z >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`; return `<span title="${esc(G.name)} ${v.toFixed(2)}"><i style="${st};background:${G.col}"></i></span>`; }).join('')}</div>`;
    const hs = E.hist, n = hs.length, step = Math.max(1, Math.ceil(n / 400));
    let svg = '';
    if (n > 1) {
      const ymax = Math.max(40, ...hs.map(h => Math.max(h.best, h.test))), X = i => 40 + 640 * i / (n - 1), Y = v => 190 - 170 * v / ymax;
      let rec = -1; const recPts = [], bestPts = [];
      hs.forEach((h, i) => { if (h.test > rec) rec = h.test; if (i % step === 0 || i === n - 1) { recPts.push(`${X(i).toFixed(1)},${Y(rec).toFixed(1)}`); bestPts.push(`${X(i).toFixed(1)},${Y(h.best).toFixed(1)}`); } });
      const bc = Ev.bestClassic();
      svg = `<svg viewBox="0 0 700 210" class="chart"><line x1="40" x2="680" y1="${Y(bc.t.score)}" y2="${Y(bc.t.score)}" stroke="#ff6b6b" stroke-dasharray="6 5"/><text x="44" y="${Y(bc.t.score) - 5}" fill="#ff6b6b">beste klassieker ${esc(bc.p.name)} ${bc.t.score}</text>
        <polyline points="${bestPts.join(' ')}" fill="none" stroke="#ffd166" stroke-width="1.2" opacity=".7"/><polyline points="${recPts.join(' ')}" fill="none" stroke="#4cc9f0" stroke-width="2.6"/>
        <text x="40" y="206">generatie ${hs[0].gen}</text><text x="680" y="206" text-anchor="end">generatie ${hs[n - 1].gen}</text><text x="44" y="14" fill="#4cc9f0">record testbaan</text><text x="170" y="14" fill="#ffd166">fitness beste</text></svg>`;
    }
    const rows = list.map((a, i) => `<tr><td>${i + 1}</td><td><i class="sw" style="background:${Ev.colorOf(a.genes)}"></i>${esc(a.name)}<small>${a.classic ? 'klassieker' : a.live ? 'kampioen (niet bewaard)' : 'eigen'}</small></td>
      <td class="n">${a.t.score}</td><td class="n">${heavy ? Ev.heavyScore(a.genes).score : '–'}</td><td class="n">${a.t.solved}/${a.t.of}</td>${Ev.TEST_CATS.map(k => `<td class="n">${a.t.cats[k.k]}</td>`).join('')}<td>${bars(a.genes)}</td></tr>`).join('');
    const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Maze Lab – evolutie-rapport</title><style>
:root{--bg:#f6f3ec;--ink:#1d2330;--mut:#6b7380;--line:#ddd6c8;--card:#fff}@media (prefers-color-scheme:dark){:root{--bg:#141820;--ink:#e6e9ef;--mut:#8b98a8;--line:#2a3242;--card:#1b2130}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif;padding:24px 16px}main{max-width:1000px;margin:auto}h1{margin:0 0 4px}h2{margin:28px 0 8px;font-size:17px}.mut{color:var(--mut)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.big{font-size:44px;font-weight:700;color:#4cc9f0;line-height:1}.row{display:flex;gap:18px;align-items:center;flex-wrap:wrap}
table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}td,th{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}th{font-size:12px;color:var(--mut);font-weight:600}
td.n{text-align:right;font-variant-numeric:tabular-nums}td small{display:block;color:var(--mut);font-size:11px}.sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}
.dna{display:grid;grid-template-columns:repeat(9,14px);gap:2px}.dna span{position:relative;height:14px;background:#8882;border-radius:2px;overflow:hidden}.dna i{position:absolute;top:0;bottom:0}
.chart{width:100%;height:auto;background:var(--card);border:1px solid var(--line);border-radius:12px}.chart text{font-size:11px;fill:var(--mut)}.wrap{overflow-x:auto}</style></head><body><main>
<h1>Maze Lab – evolutie-rapport</h1><p class="mut">${d.toLocaleString('nl-NL')} · generatie ${E.gen} · ${E.pop.length} lopers · ${E.species.length} soorten${isl() > 1 ? ' · ' + isl() + ' eilanden' : ''} · ${runs()} run(s) per doolhof</p>
${c ? `<div class="card"><div class="row"><div><div class="mut">Kampioen</div><h2 style="margin:2px 0">${esc(c.name)}</h2><div class="mut">${c.from ? 'klassieker' : 'geboren in generatie ' + c.born}</div></div><div class="big">${c.test}</div><div class="mut">testbaan<br>zwaar ${c.heavy != null ? c.heavy : '–'}</div>${bars(c.genes)}</div><p>${esc(Ev.describe(c.genes))}</p></div>` : ''}
${svg ? `<h2>Verloop</h2>${svg}` : ''}
<h2>Ranglijst</h2><div class="wrap"><table><thead><tr><th>#</th><th>Algoritme</th><th>Testbaan</th><th>Zwaar</th><th>Gehaald</th>${Ev.TEST_CATS.map(k => `<th>${esc(k.name)}</th>`).join('')}<th>DNA</th></tr></thead><tbody>${rows}</tbody></table></div>
${fame.length ? `<h2>Eregalerij</h2><div class="wrap"><table><thead><tr><th>#</th><th>Naam</th><th>Testbaan</th><th>Zwaar</th><th>Generatie</th><th>Datum</th><th>DNA</th></tr></thead><tbody>${fame.map((a, i) => `<tr><td>${i + 1}</td><td><i class="sw" style="background:${Ev.colorOf(a.genes)}"></i>${esc(a.name)}</td><td class="n">${a.test}</td><td class="n">${a.heavy != null ? a.heavy : '–'}</td><td class="n">${a.gen}</td><td>${esc(a.date)}</td><td>${bars(a.genes)}</td></tr>`).join('')}</tbody></table></div>` : ''}
<h2>Genen</h2><p class="mut">${Ev.GENES.map(G => `<i class="sw" style="background:${G.col}"></i>${esc(G.name)}: + ${esc(G.pos)}, − ${esc(G.neg)}`).join('<br>')}</p>
<p class="mut">Testbaan = 12 vaste doolhoven × 2 runs; zware testbaan = 8 grote doolhoven (40–70) met lussen en puzzels. Score 100 = altijd de kortste route.</p></main></body></html>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = `maze-lab-rapport-${d.toISOString().slice(0, 10)}.html`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    note('Rapport gedownload.');
  }

  // ======================= acties =======================
  function afterSave() { champCard(); rankList(); liveCard(); if (E.page === 'algos') { algoGrid(); algoDetail(); } }
  function saveChamp() {
    const c = E.champ; if (!c || c.from) return;
    if (!addAlgo({ name: c.name, genes: c.genes, born: c.born, parents: c.parents || [] })) return;
    note(`${c.name} is bewaard bij Algoritmes.`); afterSave();
  }
  function seed(a) {
    if (!a || !E.pop.length) return;
    const s = E.pop.slice().sort((x, y) => (x.fit || 0) - (y.fit || 0));
    const g = EV().genome(a.genes, E.gen, [], { from: a.name, name: a.name });
    E.pop[E.pop.indexOf(s[0])] = g;
    speciate(); persist(); note(`${a.name} doet mee vanaf de volgende generatie.`); legend(); liveCard();
  }
  function addAlgo(o) {
    const list = EV().loadAlgos();
    if (list.some(a => a.genes.join() === o.genes.join())) return false;
    const a = EV().newAlgo(o); EV().stampHist(a); list.push(a);
    EV().saveAlgos(list); return true;
  }
  function onClick(e) {
    const hb = e.target.closest('[data-heat]');
    if (hb && (hb.closest('#evo-species') || hb.closest('#task-legend'))) { // hittekaart per soort/deelnemer
      const v = hb.dataset.heat, task = !!hb.closest('#task-legend'), k = v === '' ? null : task ? v : +v, view = task ? T : V;
      view.heatSel = view.heatSel === k ? null : k; if (task) taskLegend(); else legend(); view.panes.forEach(r => { r.dirty = true; });
      return;
    }
    const b = e.target.closest('[data-ev]'); if (!b) return;
    const act = b.dataset.ev, id = b.dataset.id;
    if (b.tagName === 'A') e.preventDefault();
    if (act === 'sel') { if (e.target.closest('input, textarea, select')) return; E.sel = E.sel === id ? null : id; markSel(); algoDetail(); return; }
    const a = id && id !== '*evo' ? entryById(id) : null;
    const algos = EV().loadAlgos(), mine = id ? algos.find(x => x.id === id) : null;
    const M = E.mut, H = E.hunt, B = E.bench;
    if (act === 'page') setPage(b.dataset.page);
    else if (act === 'unsel') { E.sel = null; markSel(); algoDetail(); }
    else if (act === 'sel-go') { E.sel = id; setPage('algos'); const c = document.querySelector(`#algo-grid .acard.sel`); if (c) c.scrollIntoView({ block: 'nearest' }); }
    else if (act === 'save-champ') saveChamp();
    else if (act === 'save-any' && a) { note(addAlgo({ name: a.name, genes: a.genes, born: a.born || a.gen || 0, parents: a.parents || [] }) ? `${a.name} bewaard.` : 'Stond er al.'); afterSave(); }
    else if (act.startsWith('task-') && TASKS[act.slice(5)]) openTask(act.slice(5), a);
    else if (act === 'tree') { E.treeSel = id; setPage('ana'); }
    else if (act === 'seed' && a) { seed(a); setPage('evolve'); }
    else if (act === 'run') toggleRun();
    else if (act === 'skip') { if (V.phase === 'run') finishNow(); else startGen(); }
    else if (act === 'turbo') turbo(+b.dataset.turbo);
    else if (act === 'mm') { A.S.evoMazeMode = b.dataset.mm; A.save(); makePanes(); startGen(); evoBar(); }
    else if (act === 'reset') {
      if (!confirm('Opnieuw beginnen? De huidige populatie en grafiek gaan weg (bewaarde algoritmes blijven).')) return;
      E.turbo = 0; fresh(A.S.evoSeedSaved ? EV().loadAlgos() : []); refreshUI(true); startGen(); evoBar();
    }
    // taak algemeen
    else if (act === 'next-task') { stopTask(); E.task = null; taskRender(); }
    else if (act === 'save-ver') { if (E.task && E.task.kind === 'bench') benchSave(); else if (E.task && E.task.kind === 'mut') mutSave(); }
    else if (act === 'task-maze' && E.task) {
      T.salt++; T.forced = null; T.mazes = []; if (H) H.sel = -1;
      const k = E.task.kind;
      if (k === 'bench') benchRide();
      else if (k === 'duel' && E.duel && E.duel.list) startDuel(E.duel.pick, false);
      else if (k === 'why') { E.xp = { last: null }; startShow('solo', T.show ? T.show.list : [{ id: 'why', name: E.task.algo.name, genes: E.task.algo.genes, col: '#ffd34d' }]); T.running = false; E.task.step = 'pick'; stepsRender(); taskIn(); taskOut(); }
      else if (!(M && M.busy)) startShow(T.show && T.show.kind !== 'mut' ? T.show.kind : 'preview', T.show && T.show.kind !== 'mut' ? T.show.list : [{ id: 'prev', name: E.task.algo.name, genes: E.task.algo.genes, col: '#ffd34d' }]);
    }
    // werkbank
    else if (act === 'bench-ride') benchRide();
    else if (act === 'bench-duel' && B) duelNow([{ ...B.src }, { id: 'bench-edit', name: B.name, genes: B.genes }]);
    else if (act === 'bench-reset' && B) { B.genes = B.src.genes.slice(); taskIn(); benchRide(); }
    else if (act === 'bench-nudge' && B) {
      const r = ML.makeRng(Math.random()), G = EV().GENES;
      B.genes = B.genes.map((v, i) => r() < 0.4 ? EV().clamp(v + (r() * 2 - 1) * (G[i].hi - G[i].lo) * 0.12, i) : v).map(v => Math.round(v * 10) / 10);
      taskIn(); benchRide();
    }
    // duel
    else if (act === 'duel-start' && E.duel) startDuel(E.duel.pick, true);
    else if (act === 'duel-again' && E.duel) { T.salt++; T.forced = null; T.mazes = []; startDuel(E.duel.pick, false); }
    // mutanten
    else if (act === 'mut-go' && M) { M.rounds = +M.rounds; M.round = 0; M.log = []; M.orig = M.src.genes.slice(); M.origName = M.bestName || M.origName; mutRound(); }
    else if (act === 'mut-stop' && M) { M.busy = false; if (T.show && T.show.kind === 'mut' && T.phase === 'run') { T.running = false; } setStep(M.res ? 'done' : 'pick'); taskIn(); }
    else if (act === 'mut-bench' && M) openTask('bench', { id: M.src.id, name: M.bestName || M.src.name, genes: M.src.genes, ver: M.src.ver, folder: M.src.folder, tags: M.src.tags });
    else if (act === 'mut-duel' && M) duelNow([{ id: 'mut-orig', name: M.origName, genes: M.orig0 }, { id: 'mut-best', name: M.bestName || 'Beste mutant', genes: M.src.genes }]);
    // zoeker
    else if (act === 'hunt-go' && H) { if (H.running) H.running = false; else huntRun(); }
    else if (act === 'hunt-watch') huntShow(+b.dataset.i, false);
    else if (act === 'hunt-duel') huntShow(+b.dataset.i, true);
    else if (act === 'hunt-train' && H) {
      A.S.evoHunt = H.found.map(f => f.sp); A.S.evoMazeMode = 'hunt'; A.save(); makePanes(); startGen(); evoBar();
      note(`De evolutie traint nu op ${A.S.evoHunt.length} moeilijke doolhoven (Evolueren).`); taskIn();
    }
    // uitleg
    else if (act === 'why-step') whyStep(1);
    else if (act === 'why-10') whyStep(10);
    else if (act === 'why-back') whyStep(-1);
    else if (act === 'why-back10') whyStep(-10);
    else if (act === 'why-restart') { const o = whyWalker(); if (o) whyStep(-o.w.steps); }
    else if (act === 'why-play') whyPlay();
    // eregalerij, rapport, bibliotheek
    else if (act === 'save-fame' && a) { note(addAlgo({ name: a.name, genes: a.genes, born: a.born || a.gen, parents: a.parents || [] }) ? `${a.name} bewaard.` : 'Stond er al.'); famRender(); afterSave(); }
    else if (act === 'del-fame') { EV().delFame(id); famRender(); }
    else if (act === 'report') report();
    else if (act === 'export') exportAlgos();
    else if (act === 'import') $('#evo-file').click();
    else if (act === 'paste') pasteCode();
    else if (act === 'code' && mine) { const code = EV().toCode(mine); (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => note('Deelcode gekopieerd.'), () => prompt('Kopieer deze code', code)); }
    else if (act === 'del' && mine) {
      const kids = algos.filter(x => x.parent === mine.id).length;
      if (confirm(`${mine.name} verwijderen uit je algoritmes?${kids ? ` (${kids} nieuwere versie${kids > 1 ? 's' : ''} blijven bestaan)` : ''}`)) { EV().saveAlgos(algos.filter(x => x !== mine)); E.sel = null; afterSave(); }
    }
  }
  function toggleRun() { if (E.turbo) { E.turbo = 0; return; } V.running = !V.running; if (V.running && V.phase === 'idle') startGen(); evoBar(); }
  function whyPlay() {
    const o = whyWalker(); if (!o) return;
    if (o.w.done) whyStep(-o.w.steps);
    T.running = !(T.running && T.phase === 'run'); T.phase = 'run';
    E.task.step = 'busy'; stepsRender(); taskIn();
  }
  function exportAlgos() {
    const data = { format: 'maze-lab-dna/2', genes: EV().GENES.map(G => G.k), algos: EV().loadAlgos() };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    a.download = 'maze-lab-algoritmes.json'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function importFile(f) {
    const rd = new FileReader();
    rd.onload = () => {
      let n = 0;
      try {
        const o = JSON.parse(rd.result), NG = EV().GENES.length, str = (v, k) => typeof v === 'string' ? v.slice(0, k) : '';
        for (const x of (o.algos || [])) if (Array.isArray(x.genes) && x.genes.length === NG && x.genes.every(v => typeof v === 'number' && isFinite(v))) {
          if (addAlgo({ name: str(x.name, 40) || 'Geïmporteerd', genes: x.genes.map(EV().clamp), born: x.born | 0, parents: Array.isArray(x.parents) ? x.parents.map(p => str(p, 40)) : [],
            ver: x.ver | 0 || 1, folder: str(x.folder, 30), tags: Array.isArray(x.tags) ? x.tags.map(t => str(t, 20)).filter(Boolean) : [], note: str(x.note, 500) })) n++;
        }
      } catch (e) { /* ongeldig */ }
      note(n ? `${n} algoritme${n === 1 ? '' : 's'} geïmporteerd.` : 'Niets nieuws gevonden in dat bestand.'); afterSave(); if (E.page === 'algos') algosRender();
    };
    rd.readAsText(f);
  }
  function pasteCode() {
    const s = prompt('Plak een deelcode (begint met MLDNA1:)');
    if (!s) return;
    const o = EV().fromCode(s);
    note(!o ? 'Dat is geen geldige deelcode.' : addAlgo(o) ? `${o.name} toegevoegd.` : `${o.name} stond er al.`); afterSave();
  }

  // ---- koppeling met app.js ----
  let started = false;
  function init(app) {
    A = app;
    if (A.S.evoTaskSpeed == null) A.S.evoTaskSpeed = 75;
    if (!restore()) E.base = '';
    else speciate();
    const fo = document.querySelector('[data-key="evoFast"] option[value="max"]');
    if (fo) fo.textContent = `Maximaal (${EV().Pool.size()} kernen)`;
    document.querySelectorAll('[data-key^="evo"]').forEach(el => {
      el.addEventListener('input', outputs);
      el.addEventListener('change', () => {
        const k = el.dataset.key;
        if (A.S.mode !== 'evo') return;
        if (k === 'evoMazes' || k === 'evoSetN') { makePanes(); startGen(); evoBar(); }
        else if (k === 'evoPop') { resizePop(); startGen(); evoBar(); }
        else if (k === 'evoColor') { if (V.runs) V.runs.forEach(run => run.ws.forEach(w => { w.col = colorFor(w.ge); })); legend(); }
        else if (['evoGrid', 'evoSize', 'evoBraid', 'evoPuzzle', 'evoMakers'].includes(k)) { startGen(); evoBar(); }
        else if (k === 'evoIslands') { EV().assignIslands(E.pop, isl()); speciate(); persist(); status(); note(isl() > 1 ? `${isl()} eilanden: elk eiland evolueert apart; elke 8 generaties verhuist de beste naar het volgende eiland.` : 'Weer één populatie.'); }
        else if (k === 'evoRuns') status();
      });
    });
    const view = $('#view-evo');
    view.addEventListener('click', onClick);
    document.querySelectorAll('#evo-tabs [data-page]').forEach(b => b.addEventListener('click', () => setPage(b.dataset.page)));
    $('#evo-file').addEventListener('change', e => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });
    view.addEventListener('input', e => {
      const t = e.target;
      if (t.id === 'lib-q') { E.libQ = t.value; algoGrid(); }
      else if (t.dataset.g != null) benchInput(t);
      else if (t.id === 'bench-name' && E.bench) E.bench.name = t.value;
    });
    view.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'lib-folder') { E.libFolder = t.value; algoGrid(); }
      else if (t.id === 'lib-sort') { E.libSort = t.value; algoGrid(); }
      else if (t.dataset.f) libField(t);
      else if (t.dataset.mut && E.mut) { const k = t.dataset.mut; E.mut[k] = k === 'heavy' ? t.checked : k === 'str' ? t.value : +t.value; if (k === 'heavy' && t.checked) setTimeout(() => { EV().heavyScore(E.mut.orig); taskOut(); }, 30); }
      else if (t.dataset.hunt && E.hunt) E.hunt.grids = t.value;
      else if (t.dataset.duel != null && E.duel) {
        const id = t.dataset.duel;
        if (t.checked) { if (E.duel.pick.length >= 4) { t.checked = false; note('Een duel heeft hooguit 4 deelnemers.'); return; } const x = entryById(id); if (x) E.duel.pick.push(pick(x)); }
        else E.duel.pick = E.duel.pick.filter(p => p.id !== id);
        taskIn();
      }
    });
    new ResizeObserver(() => drawChart()).observe($('#cv-evo'));
    outputs(); legend(); evoBar();
  }
  function resizePop() {
    const N = Number(A.S.evoPop);
    if (E.pop.length > N) E.pop = E.pop.slice().sort((a, b) => (b.fit || 0) - (a.fit || 0)).slice(0, N);
    const r = rng();
    while (E.pop.length < N) E.pop.push(EV().genome(EV().randomGenes(r), E.gen, [], { isl: E.pop.length % isl() }));
    speciate(); persist();
  }
  function enter() {
    if (!E.pop.length || !E.base) fresh([]);
    if (!started) {
      started = true; makePanes(); setPage(E.page);
      requestAnimationFrame(() => { startGen(); refreshUI(true); evoBar(); });
      // zware testbaan op de achtergrond klaarzetten (8 grote doolhoven bouwen duurt even)
      setTimeout(() => {
        EV().heavyScore(EV().PRESETS[0].genes); if (E.champ && E.champ.heavy == null) E.champ.heavy = EV().heavyScore(E.champ.genes).score;
        refreshUI(true); if (E.page === 'algos') { algoGrid(); algoDetail(); }
      }, 1500);
    } else setPage(E.page);
  }
  function key(e) {
    if (e.key === ' ') {
      e.preventDefault();
      if (E.page === 'task' && E.task && E.task.kind === 'why') whyPlay(); else toggleRun();
    }
    else if (e.key === 't') turbo(25);
    else if ((e.key === 'v' || e.key === 'Enter') && E.page === 'evolve') { if (V.phase === 'run') finishNow(); else startGen(); }
    else if (e.key === 'b') saveChamp();
    else if (e.key === 'l') setPage('algos');
    else if (e.key === 'Escape') { if (E.page === 'algos' && E.sel) { E.sel = null; markSel(); algoDetail(); } else if (E.page !== 'algos') setPage('algos'); }
  }
  function setPalette(p) { V.panes.concat(T.panes).forEach(r => r.setPalette(p)); }

  ML.EvoUI = { init, enter, frame, key, setPalette };
})(window.ML = window.ML || {});
