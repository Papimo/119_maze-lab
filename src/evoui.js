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
      localStorage.setItem(STORE, JSON.stringify({ gen: E.gen, base: E.base, pop: E.pop.map(slim), hist: E.hist.slice(-1500), champ: E.champ, species: sp, spSeq: E.spSeq, spThr: E.spThr, growG: E.growG || 0, autoA: E.autoA || null }));
    } catch (e) { /* geen opslag */ }
  }
  function restore() {
    try {
      const o = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (o && Array.isArray(o.pop)) { o.pop.forEach(g => { if (g) g.genes = EV().upGenes(g.genes); }); if (o.champ) o.champ.genes = EV().upGenes(o.champ.genes); (o.species || []).forEach(sp => { if (sp && sp.c) sp.c = EV().upGenes(sp.c); }); }
      if (o && Array.isArray(o.pop) && o.pop.length && o.pop[0].genes && o.pop[0].genes.length === EV().GENES.length) {
        Object.assign(E, { gen: o.gen | 0, base: o.base || ML.randomSeed(), pop: o.pop, hist: o.hist || [], champ: o.champ || null,
          species: Array.isArray(o.species) ? o.species : [], spSeq: o.spSeq | 0, spThr: o.spThr || SP_THR, growG: o.growG | 0, autoA: o.autoA || null });
        return true;
      }
    } catch (e) { /* kapot */ }
    return false;
  }
  function fresh(seeds) {
    E.base = String(ML.randomSeed()); E.gen = 0; E.hist = []; E.champ = null; E.species = []; E.spSeq = 0; E.spThr = SP_THR; E.growG = 0; E.autoA = null; E.stopFrom = 0;
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
    speciate(); autoChecks();
    if (!quiet) { persist(); refreshUI(true); }
  }
  // ---- automatisch: bewaren, stoppen, meegroeien ----
  // nieuwe kampioen die alle klassiekers verslaat → bibliotheek (map Auto-bewaard; elke volgende = nieuwe versie van de vorige)
  function autoSave(tb) {
    const c = E.champ, prev = E.autoA && EV().loadAlgos().find(a => a.id === E.autoA.id);
    if (prev && tb.score < EV().testScore(prev.genes).score + 0.5) return; // pas bij ≥ 0,5 winst (anders loopt de bibliotheek vol)
    const a = addAlgo({ name: c.name, genes: c.genes, born: c.born, parents: c.parents || [], parent: prev ? prev.id : null, ver: prev ? (prev.ver || 1) + 1 : 1,
      folder: 'Auto-bewaard', tags: ['auto'], note: `Automatisch bewaard: score ${tb.score} op de testbaan, generatie ${c.gen}.` });
    if (a) { E.autoA = { id: a.id, name: a.name, s: tb.score }; E.autoN = (E.autoN || 0) + 1; note(`💾 Nieuwe kampioen ${a.name} (${tb.score}) automatisch bewaard.`); if (E.page === 'algos') { algoGrid(); algoDetail(); } }
  }
  const stall = () => E.gen - Math.max(E.champ ? E.champ.gen + 1 : 0, E.stopFrom || 0); // generaties zonder nieuw record
  function autoInfo() {
    const n = Number(A.S.evoAutoStop) || 0, bits = [];
    if (n) bits.push(`stopt na ${n} generaties zonder record (nu ${Math.max(0, stall())})`);
    if (A.S.evoAutoSave) bits.push(E.autoA ? `laatst bewaard: ${esc(E.autoA.name)} (${E.autoA.s})` : 'bewaart nieuwe kampioenen');
    if (A.S.evoGrow) bits.push(`doolhof groeit mee (nu ${A.S.evoSize})`);
    return bits.length ? `<p class="hint auto-i">🔁 ${bits.join(' · ')}</p>` : '';
  }
  function autoChecks() {
    const n = Number(A.S.evoAutoStop) || 0;
    if (n && stall() >= n && (E.turbo || V.running)) {
      E.turbo = 0; V.running = false; E.stopFrom = E.gen;
      note(`⏹ Gestopt: ${n} generaties geen nieuw record. Kampioen: ${E.champ ? E.champ.name + ' (' + E.champ.test + ')' : '—'}.`);
      setTimeout(evoBar, 0);
    }
    if (A.S.evoGrow && mm() !== 'hunt') grow();
  }
  // meegroeiende moeilijkheid: beste van de generatie haalt gemiddeld ≥ 80 over 12 generaties → doolhof 2 groter (vanaf 30 ook meer lussen)
  function grow() {
    const from = E.growG || 0, hs = E.hist.filter(h => h.gen >= from).slice(-12);
    if (hs.length < 12 || E.gen - from < 12) return;
    const avg = hs.reduce((s, h) => s + h.best, 0) / hs.length;
    if (avg < 80 || A.S.evoSize >= 80) return;
    const S = A.S; S.evoSize = Math.min(80, S.evoSize + 2);
    if (S.evoSize >= 30 && S.evoBraid < 40) S.evoBraid = Math.min(40, S.evoBraid + 5);
    E.growG = E.gen;
    ['evoSize', 'evoBraid'].forEach(k => { const el = document.querySelector(`[data-key="${k}"]`); if (el) el.value = S[k]; });
    A.save(); outputs(); note(`📈 Te makkelijk geworden (gem. ${Math.round(avg)}): doolhof groeit naar ${S.evoSize}${S.evoBraid ? ', lussen ' + S.evoBraid + '%' : ''}.`);
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
      if (A.S.evoAutoSave && !best.from && tb.score > bc.t.score) autoSave(tb);
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
        advance(true, !!pr); if (E.turbo) E.turbo--; E.turboDone++;
      } else {
        while (E.turbo && performance.now() - t0 < 40) { EV().evaluate(E.pop, mazesFor(E.gen), E.gen, runs()); advance(true); if (E.turbo) E.turbo--; E.turboDone++; }
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
    [['#4cc9f0', 'kampioen (record score testbaan)'], ['#4cc9f077', 'beste v.d. generatie, score testbaan'], ['#ffd166', 'score beste (eigen doolhoven)'], [muted, 'gemiddelde']].forEach(([c, s]) => {
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
  // ---- één scoretaal: Score 0–100 (100 = elke keer de kortste route); testbaan = 12 vaste doolhoven × 2 ----
  // zekerheid: gepaard per testdoolhof (zelfde regel als het mutantenlab: ≥3 doolhoven en verschil ≥ 2× de standaardfout)
  function sureOf(as, bs) {
    const n = Math.min(as ? as.length : 0, bs ? bs.length : 0); if (!n) return { k: 'base', icon: '', txt: '' };
    const d = []; for (let i = 0; i < n; i++) d.push((as[i] - bs[i]) * 100);
    const m = d.reduce((a, b) => a + b, 0) / n;
    if (Math.abs(m) < 0.05) return { k: 'eq', icon: '🟰', txt: 'even goed' };
    const sd = n > 1 ? Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : Infinity, se = sd / Math.sqrt(n);
    const sure = n >= 3 && (se === 0 || Math.abs(m) >= 2 * se);
    if (m > 0) return sure ? { k: 'yes', icon: '✅', txt: 'zeker beter' } : { k: 'maybe', icon: '🤔', txt: 'misschien beter' };
    return sure ? { k: 'no', icon: '❌', txt: 'zeker slechter' } : { k: 'maybe', icon: '🤔', txt: 'misschien slechter' };
  }
  const signed = v => v > 0 ? `<em class="up">+${v}</em>` : v < 0 ? `<em class="down">${v}</em>` : '<em>±0</em>';
  const sureTag = su => su.icon ? `<span class="sure ${su.k}" title="${esc(su.txt)}: per testdoolhof vergeleken (wisselt het per doolhof, dan kan het geluk zijn)">${su.icon} ${esc(su.txt)}</span>` : '';
  // scorevak: grote Score (testbaan), optioneel zwaar en een vergelijking vs = { name, t }
  function scoreBox(t, h, vs) {
    let cmp = '';
    if (vs && vs.t) cmp = `<br>${signed(r1(t.score - vs.t.score))} t.o.v. ${esc(vs.name)} ${sureTag(sureOf(t.per, vs.t.per))}`;
    return `<div class="evo-score"><b title="Score 0–100: 100 = elke keer de kortste route">${t.score}</b><span>Score · testbaan<br>${t.solved}/${t.of} gehaald${cmp}</span>${h && h.score != null ? `<b class="hv" title="Score op de zware testbaan (8 grote doolhoven met lussen en puzzels)">${h.score}</b><span>Score<br>zwaar</span>` : ''}</div>`;
  }
  const vsClassic = () => { const bc = EV().bestClassic(); return { name: bc.p.name, t: bc.t, id: bc.p.id }; };
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
      <div class="todo-g"><span>Verbeteren</span>${b('task-bench', '🔧 Werkbank', 'genen zelf bijschuiven + proefrit')}${b('task-mut', '🧬 Mutanten', 'varianten over meerdere doolhoven, beste gemiddelde wint')}</div>
      <div class="todo-g"><span>Laten strijden</span>${b('task-duel', 'vs Duel', '2–4 algoritmes in hetzelfde doolhof')}</div>
      <div class="todo-g"><span>Begrijpen</span>${b('task-why', '❔ Uitleg', 'stap voor stap: waarom die kant op?')}${b('tree', '🌳 Stamboom', 'versies en ouders (Analyse)')}</div>
      <div class="todo-g"><span>Zwakte zoeken</span>${b('task-hunt', '🎯 Zoeker', 'de moeilijkste doolhoven voor dit algoritme')}</div>
      <div class="todo-g"><span>Verder kweken</span>${b('seed', '＋ Zaai in evolutie', 'doet mee vanaf de volgende generatie')}</div>
      <div class="todo-g"><span>Inzetten</span>${b('go-build', '▶ Bouwen', 'laat hem een nieuw doolhof oplossen')}${b('go-race', '🏁 Race', 'tegen drie klassiekers in Lab')}</div>
      <div class="todo-g"><span>Tonen & delen</span>${b('go-watch', '📺 Kijken', 'eindeloos kijken, alleen eigen algoritmes')}${b('share', '🔗 Link + QR', 'korte link of QR-code voor een ander apparaat')}</div></div>`;
  }

  // delen: korte link (#dna=…, opent de app en zet hem in de bibliotheek) + QR-code (qrcode-generator in vendor/, geen externe dienst)
  const APP_URL = 'https://papimo.github.io/119_maze-lab/';
  function shareLink(a) { const base = /^https?:/.test(location.protocol) ? location.href.split('#')[0] : APP_URL; return base + '#dna=' + EV().toShort(a); }
  function qrSvg(txt) {
    if (typeof qrcode !== 'function') return '<p class="hint">QR-bibliotheek niet geladen.</p>';
    try { const q = qrcode(0, 'M'); q.addData(txt); q.make(); return q.createSvgTag({ cellSize: 4, margin: 3, scalable: true }); } catch (e) { return '<p class="hint">Link te lang voor een QR-code.</p>'; }
  }
  function shareHtml(a) {
    const url = shareLink(a);
    return `<div class="share"><h4>🔗 Delen: ${esc(a.name)}</h4><div class="share-row"><div class="qr">${qrSvg(url)}</div>
      <div class="share-r"><span class="hint" style="margin:0">Scan met een telefoon, of stuur de link. Wie hem opent krijgt ${esc(a.name)} in de eigen bibliotheek (DNA exact, ${url.length} tekens).</span>
      <input class="share-url" readonly value="${esc(url)}"><div class="btns"><button class="btn primary" data-ev="share-copy" data-id="${esc(a.id)}">Kopieer link</button><button class="btn" data-ev="share" data-id="${esc(a.id)}">Sluiten</button></div></div></div></div>`;
  }
  // link geopend met #dna=… → in de bibliotheek + selecteren
  function openShared() {
    const m = /#dna=([^&]+)/.exec(location.hash || ''); if (!m) return false;
    try { history.replaceState(null, '', location.href.split('#')[0]); } catch (e) { /* file:// */ }
    const o = EV().fromCode(decodeURIComponent(m[1]));
    if (!o) { note('Die link bevat geen geldig algoritme.'); return true; }
    const have = EV().loadAlgos().find(x => x.genes.join() === o.genes.map(v => Math.round(v * 1000) / 1000).join());
    const x = have || addAlgo({ ...o, folder: 'Gedeeld', tags: ['gedeeld'], note: 'Binnengekomen via een gedeelde link.' });
    E.page = 'algos'; E.sel = x ? x.id : null;
    note(have ? `${o.name} stond al in je bibliotheek.` : `📥 ${o.name} toegevoegd aan je bibliotheek (map Gedeeld).`);
    return true;
  }

  // ---- rondleiding: 3 stappen bij het eerste bezoek (localStorage mazelab.tour) ----
  const TOUR = [
    { sel: '#evo-tabs [data-page="algos"]', t: '1 · Algoritmes', d: 'Hier staan de klassiekers en jouw eigen algoritmes, met hun Score (0–100, 100 = altijd de kortste route). Klik een kaart en kies “Wat wil je doen?”: verbeteren, laten strijden, begrijpen, inzetten of delen.' },
    { sel: '#evo-tabs [data-page="evolve"]', t: '2 · Evolueren', d: 'Een zwerm lopers met eigen DNA kweekt hier nieuwe algoritmes, ook als je op een andere pagina bent. Turbo rekent duizenden generaties zonder animatie; onder Automatisch kan hij zelf stoppen, kampioenen bewaren en het doolhof laten meegroeien.' },
    { sel: '#lib-ladder', t: '3 · Doelen', d: 'De doelenladder: versla eerst alle klassiekers op de testbaan, daarna wacht de zware testbaan. Een taak (werkbank, mutantenlab, duel) opent als volledig scherm onder Taak.' }
  ];
  function tour(k) {
    let el = $('#evo-tour');
    document.querySelectorAll('.tour-hl').forEach(x => x.classList.remove('tour-hl'));
    if (k == null || k >= TOUR.length) { if (el) el.remove(); try { localStorage.setItem('mazelab.tour', '1'); } catch (e) { /* geen opslag */ } return; }
    if (E.page !== 'algos') setPage('algos');
    const st = TOUR[k], tg = $(st.sel);
    if (!el) { el = document.createElement('div'); el.id = 'evo-tour'; $('#view-evo').appendChild(el); }
    el.innerHTML = `<b>${esc(st.t)}</b><p>${esc(st.d)}</p><div class="btns"><span class="tour-n">${k + 1}/${TOUR.length}</span><button class="btn" data-ev="tour-end">Overslaan</button><button class="btn primary" data-ev="tour" data-k="${k + 1}">${k + 1 < TOUR.length ? 'Volgende' : 'Klaar'}</button></div>`;
    if (tg) {
      tg.classList.add('tour-hl');
      const r = tg.getBoundingClientRect(), W = Math.min(340, innerWidth - 24);
      el.style.width = W + 'px'; el.style.left = Math.max(12, Math.min(innerWidth - W - 12, r.left)) + 'px'; el.style.top = Math.min(innerHeight - 200, r.bottom + 10) + 'px';
    }
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
    const lad = $('#lib-ladder'); if (lad) lad.innerHTML = goalHtml();
  }
  function algoCard(a) {
    const tags = (a.tags || []).slice(0, 3).map(t => `<em class="tag">${esc(t)}</em>`).join('');
    return `<div class="acard${a.classic ? ' classic' : ''}${E.sel === a.id ? ' sel' : ''}" data-ev="sel" data-id="${esc(a.id)}" title="${esc(EV().describe(a.genes))}">
      <div class="ac-top"><i class="sw" style="background:${EV().colorOf(a.genes)}"></i><b>${esc(a.name)}</b>${a.ver > 1 && !/ v\d+$/.test(a.name) ? `<em class="ver">v${a.ver}</em>` : ''}</div>
      <div class="ac-sc"><b title="Score 0–100 op de testbaan">${a.t.score}</b><span>score · ${a.t.solved}/${a.t.of}${a.h ? `<br>zwaar ${a.h.score}` : ''}</span></div>
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
      ${scoreBox(t, h, a.id === vsClassic().id ? null : vsClassic())}
      <p class="desc">${esc(Ev.describe(a.genes))}</p>${dnaHtml(a.genes)}<div class="cats">${cats}</div>`;
    if (!saved) html += `<div class="btns"><button class="btn primary" data-ev="save-any" data-id="${id}">Bewaar in mijn algoritmes</button></div>`;
    if (E.share === a.id) html += shareHtml(a);
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
      html += `<h4 class="det-sub">Kampioen: ${esc(c.name)}</h4>${scoreBox(EV().testScore(c.genes), { score: c.heavy }, c.from ? null : vsClassic())}
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
    const saved = !!c.from || isSaved(c.genes);
    el.innerHTML = `<h4><i class="sw" style="background:${EV().colorOf(c.genes)}"></i>${esc(c.name)} <small>${c.from ? 'klassieker ' + esc(c.from) : 'geboren in generatie ' + c.born}${c.parents && c.parents.length ? ' · ouders ' + c.parents.map(esc).join(' × ') : ''}</small></h4>
      ${scoreBox(EV().testScore(c.genes), { score: c.heavy }, c.from === bc.p.name ? null : { name: bc.p.name, t: bc.t })}${autoInfo()}
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
      + (h ? ` · vorige generatie: score beste ${h.best}, gem. ${h.mean}` : '') + (A.S.evoGrow ? ` · groeit mee (grootte ${A.S.evoSize})` : '');
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
    else items = E.species.slice(0, 8).map(s => `<span data-heat="${s.id}"${on(s.id)} title="${s.n} lopers · beste score ${Math.round((s.best || 0) * 100)} · ${tip}"><i class="sw" style="background:${s.col}"></i>${esc(s.name)} <small>${s.n}</small></span>`)
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
      E.mut = { src: algo, root: algo.name, rootId: algo.id, orig0: algo.genes.slice(), hist: [], auto: false, n: o.n || 8, str: o.str || 'klein', rounds: o.rounds || 3, need: o.need != null ? o.need : 1, maxT: o.maxT || 4,
        round: 0, list: null, sc: null, res: null, lead: [], busy: false };
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
    const changed = (K.kind === 'bench' && E.bench && E.bench.genes.join() !== E.bench.src.genes.join()); // mutantenlab heeft een eigen bewaar-vak (naam, map, notitie)
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
    const sign = signed;
    const w = T.runs && T.runs[0] && T.runs[0].ws[0];
    return `${scoreBox(t, null, d || t.per.join() !== o.per.join() ? { name: 'origineel (' + o.score + ')', t: o } : null)}
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
    if (!D || !D.list) return '<p class="hint" style="margin-top:0">Nog niet gestart. Kies links de deelnemers en druk op Start duel. Hier verschijnt dan per deelnemer: stappen in dit doolhof, Score op de testbaan (met zekerheid) en per doolhof-soort.</p>';
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
    return `<p style="margin-top:0">${D.done ? win : 'Bezig…'}${D.done ? `<br>📏 Score testbaan: <b>${esc(D.list[tw].name)}</b> is algemeen het sterkst.` : ''}</p>
      <div class="duel-wrap"><table class="duel"><thead><tr><th></th><th>Dit doolhof</th><th title="Score 0–100 op de testbaan">Score</th><th title="t.o.v. ${esc(D.list[0].name)}, per testdoolhof vergeleken">Zeker?</th>${cats.map(c => `<th>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>
      ${D.list.map((a, k) => `<tr><th><i class="sw" style="background:${a.col}"></i>${esc(a.name)}</th>${mazeCol(k)}${cell(ts[k].score, best(t => t.score), ts[0].score, k)}<td>${k ? sureTag(sureOf(ts[k].per, ts[0].per)) : '<small>basis</small>'}</td>${cats.map(c => cell(ts[k].cats[c.k], best(t => t.cats[c.k]), ts[0].cats[c.k], k)).join('')}</tr>`).join('')}
      </tbody></table></div><p class="hint">Groen = beste in die kolom; kleine getallen = verschil met de eerste rij.</p>`;
  }

  // ---- Mutantenlab: algoritme → N mutanten (vast voor de hele reeks) → elke ronde een ánder doolhof ----
  // Score = 0–100 (100 = elke keer de kortste route), zelfde maat als de testbaan. Winnaar = hoogste gemiddelde over alle rondes.
  // Stopregel is alleen voor het kijken: wie afgekapt wordt, wordt onzichtbaar afgemaakt (zelfde zaadje) → iedereen een eerlijke score.
  // Zekerheid: verschil met het origineel per doolhof (gepaard); gemiddeld verschil ≥ 2× de standaardfout en ≥ 3 doolhoven = zeker.
  const MUT_STR = { mini: 0.03, klein: 0.06, middel: 0.12, groot: 0.25 }, STR_ORDER = ['mini', 'klein', 'middel', 'groot'];
  const MUT_PRESET = { snel: { n: 8, rounds: 3, need: 1, maxT: 4 }, grondig: { n: 24, rounds: 10, need: 3, maxT: 8 } };
  const AUTO_MAX = 8;
  const r1 = v => Math.round(v * 10) / 10;
  function mutMake() {
    const M = E.mut; if (!M) return;
    const r = ML.makeRng(M.src.name + '|mut|' + Math.random()), G = EV().GENES, f = MUT_STR[M.str] || 0.12;
    const list = [{ id: 'mut-0', name: M.src.name + (M.auto && M.hist.length ? ' (huidige)' : ' (origineel)'), genes: M.src.genes.slice(), col: '#ffffff', base: true }];
    for (let k = 1; k <= M.n; k++) {
      let genes;
      do { genes = M.src.genes.map((v, i) => r() < 0.5 ? Math.max(Math.min(G[i].lo, v), Math.min(Math.max(G[i].hi, v), v + Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(TAU * r()) * (G[i].hi - G[i].lo) * f)) : v); } while (genes.join() === M.src.genes.join()); // bereik rekt mee als de bron erbuiten ligt (Kompas: fresh 8)
      list.push({ id: `mut-${k}`, name: `${M.src.name} m${k}`, genes: genes.map(v => Math.round(v * 100) / 100), col: `hsl(${Math.round(k * 360 / M.n)},85%,62%)` });
    }
    M.list = list; M.sc = list.map(() => []); M.round = 0; M.target = +M.rounds; M.extended = false; M.res = null; M.lead = []; M.pick = 0; M.saved = null; M.saveName = null; M.saveNote = null;
  }
  function mutRound() {
    const M = E.mut; if (!M) return;
    M.round++; M.busy = true;
    T.salt++; T.forced = null; // nieuw zaadje = nieuw doolhof
    startShow('mut', M.list, false);
    setStep('busy'); taskIn();
  }
  // tempo: een ronde duurt minstens ~1,5 s (doorkweken 0,6 s), anders is er niets te volgen; herhaling rustig
  function mutRate(spd) {
    const M = E.mut, k = T.show && T.show.kind, run = T.runs && T.runs[0];
    if (!M || !run || !E.task || E.task.kind !== 'mut') return spd;
    const opt = run.mz.ctx.opt || 30;
    if (k === 'replay') return Math.min(spd, opt * 1.2);
    if (k === 'mut') return Math.min(spd, opt * 3 / (M.auto ? 0.6 : 1.5));
    return spd;
  }
  // stopregel: genoeg binnen of tijd op → rest niet afwachten (wel uitrekenen in mutDone); kansloos (> 2× stappen eerste) → afkappen
  function mutCheck(t, alive) {
    const M = E.mut, run = T.runs && T.runs[0]; if (!M || !run) return alive;
    const n = run.ws.length, need = M.need ? Math.min(M.need, n) : n, first = run.order[0];
    const cut = w => { w.done = true; w.cut = true; w.p = 1; run.cut++; };
    if (first) for (const w of run.ws) if (!w.done && w.steps > Math.max(first.steps * 2, first.steps + 30)) { cut(w); alive--; }
    if (run.order.length >= need || t - T.t0 > M.maxT) { for (const w of run.ws) if (!w.done) cut(w); return 0; }
    return alive;
  }
  // tussenstand: gemiddelde over de gespeelde rondes, beste eerst
  function mutStand() {
    const M = E.mut;
    return M.list.map((a, k) => { const s = M.sc[k], avg = s.length ? s.reduce((x, y) => x + y, 0) / s.length : 0; return { a, k, s, avg }; })
      .sort((x, y) => y.avg - x.avg);
  }
  // hoe zeker is "beter dan het origineel"? gepaard per doolhof
  function mutSure(x, base) {
    const n = x.s.length, d = x.s.map((v, i) => v - base.s[i]), m = d.reduce((a, b) => a + b, 0) / Math.max(1, n);
    if (x === base || x.a.base) return { k: 'base', icon: '', txt: '' };
    if (m <= 0) return { k: 'no', icon: '❌', txt: 'niet beter dan het origineel' };
    const sd = n > 1 ? Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : Infinity, se = sd / Math.sqrt(n);
    if (n >= 3 && (se === 0 || m >= 2 * se)) return { k: 'yes', icon: '✅', txt: 'zeker beter: wint op bijna elk doolhof' };
    return { k: 'maybe', icon: '🤔', txt: n < 3 ? 'nog onzeker: te weinig doolhoven' : 'nog onzeker: wisselt per doolhof, kan geluk zijn' };
  }
  function mutDone() {
    const M = E.mut; if (!M || !M.list) return;
    const run = T.runs[0], Ev = EV();
    run.ws.forEach((w, k) => {
      const sc = w.cut ? Ev.evalOne(run.mz.ctx, M.list[k].genes, w.seed).score() : w.score();
      M.sc[k].push(r1(sc * 100));
    });
    const st = mutStand();
    M.lead.push({ round: M.round, name: st[0].a.name, avg: r1(st[0].avg) });
    if (M.round < M.target && M.busy) { M.wait = true; setTimeout(() => { M.wait = false; if (E.mut === M && M.busy) mutRound(); }, M.auto ? 300 : 900); taskOut(); return; }
    mutFinish();
  }
  // klaar (of gestopt na ≥1 ronde): eindstand, zekerheid, sterkte bijstellen, evt. doorkweken
  function mutFinish() {
    const M = E.mut, Ev = EV();
    const st = mutStand(), base = st.find(x => x.a.base);
    M.res = st.map(x => ({ ...x, avg: r1(x.avg), t: Ev.testScore(x.a.genes).score, sure: mutSure(x, base) }));
    const w = M.res[0], bAvg = base.avg;
    if (M.auto && M.busy && w.sure.k === 'maybe' && !M.extended) { // twijfel → eerst langer meten
      M.extended = true; M.target += 5; taskOut(); mutRound(); return;
    }
    // sterkte bijstellen voor de volgende reeks
    const muts = M.res.filter(x => !x.a.base), bad = muts.filter(x => x.avg < bAvg * 0.5).length / Math.max(1, muts.length), si = STR_ORDER.indexOf(M.str);
    M.strNote = '';
    if (bad > 0.6 && si > 0) { M.str = STR_ORDER[si - 1]; M.strNote = `Sterkte omlaag naar <b>${M.str}</b>: ${Math.round(bad * 100)}% van de mutanten was veel slechter.`; }
    else if (bad < 0.1 && w.sure.k !== 'yes' && si < STR_ORDER.length - 1) { M.str = STR_ORDER[si + 1]; M.strNote = `Sterkte omhoog naar <b>${M.str}</b>: de mutanten leken te veel op het origineel.`; }
    if (M.auto) {
      M.hist.push({ n: M.hist.length + 1, name: w.a.name, gain: r1(w.avg - bAvg), sure: w.sure.k === 'yes' && !w.a.base });
      if (w.sure.k === 'yes' && !w.a.base && M.hist.length < AUTO_MAX && M.busy) {
        M.src = { ...M.src, id: null, name: `${M.root} r${M.hist.length}`, genes: w.a.genes.slice() };
        taskOut();
        setTimeout(() => { if (E.mut === M && M.auto && M.busy) { mutMake(); mutRound(); } }, 700);
        return;
      }
      M.auto = false;
    }
    // kiezen: winnaar, of bij doorkweken de beste gevonden (= huidige bron) als er geen zekere winnaar meer was
    const evolved = M.src.genes.join() !== M.orig0.join();
    M.pick = !w.a.base ? 0 : evolved ? M.res.indexOf(base) : -1;
    M.busy = false; setStep('done'); taskIn();
    // winnaar nog één keer rustig laten lopen naast het origineel, op het laatste doolhof
    const show = [M.res.find(x => x.a.base).a]; if (!w.a.base) show.push(w.a);
    startShow('replay', show, true);
  }
  const canSave = x => x && (!x.a.base || x.a.genes.join() !== E.mut.orig0.join());
  function mutIn() {
    const M = E.mut; if (!M) return '';
    const dis = M.busy ? ' disabled' : '';
    const sel = (id, opts, v) => `<select data-mut="${id}"${dis}>${opts.map(([k, t]) => `<option value="${k}"${String(k) === String(v) ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
    const pre = Object.keys(MUT_PRESET).find(p => Object.entries(MUT_PRESET[p]).every(([k, v]) => +M[k] === v));
    const pb = (p, t, d) => `<button class="btn mut-pre${pre === p ? ' on' : ''}" data-ev="mut-preset" data-p="${p}"${dis}><b>${t}</b><small>${d}</small></button>`;
    return `<p class="hint" style="margin-top:0">Het lab maakt <b>één groep</b> varianten van <b>${esc(M.src.name)}</b>. Die groep loopt <b>elke ronde een ander doolhof</b>. Winnaar = <b>hoogste gemiddelde score</b> over alle rondes. Het origineel loopt mee als maatstaf.</p>
      <div class="mut-pres">${pb('snel', '⚡ Snel', '8 mutanten · 3 doolhoven')}${pb('grondig', '🔬 Grondig', '24 mutanten · 10 doolhoven')}</div>
      <details class="ev-set"${pre ? '' : ' open'}><summary>Meer instellingen</summary>
      <div class="frow2"><span>Mutanten</span>${sel('n', [[8, 8], [16, 16], [24, 24], [40, 40]], M.n)}</div>
      <div class="frow2"><span>Sterkte</span>${sel('str', STR_ORDER.map(s => [s, s]), M.str)}</div>
      <div class="frow2"><span>Rondes</span>${sel('rounds', [[1, '1 doolhof'], [3, '3 doolhoven'], [5, '5 doolhoven'], [10, '10 doolhoven'], [20, '20 doolhoven']], M.rounds)}</div>
      <div class="frow2"><span>Kijken tot</span>${sel('need', [[1, 'de eerste binnen is'], [3, '3 binnen zijn'], [5, '5 binnen zijn'], [0, 'iedereen klaar is']], M.need)}</div>
      <div class="frow2"><span>of na</span>${sel('maxT', [[4, '4 s'], [8, '8 s'], [15, '15 s'], [30, '30 s']], M.maxT)}</div>
      <p class="hint">Sterkte past zich na elke reeks vanzelf aan. Wie je niet ziet uitlopen, wordt op de achtergrond afgemaakt: de uitslag is altijd eerlijk.</p></details>
      <div class="btns"><button class="btn primary" data-ev="mut-go"${dis}>${M.busy && !M.auto ? 'Bezig…' : M.round ? 'Nieuwe reeks' : 'Start'}</button><button class="btn" data-ev="mut-auto"${dis} title="Steeds de zekere winnaar als nieuwe bron, tot er geen zekere winst meer is (max ${AUTO_MAX} reeksen)">${M.auto ? '🔁 Doorkweken…' : '🔁 Doorkweken'}</button>${M.busy ? '<button class="btn" data-ev="mut-stop">Stop</button>' : ''}</div>
      ${goalHtml()}`;
  }
  // tabel: plaats, naam, score, score per ronde, (testbaan), verschil met origineel + zekerheid
  function mutTable(rows, done) {
    const M = E.mut, base = rows.find(x => x.a.base), R = M.sc[0].length, perR = R <= 10;
    const head = `<tr><th>#</th><th>Algoritme</th><th title="gemiddelde over alle rondes, 0–100">Score</th>${perR ? Array.from({ length: R }, (_, i) => `<th>R${i + 1}</th>`).join('') : '<th>laagste</th><th>hoogste</th>'}${done ? '<th title="12 vaste doolhoven, zelfde maat, ter controle">Testbaan</th>' : ''}<th>Δ</th></tr>`;
    const body = rows.slice(0, done ? 41 : 12).map((x, i) => {
      const d = r1(x.avg - base.avg), idx = done ? M.res.indexOf(x) : -1, on = done && M.pick === idx, clk = done && canSave(x);
      const cells = perR ? x.s.map((v, j) => `<td${!x.a.base && v > base.s[j] ? ' class="win"' : ''}>${v}</td>`).join('') : `<td>${Math.min(...x.s)}</td><td>${Math.max(...x.s)}</td>`;
      const sure = x.sure ? `<span title="${esc(x.sure.txt)}">${x.sure.icon}</span>` : '';
      return `<tr class="${i ? '' : 'top'}${on ? ' pick' : ''}${clk ? ' clk' : ''}"${clk ? ` data-ev="mut-pick" data-k="${idx}" title="klik om deze te kiezen"` : ''}><td>${i + 1}</td><th><i class="sw" style="background:${x.a.col}"></i>${esc(x.a.name)}${x.a.base ? ' <small>maatstaf</small>' : ''}</th><td class="${i ? '' : 'best'}"><b>${r1(x.avg)}</b></td>${cells}${done ? `<td>${x.t}</td>` : ''}<td>${x.a.base ? '' : (d > 0 ? '+' : '') + d} ${sure}</td></tr>`;
    }).join('');
    return `<div class="duel-wrap"><table class="duel mut-tab"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }
  function autoHtml() {
    const M = E.mut; if (!M.hist || !M.hist.length) return '';
    return `<div class="tree"><b>Doorkweken</b> ${M.hist.map(h => `reeks ${h.n}: ${h.gain > 0 ? '+' : ''}${h.gain} ${h.sure ? '✅' : '❌'}`).join(' · ')}${!M.auto && !M.busy ? ' → klaar' : ''}</div>`;
  }
  function mutOut() {
    const M = E.mut; if (!M) return '';
    let html = '';
    const run = T.runs && T.runs[0], played = M.list ? M.sc[0].length : 0;
    if (M.busy && M.auto && !played && M.hist.length) html += `<div class="wait">Reeks ${M.hist.length} gaf een zekere winnaar. Reeks ${M.hist.length + 1} start met die winnaar als bron…</div>`;
    if (M.busy && run && T.show && T.show.kind === 'mut') {
      const ser = M.auto ? `Reeks ${M.hist.length + 1} · ` : '';
      if (M.wait) html += `<div class="wait">${ser}Ronde ${M.round} klaar. Ronde ${M.round + 1} van ${M.target} start zo, op een nieuw doolhof…</div>`;
      else {
        const n = run.ws.length, need = M.need ? Math.min(M.need, n) : n, got = run.order.length;
        const el = performance.now() / 1000 - T.t0, left = Math.max(0, Math.ceil(M.maxT - el)), p = Math.min(1, Math.max(got / need, el / M.maxT));
        html += `<div class="wait">${ser}Ronde <b>${M.round}/${M.target}</b> (doolhof ${M.round}) · <b>${got}</b> binnen · ${run.cut} afgekapt · nog max ${left} s</div>
          <div class="prog"><i style="width:${Math.round(p * 100)}%"></i></div>
          <div class="wsec">Binnen deze ronde</div><ol class="arrivals">${run.order.slice(0, 6).map(w => `<li><i class="sw" style="background:${w.col}"></i>${esc(w.ge.name)}<em>${w.steps} st.</em></li>`).join('') || '<li class="hint">nog niemand…</li>'}</ol>`;
      }
      if (played) html += `<p><b>Tussenstand na ${played} ${played > 1 ? 'doolhoven' : 'doolhof'}</b> · score 0–100, beste eerst</p>` + mutTable(mutStand(), false);
      html += autoHtml();
    } else if (M.res) {
      const w = M.res[0], base = M.res.find(x => x.a.base), d = r1(w.avg - base.avg), s = w.sure;
      const evolved = M.src.genes.join() !== M.orig0.join();
      if (w.a.base) html += evolved
        ? `<div class="mut-win"><span class="md">🔁</span><div><b>Doorkweken klaar</b><span>Geen zekere winst meer. Beste gevonden: <b>${esc(M.src.name)}</b>, testbaan ${base.t} (start ${EV().testScore(M.orig0).score}).</span></div></div>`
        : `<div class="mut-win lose"><b>Geen mutant was beter</b><span>Het origineel won met score ${base.avg} over ${played} doolhoven. Probeer opnieuw: de sterkte is al aangepast.</span></div>`;
      else html += `<div class="mut-win ${s.k}"><span class="md">${s.k === 'yes' ? '🏆' : '🤔'}</span><div><b>${esc(w.a.name)}</b><span>score <b>${w.avg}</b> over <b>${played}</b> verschillende doolhoven · origineel ${base.avg} <em class="up">+${d}</em></span><span class="sure">${s.icon} ${esc(s.txt)}</span></div>
        ${s.k === 'maybe' ? '<button class="btn primary" data-ev="mut-more">+5 doolhoven</button>' : ''}</div>`;
      if (M.strNote) html += `<p class="hint">${M.strNote}</p>`;
      html += `<p class="hint">Score = gemiddelde van R1…R${played}, 0–100 (100 = elke keer de kortste route). Groen = beter dan het origineel op dat doolhof. Testbaan = 12 vaste doolhoven, zelfde maat, ter controle. Klik een rij om die te bewaren. Het doolhof laat de winnaar nog eens rustig lopen.</p>` + mutTable(M.res, true);
      html += autoHtml() + mutSaveBox();
      if (M.lead.length > 1) html += `<div class="tree"><b>Koploper per ronde</b> ${M.lead.map(l => `R${l.round}: ${esc(l.name.replace(M.src.name + ' ', ''))} (${l.avg})`).join(' · ')}</div>`;
    } else if (!M.busy) html += '<p class="hint">Kies ⚡ Snel of 🔬 Grondig en druk op Start. Of laat het lab zelf doorkweken. Het doolhof laat nu een voorproefje van het origineel zien.</p>';
    return html;
  }
  // doelen: klassiekers als ladder, jouw beste eigen algoritme ertussen
  function goalHtml(extra) {
    const Ev = EV(), cls = Ev.PRESETS.map(p => ({ name: p.name, s: Ev.testScore(p.genes).score, g: p.genes })).filter(c => c.s >= 10).sort((a, b) => a.s - b.s); // Dwaler is geen doel
    const own = Ev.loadAlgos().map(a => ({ name: a.name, s: Ev.testScore(a.genes).score, g: a.genes })).concat(extra ? [extra] : []);
    const mine = own.slice().sort((a, b) => b.s - a.s)[0];
    const next = mine ? cls.find(c => c.s >= mine.s) : cls[0]; // gelijk = nog niet verslagen
    const bar = (goals, me, nx, unit) => {
      const top = Math.max(100, ...goals.map(c => c.s));
      const dots = goals.map(c => `<i class="lg-c${me && me.s > c.s ? ' beat' : ''}${c.mile ? ' mile' : ''}" style="left:${c.s / top * 100}%" title="${esc(c.name)} ${c.s}${unit}">${c === nx ? `<span class="${c.s / top < 0.2 ? 'l' : c.s / top > 0.8 ? 'r' : ''}">doel: ${esc(c.name)}</span>` : ''}</i>`).join('');
      return `<div class="lg-bar">${dots}${me ? `<i class="lg-me" style="left:${me.s / top * 100}%" title="${esc(me.name)} ${me.s}${unit}"></i>` : ''}</div>`;
    };
    // trap 1: klassiekers op de testbaan
    if (!mine || next) {
      const txt = !mine ? `Nog geen eigen algoritme. Eerste doel: <b>${esc(cls[0].name)}</b> verslaan.`
        : `Jouw beste: <b>${esc(mine.name)}</b> ${mine.s} · volgende doel: <b>${esc(next.name)}</b> ${next.s} <small>(${next.s === mine.s ? 'gelijk: net iets beter nodig' : 'nog ' + r1(next.s - mine.s)})</small>`;
      return `<div class="ladder"><div class="lg-t"><em class="lg-k">Trap 1 · testbaan</em>${txt}</div>${bar(cls, mine, next, '')}</div>`;
    }
    // trap 2: zware testbaan (klassiekers + mijlpalen 50/70/90)
    if (!Ev.heavyReady()) return `<div class="ladder"><div class="lg-t"><em class="lg-k">Trap 1 ✓</em>🏆 Jouw <b>${esc(mine.name)}</b> (${mine.s}) verslaat alle klassiekers. Volgende trap: de zware testbaan <small>(wordt klaargezet…)</small></div>${bar(cls, mine, null, '')}</div>`;
    const hc = Ev.PRESETS.map(p => ({ name: p.name, s: Ev.heavyScore(p.genes).score })).filter(c => c.s >= 5);
    const miles = [50, 70, 90].filter(v => !hc.some(c => Math.abs(c.s - v) < 2)).map(v => ({ name: 'zwaar ' + v, s: v, mile: true }));
    const goals = hc.concat(miles).sort((a, b) => a.s - b.s);
    const hm = own.map(o => ({ name: o.name, s: Ev.heavyScore(o.g).score })).sort((a, b) => b.s - a.s)[0];
    const nx = goals.find(c => c.s >= hm.s);
    const txt = nx ? `Zware testbaan: jouw beste <b>${esc(hm.name)}</b> ${hm.s} · volgende doel: <b>${esc(nx.name)}</b> ${nx.s} <small>(nog ${r1(nx.s - hm.s)})</small>`
      : `👑 Jouw <b>${esc(hm.name)}</b> (${hm.s}) verslaat ook alles op de zware testbaan. Alle doelen gehaald!`;
    return `<div class="ladder heavy"><div class="lg-t"><em class="lg-k">Trap 2 · zware testbaan</em>${txt}</div>${bar(goals, hm, nx, ' zwaar')}</div>`;
  }
  // bewaren: gekozen rij met eigen naam, map en notitie
  function mutSaveBox() {
    const M = E.mut, x = M.res[M.pick];
    if (M.saved) return `<div class="after mut-save"><h4>✓ Bewaard als <b>${esc(M.saved.name)}</b></h4><span class="hint" style="width:100%;margin:0">Staat nu bij Algoritmes en kan als oplosser gekozen worden. Zet hem meteen in:</span>
      <button class="btn primary" data-ev="mut-go-build">▶ Laat hem lopen (Bouwen)</button><button class="btn primary" data-ev="mut-go-race">🏁 Race tegen klassiekers (Lab)</button>
      <button class="btn" data-ev="mut-again">Nieuwe reeks met ${esc(M.saved.name)} als bron</button><button class="btn" data-ev="mut-duel">Duel met origineel</button><button class="btn" data-ev="mut-bench">Naar werkbank</button>
      <div style="width:100%">${goalHtml()}</div></div>`;
    if (!canSave(x)) return '<div class="after mut-save"><h4>Kies een mutant</h4><span class="hint" style="margin:0">Klik een rij in de tabel om die te bewaren.</span></div>';
    const algos = EV().loadAlgos(), parent = algos.find(a => a.genes.join() === M.orig0.join());
    const name = M.saveName != null ? M.saveName : `${M.root.replace(/ v\d+$/, '')} v${parent ? parent.ver + 1 : 2}`;
    const nt = M.saveNote != null ? M.saveNote : `Mutantenlab: score ${x.avg} over ${M.sc[0].length} doolhoven, testbaan ${x.t}${M.hist.length ? `, ${M.hist.length} reeksen doorgekweekt` : ''}, vanaf ${M.root}`;
    return `<div class="after mut-save"><h4>💾 Bewaar <i class="sw" style="background:${x.a.col}"></i>${esc(x.a.name)} als nieuw algoritme</h4>
      <label class="frow" style="width:100%"><span>Naam</span><input id="mut-name" value="${esc(name)}" maxlength="40"></label>
      <label class="frow" style="width:100%"><span>Map</span><input id="mut-folder" value="${esc(M.saveFolder != null ? M.saveFolder : parent ? parent.folder || '' : '')}" maxlength="30" placeholder="(geen)"></label>
      <label class="frow" style="width:100%"><span>Notitie</span><textarea id="mut-note" rows="2" maxlength="500">${esc(nt)}</textarea></label>
      <button class="btn primary" data-ev="mut-save">Bewaar</button><button class="btn" data-ev="mut-duel">Eerst duel met origineel</button>
      <div style="width:100%">${goalHtml({ name: x.a.name, s: x.t, g: x.a.genes })}</div></div>`;
  }
  function mutSave() {
    const M = E.mut; if (!M || !M.res) return;
    const x = M.res[M.pick]; if (!canSave(x)) { note('Kies eerst een mutant in de tabel.'); return; }
    const algos = EV().loadAlgos(), parent = algos.find(a => a.genes.join() === M.orig0.join());
    const ver = parent ? parent.ver + 1 : 2;
    const name = ($('#mut-name') ? $('#mut-name').value : M.saveName || '').trim().slice(0, 40) || `${M.root.replace(/ v\d+$/, '')} v${ver}`;
    const folder = ($('#mut-folder') ? $('#mut-folder').value : M.saveFolder || '').trim().slice(0, 30);
    const nt = ($('#mut-note') ? $('#mut-note').value : M.saveNote || '').slice(0, 500);
    const a = saveVersion({ name, genes: x.a.genes, parent: parent ? parent.id : M.rootId, ver, parents: [M.root], folder, tags: parent && parent.tags && parent.tags.length ? parent.tags : ['mutant'], born: E.gen, note: nt });
    if (!a) return;
    M.saved = a; note(`${a.name} bewaard.`);
    taskOut();
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
        <text x="40" y="206">generatie ${hs[0].gen}</text><text x="680" y="206" text-anchor="end">generatie ${hs[n - 1].gen}</text><text x="44" y="14" fill="#4cc9f0">record score testbaan</text><text x="200" y="14" fill="#ffd166">score beste (eigen doolhoven)</text></svg>`;
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
    EV().saveAlgos(list); return a;
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
    else if (act === 'tour') tour(+b.dataset.k || 0);
    else if (act === 'tour-end') tour(null);
    else if ((act === 'go-build' || act === 'go-race') && a && A.go) A.go(act === 'go-race' ? 'race' : 'build', a);
    else if (act === 'go-watch' && A.go) { if (a && !a.classic && !isSaved(a.genes)) addAlgo({ name: a.name, genes: a.genes, born: a.born || 0, parents: a.parents || [] }); if (!EV().loadAlgos().length) { note('Bewaar eerst een eigen algoritme; Kijken toont dan alleen jouw algoritmes.'); return; } A.go('watch', a); }
    else if (act === 'share' && a) { E.share = E.share === a.id ? null : a.id; algoDetail(); }
    else if (act === 'share-copy' && a) { const url = shareLink(a); (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => note('Link gekopieerd.'), () => prompt('Kopieer deze link', url)); }
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
      B.genes = B.genes.map((v, i) => r() < 0.4 ? EV().clamp(v + (r() * 2 - 1) * (G[i].hi - G[i].lo) * 0.12, i, v) : v).map(v => Math.round(v * 10) / 10);
      taskIn(); benchRide();
    }
    // duel
    else if (act === 'duel-start' && E.duel) startDuel(E.duel.pick, true);
    else if (act === 'duel-again' && E.duel) { T.salt++; T.forced = null; T.mazes = []; startDuel(E.duel.pick, false); }
    // mutanten
    else if (act === 'mut-go' && M) { M.rounds = +M.rounds; M.auto = false; M.hist = []; mutMake(); mutRound(); }
    else if (act === 'mut-auto' && M) { M.rounds = +M.rounds; M.auto = true; M.hist = []; M.src = { ...M.src, genes: M.orig0.slice(), name: M.root }; mutMake(); mutRound(); }
    else if (act === 'mut-preset' && M && !M.busy) { Object.assign(M, MUT_PRESET[b.dataset.p]); taskIn(); }
    else if (act === 'mut-more' && M && M.res) { M.target = M.sc[0].length + 5; M.res = null; M.saved = null; mutRound(); }
    else if ((act === 'mut-go-build' || act === 'mut-go-race') && M && M.saved && A.go) A.go(act === 'mut-go-race' ? 'race' : 'build', M.saved);
    else if (act === 'mut-stop' && M) {
      M.busy = false; M.wait = false; M.auto = false; if (T.show && T.show.kind === 'mut' && T.phase === 'run') T.running = false;
      if (M.list && M.sc[0].length) mutFinish(); else { M.round = 0; setStep('pick'); taskIn(); }
    }
    else if (act === 'mut-pick' && M && M.res) { M.pick = +b.dataset.k; M.saved = null; M.saveNote = null; taskOut(); }
    else if (act === 'mut-save' && M) mutSave();
    else if ((act === 'mut-again' || act === 'mut-bench') && M && M.saved) openTask(act === 'mut-again' ? 'mut' : 'bench', { ...M.saved, mine: true });
    else if (act === 'mut-duel' && M && M.res && M.res[M.pick]) { const x = M.res[M.pick]; duelNow([{ id: 'mut-orig', name: M.root, genes: M.orig0 }, { id: M.saved ? M.saved.id : 'mut-best', name: M.saved ? M.saved.name : x.a.name, genes: x.a.genes }]); }
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
        for (const x of (o.algos || [])) if ((x.genes = EV().upGenes(x.genes)) && EV().okGenes(x.genes)) {
          if (addAlgo({ name: str(x.name, 40) || 'Geïmporteerd', genes: x.genes.map((v, i) => EV().clampHard(v, i)), born: x.born | 0, parents: Array.isArray(x.parents) ? x.parents.map(p => str(p, 40)) : [],
            ver: x.ver | 0 || 1, folder: str(x.folder, 30), tags: Array.isArray(x.tags) ? x.tags.map(t => str(t, 20)).filter(Boolean) : [], note: str(x.note, 500) })) n++;
        }
      } catch (e) { /* ongeldig */ }
      note(n ? `${n} algoritme${n === 1 ? '' : 's'} geïmporteerd.` : 'Niets nieuws gevonden in dat bestand.'); afterSave(); if (E.page === 'algos') algosRender();
    };
    rd.readAsText(f);
  }
  function pasteCode() {
    const s = prompt('Plak een deelcode of link (MLDNA1:…, MLDNA2.… of …#dna=…)');
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
        else if (k === 'evoAutoStop' || k === 'evoAutoSave' || k === 'evoGrow') { E.stopFrom = E.gen; E.growG = E.gen; champCard(); status(); }
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
      else if (E.mut && t.id === 'mut-name') E.mut.saveName = t.value;
      else if (E.mut && t.id === 'mut-folder') E.mut.saveFolder = t.value;
      else if (E.mut && t.id === 'mut-note') E.mut.saveNote = t.value;
    });
    view.addEventListener('change', e => {
      const t = e.target;
      if (t.id === 'lib-folder') { E.libFolder = t.value; algoGrid(); }
      else if (t.id === 'lib-sort') { E.libSort = t.value; algoGrid(); }
      else if (t.dataset.f) libField(t);
      else if (t.dataset.mut && E.mut) { const k = t.dataset.mut; E.mut[k] = k === 'str' ? t.value : +t.value; }
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
    const shared = openShared();
    if (!started) {
      started = true; makePanes(); setPage(E.page);
      requestAnimationFrame(() => { startGen(); refreshUI(true); evoBar(); });
      // zware testbaan op de achtergrond klaarzetten (8 grote doolhoven bouwen duurt even)
      setTimeout(() => {
        EV().heavyScore(EV().PRESETS[0].genes); if (E.champ && E.champ.heavy == null) E.champ.heavy = EV().heavyScore(E.champ.genes).score;
        refreshUI(true); if (E.page === 'algos') { algoGrid(); algoDetail(); }
      }, 1500);
    } else setPage(E.page);
    if (shared) { algoGrid(); algoDetail(); }
    let seenTour = true; try { seenTour = !!localStorage.getItem('mazelab.tour'); } catch (e) { /* geen opslag */ }
    if (!seenTour && !shared) setTimeout(() => { if (A.S.mode === 'evo' && !$('#evo-tour')) tour(0); }, 600);
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

  ML.EvoUI = { init, enter, frame, key, setPalette, _test: { E, autoSave, grow } }; // _test: alleen voor de rooktest
})(window.ML = window.ML || {});
