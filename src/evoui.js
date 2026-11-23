// Tab Evolutie (startscherm): zwerm waarin elke loper eigen DNA heeft, gekleurd per soort (familie).
// Na elke generatie: selectie → kinderen → nieuwe generatie. Kampioen wordt getoetst op een vaste testbaan.
// Lade rechts: Bibliotheek (versies, mappen, labels, notities, geschiedenis), Werkbank (genen tweaken + proefrit)
// en Duel (2–4 algoritmes in hetzelfde doolhof + testbaan per doolhof-soort).
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
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let A = null; // { Runner, S, save, pal }

  // E = toestand van de evolutie
  const E = { pop: [], gen: 0, hist: [], base: '', champ: null, species: [], spSeq: 0, spMap: new Map(), spThr: SP_THR,
    mazes: [], panes: [], runs: null, running: true, show: null, salt: 0,
    phase: 'idle', firstT: null, endT: 0, lastT: 0, turbo: 0, turboN: 0, turboDone: 0, turboT0: 0, uiT: 0, rankT: 0, saveT: 0,
    msg: '', msgT: 0, seen: new Set(), drawer: null, libOpen: null, libQ: '', libFolder: '', libSort: 'score', duelSel: new Map(), duel: null, bench: null,
    mut: null, hunt: null, forced: null, heatSel: null, xp: null };

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
  const mazeSeed = (i, gen) => (mm() === 'new' ? `${E.base}|g${gen}|${i}` : `${E.base}|vast|${i}`) + (E.show && E.salt ? `|x${E.salt}` : '');

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
    E.panes = [];
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'pane';
      el.innerHTML = '<div class="pane-head"><span class="ev-lab"></span><span class="rank"></span></div><div class="pane-cv"><canvas></canvas></div><div class="pane-stats"></div>';
      grid.appendChild(el);
      const r = new A.Runner(el.querySelector('canvas'));
      r.el = el; r.setPalette(A.pal());
      E.panes.push(r);
    }
  }
  function mazesFor(gen) { // turbo: zonder panelen
    if (mm() === 'hunt') return huntMazes();
    const asp = E.aspect || 0.66, out = [];
    for (let i = 0; i < nEval(); i++) { const sd = mazeSeed(i, gen); E.seen.add(sd + '|' + i); out.push(EV().buildMaze(opts(), sd, i, asp)); }
    return out;
  }
  // zelfde doolhoven als mazesFor, maar als beschrijving: de workers bouwen ze zelf
  function specsFor(gen, look) { // look = alleen vooruitkijken (niet als gezien tellen)
    const asp = E.aspect || 0.66, o = opts(), out = [];
    for (let i = 0; i < nEval(); i++) { const sd = mazeSeed(i, gen); if (!look) E.seen.add(sd + '|' + i); out.push({ o, sd, i, asp }); }
    return out;
  }
  function huntMazes() { const l = huntSet().map(sp => EV().specMaze(sp, HUNT_ASP)); l.forEach(mz => E.seen.add(mz.key)); return l; }

  // ---- generatie (of kijk/duel) zichtbaar laten lopen ----
  function startGen() {
    if (!E.panes.length) return;
    const asp = E.panes[0].aspect(), show = E.show, cnt = show ? E.panes.length : nEval();
    E.aspect = asp; E.mazes = [];
    if (show && E.forced) E.mazes = [E.forced];
    else if (mm() === 'hunt' && huntSet().length) E.mazes = huntMazes().slice(0, cnt);
    else for (let i = 0; i < cnt; i++) { const sd = mazeSeed(i, E.gen); if (!show) E.seen.add(sd + '|' + i); E.mazes.push(EV().buildMaze(opts(), sd, i, asp)); }
    const list = show ? show.list : E.pop;
    E.runs = E.mazes.slice(0, E.panes.length).map((mz, i) => {
      const r = E.panes[i], P = mz.ctx.P;
      r.s = mz.s; r.genId = mz.gen; r.m = mz.m; r.P = P; r.phase = 'evo'; r.racers = null; r.sw = null; r.fx.length = 0;
      const run = { mz, heat: new Float32Array(mz.m.cells.length), heatBy: new Map(), flash: [], order: [],
        ws: list.map((ge, k) => {
          const seed = show ? `${ge.id}|show|${E.salt}|${i}` : `${ge.id}|${E.gen}|${i}`;
          const w = new (EV().Walker)(mz.ctx, ge.genes, seed);
          w.seed = seed; w.ge = ge; w.col = show ? ge.col : colorFor(ge); w.hk = show ? 'w' + k : ge.sp; return w;
        }) };
      run.heat[mz.ctx.cellOf[P.start]] = list.length;
      if (E.xp && i === 0) E.xp.last = null;
      r.vs = { cur: -1, readyT: performance.now() / 1000, floorFx: (g, rr, now) => drawRun(run, g, rr, now) };
      r.dirty = true;
      const gd = ML.GENERATORS.find(x => x.id === mz.gen);
      r.el.querySelector('.ev-lab').textContent = `${GRID_NAMES[mz.s.grid] || mz.s.grid} · ${gd ? gd.name : mz.gen} · kortste ${mz.ctx.opt}`;
      return run;
    });
    E.phase = 'run'; E.firstT = null;
    E.champId = !show && E.pop.length ? E.pop.slice().sort((a, b) => (b.fit || 0) - (a.fit || 0))[0].id : null;
    if (E.heatSel != null && !legendKeys().includes(E.heatSel)) E.heatSel = null;
    paneStats(); status(); legend();
  }
  const rate = v => 2 * Math.pow(10, v / 33); // stappen per seconde per loper
  function frame(t) {
    const dt = E.lastT ? Math.min(0.05, t - E.lastT) : 0;
    E.lastT = t;
    if (E.phase === 'run' && E.running && E.runs) {
      let u = rate(A.S.evoSpeed) * dt;
      if (E.firstT != null) u *= 1 + Math.max(0, t - E.firstT) * 0.9; // na de eerste aankomst versnellen
      let alive = 0;
      for (const run of E.runs) {
        for (const w of run.ws) {
          if (w.done) continue;
          w.p += u;
          let k = 0;
          while (w.p >= 1 && !w.done && k++ < 600) {
            w.p -= 1; w.step(); run.heat[w.nc]++; heatAdd(run, w);
            if (w.done && w.reached) { run.order.push(w); run.flash.push({ t, col: w.col }); if (E.firstT == null) E.firstT = t; }
          }
          if (w.done) w.p = 1; else alive++;
        }
      }
      if (!alive) endGen(t); else if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) { paneStats(); if (E.drawer === 'why') whyTable(); }
    } else if (E.phase === 'pause' && E.running && t > E.endT) {
      if (E.show) { E.phase = 'idle'; E.running = false; toolbar(); } else startGen();
    }
    E.panes.forEach(r => { if (E.phase === 'run') r.dirty = true; r.draw(t); });
    if (E.msg && t - E.msgT > 6) { E.msg = ''; champCard(); }
  }
  function finishNow() { // "volgende generatie": rest direct uitrekenen
    if (E.phase !== 'run' || !E.runs) return;
    const t = performance.now() / 1000;
    for (const run of E.runs) for (const w of run.ws) { while (!w.done) { w.step(); run.heat[w.nc]++; heatAdd(run, w); } w.p = 1; if (w.reached && !run.order.includes(w)) run.order.push(w); }
    endGen(t);
  }
  function endGen(t) {
    E.phase = 'pause'; E.endT = t + (E.show ? 0.1 : 1.1);
    paneStats(true);
    if (E.show) { if (E.show.kind === 'duel') duelDone(); else if (E.show.kind === 'mut') mutDone(); if (E.drawer === 'why') whyRender(); status(); return; }
    // fitness = gemiddelde score over alle doolhoven × runs (zichtbare + verborgen; zelfde zaadjes als turbo/evalList)
    const vis = E.runs.length, hidden = E.mazes.slice(vis), R = runs();
    E.pop.forEach((ge, j) => {
      let s = 0, ok = 0, st = 0;
      const add = w => { s += w.score(); if (w.reached) ok++; st += w.steps; };
      E.runs.forEach((run, i) => { add(run.ws[j]); for (let r = 1; r < R; r++) add(EV().evalOne(run.mz.ctx, ge.genes, `${ge.id}|${E.gen}|${i}|r${r}`)); });
      hidden.forEach((mz, k) => { for (let r = 0; r < R; r++) add(EV().evalOne(mz.ctx, ge.genes, `${ge.id}|${E.gen}|${vis + k}` + (r ? '|r' + r : ''))); });
      ge.fit = s / (E.mazes.length * R); ge.ok = ok; ge.steps = st;
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
        if (pos && E.drawer === 'fame' && !quiet) famRender();
      }
    }
  }
  function refreshUI(rank) { drawChart(); champCard(); legend(); status(); if (rank) { rankList(); if (E.drawer === 'lib') libList(); else if (E.drawer === 'fame') famRender(); } }
  function note(s) { E.msg = s; E.msgT = performance.now() / 1000; }

  // ---- turbo: generaties zonder animatie (×25 / ×100 / ×1000 / tot ik stop) ----
  async function turbo(n) {
    if (E.turbo) { E.turbo = 0; return; }
    E.show = null; E.phase = 'idle'; E.turbo = n || Infinity; E.turboN = n || 0; E.turboDone = 0; E.turboT0 = performance.now();
    if (E.panes[0]) E.aspect = E.panes[0].aspect();
    toolbar();
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
    flushPend(); E.turbo = 0; persist(); refreshUI(true); toolbar(); startGen();
  }

  // ---- tekenen in een paneel ----
  // hittekaart per soort (zwerm) of per deelnemer (kijken/duel/mutanten): sleutel w.hk
  function heatAdd(run, w) {
    let h = run.heatBy.get(w.hk);
    if (!h) { h = new Float32Array(run.heat.length); h[run.mz.ctx.cellOf[run.mz.ctx.start]] = 1; run.heatBy.set(w.hk, h); }
    h[w.nc]++;
  }
  function drawRun(run, g, r, now) {
    const m = run.mz.m, C = m.cells, s = r.s, show = E.show, rad = Math.max(1.6, s * (show ? 0.17 : 0.1)), hs = E.heatSel;
    ML.drawHeat(g, r, m, hs != null ? run.heatBy.get(hs) || new Float32Array(run.heat.length) : run.heat, show ? 0.4 : 0.5);
    const by = new Map();
    let lead = null, ld = 1e9, champ = null;
    for (const w of run.ws) {
      if (w.done && !w.reached) continue;
      if (hs != null && w.hk !== hs) continue; // alleen de gekozen soort
      if (w.ge.id === E.champId) champ = w;
      if (w.reached) continue;
      const d = run.mz.ctx.dist[w.nc]; if (d < ld) { ld = d; lead = w; }
      const p = posOf(w, C), X = r.X(p[0]), Y = r.Y(p[1]);
      let path = by.get(w.col); if (!path) by.set(w.col, path = new Path2D());
      path.moveTo(X + rad, Y); path.arc(X, Y, rad, 0, TAU);
    }
    g.save();
    // kijken/duel: het pad dat elke loper nu "denkt" (stapel), elk in eigen kleur, iets verschoven
    if (show && run.ws.length <= 4) {
      const cellOf = run.mz.ctx.cellOf, k0 = (run.ws.length - 1) / 2;
      g.lineCap = g.lineJoin = 'round'; g.lineWidth = Math.max(2, s * (run.ws.length > 1 ? 0.1 : 0.14));
      run.ws.forEach((w, k) => {
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
    if (lead && !show) ring(lead, 'rgba(255,243,176,0.9)', 2.2);
    if (champ && !show && !champ.reached) ring(champ, '#ffffff', 1.7);
    // aankomst-flitsen bij het doel
    const gc = C[m.goal].center, gx = r.X(gc[0]), gy = r.Y(gc[1]);
    run.flash = run.flash.filter(f => now - f.t < 0.9);
    for (const f of run.flash) { const e = (now - f.t) / 0.9; g.globalAlpha = 0.8 * (1 - e); g.strokeStyle = f.col; g.lineWidth = Math.max(1.5, s * 0.07); g.beginPath(); g.arc(gx, gy, s * (0.3 + e * 1.6), 0, TAU); g.stroke(); }
    g.globalAlpha = 1;
    if (E.drawer === 'why' && show && show.kind === 'solo' && run === E.runs[0]) drawWhy(run, g, r);
    g.restore();
    return E.phase === 'run' || run.flash.length > 0;
  }
  function posOf(w, C) {
    const a = C[w.c].center, b = C[w.nc].center;
    let e = Math.min(1, w.p);
    if (w.jump) e = e < 0.5 ? 0 : 1;
    return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
  }
  function paneStats(final) {
    if (!E.runs) return;
    E.runs.forEach((run, i) => {
      const el = E.panes[i] && E.panes[i].el; if (!el) return;
      const n = run.ws.length, ok = run.order.length, f = run.order[0], show = E.show;
      let txt;
      if (show && show.kind === 'mut') txt = `${ok}/${n} gehaald` + (f ? ` · eerste: ${f.ge.name} (${f.steps} st.)` : '');
      else if (show && show.kind === 'duel') txt = run.ws.map(w => `${w.ge.name}: ${w.reached ? w.steps + ' ✓' : w.done ? '✗' : w.steps + '…'}`).join(' · ');
      else if (show) { const w = run.ws[0]; txt = w.reached ? `Gehaald in ${w.steps} stappen (kortste ${run.mz.ctx.opt}) · score ${Math.round(w.score() * 100)}` : final ? 'Niet gehaald binnen de limiet' : `${w.steps} stappen…`; }
      else txt = `${ok}/${n} gehaald` + (f ? ` · eerste: ${f.ge.name} (${f.steps} st.)` : '') + (i === 0 && E.mazes.length > E.runs.length ? ` · +${E.mazes.length - E.runs.length} doolhoven op de achtergrond` : '');
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
    const L = 34 * d, R = 10 * d, T = 22 * d, B = 20 * d, hs = E.hist, bc = EV().bestClassic();
    let top = bc.t.score; for (const h of hs) { if (h.best > top) top = h.best; if (h.test > top) top = h.test; }
    const ymax = Math.min(100, Math.max(40, Math.ceil(top / 10) * 10 + 5));
    const n = Math.max(2, hs.length), X = i => L + (W - L - R) * i / (n - 1), Y = v => T + (H - T - B) * (1 - v / ymax);
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
  function dnaHtml(genes) {
    return '<div class="dna">' + EV().GENES.map((G, i) => {
      const v = genes[i], z = G.k === 'chaos' ? (v - G.lo) / (G.hi - G.lo) : v / G.hi, w = Math.abs(z) * 50;
      const st = G.k === 'chaos' ? `left:0;width:${z * 100}%` : z >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`;
      return `<div class="gene" title="${esc(G.name)}: ${v.toFixed(2)}"><span>${esc(G.name)}</span><b><i style="${st};background:${G.col}"></i></b></div>`;
    }).join('') + '</div>';
  }
  const isSaved = genes => EV().loadAlgos().some(a => a.genes.join() === genes.join());
  function champCard() {
    const el = $('#evo-champ'); if (!el) return;
    const c = E.champ, bc = EV().bestClassic();
    if (!c) { el.innerHTML = `${E.msg ? `<div class="evo-msg">${esc(E.msg)}</div>` : ''}<h4>Kampioen</h4><p class="hint">Nog geen generatie klaar. Kijk mee, of druk op een Turbo-knop.</p>`; return; }
    const saved = isSaved(c.genes), diff = Math.round((c.test - bc.t.score) * 10) / 10;
    el.innerHTML = `${E.msg ? `<div class="evo-msg">${esc(E.msg)}</div>` : ''}
      <h4><i class="sw" style="background:${EV().colorOf(c.genes)}"></i>${esc(c.name)} <small>${c.from ? 'klassieker ' + esc(c.from) : 'geboren in generatie ' + c.born}${c.parents && c.parents.length ? ' · ouders ' + c.parents.map(esc).join(' × ') : ''}</small></h4>
      <div class="evo-score"><b>${c.test}</b><span>testbaan<br>${diff >= 0 ? `<em class="up">+${diff}</em>` : `<em class="down">${diff}</em>`} t.o.v. ${esc(bc.p.name)}</span>${c.heavy != null ? `<b class="hv">${c.heavy}</b><span>zware<br>testbaan</span>` : ''}</div>
      <p class="desc">${esc(EV().describe(c.genes))}</p>
      ${dnaHtml(c.genes)}
      <div class="btns"><button class="btn${saved ? '' : ' primary'}" data-ev="save-champ"${saved ? ' disabled' : ''}>${saved ? 'Bewaard ✓' : 'Bewaar'}</button><button class="btn" data-ev="bench" data-id="${esc(c.id)}">Werkbank</button><button class="btn" data-ev="watch" data-id="${esc(c.id)}">Kijk alleen</button><button class="btn" data-ev="mut-src" data-id="${esc(c.id)}" title="Mutantenlab">🧬</button><button class="btn" data-ev="hunt-src" data-id="${esc(c.id)}" title="Doolhof-zoeker">🎯</button></div>`;
  }

  // ---- alle algoritmes (klassiekers + bibliotheek + kampioen) ----
  function entries() {
    const Ev = EV(), mine = Ev.loadAlgos().map(a => ({ ...a, mine: true }));
    const list = [...Ev.PRESETS, ...mine];
    if (E.champ && !E.champ.from && !mine.some(a => a.genes.join() === E.champ.genes.join())) list.push({ ...E.champ, live: true });
    const hv = Ev.heavyReady();
    list.forEach(a => { a.t = Ev.testScore(a.genes); a.h = hv ? Ev.heavyScore(a.genes) : null; });
    return list.sort((a, b) => b.t.score - a.t.score || (b.t.solved - a.t.solved));
  }
  const entryById = id => entries().find(a => a.id === id) || (E.champ && E.champ.id === id ? E.champ : null) || (E.bench && E.bench.src.id === id ? E.bench.src : null)
    || EV().loadFame().find(a => a.id === id) || null;
  function subOf(a) {
    if (a.classic) return a.desc;
    if (a.live) return 'kampioen, nog niet bewaard';
    return [a.ver > 1 ? 'v' + a.ver : '', a.folder, `gen ${a.born}`, a.created].filter(Boolean).join(' · ');
  }
  // ---- ranglijst (links, compact) ----
  function rankList() {
    const el = $('#evo-rank'); if (!el) return;
    const list = entries(), bc = EV().bestClassic(), top = list.length ? list[0].t.score : 1;
    el.innerHTML = list.slice(0, 12).map((a, i) => {
      const beat = !a.classic && a.t.score > bc.t.score, inDuel = E.duelSel.has(a.id);
      const acts = `<button title="Kijk alleen" data-ev="watch" data-id="${esc(a.id)}">▶</button><button title="Zaai in de populatie" data-ev="seed" data-id="${esc(a.id)}">＋</button>`
        + `<button title="Werkbank: genen tweaken" data-ev="bench" data-id="${esc(a.id)}">🔧</button><button title="Mutantenlab" data-ev="mut-src" data-id="${esc(a.id)}">🧬</button><button title="Doolhof-zoeker: moeilijkste doolhoven" data-ev="hunt-src" data-id="${esc(a.id)}">🎯</button><button title="Kies voor duel" data-ev="duel-tog" data-id="${esc(a.id)}"${inDuel ? ' class="on"' : ''}>vs</button>`
        + (a.live ? `<button title="Bewaar" data-ev="save-champ">💾</button>` : '');
      return `<div class="erow${a.classic ? ' classic' : ''}${a.live ? ' live' : ''}" title="${esc(EV().describe(a.genes))}">
        <b class="pos">${i + 1}</b><i class="sw" style="background:${EV().colorOf(a.genes)}"></i>
        <span class="nm">${beat ? '🏆 ' : ''}${esc(a.name)}<small>${esc(subOf(a))}</small></span>
        <span class="sc">${a.t.score}<small title="zware testbaan">${a.h ? 'zwaar ' + a.h.score : a.t.solved + '/' + a.t.of}</small></span>
        <span class="bar"><i style="width:${Math.max(2, a.t.score / Math.max(1, top) * 100)}%"></i></span>
        <span class="acts">${acts}</span></div>`;
    }).join('') + (list.length > 12 ? `<p class="hint">+${list.length - 12} meer in de bibliotheek</p>` : '');
  }

  // ======================= Lade: Bibliotheek / Werkbank / Duel =======================
  function openDrawer(tab) {
    if (tab !== 'why') E.xp = null;
    E.drawer = tab;
    $('#view-evo').classList.add('drawer');
    document.querySelectorAll('#evo-drawer [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    renderDrawer();
  }
  function closeDrawer() { E.drawer = null; E.xp = null; $('#view-evo').classList.remove('drawer'); E.panes.forEach(r => { r.dirty = true; }); }
  function renderDrawer() {
    const body = $('#evo-dbody'); if (!body || !E.drawer) return;
    if (E.drawer === 'lib') libRender();
    else if (E.drawer === 'bench') benchRender();
    else if (E.drawer === 'duel') duelRender();
    else if (E.drawer === 'fame') famRender();
    else if (E.drawer === 'mut') mutRender();
    else if (E.drawer === 'hunt') huntRender();
    else if (E.drawer === 'tree') treeRender();
    else if (E.drawer === 'why') whyRender();
  }

  // ---- Bibliotheek ----
  function libRender() {
    const algos = EV().loadAlgos();
    let dirty = false; algos.forEach(a => { if (EV().stampHist(a)) dirty = true; });
    if (dirty) EV().saveAlgos(algos);
    const folders = [...new Set(algos.map(a => a.folder).filter(Boolean))].sort();
    $('#evo-dbody').innerHTML = `
      <div class="lib-tools">
        <input type="search" id="lib-q" placeholder="Zoek op naam, label of notitie" value="${esc(E.libQ)}">
        <select id="lib-folder"><option value="">Alles</option><option value="*mine">Alleen eigen</option><option value="*classic">Klassiekers</option>${folders.map(f => `<option value="${esc(f)}">📁 ${esc(f)}</option>`).join('')}</select>
        <select id="lib-sort"><option value="score">Beste eerst</option><option value="new">Nieuwste eerst</option><option value="name">Naam</option></select>
      </div>
      <datalist id="lib-folders">${folders.map(f => `<option value="${esc(f)}">`).join('')}</datalist>
      <div class="lib-list" id="lib-list"></div>
      <div class="lib-foot" id="lib-foot"></div>`;
    $('#lib-folder').value = folders.includes(E.libFolder) || E.libFolder.startsWith('*') ? E.libFolder : '';
    $('#lib-sort').value = E.libSort;
    libList();
  }
  function libList() {
    const el = $('#lib-list'); if (!el) return;
    const q = E.libQ.trim().toLowerCase(), f = E.libFolder;
    let list = entries().filter(a => {
      if (f === '*mine' && !a.mine) return false;
      if (f === '*classic' && !a.classic) return false;
      if (f && !f.startsWith('*') && a.folder !== f) return false;
      if (!q) return true;
      return [a.name, a.note, a.folder, (a.tags || []).join(' '), a.desc].join(' ').toLowerCase().includes(q);
    });
    if (E.libSort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (E.libSort === 'new') list.sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || String(b.created || '').localeCompare(String(a.created || '')) || (a.classic ? 1 : 0) - (b.classic ? 1 : 0));
    el.innerHTML = list.length ? list.map(a => libRow(a)).join('') : '<p class="hint">Niets gevonden.</p>';
    const sel = [...E.duelSel.values()];
    $('#lib-foot').innerHTML = `
      <div class="duelbar"><b>Duel</b> <span>${sel.length ? sel.map(s => esc(s.name)).join(', ') : 'kies 2–4 algoritmes met vs'}</span>
        <button class="btn primary" data-ev="duel-start"${sel.length < 2 ? ' disabled' : ''}>Start duel</button>${sel.length ? '<button class="btn" data-ev="duel-clear">Wis</button>' : ''}</div>
      <div class="btns"><button class="btn" data-ev="export">Exporteer</button><button class="btn" data-ev="import">Importeer</button><button class="btn" data-ev="paste">Plak code</button></div>`;
  }
  function libRow(a) {
    const open = E.libOpen === a.id, inDuel = E.duelSel.has(a.id);
    const tags = (a.tags || []).map(t => `<em class="tag">${esc(t)}</em>`).join('');
    const h = a.hist || [], prev = h.length > 1 ? h[h.length - 2].s : null;
    let html = `<div class="lrow${open ? ' open' : ''}${a.classic ? ' classic' : ''}${a.live ? ' live' : ''}" data-ev="lib-open" data-id="${esc(a.id)}">
      <i class="sw" style="background:${EV().colorOf(a.genes)}"></i>
      <span class="nm">${esc(a.name)}${a.ver > 1 && !/ v\d+$/.test(a.name) ? ` <em class="ver">v${a.ver}</em>` : ''}${tags}<small>${esc(subOf(a))}</small></span>
      <span class="sc">${a.t.score}<small>${a.h ? 'zwaar ' + a.h.score + ' · ' : ''}${a.t.solved}/${a.t.of}${prev != null && prev !== a.t.score ? ` · was ${prev}` : ''}</small></span>
      <button class="duel-tog${inDuel ? ' on' : ''}" data-ev="duel-tog" data-id="${esc(a.id)}" title="Kies voor duel">vs</button></div>`;
    if (open) html += libDetail(a);
    return html;
  }
  function lineage(a) {
    const algos = EV().loadAlgos(), find = id => algos.find(x => x.id === id) || EV().PRESETS.find(p => p.id === id);
    const chain = []; let cur = a, guard = 0;
    while (cur && cur.parent && guard++ < 20) { const p = find(cur.parent); if (!p) break; chain.unshift(p); cur = p; }
    const kids = a.id ? algos.filter(x => x.parent === a.id) : [];
    return { chain, kids };
  }
  function libDetail(a) {
    const id = esc(a.id), common = `<button class="btn" data-ev="bench" data-id="${id}">Werkbank</button><button class="btn" data-ev="watch" data-id="${id}">Kijk alleen</button><button class="btn" data-ev="seed" data-id="${id}">Zaai</button>`
      + `<button class="btn" data-ev="mut-src" data-id="${id}">🧬 Mutanten</button><button class="btn" data-ev="hunt-src" data-id="${id}">🎯 Zoeker</button><button class="btn" data-ev="why-of" data-id="${id}">Uitleg</button>`;
    const cats = EV().TEST_CATS.map(c => `<span>${esc(c.name)} <b>${a.t.cats[c.k]}</b></span>`).join('') + (a.h ? `<span>Zware testbaan <b>${a.h.score}</b> (${a.h.solved}/${a.h.of})</span>` : '')
      + (a.mine ? '<span>🧬 ook als oplosser in Bouwen, Lab en Kijken</span>' : '');
    let html = `<div class="ldet" data-id="${id}"><p class="desc">${esc(EV().describe(a.genes))}</p>${dnaHtml(a.genes)}<div class="cats">${cats}</div>`;
    if (a.mine) {
      const { chain, kids } = lineage(a);
      html += `
        <label class="frow"><span>Naam</span><input data-f="name" value="${esc(a.name)}" maxlength="40"></label>
        <label class="frow"><span>Map</span><input data-f="folder" list="lib-folders" value="${esc(a.folder)}" placeholder="bv. Snelle lopers"></label>
        <label class="frow"><span>Labels</span><input data-f="tags" value="${esc((a.tags || []).join(', '))}" placeholder="komma's ertussen"></label>
        <label class="frow"><span>Notitie</span><textarea data-f="note" rows="2" placeholder="Wat is er bijzonder aan?">${esc(a.note)}</textarea></label>
        <div class="tree"><b>Stamboom</b> ${chain.length ? chain.map(p => esc(p.name) + (p.ver > 1 ? ' v' + p.ver : '')).join(' → ') + ' → ' : ''}<u>${esc(a.name)}</u>${kids.length ? ` · nieuwere versies: ${kids.map(k => esc(k.name)).join(', ')}` : ''}${a.parents && a.parents.length && !a.parent ? ` · ouders ${a.parents.map(esc).join(' × ')}` : ''}</div>
        <div class="tree"><b>Testscore</b> ${(a.hist || []).slice(-6).map(h => `${esc(h.d)}: ${h.s}`).join(' · ') || '—'}</div>
        <div class="btns">${common}<button class="btn" data-ev="code" data-id="${id}">Deelcode</button><button class="btn" data-ev="del" data-id="${id}">Verwijder</button></div>`;
    } else if (a.live) html += `<div class="btns"><button class="btn primary" data-ev="save-champ">Bewaar</button>${common}</div>`;
    else html += `<div class="btns">${common}</div>`;
    return html + '</div>';
  }
  function libField(el) {
    const det = el.closest('.ldet'); if (!det) return;
    const algos = EV().loadAlgos(), a = algos.find(x => x.id === det.dataset.id); if (!a) return;
    const f = el.dataset.f, v = el.value;
    if (f === 'name') { if (!v.trim()) return; a.name = v.trim().slice(0, 40); }
    else if (f === 'folder') a.folder = v.trim().slice(0, 30);
    else if (f === 'tags') a.tags = v.split(',').map(s => s.trim()).filter(Boolean).slice(0, 8).map(s => s.slice(0, 20));
    else if (f === 'note') a.note = v.slice(0, 500);
    EV().saveAlgos(algos);
    if (f === 'folder') libRender(); else libList();
    rankList();
  }

  // ---- Werkbank ----
  function openBench(a) {
    if (!a) return;
    E.turbo = 0;
    const src = { id: a.id, name: a.name, genes: a.genes.slice(), mine: !!a.mine, classic: !!a.classic, ver: a.ver || 1, folder: a.folder || '', tags: a.tags || [] };
    E.bench = { src, genes: a.genes.slice(), name: `${a.name.replace(/ v\d+$/, '')} v${src.ver + 1}` };
    openDrawer('bench'); benchRide();
  }
  function benchRender() {
    const el = $('#evo-dbody'), B = E.bench;
    if (!B) { el.innerHTML = '<p class="hint">Open een algoritme in de werkbank via 🔧 in de ranglijst of bibliotheek, of met de knop Werkbank bij de kampioen.</p>'; return; }
    el.innerHTML = `
      <p class="hint" style="margin-top:0">Schuif aan de genen van <b>${esc(B.src.name)}</b>. Elke wijziging start meteen een proefrit op het doolhof links; de testbaan rekent mee.</p>
      <label class="frow"><span>Naam</span><input id="bench-name" value="${esc(B.name)}" maxlength="40"></label>
      <div class="bench-sl">${EV().GENES.map((G, i) => `<label class="bsl" title="+ ${esc(G.pos)} · − ${esc(G.neg)}"><span><i class="sw" style="background:${G.col}"></i>${esc(G.name)}</span>
        <span class="bw"><input type="range" data-g="${i}" min="${G.lo}" max="${G.hi}" step="0.1" value="${B.genes[i]}"><s style="left:${(B.src.genes[i] - G.lo) / (G.hi - G.lo) * 100}%" title="origineel ${B.src.genes[i].toFixed(1)}"></s></span><output>${B.genes[i].toFixed(1)}</output></label>`).join('')}</div>
      <p class="desc" id="bench-desc">${esc(EV().describe(B.genes))}</p>
      <div id="bench-score"></div>
      <div class="btns"><button class="btn primary" data-ev="bench-save">Bewaar als nieuwe versie</button><button class="btn" data-ev="bench-duel">Vergelijk met origineel</button></div>
      <div class="btns"><button class="btn" data-ev="bench-ride">Proefrit opnieuw</button><button class="btn" data-ev="bench-nudge">Kleine mutatie</button><button class="btn" data-ev="bench-reset">Terug naar origineel</button></div>`;
    benchScore();
  }
  function benchScore() {
    const el = $('#bench-score'), B = E.bench; if (!el || !B) return;
    const t = EV().testScore(B.genes), o = EV().testScore(B.src.genes), d = Math.round((t.score - o.score) * 10) / 10;
    const sign = v => v > 0 ? `<em class="up">+${v}</em>` : v < 0 ? `<em class="down">${v}</em>` : '<em>±0</em>';
    el.innerHTML = `<div class="evo-score"><b>${t.score}</b><span>testbaan (${t.solved}/${t.of} gehaald)<br>${sign(d)} t.o.v. origineel ${o.score}</span></div>
      <div class="cats">${EV().TEST_CATS.map(c => `<span>${esc(c.name)} <b>${t.cats[c.k]}</b> ${sign(Math.round((t.cats[c.k] - o.cats[c.k]) * 10) / 10)}</span>`).join('')}</div>`;
  }
  let benchTimer = 0;
  function benchInput(inp) {
    const B = E.bench; if (!B) return;
    const i = +inp.dataset.g; B.genes[i] = Number(inp.value);
    inp.closest('.bsl').querySelector('output').textContent = B.genes[i].toFixed(1);
    $('#bench-desc').textContent = EV().describe(B.genes);
    clearTimeout(benchTimer); benchTimer = setTimeout(() => { benchRide(); benchScore(); }, 160);
  }
  function benchRide() {
    const B = E.bench; if (!B) return;
    E.forced = null; E.show = { kind: 'solo', list: [{ id: 'bench', name: B.name, genes: B.genes.slice(), col: '#ffd34d' }] };
    E.running = true; startGen(); toolbar();
  }
  function benchSave() {
    const B = E.bench; if (!B) return;
    const name = (($('#bench-name') || {}).value || B.name).trim().slice(0, 40) || B.name;
    const algos = EV().loadAlgos();
    if (algos.some(a => a.genes.join() === B.genes.map(v => Math.round(v * 1000) / 1000).join())) { note('Dit DNA staat al in je bibliotheek.'); champCard(); return; }
    const a = EV().newAlgo({ name, genes: B.genes, parent: B.src.id, ver: B.src.ver + 1, parents: [B.src.name], folder: B.src.folder, tags: B.src.tags,
      born: E.gen, note: `Getweakt vanaf ${B.src.name}` });
    EV().stampHist(a); algos.push(a); EV().saveAlgos(algos);
    note(`${a.name} bewaard als versie ${a.ver} van ${B.src.name}.`);
    E.bench = { src: { ...a, mine: true }, genes: a.genes.slice(), name: `${name.replace(/ v\d+$/, '')} v${a.ver + 1}` };
    benchRender(); rankList(); champCard();
  }

  // ---- Duel ----
  function startDuel(list, keepMaze) {
    if (!list || list.length < 2) return;
    E.turbo = 0; if (!keepMaze) E.forced = null;
    E.duel = { list: list.slice(0, 4).map((a, k) => ({ id: a.id || 'duel-' + k, name: a.name, genes: a.genes.slice(), col: DUEL_COLS[k] })), done: false };
    E.show = { kind: 'duel', list: E.duel.list }; E.running = true;
    openDrawer('duel'); startGen(); toolbar();
  }
  function duelDone() {
    if (!E.duel) return;
    E.duel.done = true;
    E.duel.res = E.duel.list.map((_, k) => E.runs.map(run => { const w = run.ws[k]; return { steps: w.steps, ok: w.reached, opt: run.mz.ctx.opt }; }));
    if (E.drawer === 'duel') duelRender();
  }
  function duelRender() {
    const el = $('#evo-dbody'), D = E.duel;
    if (!D) {
      const sel = [...E.duelSel.values()];
      el.innerHTML = `<p class="hint" style="margin-top:0">Laat 2–4 algoritmes tegelijk door hetzelfde doolhof lopen, elk met eigen kleur en spoor. Daarna: verschil op de testbaan en per doolhof-soort.</p>
        <p>${sel.length ? 'Gekozen: ' + sel.map(s => `<b>${esc(s.name)}</b>`).join(', ') : 'Kies algoritmes met de knop vs in de ranglijst of bibliotheek.'}</p>
        <div class="btns"><button class="btn primary" data-ev="duel-start"${sel.length < 2 ? ' disabled' : ''}>Start duel</button><button class="btn" data-ev="tab" data-tab="lib">Naar bibliotheek</button></div>`;
      return;
    }
    const cats = EV().TEST_CATS, ts = D.list.map(a => EV().testScore(a.genes));
    const best = key => Math.max(...ts.map(key));
    const cell = (v, b, base, k) => `<td class="${v === b ? 'best' : ''}">${v}${k && base != null ? `<small>${v - base > 0 ? '+' : ''}${Math.round((v - base) * 10) / 10}</small>` : ''}</td>`;
    const mazeCol = k => {
      if (!D.done || !D.res) return '<td>…</td>';
      const r = D.res[k], tot = r.reduce((s, x) => s + (x.ok ? x.steps : 0), 0), ok = r.every(x => x.ok);
      const bestTot = Math.min(...D.res.map(rr => rr.every(x => x.ok) ? rr.reduce((s, x) => s + x.steps, 0) : 1e9));
      return `<td class="${ok && tot === bestTot ? 'best' : ''}">${ok ? tot + ' st.' : '✗'}</td>`;
    };
    el.innerHTML = `<p class="hint" style="margin-top:0">${D.done ? 'Klaar.' : 'Bezig…'} Groen = beste in die kolom; kleine getallen = verschil met de eerste rij.</p>
      <div class="duel-wrap"><table class="duel"><thead><tr><th></th><th>Dit doolhof</th><th>Testbaan</th>${cats.map(c => `<th>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>
      ${D.list.map((a, k) => `<tr><th><i class="sw" style="background:${a.col}"></i>${esc(a.name)}</th>${mazeCol(k)}${cell(ts[k].score, best(t => t.score), ts[0].score, k)}${cats.map(c => cell(ts[k].cats[c.k], best(t => t.cats[c.k]), ts[0].cats[c.k], k)).join('')}</tr>`).join('')}
      </tbody></table></div>
      <div class="btns"><button class="btn primary" data-ev="duel-again">Nog een keer (ander doolhof)</button><button class="btn" data-ev="duel-stop">Stop duel</button></div>`;
  }

  // ---- Eregalerij: top 20 van alle records (automatisch bij elk nieuw record) ----
  function famRender() {
    const el = $('#evo-dbody'), list = EV().loadFame(), Ev = EV();
    if (!list.length) { el.innerHTML = '<p class="hint" style="margin-top:0">Nog leeg. Elk nieuw record van een eigen algoritme komt hier vanzelf in (top 20, ook over sessies heen).</p>'; return; }
    const heavy = Ev.heavyReady(), medal = ['🥇', '🥈', '🥉'];
    const acts = a => `<button title="Kijk alleen" data-ev="watch" data-id="${esc(a.id)}">▶</button><button title="Werkbank" data-ev="bench" data-id="${esc(a.id)}">🔧</button><button title="Mutantenlab" data-ev="mut-src" data-id="${esc(a.id)}">🧬</button><button title="Kies voor duel" data-ev="duel-tog" data-id="${esc(a.id)}"${E.duelSel.has(a.id) ? ' class="on"' : ''}>vs</button>`
      + (isSaved(a.genes) ? '' : `<button title="Bewaar in bibliotheek" data-ev="save-fame" data-id="${esc(a.id)}">💾</button>`) + `<button title="Uit de eregalerij" data-ev="del-fame" data-id="${esc(a.id)}">✕</button>`;
    const hv = a => a.heavy != null ? a.heavy : heavy ? Ev.heavyScore(a.genes).score : '…';
    el.innerHTML = `<div class="podium">${list.slice(0, 3).map((a, i) => `<div class="pod p${i + 1}"><span class="md">${medal[i]}</span><i class="sw" style="background:${Ev.colorOf(a.genes)}"></i><b>${esc(a.name)}</b>
        <span class="big">${a.test}</span><small>zwaar ${hv(a)} · gen ${a.gen} · ${esc(a.date)}</small><span class="acts">${acts(a)}</span></div>`).join('')}</div>
      <div class="fame">${list.slice(3).map((a, i) => `<div class="erow" title="${esc(Ev.describe(a.genes))}"><b class="pos">${i + 4}</b><i class="sw" style="background:${Ev.colorOf(a.genes)}"></i>
        <span class="nm">${esc(a.name)}<small>gen ${a.gen} · ${esc(a.date)}${a.parents && a.parents.length ? ' · ' + a.parents.map(esc).join(' × ') : ''}</small></span>
        <span class="sc">${a.test}<small>zwaar ${hv(a)}</small></span><span class="acts">${acts(a)}</span></div>`).join('')}</div>
      <div class="btns"><button class="btn" data-ev="report">Rapport (HTML)</button></div>`;
  }

  // ---- Mutantenlab: algoritme → N mutanten → race in één doolhof + testbaan; de beste gaat door naar de volgende ronde ----
  const MUT_STR = { klein: 0.06, middel: 0.12, groot: 0.25 };
  function mutSrc(a) {
    if (!a) return;
    E.mut = { src: { id: a.id, name: a.name.replace(/ M\d+\.\d+$/, ''), genes: a.genes.slice(), ver: a.ver || 1, mine: !!a.mine || isSaved(a.genes) }, orig: a.genes.slice(), origName: a.name,
      n: (E.mut && E.mut.n) || 16, str: (E.mut && E.mut.str) || 'middel', rounds: (E.mut && E.mut.rounds) || 3, heavy: !!(E.mut && E.mut.heavy), round: 0, res: null, log: [], busy: false };
    openDrawer('mut');
  }
  function mutRound() {
    const M = E.mut; if (!M) return;
    E.turbo = 0; M.round++; M.busy = true; M.res = null;
    const r = ML.makeRng(M.src.name + '|mut|' + M.round + '|' + Math.random()), G = EV().GENES, f = MUT_STR[M.str] || 0.12;
    const list = [{ id: 'mut-0-' + M.round, name: M.src.name + (M.round > 1 ? ' (beste vorige)' : ' (origineel)'), genes: M.src.genes.slice(), col: '#ffffff', base: true }];
    for (let k = 1; k <= M.n; k++) {
      let genes;
      do { genes = M.src.genes.map((v, i) => r() < 0.5 ? EV().clamp(v + Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(TAU * r()) * (G[i].hi - G[i].lo) * f, i) : v); } while (genes.join() === M.src.genes.join());
      list.push({ id: `mut-${k}-${M.round}`, name: `${M.src.name} M${M.round}.${k}`, genes: genes.map(v => Math.round(v * 100) / 100), col: `hsl(${Math.round(k * 360 / M.n)},85%,62%)` });
    }
    M.list = list; E.salt++; E.forced = null;
    E.show = { kind: 'mut', list }; E.running = true; startGen(); toolbar(); if (E.drawer === 'mut') mutRender();
  }
  function mutDone() {
    const M = E.mut; if (!M || !M.list) return;
    const run = E.runs[0], Ev = EV();
    M.res = M.list.map((a, k) => {
      const w = run.ws[k], t = Ev.testScore(a.genes), h = M.heavy ? Ev.heavyScore(a.genes) : null;
      return { a, race: w.reached ? w.steps : null, t: t.score, solved: t.solved, h: h ? h.score : null, score: h ? (t.score + h.score) / 2 : t.score };
    }).sort((x, y) => y.score - x.score || (x.race || 1e9) - (y.race || 1e9));
    const best = M.res[0], base = M.res.find(x => x.a.base);
    M.log.push({ round: M.round, name: best.a.name, score: Math.round(best.score * 10) / 10, gain: Math.round((best.score - base.score) * 10) / 10 });
    M.busy = false;
    if (!best.a.base) { M.src = { ...M.src, genes: best.a.genes.slice() }; M.bestName = best.a.name; }
    if (M.round < M.rounds) { M.busy = true; setTimeout(() => { if (E.mut === M && M.busy) mutRound(); }, 1400); }
    if (E.drawer === 'mut') mutRender();
  }
  function mutRender() {
    const el = $('#evo-dbody'), M = E.mut, Ev = EV();
    if (!M) { el.innerHTML = '<p class="hint" style="margin-top:0">Kies een algoritme met 🧬 (ranglijst, bibliotheek, eregalerij of kampioen). Het lab maakt er mutanten van, laat ze racen in één doolhof en meet ze op de testbaan. De beste gaat door naar de volgende ronde.</p>'; return; }
    const sel = (id, opts, v) => `<select data-mut="${id}">${opts.map(([k, t]) => `<option value="${k}"${String(k) === String(v) ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
    const o = Ev.testScore(M.orig).score, cur = Ev.testScore(M.src.genes).score;
    let html = `<p class="hint" style="margin-top:0">Bron: <b>${esc(M.origName)}</b> (testbaan ${o})${M.round ? ` · nu ${cur} ${cur > o ? `<em class="up">+${Math.round((cur - o) * 10) / 10}</em>` : ''}` : ''}</p>
      <div class="mut-set"><label>Mutanten ${sel('n', [[8, 8], [16, 16], [24, 24], [40, 40]], M.n)}</label><label>Sterkte ${sel('str', [['klein', 'klein'], ['middel', 'middel'], ['groot', 'groot']], M.str)}</label>
      <label>Rondes ${sel('rounds', [[1, 1], [3, 3], [5, 5], [10, 10]], M.rounds)}</label><label class="check"><input type="checkbox" data-mut="heavy"${M.heavy ? ' checked' : ''}> ook zware testbaan</label></div>
      <div class="btns"><button class="btn primary" data-ev="mut-go"${M.busy ? ' disabled' : ''}>${M.round ? 'Nog ' + M.rounds + ' rondes' : 'Start'}</button>${M.busy ? '<button class="btn" data-ev="mut-stop">Stop</button>' : ''}</div>`;
    if (M.busy && !M.res) html += `<p>Ronde ${M.round}/${M.rounds}: ${M.n} mutanten + ${M.round > 1 ? 'beste van vorige ronde' : 'origineel'} racen…</p>`;
    if (M.res) {
      html += `<p><b>Ronde ${M.round}</b> · gerangschikt op ${M.heavy ? 'gemiddelde van testbaan en zware testbaan' : 'testbaan'}; race = stappen in dit doolhof.</p>
        <div class="duel-wrap"><table class="duel"><thead><tr><th></th><th>Race</th><th>Test</th>${M.heavy ? '<th>Zwaar</th>' : ''}<th>Δ</th></tr></thead><tbody>
        ${M.res.slice(0, 14).map((x, i) => { const b = M.res.find(y => y.a.base), d = Math.round((x.score - b.score) * 10) / 10;
          return `<tr${i ? '' : ' class="top"'}><th><i class="sw" style="background:${x.a.col}"></i>${esc(x.a.name)}</th><td>${x.race != null ? x.race : '✗'}</td><td class="${i ? '' : 'best'}">${x.t}</td>${M.heavy ? `<td>${x.h}</td>` : ''}<td>${x.a.base ? '' : (d > 0 ? '+' : '') + d}</td></tr>`; }).join('')}
        </tbody></table></div>`;
    }
    if (M.log.length) html += `<div class="tree"><b>Verloop</b> ${M.log.map(l => `R${l.round}: ${l.score}${l.gain > 0 ? ` (+${l.gain})` : ' (geen winst)'}`).join(' · ')}</div>`;
    if (M.round && M.src.genes.join() !== M.orig.join()) html += `<div class="btns"><button class="btn primary" data-ev="mut-save">Bewaar beste als nieuwe versie</button><button class="btn" data-ev="mut-bench">Naar werkbank</button><button class="btn" data-ev="mut-duel">Duel met origineel</button></div>`;
    el.innerHTML = html;
  }
  function mutSave() {
    const M = E.mut; if (!M) return;
    const algos = EV().loadAlgos(), parent = algos.find(a => a.id === M.src.id) || algos.find(a => a.genes.join() === M.orig.join());
    const ver = parent ? parent.ver + 1 : 2, name = `${M.src.name.replace(/ v\d+$/, '')} v${ver}`;
    if (addAlgo({ name, genes: M.src.genes, parent: parent ? parent.id : M.src.id, ver, parents: [M.origName], folder: parent ? parent.folder : '', tags: parent ? parent.tags : ['mutant'], born: E.gen, note: `Mutantenlab: ${M.log.length} rondes vanaf ${M.origName}` }))
      note(`${name} bewaard.`); else note('Dit DNA stond al in je bibliotheek.');
    rankList(); champCard(); mutRender();
  }

  // ---- Doolhof-zoeker: welke doolhoven zijn het moeilijkst voor dit algoritme? (zoekt + klimt naar slechtere scores) ----
  function huntSrc(a) {
    if (!a) return;
    E.hunt = { target: { id: a.id, name: a.name, genes: a.genes.slice() }, found: [], tried: 0, running: false, grids: A.S.evoGrid === 'mix' ? 'all' : A.S.evoGrid };
    openDrawer('hunt');
  }
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
    H.running = true; huntRender();
    const r = ML.makeRng(Math.random()), Ev = EV(), budget = H.tried + 150;
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
      if (E.drawer === 'hunt') huntRender();
      await new Promise(res => setTimeout(res, 0));
    }
    H.running = false; if (E.drawer === 'hunt') huntRender();
  }
  function huntRender() {
    const el = $('#evo-dbody'), H = E.hunt, Ev = EV();
    if (!H) { el.innerHTML = '<p class="hint" style="margin-top:0">Kies een algoritme met 🎯 (ranglijst, bibliotheek of kampioen). De zoeker bouwt honderden doolhoven en klimt naar de doolhoven waar dat algoritme het slechtst op scoort. Daarna: kijken, duel met de klassiekers, of de populatie erop laten trainen.</p>'; return; }
    const gsel = `<select data-hunt="grids">${[['all', 'Alle rasters'], ...Ev.GRIDS.map(g => [g, GRID_NAMES[g]])].map(([k, t]) => `<option value="${k}"${k === H.grids ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
    el.innerHTML = `<p class="hint" style="margin-top:0">Doelwit: <b>${esc(H.target.name)}</b> · ${H.tried} doolhoven geprobeerd. Score = gemiddelde van 3 runs (0–100); lager = moeilijker.</p>
      <div class="mut-set"><label>Raster ${gsel}</label></div>
      <div class="btns"><button class="btn primary" data-ev="hunt-go">${H.running ? 'Stop' : H.tried ? 'Zoek verder (+150)' : 'Zoek (150 doolhoven)'}</button>${H.found.length ? '<button class="btn" data-ev="hunt-train">Train de populatie hierop</button>' : ''}</div>
      ${H.found.length ? `<div class="duel-wrap"><table class="duel hunt"><thead><tr><th>Doolhof</th><th>Score</th><th>Klassiek</th><th></th></tr></thead><tbody>
      ${H.found.map((f, i) => `<tr><th>${esc(Ev.spName(f.sp))}<small>${esc(f.sp.maker)} · kortste ${f.opt}</small></th><td class="${f.sc < f.cb.sc ? 'worse' : ''}">${f.sc}</td><td>${f.cb.sc}<small>${esc(f.cb.name)}</small></td>
        <td class="acts"><button data-ev="hunt-watch" data-i="${i}" title="Kijk">▶</button><button data-ev="hunt-duel" data-i="${i}" title="Duel met de beste klassieker">vs</button></td></tr>`).join('')}
      </tbody></table></div>` : ''}
      ${huntSet().length ? `<p class="hint">Trainingsset actief: ${huntSet().length} doolhoven (knop “Zoeker-set” bovenaan).</p>` : ''}`;
  }
  function huntShow(i, duel) {
    const H = E.hunt, f = H && H.found[i]; if (!f) return;
    E.turbo = 0; E.forced = EV().specMaze(f.sp, HUNT_ASP);
    if (duel) { const bc = EV().PRESETS.find(p => p.name === f.cb.name) || EV().bestClassic().p; startDuel([H.target, bc], true); }
    else { E.show = { kind: 'solo', list: [{ id: 'hunt', name: H.target.name, genes: H.target.genes.slice(), col: '#ffd34d' }] }; E.running = true; startGen(); toolbar(); }
  }

  // ---- Stamboom (grafisch): versies uit de bibliotheek als boom ----
  function treeRender() {
    const el = $('#evo-dbody'), Ev = EV(), algos = Ev.loadAlgos(), byId = new Map(algos.map(a => [a.id, a]));
    Ev.PRESETS.forEach(p => { if (algos.some(a => a.parent === p.id)) byId.set(p.id, { ...p, classic: true }); });
    const nodes = [...byId.values()], kids = new Map();
    nodes.forEach(a => { const p = a.parent && byId.has(a.parent) ? a.parent : null; a._p = p; if (p) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(a); } });
    const roots = nodes.filter(a => !a._p).sort((a, b) => Ev.testScore(b.genes).score - Ev.testScore(a.genes).score);
    if (!nodes.length) { el.innerHTML = '<p class="hint" style="margin-top:0">Nog geen bewaarde algoritmes. Bewaar een kampioen en maak er versies van in de werkbank of het mutantenlab: die verschijnen hier als boom.</p>'; return; }
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
      boxes += `<g class="tn${a.classic ? ' classic' : ''}" data-ev="tree-open" data-id="${esc(a.id)}" transform="translate(${p.x},${p.y})"><title>${esc(Ev.describe(a.genes))}</title><rect width="${W}" height="${H}" rx="7"/>
        <rect width="5" height="${H}" rx="2" fill="${Ev.colorOf(a.genes)}"/><text x="11" y="13">${esc(a.name.length > 17 ? a.name.slice(0, 16) + '…' : a.name)}</text>
        <text x="11" y="25" class="s">${sc}${d != null ? ` <tspan class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}</tspan>` : ''}${a.ver > 1 ? ' · v' + a.ver : ''}</text></g>`;
    });
    el.innerHTML = `<p class="hint" style="margin-top:0">Elke lijn = nieuwe versie (werkbank of mutantenlab). Groen/rood = winst/verlies op de testbaan t.o.v. de ouder. Klik een blokje om het in de bibliotheek te openen.</p>
      <div class="treewrap"><svg class="stree" width="${SW}" height="${SH}" viewBox="0 0 ${SW} ${SH}"><g class="edges">${edges}</g>${boxes}</svg></div>`;
  }

  // ---- Uitleg-replay: per stap welke zetten er waren, de punten per gen en de kans ----
  function whyStart() {
    E.xp = { last: null };
    if (!(E.show && E.show.kind === 'solo')) { const c = E.champ || EV().bestClassic().p; watch(c); }
    E.running = false; toolbar(); whyRender();
  }
  function whyWalker() { return E.show && E.show.kind === 'solo' && E.runs && E.runs[0] ? { run: E.runs[0], w: E.runs[0].ws[0] } : null; }
  function whyStep(n) {
    const o = whyWalker(); if (!o) return;
    const { run, w } = o;
    if (n < 0) { // terug: opnieuw vanaf de start met hetzelfde zaadje (deterministisch)
      const k = Math.max(0, w.steps + n);
      w.reset(w.ge.genes, w.seed); run.heat.fill(0); run.heatBy.clear(); run.order.length = 0;
      for (let i = 0; i < k - 1; i++) { w.step(); run.heat[w.nc]++; heatAdd(run, w); }
      if (k > 0) { const ex = w.explain(); w.step(); run.heat[w.nc]++; heatAdd(run, w); E.xp.last = { opts: ex, pick: w.s }; } else E.xp.last = null;
    } else for (let i = 0; i < n && !w.done; i++) { const ex = w.explain(); w.step(); run.heat[w.nc]++; heatAdd(run, w); E.xp.last = { opts: ex, pick: w.s }; }
    w.p = 1; E.running = false; E.phase = w.done ? 'pause' : 'run'; E.endT = Infinity;
    E.panes[0].dirty = true; paneStats(w.done); toolbar(); whyTable();
  }
  function whyRender() {
    const el = $('#evo-dbody'), o = whyWalker();
    if (!o) { el.innerHTML = '<p class="hint" style="margin-top:0">Open “Kijk alleen” bij een algoritme; hier zie je dan per stap waarom het die kant op ging.</p><div class="btns"><button class="btn primary" data-ev="why-start">Uitleg bij de kampioen</button></div>'; return; }
    el.innerHTML = `<p class="hint" style="margin-top:0">Elke zet krijgt punten (gen × kenmerk). Daarna loot de loper met “chaos” als temperatuur: hoe hoger de punten, hoe groter de kans. In het doolhof: cirkel = kans per zet.</p>
      <div class="btns"><button class="btn" data-ev="why-back10">−10</button><button class="btn" data-ev="why-back">◀ Stap</button><button class="btn primary" data-ev="why-step">Stap ▶</button><button class="btn" data-ev="why-10">+10</button><button class="btn" data-ev="why-play">${E.running ? 'Pauze' : 'Speel af'}</button></div>
      <div id="why-tab"></div>`;
    whyTable();
  }
  function whyTable() {
    const el = $('#why-tab'), o = whyWalker(); if (!el || !o) return;
    const { w } = o, G = EV().GENES, cur = w.done ? null : w.explain(), L = E.xp && E.xp.last;
    const row = (x, picked) => {
      const chips = x.parts.map((v, i) => Math.abs(v) >= 0.05 ? `<em style="border-color:${G[i].col}" title="${esc(G[i].name)}">${v > 0 ? '+' : ''}${v.toFixed(1)} ${esc(G[i].name)}</em>` : '').join('');
      return `<div class="wrow${picked ? ' pick' : ''}"><b>${Math.round(x.p * 100)}%</b><span>${x.visits ? `al ${x.visits}× geweest` : 'nieuw'}${x.jump ? ' · sprong' : ''} · ${x.sc.toFixed(1)} pt</span><div class="chips">${chips || '<em>geen voorkeur</em>'}</div></div>`;
    };
    let html = `<p><b>Stap ${w.steps}</b>${w.reached ? ' · doel bereikt ✓' : w.done ? ' · gestopt (limiet)' : ''} · temperatuur ${w.T.toFixed(2)}</p>`;
    if (L) html += `<div class="wsec">Vorige keuze</div>` + L.opts.slice().sort((a, b) => b.p - a.p).map(x => row(x, x.s2 === L.pick)).join('');
    if (cur) html += `<div class="wsec">Nu te kiezen (${cur.length})</div>` + cur.slice().sort((a, b) => b.p - a.p).map(x => row(x, false)).join('');
    el.innerHTML = html;
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

  // ---- Rapport: ranglijst + kampioen + verloop + eregalerij als zelfstandige HTML ----
  function report() {
    const Ev = EV(), list = entries(), fame = Ev.loadFame(), c = E.champ, d = new Date(), heavy = Ev.heavyReady();
    const bars = genes => `<div class="dna">${Ev.GENES.map((G, i) => { const v = genes[i], z = G.k === 'chaos' ? (v - G.lo) / (G.hi - G.lo) : v / G.hi, w = Math.abs(z) * 50;
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
    note('Rapport gedownload.'); champCard();
  }

  // ---- acties ----
  function saveChamp() {
    const c = E.champ; if (!c) return;
    const list = EV().loadAlgos();
    if (list.some(a => a.genes.join() === c.genes.join())) return;
    const a = EV().newAlgo({ name: c.name, genes: c.genes, born: c.born, parents: c.parents || [] });
    EV().stampHist(a); list.push(a);
    EV().saveAlgos(list); note(`${c.name} is bewaard in de bibliotheek.`); champCard(); rankList(); if (E.drawer === 'lib') libList();
  }
  function watch(a) {
    if (!a) return;
    E.turbo = 0; E.forced = null; E.show = { kind: 'solo', list: [{ id: 'solo-' + a.name, name: a.name, genes: a.genes.slice(), col: '#ffd34d' }] }; E.running = !E.xp;
    startGen(); toolbar();
  }
  function seed(a) {
    if (!a || !E.pop.length) return;
    const s = E.pop.slice().sort((x, y) => (x.fit || 0) - (y.fit || 0));
    const g = EV().genome(a.genes, E.gen, [], { from: a.name, name: a.name });
    E.pop[E.pop.indexOf(s[0])] = g;
    speciate(); persist(); note(`${a.name} doet mee vanaf de volgende generatie.`); champCard(); legend();
  }
  function duelToggle(a) {
    if (!a) return;
    if (E.duelSel.has(a.id)) E.duelSel.delete(a.id);
    else if (E.duelSel.size < 4) E.duelSel.set(a.id, { id: a.id, name: a.name, genes: a.genes.slice() });
    else note('Een duel heeft hooguit 4 deelnemers.');
    rankList(); if (E.drawer === 'lib') libList(); if (E.drawer === 'duel' && !E.duel) duelRender(); champCard();
  }
  function onClick(e) {
    const b = e.target.closest('[data-ev]'); if (!b) return;
    const act = b.dataset.ev, id = b.dataset.id;
    if (act === 'lib-open') { if (e.target.closest('.ldet, button, input, textarea, select')) return; E.libOpen = E.libOpen === id ? null : id; libList(); return; }
    e.stopPropagation();
    const a = id ? entryById(id) : null;
    const algos = EV().loadAlgos(), mine = id ? algos.find(x => x.id === id) : null;
    if (act === 'save-champ') saveChamp();
    else if (act === 'watch') watch(a);
    else if (act === 'seed') seed(a);
    else if (act === 'bench') openBench(a);
    else if (act === 'duel-tog') duelToggle(a);
    else if (act === 'duel-start') startDuel([...E.duelSel.values()]);
    else if (act === 'duel-clear') { E.duelSel.clear(); rankList(); libList(); }
    else if (act === 'duel-again') { E.salt++; E.forced = null; if (E.duel) { E.duel.done = false; E.show = { kind: 'duel', list: E.duel.list }; E.running = true; startGen(); duelRender(); toolbar(); } }
    else if (act === 'duel-stop') { E.duel = null; resume(); duelRender(); }
    else if (act === 'tab') openDrawer(b.dataset.tab);
    else if (act === 'bench-save') benchSave();
    else if (act === 'bench-ride') benchRide();
    else if (act === 'bench-duel' && E.bench) startDuel([{ id: E.bench.src.id, name: E.bench.src.name, genes: E.bench.src.genes }, { id: 'bench-edit', name: E.bench.name, genes: E.bench.genes }]);
    else if (act === 'bench-reset' && E.bench) { E.bench.genes = E.bench.src.genes.slice(); benchRender(); benchRide(); }
    else if (act === 'bench-nudge' && E.bench) {
      const r = ML.makeRng(Math.random()), G = EV().GENES;
      E.bench.genes = E.bench.genes.map((v, i) => r() < 0.4 ? EV().clamp(v + (r() * 2 - 1) * (G[i].hi - G[i].lo) * 0.12, i) : v).map(v => Math.round(v * 10) / 10);
      benchRender(); benchRide();
    }
    else if (act === 'save-fame' && a) { note(addAlgo({ name: a.name, genes: a.genes, born: a.born || a.gen, parents: a.parents || [] }) ? `${a.name} bewaard.` : 'Stond er al.'); famRender(); rankList(); champCard(); }
    else if (act === 'del-fame') { EV().delFame(id); famRender(); }
    else if (act === 'report') report();
    else if (act === 'mut-src') mutSrc(a);
    else if (act === 'mut-go' && E.mut) { E.mut.rounds = +E.mut.rounds; E.mut.round = 0; E.mut.log = []; E.mut.orig = E.mut.src.genes.slice(); E.mut.origName = E.mut.bestName || E.mut.origName; mutRound(); }
    else if (act === 'mut-stop' && E.mut) { E.mut.busy = false; mutRender(); }
    else if (act === 'mut-save') mutSave();
    else if (act === 'mut-bench' && E.mut) openBench({ id: E.mut.src.id, name: E.mut.bestName || E.mut.src.name, genes: E.mut.src.genes, ver: E.mut.src.ver });
    else if (act === 'mut-duel' && E.mut) startDuel([{ id: 'mut-orig', name: E.mut.origName, genes: E.mut.orig }, { id: 'mut-best', name: E.mut.bestName || 'Beste mutant', genes: E.mut.src.genes }]);
    else if (act === 'hunt-src') huntSrc(a);
    else if (act === 'hunt-go' && E.hunt) { if (E.hunt.running) E.hunt.running = false; else huntRun(); }
    else if (act === 'hunt-watch') huntShow(+b.dataset.i, false);
    else if (act === 'hunt-duel') huntShow(+b.dataset.i, true);
    else if (act === 'hunt-train' && E.hunt) { A.S.evoHunt = E.hunt.found.map(f => f.sp); A.S.evoMazeMode = 'hunt'; A.save(); E.show = null; E.forced = null; makePanes(); startGen(); toolbar(); note(`De populatie traint nu op ${A.S.evoHunt.length} moeilijke doolhoven.`); champCard(); huntRender(); }
    else if (act === 'tree-open') { E.libOpen = id; openDrawer('lib'); }
    else if (act === 'why-start') whyStart();
    else if (act === 'why-of' && a) { E.xp = { last: null }; watch(a); openDrawer('why'); E.running = false; toolbar(); }
    else if (act === 'why-step') whyStep(1);
    else if (act === 'why-10') whyStep(10);
    else if (act === 'why-back') whyStep(-1);
    else if (act === 'why-back10') whyStep(-10);
    else if (act === 'why-play') { E.running = !E.running; if (E.phase === 'pause') E.endT = performance.now() / 1000 + 0.5; toolbar(); whyRender(); }
    else if (act === 'export') exportAlgos();
    else if (act === 'import') $('#evo-file').click();
    else if (act === 'paste') pasteCode();
    else if (act === 'code' && mine) { const code = EV().toCode(mine); (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => note('Deelcode gekopieerd.'), () => prompt('Kopieer deze code', code)).then(champCard); }
    else if (act === 'del' && mine) {
      const kids = algos.filter(x => x.parent === mine.id).length;
      if (confirm(`${mine.name} verwijderen uit je bibliotheek?${kids ? ` (${kids} nieuwere versie${kids > 1 ? 's' : ''} blijven bestaan)` : ''}`)) { EV().saveAlgos(algos.filter(x => x !== mine)); E.duelSel.delete(mine.id); rankList(); libList(); champCard(); }
    }
  }
  function resume() { E.show = null; E.forced = null; E.running = true; if (E.mut) E.mut.busy = false; startGen(); toolbar(); }
  function addAlgo(o) {
    const list = EV().loadAlgos();
    if (list.some(a => a.genes.join() === o.genes.join())) return false;
    const a = EV().newAlgo(o); EV().stampHist(a); list.push(a);
    EV().saveAlgos(list); return true;
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
      note(n ? `${n} algoritme${n === 1 ? '' : 's'} geïmporteerd.` : 'Niets nieuws gevonden in dat bestand.'); rankList(); champCard(); if (E.drawer === 'lib') libRender();
    };
    rd.readAsText(f);
  }
  function pasteCode() {
    const s = prompt('Plak een deelcode (begint met MLDNA1:)');
    if (!s) return;
    const o = EV().fromCode(s);
    note(!o ? 'Dat is geen geldige deelcode.' : addAlgo(o) ? `${o.name} toegevoegd.` : `${o.name} stond er al.`); rankList(); champCard(); if (E.drawer === 'lib') libList();
  }

  // ---- statusregel, knoppen, legenda ----
  function status() {
    const el = $('#evo-status'); if (!el) return;
    if (E.turbo) {
      const sec = (performance.now() - E.turboT0) / 1000, gps = sec > 0.3 ? Math.round(E.turboDone / sec) : 0;
      el.textContent = `Turbo${A.S.evoFast === 'max' && !EV().Pool.broken ? ` (${EV().Pool.size()} kernen${EV().Pool.canBuild && mm() !== 'hunt' ? ', bouwen in workers' : ''})` : ''}: ${E.turboDone}${E.turboN ? '/' + E.turboN : ''} generaties · ${gps}/s · generatie ${E.gen} · ${E.seen.size} verschillende doolhoven`;
      return;
    }
    const nm = E.mazes.length || nEval(), dz = nm > 1 ? 'doolhoven' : 'doolhof';
    if (E.show && E.show.kind === 'duel') { el.textContent = `Duel: ${E.show.list.map(a => a.name).join(' tegen ')}`; return; }
    if (E.show) { el.textContent = `Kijken: ${E.show.list[0].name} alleen`; return; }
    const h = E.hist[E.hist.length - 1];
    el.textContent = `Generatie ${E.gen} · ${E.pop.length} lopers × ${nm} ${dz}${runs() > 1 ? ' × ' + runs() + ' runs' : ''}${mm() === 'hunt' ? ' (zoeker-set)' : ''} · ${E.species.length} ${E.species.length === 1 ? 'soort' : 'soorten'}${isl() > 1 ? ' op ' + isl() + ' eilanden' : ''}` + ` · ${E.seen.size} verschillende doolhoven deze sessie`
      + (h ? ` · vorige: beste ${h.best}, gem. ${h.mean}` : '');
  }
  function toolbar() {
    const run = $('#evo-run');
    if (run) run.textContent = E.turbo ? 'Stop turbo' : E.show ? 'Verder evolueren' : E.running ? 'Pauze' : 'Start';
    document.querySelectorAll('[data-turbo]').forEach(b => {
      const n = +b.dataset.turbo, on = E.turbo && E.turboN === n;
      b.classList.toggle('on', !!on); b.textContent = on ? 'Stop' : n ? '×' + n : '∞';
    });
    document.querySelectorAll('#evo-mm [data-mm]').forEach(b => b.classList.toggle('on', b.dataset.mm === mm()));
    const sn = $('#evo-mm select'); if (sn) sn.hidden = mm() !== 'set';
    const hb = $('#evo-mm [data-mm="hunt"]'); if (hb) { hb.hidden = !huntSet().length; hb.title = `Train op de ${huntSet().length} moeilijkste doolhoven uit de doolhof-zoeker`; }
    status();
  }
  function outputs() {
    const S = A.S, set = (k, v) => { const o = document.querySelector(`[data-out="${k}"]`); if (o) o.textContent = v; };
    set('evoSize', S.evoSize); set('evoBraid', S.evoBraid + '%'); set('evoMut', S.evoMut + '%');
    const r = rate(S.evoSpeed); set('evoSpeed', r < 10 ? r.toFixed(1) + '/s' : Math.round(r) + '/s');
  }
  // sleutels voor de hittekaart per soort/deelnemer (zelfde als w.hk)
  const legendKeys = () => E.show ? E.show.list.map((_, k) => 'w' + k) : E.species.map(s => s.id);
  function legend() {
    const el = $('#evo-species'); if (!el) return;
    let items;
    const hs = E.heatSel, on = k => hs === k ? ' class="on"' : '', tip = 'klik: hittekaart van alleen deze';
    if (E.show) items = E.show.list.slice(0, 10).map((a, k) => `<span data-heat="w${k}"${on('w' + k)} title="${tip}"><i class="sw" style="background:${a.col}"></i>${esc(a.name)}</span>`)
      .concat(E.show.list.length > 10 ? [`<span><small>+${E.show.list.length - 10}</small></span>`] : []);
    else if (A.S.evoColor === 'gene') items = EV().GENES.slice(0, -1).map(G => `<span><i class="sw" style="background:${G.col}"></i>${esc(G.name)}</span>`);
    else items = E.species.slice(0, 8).map(s => `<span data-heat="${s.id}"${on(s.id)} title="${s.n} lopers · beste fitness ${Math.round((s.best || 0) * 100)} · ${tip} soort"><i class="sw" style="background:${s.col}"></i>${esc(s.name)} <small>${s.n}</small></span>`)
      .concat(E.species.length > 8 ? [`<span><small>+${E.species.length - 8}</small></span>`] : []);
    if (hs != null) items.unshift('<span data-heat="" class="all" title="Hittekaart van iedereen">✕ alle</span>');
    el.innerHTML = items.join('');
  }

  // ---- koppeling met app.js ----
  let started = false;
  function init(app) {
    A = app;
    if (!restore()) E.base = '';
    else speciate();
    const fo = document.querySelector('[data-key="evoFast"] option[value="max"]');
    if (fo) fo.textContent = `Maximaal (${EV().Pool.size()} kernen)`;
    document.querySelectorAll('[data-key^="evo"]').forEach(el => {
      el.addEventListener('input', outputs);
      el.addEventListener('change', () => {
        const k = el.dataset.key;
        if (A.S.mode !== 'evo') return;
        if (k === 'evoMazes' || k === 'evoSetN') { E.show = null; makePanes(); startGen(); toolbar(); }
        else if (k === 'evoPop') { resizePop(); E.show = null; startGen(); toolbar(); }
        else if (k === 'evoColor') { if (E.runs && !E.show) E.runs.forEach(run => run.ws.forEach(w => { w.col = colorFor(w.ge); })); legend(); }
        else if (['evoGrid', 'evoSize', 'evoBraid', 'evoPuzzle', 'evoMakers'].includes(k)) { E.show = null; startGen(); toolbar(); }
        else if (k === 'evoIslands') { EV().assignIslands(E.pop, isl()); speciate(); persist(); status(); note(isl() > 1 ? `${isl()} eilanden: elk eiland evolueert apart; elke 8 generaties verhuist de beste naar het volgende eiland.` : 'Weer één populatie.'); champCard(); }
        else if (k === 'evoRuns') status();
      });
    });
    document.querySelectorAll('#evo-mm [data-mm]').forEach(b => b.addEventListener('click', () => {
      A.S.evoMazeMode = b.dataset.mm; A.save(); E.show = null; makePanes(); startGen(); toolbar();
    }));
    $('#evo-run').addEventListener('click', () => {
      if (E.turbo) { E.turbo = 0; return; }
      if (E.show) { if (E.duel) { E.duel = null; if (E.drawer === 'duel') duelRender(); } resume(); }
      else { E.running = !E.running; if (E.running && E.phase === 'idle') startGen(); toolbar(); }
    });
    $('#evo-skip').addEventListener('click', () => { if (E.phase === 'run') finishNow(); else if (!E.show) startGen(); });
    document.querySelectorAll('[data-turbo]').forEach(b => b.addEventListener('click', () => turbo(+b.dataset.turbo)));
    $('#evo-save').addEventListener('click', saveChamp);
    $('#evo-reset').addEventListener('click', () => {
      if (!confirm('Opnieuw beginnen? De huidige populatie en grafiek gaan weg (bewaarde algoritmes blijven).')) return;
      const seeds = A.S.evoSeedSaved ? EV().loadAlgos() : [];
      E.show = null; E.duel = null; fresh(seeds); refreshUI(true); startGen(); toolbar();
    });
    $('#evo-export').addEventListener('click', exportAlgos);
    $('#evo-report').addEventListener('click', report);
    $('#evo-import').addEventListener('click', () => $('#evo-file').click());
    $('#evo-file').addEventListener('change', e => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; });
    $('#evo-paste').addEventListener('click', pasteCode);
    document.querySelectorAll('[data-open-drawer]').forEach(b => b.addEventListener('click', () => { const t = b.dataset.openDrawer; if (E.drawer === t) closeDrawer(); else openDrawer(t); }));
    $('#evo-dclose').addEventListener('click', closeDrawer);
    document.querySelectorAll('#evo-drawer [data-tab]').forEach(b => b.addEventListener('click', () => openDrawer(b.dataset.tab)));
    ['#evo-champ', '#evo-rank', '#evo-dbody'].forEach(s => $(s).addEventListener('click', onClick));
    $('#evo-species').addEventListener('click', e => { // hittekaart per soort/deelnemer
      const sp = e.target.closest('[data-heat]'); if (!sp) return;
      const v = sp.dataset.heat, k = v === '' ? null : /^w/.test(v) ? v : +v;
      E.heatSel = E.heatSel === k ? null : k; legend(); E.panes.forEach(r => { r.dirty = true; });
    });
    const body = $('#evo-dbody');
    body.addEventListener('input', e => {
      const t = e.target;
      if (t.id === 'lib-q') { E.libQ = t.value; libList(); }
      else if (t.dataset.g != null) benchInput(t);
      else if (t.id === 'bench-name' && E.bench) E.bench.name = t.value;
    });
    body.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'lib-folder') { E.libFolder = t.value; libList(); }
      else if (t.id === 'lib-sort') { E.libSort = t.value; libList(); }
      else if (t.dataset.f) libField(t);
      else if (t.dataset.mut && E.mut) { const k = t.dataset.mut; E.mut[k] = k === 'heavy' ? t.checked : k === 'str' ? t.value : +t.value; if (k === 'heavy' && t.checked) setTimeout(() => { EV().heavyScore(E.mut.orig); mutRender(); }, 30); }
      else if (t.dataset.hunt && E.hunt) { E.hunt.grids = t.value; }
    });
    new ResizeObserver(() => drawChart()).observe($('#cv-evo'));
    outputs(); legend(); toolbar();
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
      started = true; makePanes(); requestAnimationFrame(() => { startGen(); refreshUI(true); toolbar(); });
      // zware testbaan op de achtergrond klaarzetten (8 grote doolhoven bouwen duurt even)
      setTimeout(() => { EV().heavyScore(EV().PRESETS[0].genes); if (E.champ && E.champ.heavy == null) E.champ.heavy = EV().heavyScore(E.champ.genes).score; refreshUI(true); }, 1500);
    }
    else requestAnimationFrame(() => { drawChart(); E.panes.forEach(r => { r.dirty = true; }); });
  }
  function key(e) {
    if (e.key === ' ') { e.preventDefault(); $('#evo-run').click(); }
    else if (e.key === 't') turbo(25);
    else if (e.key === 'v' || e.key === 'Enter') $('#evo-skip').click();
    else if (e.key === 'b') saveChamp();
    else if (e.key === 'l') { if (E.drawer === 'lib') closeDrawer(); else openDrawer('lib'); }
    else if (e.key === 'Escape' && E.drawer) closeDrawer();
  }
  function setPalette(p) { E.panes.forEach(r => r.setPalette(p)); }

  ML.EvoUI = { init, enter, frame, key, setPalette };
})(window.ML = window.ML || {});
