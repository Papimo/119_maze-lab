// Runner (één doolhof + animatie op één canvas) en gedeelde hulpjes: commentator, hittekaart, kijkcijfers, statusregel.
(function (ML) {
  'use strict';
  const A = ML.App;
  const { S, KEYS } = A;

  const AN = ML.ANIM;
  const SWARMY = () => S.compare === 'swarm' || S.compare === 'ants';
  const isSwarmSolver = id => id === 'swarm' || id === 'ants';
  const solverName = id => id === 'swarm' ? 'Zwerm' : id === 'ants' ? 'Mierenkolonie' : byId(ML.SOLVERS, id).name;

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
  const RACES = KEYS.races;
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


  Object.assign(A, { AN, SWARMY, isSwarmSolver, solverName, GEN_X, GEN_MAX, speedToSpf, pal, byId, GRID_NAMES, pathCost, mkHist, histPush, say, leadCheck, heatFx, raceWin, boardHtml, Runner, statusText });
})(window.ML = window.ML || {});
