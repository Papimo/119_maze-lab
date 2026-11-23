// UI, standen (Bouwen / Lab / Vandaag / Kijken) en de animatielus.
(function (ML) {
  'use strict';
  const $ = s => document.querySelector(s);
  const STORE = 'mazelab.settings';
  const AN = ML.ANIM;

  const S = {
    mode: 'evo', grid: 'square', shape: 'rect', text: 'MAZE', size: 24, levels: 1, torus: false,
    gen: 'backtracker', mix: 75, braid: 0, seed: ML.randomSeed(),
    keys: 0, oneways: 0, teleports: 0, switches: 0, timed: 0, terrain: 0,
    solver: 'bfs', speed: 45, palette: 'maquette', life: true, variant: '', styleV: 1, target: 50,
    compare: 'solvers', panes: 2, swarmN: 100, feet: 'color', under: false, heat: true, raceSel: ['bfs', 'astar', 'dfs', 'wall'],
    paneSel: ['bfs', 'astar', 'dfs', 'wall'], paneGen: ['backtracker', 'prim', 'kruskal', 'wilson'],
    // 2.0
    trails: true, patch: true, rainbow: true, wave: true, glint: true, flow: true, mood: 'dag', vignette: true, bloom: true,
    sound: false, follow: false, view3d: false, cam3d: 'orbit',
    // evolutie
    evoPop: 40, evoMazes: 1, evoGrid: 'square', evoMakers: 'mix', evoSize: 14, evoBraid: 0, evoPuzzle: false, evoSame: false,
    evoMut: 30, evoSpeed: 50, evoClassics: true, evoSeedSaved: false,
    evoMazeMode: 'new', evoSetN: 6, evoColor: 'species', evoFast: 'simple', evoV: 0, evoRuns: 1, evoIslands: 1, evoHunt: []
  };
  try { Object.assign(S, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* geen opslag */ }
  if (S.mode === 'watch') S.mode = 'build';
  if ((S.evoV | 0) < 2) { S.mode = 'evo'; S.evoMazes = 1; S.evoMazeMode = S.evoSame ? 'fixed' : 'new'; S.evoV = 2; } // Evolutie 2 = startscherm, 1 groot paneel
  if (S.styleV !== 1) { S.palette = 'maquette'; S.styleV = 1; } // maquette = nieuwe standaardstijl
  ML.V2.S = S;
  const SWARMY = () => S.compare === 'swarm' || S.compare === 'ants';
  const isSwarmSolver = id => id === 'swarm' || id === 'ants';
  const solverName = id => id === 'swarm' ? 'Zwerm' : id === 'ants' ? 'Mierenkolonie' : byId(ML.SOLVERS, id).name;
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* geen opslag */ } };

  const GEN_X = 6, GEN_MAX = 2; // bouwen: 6× de oplos-snelheid, hooguit ~2 s
  const speedToSpf = v => Math.pow(10, v / 25 - 1); // 0.1 … 1000 stappen per beeld
  const pal = () => ML.PALETTES[S.palette] || ML.PALETTES.blauwdruk;
  const byId = (list, id) => list.find(x => x.id === id) || list[0];
  const GRID_NAMES = { square: 'Vierkant', hex: 'Zeshoek', tri: 'Driehoek', polar: 'Ringen' };

  // Kosten van een gelopen route (wachten en teleporteren = 1).
  function pathCost(m, path) {
    let c = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      c += a === b || !ML.edge(m, a, b) ? 1 : m.cost[b];
    }
    return Math.round(c * 10) / 10;
  }

  // Verloop voor de grafiek: [stap, bezocht], max ~400 punten (dunt zichzelf uit).
  const mkHist = () => ({ pts: [[0, 0]], stride: 1 });
  function histPush(h, step, v, force) {
    if (!force && step % h.stride) return;
    const L = h.pts[h.pts.length - 1];
    if (L[0] === step) { L[1] = v; return; }
    h.pts.push([step, v]);
    if (h.pts.length > 400) { h.pts = h.pts.filter((_, i) => i % 2 === 0 || i === h.pts.length - 1); h.stride *= 2; }
  }

  // ---- Commentator: tekstballon boven race/zwerm (alleen als het paneel een .say heeft) ----
  const SAY = {
    start: ['En ze zijn weg!', 'Daar gaan ze!', 'Het startschot klinkt!'],
    swarm: ['{n} lopers stormen naar binnen!', 'Daar komt de zwerm: {n} lopers, {n} plannen.', 'Wie van de {n} is het snelst?'],
    lead: ['{a} neemt de leiding!', '{a} schuift naar voren.', 'Kijk {a} gaan!', '{a} ruikt het doel.', 'Nu ligt {a} voor!'],
    close: ['{a} is er bijna!', 'Nog een paar bochten voor {a}…', '{a} ziet het doel al.'],
    half: ['{a} heeft al de helft van het doolhof gezien.', '{a} dwaalt flink rond…', '{a} neemt de toeristische route.'],
    stuck: ['{a} loopt vast! Au.', 'Oei, {a} komt er niet meer uit.', '{a} geeft het op.'],
    win: ['{a} wint! Na {n} stappen.', 'Daar is {a}! Eerste bij het doel.', 'Wat een race: {a} is binnen!'],
    place: ['{a} wordt {r}e.', '{a} komt als {r}e binnen.', 'En daar is {a}, {r}e.'],
    swin: ['Loper {a} wint! {n} stappen.', 'Nummer {a} is er! De rest mag naar huis.', '{a} van de {m} had de beste ingeving!']
  };
  function say(r, kind, vars, col, prio) {
    const el = r.el && r.el.querySelector('.say'), now = performance.now();
    if (!el || (!prio && now - (r.sayT || 0) < 2200)) return;
    r.sayT = now;
    const list = SAY[kind], txt = list[Math.floor(Math.random() * list.length)].replace(/\{(\w)\}/g, (_, k) => vars[k] != null ? vars[k] : '');
    el.innerHTML = `<i class="dot" style="background:${col || 'var(--accent)'}"></i>${txt}`;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  // Wie ligt voor (dichtst bij het doel); meldt een wissel. items: [{ key, cell, name, col }]
  function leadCheck(r, items) {
    const d = r.gdist; if (!d || !items.length) return;
    let best = items[0];
    for (const q of items) if (d[q.cell] < d[best.cell]) best = q;
    if (best.key !== r.leadKey && (r.leadKey == null || d[best.cell] < r.leadD)) { r.leadKey = best.key; say(r, 'lead', { a: best.name }, best.col); }
    if (best.key === r.leadKey) r.leadD = d[best.cell];
    if (!r.saidClose && d[best.cell] <= 3) { r.saidClose = true; say(r, 'close', { a: best.name }, best.col, true); }
  }

  // Hittekaart na afloop: bezoeken per cel als gloed (zelfde kleuren als de zwerm); vervangt dan de volgordekleuren.
  const HEAT_IN = 0.9;
  function heatFx(v, g, r, now) {
    if (!S.heat || v.doneT == null || !v.heat) return false;
    const e = Math.min(1, Math.max(0, now - v.doneT) / HEAT_IN);
    ML.drawHeat(g, r, r.m, v.heat, e);
    return e < 1;
  }

  // Kijkcijfers: race-winnaars per dag (localStorage mazelab.races = { ymd: { solverId: winst } }).
  const RACES = 'mazelab.races';
  const racesLoad = () => { try { return JSON.parse(localStorage.getItem(RACES) || '{}'); } catch (e) { return {}; } };
  function raceWin(id) {
    const all = racesLoad(), d = ML.Daily.ymd(), day = all[d] = all[d] || {};
    day[id] = (day[id] || 0) + 1;
    try { localStorage.setItem(RACES, JSON.stringify(all)); } catch (e) { /* geen opslag */ }
  }
  function boardHtml() {
    const all = racesLoad(), day = all[ML.Daily.ymd()] || {}, tot = {};
    for (const k in all) for (const id in all[k]) tot[id] = (tot[id] || 0) + all[k][id];
    const rows = Object.entries(day).sort((a, b) => b[1] - a[1]).slice(0, 5), mx = rows.length ? rows[0][1] : 1;
    if (!rows.length) return '<b>Kijkcijfers</b><small>vandaag nog geen races</small>';
    return '<b>Kijkcijfers vandaag</b>' + rows.map(([id, n], i) => `<div class="brow${i ? '' : ' top'}"><span>${byId(ML.SOLVERS, id).name}</span><i style="width:${Math.round(n / mx * 100)}%"></i><em>${n}</em></div>`).join('') +
      `<small>altijd: ${Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => `${byId(ML.SOLVERS, id).name} ${n}`).join(' · ')}</small>`;
  }

  // ---- Runner: één doolhof + animatie op één canvas ----
  class Runner {
    constructor(canvas) {
      this.cv = canvas; this.r = new ML.Render2D(canvas);
      this.m = null; this.P = null; this.phase = 'idle'; this.vs = { cur: -1 }; this.acc = 0; this.steps = 0;
      this.fx = []; this.lastT = 0; this.clk = -1; this.lifeT = 0;
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
      const m = this.m = ML.makeMaze(this.s, this.aspect());
      this.P = null; this.score = null; this.play = null; this.fx.length = 0; this.racers = null; this.hist = null; this.sw = null;
      this.genIt = byId(ML.GENERATORS, genId).fn(m, ML.makeRng(s.seed + '|' + genId), { mix: s.mix / 100 });
      this.vs = { inMaze: new Uint8Array(m.cells.length), cur: -1, wallAnim: new Map(), tail: [], riseT: animate ? performance.now() / 1000 : null,
        gord: new Int32Array(m.cells.length).fill(-1), gn: 0, rainbowHue: Math.floor(Math.random() * 360) };
      this.phase = 'gen'; this.steps = 0; this.result = null; this.stats = null; this.acc = 0;
      // bouwen gaat los van de oplos-snelheid: GEN_X keer sneller, en nooit langer dan ~GEN_MAX s
      const gd = byId(ML.GENERATORS, genId);
      this.genMin = m.cells.length * (gd.slow || (genId === 'wilson' ? 5 : 2)) / (GEN_MAX * 60);
      if (!animate) this.finishGen(); else { this.dirty = true; this.emit('gen'); }
    }
    finishGen() {
      for (let r = this.genIt.next(); !r.done; r = this.genIt.next());
      const m = this.m;
      ML.finishMaze(m, this.s, this.genId);
      this.P = ML.makeProblem(m);
      this.stats = ML.mazeStats(m);
      this.score = ML.difficulty(m);
      const old = this.vs, now = performance.now() / 1000;
      this.vs = { cur: -1, readyT: now };
      if (old && old.gord && old.gn > 0) this.vs.rainbow = { ord: old.gord, t0: now };
      this.phase = 'ready'; this.dirty = true;
      this.emit('ready');
    }
    solve(solverId) {
      if (!this.m) return;
      if (this.phase === 'gen') this.finishGen();
      const m = this.m, n = m.cells.length;
      this.solverId = solverId; this.play = null;
      this.solIt = byId(ML.SOLVERS, solverId).fn(m, this.P);
      this.vs = {
        order: new Int32Array(n).fill(-1), nOrder: 0, front: new Uint8Array(n), cur: -1, path: null,
        vt: new Float64Array(n), recent: [], tail: [], side: new Uint8Array(n), dead: new Uint8Array(n), prints: []
      };
      const pr = this.vs.prints, vv = this.vs;
      vv.heat = new Float32Array(n);
      vv.floorFx = (g, r, now) => { const a = heatFx(vv, g, r, now); return (S.feet === 'paws' ? ML.Prints.draw(g, r, pr, now) : false) || a; };
      this.steps = 0; this.result = null; this.phase = 'solve'; this.acc = 0; this.dirty = true;
      this.hist = mkHist(); this.racers = null; this.sw = null;
      this.emit('solve');
    }
    // Race: meerdere oplossers tegelijk op hetzelfde doolhof, elk dezelfde stappen per beeld.
    race(ids) {
      if (!this.m) return;
      if (this.phase === 'gen') this.finishGen();
      const m = this.m, n = m.cells.length;
      this.play = null; this.result = null; this.steps = 0; this.acc = 0; this.hist = null; this.sw = null;
      this.racers = ids.map((id, k) => {
        const sv = byId(ML.SOLVERS, id);
        return { id: sv.id, name: sv.name, col: ML.RACECOL[k % ML.RACECOL.length], it: sv.fn(m, this.P), seen: new Uint8Array(n), list: [],
          cur: m.start, tail: [], path: null, pathT: 0, found: false, done: false, steps: 0, rank: 0, hist: mkHist() };
      });
      this.finished = 0; this.gdist = ML.goalDist(m); this.leadKey = null; this.saidClose = false;
      this.vs = { cur: -1, race: this.racers, heat: new Float32Array(n) };
      const vv = this.vs; vv.floorFx = (g, r, now) => heatFx(vv, g, r, now);
      say(this, 'start', {}, null, true);
      this.phase = 'race'; this.dirty = true;
      this.emit('solve');
    }
    // Zwerm: n lopers met elk een eigen willekeurig pad; de eerste bij het doel wint.
    swarm(n, ants) {
      if (!this.m) return;
      if (this.phase === 'gen') this.finishGen();
      this.play = null; this.result = null; this.steps = 0; this.acc = 0; this.racers = null; this.hist = mkHist();
      const sw = this.sw = new (ants ? ML.Ants : ML.Swarm)(this.m, this.P, n || 100, ML.randomSeed());
      this.swLast = 0;
      this.vs = { cur: -1, floorFx: (g, r, now) => sw.draw(g, r, now) };
      this.phase = 'swarm'; this.dirty = true; this.gdist = sw.dist; this.leadKey = null; this.saidClose = false;
      say(this, 'swarm', { n: sw.n }, ML.HEAT_STOPS[3], true);
      this.emit('solve');
    }
    tickSwarm(spf, t) {
      const sw = this.sw, dt = this.swLast ? Math.min(0.05, t - this.swLast) : 0;
      this.swLast = t;
      sw.step(dt * Math.min(60, Math.max(spf ? 1 : 0, spf * 60 / 25)), t); // cellen per seconde per loper
      this.steps = Math.round(sw.clock);
      histPush(this.hist, this.steps, sw.reached);
      if (!sw.winner && sw.alive) { const L = sw.leader(); if (L) leadCheck(this, [{ key: L.k, cell: L.nc, name: '#' + L.k, col: '#ffd34d' }]); }
      if (sw.winner) {
        const v = this.vs;
        say(this, 'swin', { a: '#' + sw.winner.k, n: sw.winner.steps, m: sw.n }, '#ffd34d', true);
        this.result = sw.result; this.result.cost = pathCost(this.m, this.result.path); this.steps = sw.winner.steps;
        histPush(this.hist, Math.round(sw.clock), sw.reached, true);
        v.path = this.result.path; v.pathT = 0;
        this.phase = v.path.length > 1 ? 'path' : 'done';
        this.emit('solved');
      } else if (!sw.alive) {
        this.result = { found: false, path: [], states: [] }; this.phase = 'done'; this.emit('done');
      }
      this.dirty = true;
    }
    clearSolve() {
      if (!this.m || this.phase === 'gen') return;
      this.vs = { cur: -1 }; this.phase = 'ready'; this.result = null; this.steps = 0; this.play = null; this.dirty = true;
      this.racers = null; this.hist = null; this.sw = null;
      this.emit('clear');
    }
    pushTail(c, t) {
      const T = this.vs.tail;
      if (!T) return;
      T.push({ c, t });
      if (T.length > 40) T.splice(0, T.length - 40);
    }
    // Effecten bij een stap van toestand s0 (cel c0) naar s1 (cel c1).
    stepFx(s0, s1, c0, c1) {
      const m = this.m, P = this.P, C = m.cells, cc = C[c1].center;
      if (s0 != null && s1 != null && P) {
        const a = P.dec(s0), b = P.dec(s1), gk = b.k & ~a.k, sw = a.sw ^ b.sw;
        if (gk) ML.FX.sparks(this.fx, cc[0], cc[1], ML.KEYCOL[ML.KEY_COLORS[31 - Math.clz32(gk)]], 30);
        if (sw) ML.FX.sparks(this.fx, cc[0], cc[1], ML.SWCOL[ML.SWITCH_COLORS[31 - Math.clz32(sw)]], 18);
      }
      if (c0 !== c1 && m.telePartner[c0] === c1 && !ML.edge(m, c0, c1)) {
        const p = m.teleporters.findIndex(t => t.a === c0 || t.b === c0), col = ML.teleColor(Math.max(0, p)), f = C[c0].center;
        ML.FX.vortex(this.fx, f[0], f[1], col, false);
        ML.FX.vortex(this.fx, cc[0], cc[1], col, true);
      }
    }
    goalFx() {
      const g = this.m.cells[this.m.goal].center; ML.FX.confetti(this.fx, g[0], g[1]); ML.Sound.chord();
      this.vs.endT = performance.now() / 1000; // eindscène (render2d klemt op >= 0: rAF-tijd kan iets achterlopen)
      this.dirty = true;
    }

    tick(spf, t) {
      const ph = this.phase, v = this.vs;
      if (ph !== 'gen' && ph !== 'solve' && ph !== 'path' && ph !== 'race' && ph !== 'swarm') return;
      if (ph === 'race') { this.tickRace(spf, t); return; }
      if (ph === 'swarm') { this.tickSwarm(spf, t); return; }
      if (ph === 'path') {
        const L = v.path.length - 1, i0 = Math.floor((v.pathT || 0) * L);
        v.pathT = Math.min(1, (v.pathT || 0) + 1 / Math.max(40, Math.min(150, L * 1.5)));
        const i1 = Math.floor(v.pathT * L), sts = this.result.states;
        for (let j = i0 + 1; j <= i1; j++) this.stepFx(sts && sts[j - 1], sts && sts[j], v.path[j - 1], v.path[j]);
        if (sts && sts.length) v.state = sts[Math.min(i1, sts.length - 1)];
        if (v.pathT >= 1) { this.phase = 'done'; if (this.result.found) this.goalFx(); this.emit('done'); }
        this.dirty = true; return;
      }
      const eff = ph === 'gen' && spf > 0 ? Math.max(spf * (this.genX || GEN_X), this.genMin || 0) : spf;
      this.acc += eff;
      let k = Math.floor(this.acc);
      this.acc -= k;
      if (k <= 0) return;
      const anim = eff <= (ph === 'gen' ? 60 : 40);
      if (ph === 'gen') {
        while (k-- > 0) {
          const r = this.genIt.next();
          if (r.done) { this.finishGen(); return; }
          const e = r.value;
          if (e.all) v.inMaze.fill(1);
          if (e.add !== undefined) { v.inMaze[e.add] = 1; if (v.gord && v.gord[e.add] < 0) v.gord[e.add] = v.gn++; }
          if (e.add2 !== undefined) { v.inMaze[e.add2] = 1; if (v.gord && v.gord[e.add2] < 0) v.gord[e.add2] = v.gn++; }
          if (anim && e.carve !== undefined && S.sound) { const b = this.m.bounds, c = this.m.cells[e.add !== undefined ? e.add : Math.max(0, e.cur)]; if (c) ML.Sound.blip((c.center[1] - b.miny) / ((b.maxy - b.miny) || 1), 'carve'); }
          if (anim && e.carve !== undefined) v.wallAnim.set(e.carve, { t0: t, dir: -1 });
          if (anim && e.build !== undefined) v.wallAnim.set(e.build, { t0: t, dir: 1 });
          if (e.cur !== undefined && e.cur !== v.cur) { v.cur = e.cur; if (e.cur >= 0) this.pushTail(e.cur, t); }
          v.walk = e.walk || null; v.walkFrom = e.walkFrom || 0;
        }
      } else {
        while (k-- > 0) {
          const r = this.solIt.next();
          if (r.done) {
            this.result = r.value; v.path = r.value.path; v.pathT = 0; v.cur = -1;
            this.result.cost = pathCost(this.m, v.path);
            if (this.hist) histPush(this.hist, this.steps, v.nOrder, true);
            this.phase = v.path.length > 1 ? 'path' : 'done';
            if (this.phase === 'done' && this.result.found) this.goalFx();
            this.emit('solved'); break;
          }
          const e = r.value;
          if (e.visit !== undefined && v.heat) v.heat[e.visit]++;
          if (e.dead !== undefined) {
            v.dead[e.dead] = 1;
            if (anim && this.fx.length < 400) { const dc = this.m.cells[e.dead].center; ML.FX.sparks(this.fx, dc[0], dc[1], this.r.pal.maq ? 'rgba(150,125,95,0.7)' : 'rgba(200,200,230,0.6)', 5); }
          }
          else if (v.order[e.visit] < 0) {
            v.order[e.visit] = v.nOrder++; v.vt[e.visit] = t; v.recent.push(e.visit);
            if (e.side) v.side[e.visit] = 1;
          }
          if (v.cur !== e.visit && S.sound && anim) { const b = this.m.bounds, c = this.m.cells[e.visit]; ML.Sound.blip((c.center[0] - b.minx) / ((b.maxx - b.minx) || 1), 'visit'); }
          if (v.cur !== e.visit) { if (anim && v.prints) ML.Prints.add(v.prints, this.m, v.cur, e.visit, t); v.cur = e.visit; this.pushTail(e.visit, t); }
          for (const f of e.front) v.front[f] = 1;
          this.steps++;
          if (this.hist) histPush(this.hist, this.steps, v.nOrder);
        }
        const R = v.recent;
        if (R.length > 1200) { const cut = R.length - 1200; for (let i = 0; i < cut; i++) v.vt[R[i]] = 0; R.splice(0, cut); }
      }
      this.dirty = true;
    }
    tickRace(spf, t) {
      const R = this.racers;
      for (const r of R) if (r.done && r.path && r.pathT < 1) r.pathT = Math.min(1, r.pathT + 1 / Math.max(30, Math.min(120, r.path.length)));
      this.acc += spf;
      let k = Math.floor(this.acc);
      this.acc -= k;
      while (k-- > 0 && this.finished < R.length) {
        this.steps++;
        for (const r of R) {
          if (r.done) continue;
          const x = r.it.next();
          if (x.done) {
            r.done = true; r.found = !!x.value.found; r.path = x.value.path && x.value.path.length > 1 ? x.value.path : null;
            this.finished++;
            histPush(r.hist, r.steps, r.list.length, true);
            if (r.found) {
              r.rank = 1 + R.filter(q => q !== r && q.found && q.rank).length;
              if (r.rank === 1) {
                this.goalFx(); say(this, 'win', { a: r.name, n: r.steps }, r.col, true);
                if (this.el) { raceWin(r.id); const b = this.el.querySelector('.board'); if (b) b.innerHTML = boardHtml(); }
              }
              else say(this, 'place', { a: r.name, r: r.rank }, r.col, true);
            } else say(this, 'stuck', { a: r.name }, r.col, true);
            continue;
          }
          const e = x.value;
          r.steps++;
          if (e.visit !== undefined && e.dead === undefined) {
            this.vs.heat[e.visit]++;
            if (!r.seen[e.visit]) { r.seen[e.visit] = 1; r.list.push(e.visit); }
            if (r.cur !== e.visit) { r.cur = e.visit; r.tail.push({ c: e.visit, t }); if (r.tail.length > 14) r.tail.shift(); }
          }
          histPush(r.hist, r.steps, r.list.length);
        }
      }
      if (this.finished < R.length) {
        leadCheck(this, R.filter(q => !q.done).map(q => ({ key: q.id + q.col, cell: q.cur, name: q.name, col: q.col })));
        const half = this.m.cells.length / 2;
        for (const q of R) if (!q.done && !q.saidHalf && q.list.length > half) { q.saidHalf = true; say(this, 'half', { a: q.name }, q.col); }
      }
      if (this.finished >= R.length && R.every(r => !r.path || r.pathT >= 1)) { this.phase = 'done'; this.emit('done'); }
      this.dirty = true;
    }
    draw(t) {
      const dt = this.lastT ? Math.min(0.05, t - this.lastT) : 0, v = this.vs;
      this.lastT = t;
      if (this.fx.length) { ML.FX.step(this.fx, dt); this.dirty = true; }
      if (v.tail && v.tail.length) { let i = 0; while (i < v.tail.length && t - v.tail[i].t > AN.TAIL) i++; if (i) { v.tail.splice(0, i); this.dirty = true; } }
      // 2.0 · camera volgt de zoeker (Bouwen/Lab), zacht in- en uitzoomen
      if (!this.isWatch && this.m) {
        const act = S.follow && (this.phase === 'gen' || this.phase === 'solve' || this.phase === 'path' || this.phase === 'swarm');
        const F = this.fc || (this.fc = { x: null, y: null, z: 1 }), b = this.m.bounds, mid = [(b.minx + b.maxx) / 2, (b.miny + b.maxy) / 2];
        let tgt = null;
        if (act) {
          if (this.phase === 'swarm' && this.sw) { const L = this.sw.leader(); if (L) tgt = this.sw.pos(L); }
          else if (this.phase === 'path') tgt = this.r.headPos;
          else if (v.cur >= 0 && this.m.cells[v.cur]) tgt = this.m.cells[v.cur].center;
        }
        const k = 1 - Math.pow(0.03, dt);
        if (F.x == null && tgt) { F.x = mid[0]; F.y = mid[1]; }
        if (F.x != null) {
          const aim = tgt || mid;
          F.x += (aim[0] - F.x) * k; F.y += (aim[1] - F.y) * k;
          const zt = tgt ? Math.min(2.6, Math.max(1.5, Math.sqrt(this.m.cells.length) / 12)) : 1;
          F.z += (zt - F.z) * k * 0.8;
          if (!tgt && Math.abs(F.z - 1) < 0.004) { F.x = null; F.z = 1; delete v.cam; }
          else v.cam = { x: F.x, y: F.y, z: F.z };
          this.dirty = true;
        }
      }
      if (v.recent && v.recent.length) { let i = 0; while (i < v.recent.length && t - v.vt[v.recent[i]] > AN.RIP) i++; if (i) v.recent.splice(0, i); }
      if (v.wallAnim && v.wallAnim.size) for (const [k, a] of v.wallAnim) if (t - a.t0 > AN.WALL) v.wallAnim.delete(k);
      if (this.m && this.m.timed.length && v.state == null) { const c = Math.floor(t / AN.CLOCK); if (c !== this.clk) { this.clk = c; this.dirty = true; } }
      // rustig leven (maquette): ~30 beelden per seconde, alleen als het canvas zichtbaar is
      if (S.life && this.r.pal.maq && this.m && this.m.ready && t - this.lifeT >= 0.033 && this.cv.getClientRects().length > 0) { this.lifeT = t; this.dirty = true; }
      // thema-leven (tuin: vogels, bladeren, fontein); pas als het doolhof klaar is
      const lp = this.r.pal.life;
      if (lp && S.life && this.m && this.m.ready && this.phase !== 'gen' && ML.THEME_LIFE[lp]) {
        if (!this.tl || this.tl.m !== this.m) this.tl = ML.THEME_LIFE[lp](this.m);
        this.tl.step(dt); v.theme = this.tl;
      } else v.theme = null;
      if (!this.dirty) return;
      this.dirty = false;
      if (v.heat && this.phase === 'done' && v.doneT == null) v.doneT = t;
      v.fx = this.fx; v.P = this.P; v.phase = this.phase; v.life = S.life;
      v.noVisit = (!!v.prints && S.feet === 'paws' && !S.under) || (S.heat && v.doneT != null && t - v.doneT > HEAT_IN);
      if (this.r.draw(this.m, v, t)) this.dirty = true;
      this.drew = true;
    }
  }

  function statusText(r, withMaze) {
    if (!r || !r.m) return '';
    const m = r.m, p = [`${m.cells.length} cellen`];
    if (m.levels > 1) p.push(`${m.levels} verdiepingen`);
    if (r.phase === 'gen') p.push('bouwen…');
    else if (withMaze && r.stats) {
      const st = r.stats;
      p.push(`${st.deadEnds} doodlopend`, `${st.junctions} kruisingen`);
      if (m.levels > 1) p.push(`${st.stairs} trappen`);
      if (st.bridges) p.push(`${st.bridges} bruggen`);
      p.push(`kortste route ${st.route || '—'}` + (st.weighted ? ` (kosten ${Math.round(st.cost * 10) / 10})` : ''));
      if (r.score) p.push(`moeilijkheid ${r.score.score}`);
    }
    if (r.sw) return r.sw.info() + ` · kortste ${r.stats ? r.stats.route : '—'}`;
    if (r.vs.order) p.push(`bezocht ${r.vs.nOrder}`, `stappen ${r.steps}`);
    if (r.result) p.push(r.result.found ? `pad ${r.result.path.length - 1}` + (m.weighted ? ` · kosten ${r.result.cost}` : '') : 'vastgelopen');
    return p.join(' · ');
  }

  // ---- Bouwen ----
  const build = new Runner($('#cv-build'));
  build.onChange = (r, e) => { hudDirty = true; if (e === 'ready') showScore(); };
  let hudDirty = true, paused = false;

  function showScore() {
    const sc = build.score;
    $('#score-bar').style.width = sc ? sc.score + '%' : '0';
    $('#score-text').textContent = sc ? `${sc.score} / 100 · ${sc.label}` : '—';
    const ci = ML.calibInfo();
    $('#calib-text').textContent = ci.n >= ci.min ? `Geijkt op ${ci.n} eigen dagdoolhoven (weging ${ci.w.map(v => Math.round(v * 100)).join('/')}).`
      : `Weging is nog een gok; speel ${ci.min - ci.n} dagdoolhof${ci.min - ci.n === 1 ? '' : 'en'} meer om te ijken.`;
  }
  function recalibrate() {
    ML.calibrate();
    if (build.m && build.m.ready) build.score = ML.difficulty(build.m);
    showScore(); hudDirty = true;
  }
  function findTarget() {
    const base = ML.randomSeed(), t0 = performance.now(), aspect = build.aspect();
    let best = null;
    for (let i = 0; i < 40 && performance.now() - t0 < 2500; i++) {
      const seed = base + i, sc = ML.difficulty(ML.buildFull({ ...S, seed }, S.gen, aspect)).score;
      if (!best || Math.abs(sc - S.target) < Math.abs(best.sc - S.target)) best = { seed, sc };
      if (Math.abs(sc - S.target) <= 3) break;
    }
    S.seed = best.seed; $('[data-key="seed"]').value = S.seed; save();
    regenerate(false);
    const far = Math.abs(best.sc - S.target) > 10;
    $('#score-hint').textContent = `Gevonden: ${best.sc} (doel ${S.target}).` +
      (far ? (best.sc < S.target ? ' Hoger lukt niet met deze instellingen: groter, minder lussen of meer puzzel.' : ' Lager lukt niet: kleiner of minder puzzel.') : '');
  }

  // ---- Lab ----
  let panes = [];
  const paneGen = i => S.compare === 'makers' ? S.paneGen[i] : S.gen;
  const raceIds = () => S.raceSel.slice(0, S.panes);
  const paneSolver = i => S.compare === 'solvers' ? S.paneSel[i] : isSwarmSolver(S.solver) ? 'bfs' : S.solver;

  function makeLab() {
    const grid = $('#lab-grid');
    grid.innerHTML = '';
    panes = [];
    if (S.compare === 'race') { makeRace(grid); return; }
    if (SWARMY()) { makeSwarm(grid); return; }
    grid.dataset.n = S.panes;
    const list = S.compare === 'solvers' ? ML.SOLVERS : ML.GENERATORS;
    const arr = S.compare === 'solvers' ? S.paneSel : S.paneGen;
    for (let i = 0; i < S.panes; i++) {
      const el = document.createElement('div');
      el.className = 'pane';
      el.innerHTML = `<div class="pane-head"><i class="dot" style="background:${ML.RACECOL[i]}"></i><select aria-label="Kies voor paneel ${i + 1}"></select><span class="rank"></span></div>
        <div class="pane-cv"><canvas></canvas></div><div class="pane-stats"></div>`;
      grid.appendChild(el);
      const sel = el.querySelector('select');
      sel.innerHTML = list.map(x => `<option value="${x.id}">${x.name} — ${x.desc}</option>`).join('');
      sel.value = byId(list, arr[i]).id;
      const r = new Runner(el.querySelector('canvas'));
      r.el = el; r.setPalette(pal());
      r.onChange = () => paneInfo(true);
      sel.addEventListener('change', () => {
        arr[i] = sel.value; save(); refreshPanel();
        if (S.compare === 'makers') r.generate(S, sel.value, false); else r.clearSolve();
      });
      panes.push(r);
    }
    panes.forEach((r, i) => r.generate(S, paneGen(i), false));
  }
  // Race: één groot doolhof, per deelnemer een kleur-keuze in de kop.
  function makeRace(grid) {
    grid.dataset.n = 1;
    const el = document.createElement('div');
    el.className = 'pane race';
    const heads = raceIds().map((id, i) => `<label class="racer"><i class="dot" style="background:${ML.RACECOL[i]}"></i><select aria-label="Deelnemer ${i + 1}">${ML.SOLVERS.map(x => `<option value="${x.id}">${x.name}</option>`).join('')}</select><b class="rank"></b></label>`).join('');
    el.innerHTML = `<div class="pane-head">${heads}</div><div class="pane-cv"><canvas></canvas><div class="say"></div><div class="board">${boardHtml()}</div></div><div class="pane-stats"></div>`;
    grid.appendChild(el);
    el.querySelectorAll('select').forEach((sel, i) => {
      sel.value = byId(ML.SOLVERS, S.raceSel[i]).id;
      sel.addEventListener('change', () => { S.raceSel[i] = sel.value; save(); r.clearSolve(); });
    });
    const r = new Runner(el.querySelector('canvas'));
    r.el = el; r.setPalette(pal());
    r.onChange = () => paneInfo(true);
    panes.push(r);
    r.generate(S, S.gen, false);
  }
  // Zwerm: één groot doolhof, warmtegloed + 100 lopers.
  function makeSwarm(grid) {
    grid.dataset.n = 1;
    const el = document.createElement('div');
    el.className = 'pane race';
    el.innerHTML = `<div class="pane-head"><span class="racer"><i class="dot" style="background:${ML.HEAT_STOPS[3]}"></i>Zwerm · ${S.swarmN} lopers, elk een eigen pad<b class="rank"></b></span></div><div class="pane-cv"><canvas></canvas><div class="say"></div></div><div class="pane-stats"></div>`;
    grid.appendChild(el);
    const r = new Runner(el.querySelector('canvas'));
    r.el = el; r.setPalette(pal());
    r.onChange = () => paneInfo(true);
    panes.push(r);
    r.generate(S, S.gen, false);
  }
  function swarmInfo(r) {
    const w = r.sw && r.sw.winner;
    r.el.querySelector('.rank').textContent = w ? ` · winnaar #${w.k}` : '';
    r.el.querySelector('.pane-stats').textContent = statusText(r, !r.sw);
  }
  function raceInfo(r) {
    const R = r.racers, ranks = r.el.querySelectorAll('.rank');
    ranks.forEach((b, i) => { const q = R && R[i]; b.textContent = !q || !q.done ? '' : q.found ? `${q.rank}e` : 'vast'; });
    const st = r.el.querySelector('.pane-stats');
    if (!R) { st.textContent = statusText(r, true); return; }
    st.innerHTML = R.map(q => `<span class="rstat${q.rank === 1 ? ' win' : ''}"><i class="dot" style="background:${q.col}"></i>${q.name}: bezocht ${q.list.length} · stappen ${q.steps}` +
      (q.done ? (q.found ? ` · pad ${q.path ? q.path.length - 1 : 0}` : ' · vastgelopen') : '') + '</span>').join('');
  }

  // Grafiek onder het lab (bezocht per stap + blokjes per maat). Hooguit ~8x per seconde.
  const chart = new ML.Chart($('#cv-chart'));
  let chartT = 0;
  function drawChart(force) {
    const now = performance.now();
    if (!force && now - chartT < 120) return;
    chartT = now;
    if (S.mode !== 'lab' || !panes.length) return;
    const E = [], mets = [];
    const low = (label, vals) => mets.push({ label, vals, low: true });
    if (SWARMY()) {
      const r = panes[0], w = r.sw && r.sw.winner;
      if (r.sw) {
        E.push({ name: 'Zwerm', col: ML.HEAT_STOPS[3], hist: r.hist ? r.hist.pts : [], done: !!r.result, found: !!w, win: !!w, rank: w ? `#${w.k}` : '' });
        low('winnaar stappen', [w ? w.steps : null]); low('route', [w ? r.result.path.length - 1 : null]); low('kortste', [r.stats ? r.stats.route : null]);
      }
      chart.draw(pal(), E, mets, 'Zwerm · cellen bezocht door alle lopers samen');
      return;
    }
    if (S.compare === 'race') {
      const R = panes[0].racers || [];
      for (const q of R) E.push({ name: q.name, col: q.col, hist: q.hist.pts, done: q.done, found: q.found, win: q.rank === 1, rank: q.rank ? q.rank + 'e' : '' });
      if (R.length) {
        low('bezocht', R.map(q => q.list.length)); low('stappen', R.map(q => q.steps));
        low('pad', R.map(q => q.found && q.path ? q.path.length - 1 : null));
      }
      chart.draw(pal(), E, mets, 'Race · bezocht per stap');
      return;
    }
    const list = S.compare === 'solvers' ? ML.SOLVERS : ML.GENERATORS;
    const done = panes.filter(r => r.result).sort((a, b) => (b.result.found - a.result.found) || (a.steps - b.steps));
    panes.forEach((r, i) => {
      const id = S.compare === 'solvers' ? paneSolver(i) : paneGen(i), rk = done.indexOf(r);
      E.push({ name: byId(list, id).name, col: ML.RACECOL[i], hist: r.hist ? r.hist.pts : [], done: !!r.result, found: r.result && r.result.found,
        win: rk === 0 && r.result && r.result.found && done.length === panes.length, rank: rk >= 0 && r.result.found ? rk + 1 + 'e' : '' });
    });
    const solved = panes.some(r => r.vs.order);
    if (S.compare === 'makers') {
      mets.push({ label: 'doodlopend', vals: panes.map(r => r.stats ? r.stats.deadEnds : null) });
      mets.push({ label: 'kruisingen', vals: panes.map(r => r.stats ? r.stats.junctions : null) });
      mets.push({ label: 'route', vals: panes.map(r => r.stats ? r.stats.route : null) });
      mets.push({ label: 'moeilijk', vals: panes.map(r => r.score ? r.score.score : null) });
      if (solved) low('bezocht', panes.map(r => r.vs.order ? r.vs.nOrder : null));
    } else if (solved) {
      low('bezocht', panes.map(r => r.vs.order ? r.vs.nOrder : null)); low('stappen', panes.map(r => r.vs.order ? r.steps : null));
      low('pad', panes.map(r => r.result && r.result.found ? r.result.path.length - 1 : null));
    }
    chart.draw(pal(), solved || S.compare === 'makers' ? E : [], mets, S.compare === 'makers' ? 'Zelfde oplosser · bezocht per stap' : 'Bezocht per stap');
  }

  function paneInfo(force) {
    if (S.compare === 'race') { if (panes[0]) raceInfo(panes[0]); drawChart(force); return; }
    if (SWARMY()) { if (panes[0]) swarmInfo(panes[0]); drawChart(force); return; }
    const done = panes.filter(r => r.result).sort((a, b) => (b.result.found - a.result.found) || (a.steps - b.steps));
    panes.forEach(r => {
      const rank = done.indexOf(r);
      r.el.querySelector('.rank').textContent = rank < 0 ? '' : r.result.found ? `${rank + 1}e` : 'vast';
      r.el.classList.toggle('winner', rank === 0 && r.result.found && done.length === panes.length && panes.length > 1);
      r.el.querySelector('.pane-stats').textContent = statusText(r, S.compare === 'makers');
    });
    drawChart(force);
  }

  // ---- Vandaag: dagelijks doolhof, zelf spelen ----
  let daily = null;
  const D = { ymd: '', s: null };
  function dailyEnsure() {
    if (!daily) {
      daily = new Runner($('#cv-daily'));
      daily.setPalette(pal());
      daily.onPlay = (r, p) => { if (p.done) dailyFinish(p); };
      $('#cv-daily').addEventListener('pointerdown', e => {
        const d = window.devicePixelRatio || 1;
        ML.Play.click(daily, e.offsetX * d, e.offsetY * d);
      });
    }
    const today = ML.Daily.ymd();
    if (D.ymd !== today || !daily.m) {
      D.ymd = today; D.s = ML.Daily.settings(today); D.msg = '';
      daily.generate(D.s, D.s.gen, false);
      ML.Play.start(daily);
    }
    dailyPanel();
  }
  function dailyFinish(p) {
    if (p.gaveUp) return;
    const time = p.tEnd - p.t0, best = daily.stats.route;
    const res = ML.Daily.record(D.ymd, { time, moves: p.moves, best });
    setTimeout(recalibrate, 50);
    D.msg = `Gehaald in ${ML.Daily.fmt(time)} met ${p.moves} stappen (kortste ${best}).` + (res.newTime ? ' Nieuw tijdrecord!' : res.newMoves ? ' Minste stappen ooit!' : '');
    dailyPanel();
  }
  function dailyPanel() {
    const all = ML.Daily.load(), rec = all[D.ymd], s = D.s, m = daily.m;
    const date = new Date(D.ymd + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
    const extras = [];
    if (s.levels > 1) extras.push(`${s.levels} verdiepingen`);
    if (s.torus) extras.push('torus');
    if (m.weighted) extras.push('terrein');
    if (m.keys.length) extras.push(`${m.keys.length} sleutel${m.keys.length > 1 ? 's' : ''}`);
    if (m.switches.length) extras.push('hendel');
    if (m.timed.length) extras.push('tijddeuren');
    if (m.teleporters.length) extras.push('teleporter');
    if (m.oneways.length) extras.push('eenrichting');
    let hist = '';
    for (let i = 1; i <= 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = ML.Daily.ymd(d), r = all[k];
      hist += `<li><span>${d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric' })}</span><span>${r && r.time ? `${ML.Daily.fmt(r.time)} · ${r.moves} st.` : '—'}</span></li>`;
    }
    $('#daily-info').innerHTML = `<p class="daily-date">${date}</p>
      <p>${GRID_NAMES[s.grid]} · ${byId(ML.GENERATORS, s.gen).name}${extras.length ? ' · ' + extras.join(', ') : ''}</p>
      <p>Moeilijkheid <b>${daily.score ? daily.score.score : '—'}</b> · kortste route ${daily.stats.route} stappen</p>
      <p>Jouw record vandaag: <b>${rec && rec.time ? `${ML.Daily.fmt(rec.time)} · ${rec.moves} stappen` : 'nog niet gehaald'}</b></p>
      ${D.msg ? `<p class="daily-msg">${D.msg}</p>` : ''}
      <h3>Vorige 7 dagen</h3><ul class="daily-hist">${hist}</ul>`;
  }
  function dailyHud() {
    if (!daily || !daily.m) return;
    const p = daily.play;
    if (!p) { $('#hud-daily').textContent = 'Opgegeven · oplossing getoond · R = opnieuw'; return; }
    const ms = p.done ? p.tEnd - p.t0 : p.t0 ? performance.now() - p.t0 : 0;
    const parts = [`⏱ ${ML.Daily.fmt(ms)}`, `${p.moves} stappen`];
    if (daily.m.weighted) parts.push(`kosten ${Math.round(p.cost * 10) / 10}`);
    parts.push(p.done ? 'gehaald!' : 'pijltjes/klik = lopen · T = trap/teleporter' + (daily.m.timed.length ? ' · spatie = wachten' : '') + ' · R = opnieuw');
    $('#hud-daily').textContent = parts.join(' · ');
  }

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
  function watchStop() { W.on = false; $('#watch').hidden = true; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }

  // ---- 2.0: 3D, camera, sfeer, schermvullend ----
  function v3of(r) {
    if (!r.v3) { r.v3 = new ML.View3D(r); if (!r.v3.ok) { S.view3d = false; set3D(false); alert('3D kon niet laden (three.js ontbreekt).'); } }
    return r.v3;
  }
  function set3D(on) {
    [build, W.runner].forEach(r => { if (!r) return; r.r.noWalls = on; r.dirty = true; if (on && r.m) v3of(r); if (r.v3) r.v3.show(on); });
    const el = $('[data-key="view3d"]'); if (el) el.checked = on;
    refreshPanel();
  }
  const CAMS = ['orbit', 'chase', 'first'], MOODS = ['dag', 'avond', 'nacht', 'zaklamp', 'cyclus'];
  function cycleKey(k, list) { S[k] = list[(list.indexOf(S[k]) + 1) % list.length]; const el = $(`[data-key="${k}"]`); if (el) el.value = S[k]; save(); [build, ...panes, W.runner].forEach(r => { if (r) r.dirty = true; }); flash(el ? el.selectedOptions[0].textContent : S[k]); }
  function flash(txt) {
    let el = $('#v2-flash');
    if (!el) { el = document.createElement('div'); el.id = 'v2-flash'; document.body.appendChild(el); }
    el.textContent = txt; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  function fullscreen() {
    const el = W.on ? $('#watch') : document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }
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
    const evoS = ML.SOLVERS.filter(x => x.evo); // eigen algoritmes: 14% kans
    s.solver = sr < 0.22 ? 'swarm' : sr < 0.36 ? 'ants' : sr < 0.5 && evoS.length ? rng.pick(evoS).id : rng.pick(ML.SOLVERS.filter(x => !x.evo && (plain || x.id !== 'wall'))).id;
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
    $('#watch-info').textContent = `${GRID_NAMES[grid]} · ${g.name} → ${s.solver === 'swarm' ? 'Zwerm van 100 lopers' : s.solver === 'ants' ? 'Mierenkolonie van 60' : byId(ML.SOLVERS, s.solver).name}`;
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
    if (S.view3d) { v3of(r).render(t); r.v3.cv.style.opacity = r.cv.style.opacity || 1; }
  }

  // ---- Paneel ----
  const V2KEYS = new Set(['trails', 'patch', 'rainbow', 'wave', 'glint', 'flow', 'mood', 'vignette', 'bloom', 'follow', 'cam3d']);
  const REBUILD = new Set(['variant', 'grid', 'shape', 'text', 'size', 'levels', 'torus', 'gen', 'mix', 'braid', 'seed', 'keys', 'oneways', 'teleports', 'switches', 'timed', 'terrain']);
  function fillSelect(el, list) { el.innerHTML = list.map(x => `<option value="${x.id}">${x.name} — ${x.desc}</option>`).join(''); }
  fillSelect($('[data-key="gen"]'), ML.GENERATORS);
  function fillSolvers() { // ook na bewaren/verwijderen van een eigen algoritme (ML.onSolversChanged vanuit evo.js)
    const el = $('[data-key="solver"]'), v = S.solver;
    fillSelect(el, ML.SOLVERS);
    el.insertAdjacentHTML('beforeend', '<option value="swarm">Zwerm — lopers met warmtegloed</option><option value="ants">Mierenkolonie — leert de kortste route via feromoon</option>');
    if ([...el.options].some(o => o.value === v)) el.value = v;
  }
  fillSolvers();
  ML.onSolversChanged = fillSolvers;
  $('[data-key="palette"]').innerHTML = Object.entries(ML.PALETTES).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('');

  function outputs() {
    const out = {
      size: S.grid === 'polar' ? `${Math.max(3, Math.round(S.size / 2))} ringen` : S.size,
      levels: S.levels, mix: `${S.mix}%`, braid: `${S.braid}%`, terrain: `${S.terrain}%`,
      keys: S.keys, oneways: S.oneways, teleports: S.teleports, switches: S.switches, timed: S.timed, target: S.target,
      speed: (() => { const v = speedToSpf(S.speed) * 60; return v < 10 ? `${v.toFixed(1)}/s` : `${Math.round(v)}/s`; })()
    };
    document.querySelectorAll('[data-out]').forEach(o => { o.textContent = out[o.dataset.out]; });
  }
  function show(sel, on) { const el = $(sel); if (el) el.hidden = !on; }
  function refreshPanel() {
    const lab = S.mode === 'lab', torus = S.grid === 'square' && S.torus;
    document.body.dataset.mode = S.mode;
    show('#row-gen', !lab || S.compare !== 'makers');
    show('#row-solver', !lab || S.compare === 'makers');
    const gensUsed = (!lab || S.compare !== 'makers') ? [S.gen] : S.paneGen.slice(0, S.panes);
    show('#row-mix', gensUsed.includes('growing'));
    const plainSquare = S.grid === 'square' && (S.shape === 'rect' || torus);
    show('#gen-hint', !plainSquare && gensUsed.some(id => byId(ML.GENERATORS, id).grid));
    show('#row-shape', S.grid !== 'polar' && !torus);
    show('#row-text', S.grid !== 'polar' && !torus && S.shape === 'text');
    show('#row-torus', S.grid === 'square');
    show('#row-variant', S.grid === 'square');
    show('#sec-lab', lab);
    show('#row-under', S.feet === 'paws');
    show('#row-cam3d', !!S.view3d);
    show('#row-panes', !SWARMY()); show('#row-swarm', SWARMY());
    document.querySelectorAll('.tabs [data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
    show('#view-build', S.mode === 'build'); show('#view-lab', lab); show('#view-daily', S.mode === 'daily'); show('#view-evo', S.mode === 'evo');
    $('#btn-pause').textContent = paused ? 'Verder' : 'Pauze';
  }
  function setPalette() { build.setPalette(pal()); panes.forEach(r => r.setPalette(pal())); if (daily) daily.setPalette(pal()); if (ML.EvoUI) ML.EvoUI.setPalette(pal()); }

  function regenerate(animate) {
    if (S.mode === 'lab') panes.forEach((r, i) => r.generate(S, paneGen(i), animate));
    else build.generate(S, S.gen, animate);
    hudDirty = true;
  }
  function solveAll() {
    if (S.mode === 'daily') return;
    if (S.mode === 'lab' && S.compare === 'race') { if (panes[0]) panes[0].race(raceIds()); }
    else if (S.mode === 'lab' && SWARMY()) { if (panes[0]) panes[0].swarm(S.swarmN, S.compare === 'ants'); }
    else if (S.mode === 'lab') panes.forEach((r, i) => r.solve(paneSolver(i)));
    else if (isSwarmSolver(S.solver)) build.swarm(S.swarmN, S.solver === 'ants');
    else build.solve(S.solver);
    paused = false; refreshPanel();
  }
  function newSeed() { S.seed = ML.randomSeed(); $('[data-key="seed"]').value = S.seed; save(); }

  document.querySelectorAll('[data-key]').forEach(el => {
    const k = el.dataset.key, check = el.type === 'checkbox', num = el.type === 'range' || el.dataset.num !== undefined;
    if (check) el.checked = !!S[k]; else el.value = S[k];
    el.addEventListener('input', () => {
      S[k] = check ? el.checked : num ? Number(el.value) : el.value;
      save(); outputs(); refreshPanel();
      if (k === 'palette') { setPalette(); drawChart(true); }
      if (k === 'feet' || k === 'under' || k === 'heat' || V2KEYS.has(k)) [build, ...panes, W.runner].forEach(r => { if (r) r.dirty = true; });
      if (k === 'view3d') set3D(S.view3d);
      if (k === 'sound' && S.sound) { ML.Sound.ensure(); ML.Sound.chord(); }
    });
    el.addEventListener('change', () => {
      if (check) { S[k] = el.checked; save(); refreshPanel(); }
      if (REBUILD.has(k)) regenerate(false);
      if (k === 'compare' || k === 'panes' || k === 'swarmN') { S.swarmN = Number(S.swarmN); S.panes = Number(S.panes); makeLab(); refreshPanel(); }
      if (k === 'solver' && S.mode === 'lab') panes.forEach(r => r.clearSolve());
    });
  });

  function setMode(md) {
    S.mode = md; save(); refreshPanel();
    if (md === 'lab' && !panes.length) makeLab();
    if (md === 'lab') requestAnimationFrame(() => drawChart(true));
    if (md === 'build' && !build.m) build.generate(S, S.gen, false);
    if (md === 'evo') ML.EvoUI.enter();
    if (md === 'daily') requestAnimationFrame(dailyEnsure); // eerst zichtbaar, dan heeft het canvas een maat
  }
  document.querySelectorAll('.tabs [data-mode]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.mode === 'watch') watchStart(); else setMode(b.dataset.mode);
  }));
  $('#dice').addEventListener('click', () => { newSeed(); regenerate(false); });
  $('#btn-new').addEventListener('click', () => { newSeed(); paused = false; refreshPanel(); regenerate(true); });
  $('#btn-instant').addEventListener('click', () => { newSeed(); regenerate(false); });
  $('#btn-solve').addEventListener('click', solveAll);
  $('#btn-pause').addEventListener('click', () => { paused = !paused; refreshPanel(); });
  $('#btn-clear').addEventListener('click', () => { (S.mode === 'lab' ? panes : [build]).forEach(r => r.clearSolve()); });
  $('#btn-target').addEventListener('click', findTarget);
  $('#btn-restart').addEventListener('click', () => { if (daily && daily.m) { ML.Play.start(daily); D.msg = ''; dailyPanel(); } });
  $('#btn-giveup').addEventListener('click', () => { if (daily && daily.play && !daily.play.done) { daily.play.gaveUp = true; daily.solve('astar'); } });
  $('#watch-exit').addEventListener('click', watchStop);

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const current = () => S.mode === 'lab' ? panes[0] : S.mode === 'daily' ? daily : build;
  $('#btn-json').addEventListener('click', () => {
    const r = current();
    if (!r || !r.m || !r.m.ready) return;
    const { grid, shape, text, size, levels, torus, variant, mix, braid, keys, oneways, teleports, switches, timed, terrain } = r.s;
    const data = ML.toJSON(r.m, { seed: r.s.seed, generator: r.genId, difficulty: r.score ? r.score.score : null, settings: { grid, shape, text, size, levels, torus, variant, mix, braid, keys, oneways, teleports, switches, timed, terrain } });
    download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `maze-${r.s.seed}.json`);
  });
  $('#btn-png').addEventListener('click', () => {
    const r = current(); if (!r) return;
    const name = `maze-${r.s ? r.s.seed : 'leeg'}${S.view3d && r.v3 ? '-3d' : ''}.png`;
    if (S.view3d && r.v3 && r.v3.ok) { r.v3.render(performance.now() / 1000); r.v3.cv.toBlob(b => download(b, name)); }
    else r.cv.toBlob(b => download(b, name));
  });

  const ARROWS = { ArrowRight: 0, ArrowDown: Math.PI / 2, ArrowLeft: Math.PI, ArrowUp: -Math.PI / 2, d: 0, s: Math.PI / 2, a: Math.PI, w: -Math.PI / 2 };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && W.on) { watchStop(); return; }
    if (!/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && S.mode !== 'daily') {
      if (e.key === '3') { S.view3d = !S.view3d; save(); set3D(S.view3d); flash(S.view3d ? '3D aan' : '3D uit'); return; }
      if (e.key === 'c' && S.view3d) { cycleKey('cam3d', CAMS); return; }
      if (e.key === 'm') { cycleKey('mood', MOODS); return; }
      if (e.key === 'f') { fullscreen(); return; }
    }
    if (W.on || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (S.mode === 'evo') { ML.EvoUI.key(e); return; }
    if (S.mode === 'daily') {
      if (!daily || !daily.m) return;
      if (ARROWS[e.key] !== undefined) { e.preventDefault(); ML.Play.arrow(daily, ARROWS[e.key]); }
      else if (e.key === ' ') { e.preventDefault(); ML.Play.wait(daily); }
      else if (e.key === 't' || e.key === 'Enter') ML.Play.special(daily);
      else if (e.key === 'r') $('#btn-restart').click();
      return;
    }
    if (e.key === 'n') $('#btn-new').click();
    else if (e.key === 's' || e.key === 'Enter') solveAll();
    else if (e.key === ' ') { e.preventDefault(); $('#btn-pause').click(); }
  });

  // ---- Lus ----
  function frame(now) {
    const t = now / 1000, spf = paused ? 0 : speedToSpf(S.speed);
    if (W.on) watchFrame(t);
    else if (S.mode === 'lab') { panes.forEach(r => { r.tick(spf, t); r.draw(t); }); if (panes.some(r => r.phase === 'solve' || r.phase === 'gen' || r.phase === 'race' || r.phase === 'swarm')) paneInfo(); }
    else if (S.mode === 'daily') { if (daily) { daily.tick(speedToSpf(70), t); daily.draw(t); dailyHud(); } }
    else if (S.mode === 'evo') ML.EvoUI.frame(t);
    else {
      build.tick(spf, t); build.draw(t);
      if (S.view3d) v3of(build).render(t);
      if (hudDirty || build.phase === 'gen' || build.phase === 'solve' || build.phase === 'swarm') { $('#hud-build').textContent = statusText(build, true); hudDirty = false; }
    }
    requestAnimationFrame(frame);
  }

  ML.EvoUI.init({ Runner, S, save, pal });
  outputs(); refreshPanel(); setPalette();
  if (S.mode === 'lab') makeLab();
  else if (S.mode === 'daily') { build.generate(S, S.gen, false); requestAnimationFrame(dailyEnsure); }
  else build.generate(S, S.gen, false);
  if (S.mode === 'evo') ML.EvoUI.enter();
  if (S.view3d) requestAnimationFrame(() => set3D(true));
  document.addEventListener('pointerdown', () => { if (S.sound) ML.Sound.ensure(); });
  showScore();
  setTimeout(recalibrate, 800); // na het eerste beeld: eigen records meewegen
  requestAnimationFrame(frame);
})(window.ML = window.ML || {});
