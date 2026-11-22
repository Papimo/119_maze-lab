// UI, standen (Bouwen / Lab / Vandaag / Kijken) en de animatielus.
(function (ML) {
  'use strict';
  const $ = s => document.querySelector(s);
  const STORE = 'mazelab.settings';
  const AN = ML.ANIM;

  const S = {
    mode: 'build', grid: 'square', shape: 'rect', text: 'MAZE', size: 24, levels: 1, torus: false,
    gen: 'backtracker', mix: 75, braid: 0, seed: ML.randomSeed(),
    keys: 0, oneways: 0, teleports: 0, switches: 0, timed: 0, terrain: 0,
    solver: 'bfs', speed: 45, palette: 'blauwdruk', target: 50,
    compare: 'solvers', panes: 2,
    paneSel: ['bfs', 'astar', 'dfs', 'wall'], paneGen: ['backtracker', 'prim', 'kruskal', 'wilson']
  };
  try { Object.assign(S, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* geen opslag */ }
  if (S.mode === 'watch') S.mode = 'build';
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* geen opslag */ } };

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

  // ---- Runner: één doolhof + animatie op één canvas ----
  class Runner {
    constructor(canvas) {
      this.cv = canvas; this.r = new ML.Render2D(canvas);
      this.m = null; this.P = null; this.phase = 'idle'; this.vs = { cur: -1 }; this.acc = 0; this.steps = 0;
      this.fx = []; this.lastT = 0; this.clk = -1;
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
      this.P = null; this.score = null; this.play = null; this.fx.length = 0;
      this.genIt = byId(ML.GENERATORS, genId).fn(m, ML.makeRng(s.seed + '|' + genId), { mix: s.mix / 100 });
      this.vs = { inMaze: new Uint8Array(m.cells.length), cur: -1, wallAnim: new Map(), tail: [] };
      this.phase = 'gen'; this.steps = 0; this.result = null; this.stats = null; this.acc = 0;
      if (!animate) this.finishGen(); else { this.dirty = true; this.emit('gen'); }
    }
    finishGen() {
      for (let r = this.genIt.next(); !r.done; r = this.genIt.next());
      const m = this.m;
      ML.finishMaze(m, this.s, this.genId);
      this.P = ML.makeProblem(m);
      this.stats = ML.mazeStats(m);
      this.score = ML.difficulty(m);
      this.vs = { cur: -1 }; this.phase = 'ready'; this.dirty = true;
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
        vt: new Float64Array(n), recent: [], tail: [], side: new Uint8Array(n), dead: new Uint8Array(n)
      };
      this.steps = 0; this.result = null; this.phase = 'solve'; this.acc = 0; this.dirty = true;
      this.emit('solve');
    }
    clearSolve() {
      if (!this.m || this.phase === 'gen') return;
      this.vs = { cur: -1 }; this.phase = 'ready'; this.result = null; this.steps = 0; this.play = null; this.dirty = true;
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
    goalFx() { const g = this.m.cells[this.m.goal].center; ML.FX.confetti(this.fx, g[0], g[1]); this.dirty = true; }

    tick(spf, t) {
      const ph = this.phase, v = this.vs;
      if (ph !== 'gen' && ph !== 'solve' && ph !== 'path') return;
      if (ph === 'path') {
        const L = v.path.length - 1, i0 = Math.floor((v.pathT || 0) * L);
        v.pathT = Math.min(1, (v.pathT || 0) + 1 / Math.max(40, Math.min(150, L * 1.5)));
        const i1 = Math.floor(v.pathT * L), sts = this.result.states;
        for (let j = i0 + 1; j <= i1; j++) this.stepFx(sts && sts[j - 1], sts && sts[j], v.path[j - 1], v.path[j]);
        if (sts && sts.length) v.state = sts[Math.min(i1, sts.length - 1)];
        if (v.pathT >= 1) { this.phase = 'done'; if (this.result.found) this.goalFx(); this.emit('done'); }
        this.dirty = true; return;
      }
      this.acc += spf;
      let k = Math.floor(this.acc);
      this.acc -= k;
      if (k <= 0) return;
      const anim = spf <= 40;
      if (ph === 'gen') {
        while (k-- > 0) {
          const r = this.genIt.next();
          if (r.done) { this.finishGen(); return; }
          const e = r.value;
          if (e.all) v.inMaze.fill(1);
          if (e.add !== undefined) v.inMaze[e.add] = 1;
          if (e.add2 !== undefined) v.inMaze[e.add2] = 1;
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
            this.phase = v.path.length > 1 ? 'path' : 'done';
            if (this.phase === 'done' && this.result.found) this.goalFx();
            this.emit('solved'); break;
          }
          const e = r.value;
          if (e.dead !== undefined) v.dead[e.dead] = 1;
          else if (v.order[e.visit] < 0) {
            v.order[e.visit] = v.nOrder++; v.vt[e.visit] = t; v.recent.push(e.visit);
            if (e.side) v.side[e.visit] = 1;
          }
          if (v.cur !== e.visit) { v.cur = e.visit; this.pushTail(e.visit, t); }
          for (const f of e.front) v.front[f] = 1;
          this.steps++;
        }
        const R = v.recent;
        if (R.length > 1200) { const cut = R.length - 1200; for (let i = 0; i < cut; i++) v.vt[R[i]] = 0; R.splice(0, cut); }
      }
      this.dirty = true;
    }
    draw(t) {
      const dt = this.lastT ? Math.min(0.05, t - this.lastT) : 0, v = this.vs;
      this.lastT = t;
      if (this.fx.length) { ML.FX.step(this.fx, dt); this.dirty = true; }
      if (v.tail && v.tail.length) { let i = 0; while (i < v.tail.length && t - v.tail[i].t > AN.TAIL) i++; if (i) { v.tail.splice(0, i); this.dirty = true; } }
      if (v.recent && v.recent.length) { let i = 0; while (i < v.recent.length && t - v.vt[v.recent[i]] > AN.RIP) i++; if (i) v.recent.splice(0, i); }
      if (v.wallAnim && v.wallAnim.size) for (const [k, a] of v.wallAnim) if (t - a.t0 > AN.WALL) v.wallAnim.delete(k);
      if (this.m && this.m.timed.length && v.state == null) { const c = Math.floor(t / AN.CLOCK); if (c !== this.clk) { this.clk = c; this.dirty = true; } }
      if (!this.dirty) return;
      this.dirty = false;
      v.fx = this.fx; v.P = this.P; v.phase = this.phase;
      if (this.r.draw(this.m, v, t)) this.dirty = true;
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
      p.push(`kortste route ${st.route || '—'}` + (st.weighted ? ` (kosten ${Math.round(st.cost * 10) / 10})` : ''));
      if (r.score) p.push(`moeilijkheid ${r.score.score}`);
    }
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
      sel.value = byId(list, arr[i]).id;
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
    if (!W.runner) W.runner = new Runner($('#cv-watch'));
    W.runner.resize();
    watchNext();
  }
  function watchStop() { W.on = false; $('#watch').hidden = true; }
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
    s.solver = rng.pick(ML.SOLVERS.filter(x => plain || x.id !== 'wall')).id;
    const [a, b] = rng.pick(AMB);
    r.setPalette({ ...ML.PALETTES.neon, visitA: a, visitB: b, wall: rng.pick(AMB_WALL) });
    r.generate(s, s.gen, true);
    W.s = s;
    const n = r.m.cells.length, g = byId(ML.GENERATORS, s.gen);
    W.genSpf = Math.max(0.5, n * (g.slow || (s.gen === 'wilson' ? 5 : 2)) / (8 * 60));
    W.solveSpf = Math.max(0.5, n / (6 * 60));
    W.stage = 'gen';
    $('#cv-watch').style.opacity = 1;
    $('#watch-info').textContent = `${GRID_NAMES[grid]} · ${g.name} → ${byId(ML.SOLVERS, s.solver).name}`;
  }
  function watchFrame(t) {
    const r = W.runner;
    if (W.stage === 'gen') { r.tick(W.genSpf, t); if (r.phase === 'ready') { W.stage = 'pause'; W.t = t + 0.9; } }
    else if (W.stage === 'pause' && t > W.t) { r.solve(W.s.solver); W.stage = 'solve'; }
    else if (W.stage === 'solve') { r.tick(W.solveSpf, t); if (r.phase === 'done') { W.stage = 'hold'; W.t = t + 2.8; } }
    else if (W.stage === 'hold' && t > W.t) { $('#cv-watch').style.opacity = 0; W.stage = 'fade'; W.t = t + 0.8; }
    else if (W.stage === 'fade' && t > W.t) watchNext();
    r.draw(t);
  }

  // ---- Paneel ----
  const REBUILD = new Set(['grid', 'shape', 'text', 'size', 'levels', 'torus', 'gen', 'mix', 'braid', 'seed', 'keys', 'oneways', 'teleports', 'switches', 'timed', 'terrain']);
  function fillSelect(el, list) { el.innerHTML = list.map(x => `<option value="${x.id}">${x.name} — ${x.desc}</option>`).join(''); }
  fillSelect($('[data-key="gen"]'), ML.GENERATORS);
  fillSelect($('[data-key="solver"]'), ML.SOLVERS);
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
    show('#row-gen', !lab || S.compare === 'solvers');
    show('#row-solver', !lab || S.compare === 'makers');
    const gensUsed = (!lab || S.compare === 'solvers') ? [S.gen] : S.paneGen.slice(0, S.panes);
    show('#row-mix', gensUsed.includes('growing'));
    const plainSquare = S.grid === 'square' && (S.shape === 'rect' || torus);
    show('#gen-hint', !plainSquare && gensUsed.some(id => byId(ML.GENERATORS, id).grid));
    show('#row-shape', S.grid !== 'polar' && !torus);
    show('#row-text', S.grid !== 'polar' && !torus && S.shape === 'text');
    show('#row-torus', S.grid === 'square');
    show('#sec-lab', lab);
    document.querySelectorAll('.tabs [data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
    show('#view-build', S.mode === 'build'); show('#view-lab', lab); show('#view-daily', S.mode === 'daily');
    $('#btn-pause').textContent = paused ? 'Verder' : 'Pauze';
  }
  function setPalette() { build.setPalette(pal()); panes.forEach(r => r.setPalette(pal())); if (daily) daily.setPalette(pal()); }

  function regenerate(animate) {
    if (S.mode === 'lab') panes.forEach((r, i) => r.generate(S, paneGen(i), animate));
    else build.generate(S, S.gen, animate);
    hudDirty = true;
  }
  function solveAll() {
    if (S.mode === 'daily') return;
    if (S.mode === 'lab') panes.forEach((r, i) => r.solve(paneSolver(i)));
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
      if (k === 'palette') setPalette();
    });
    el.addEventListener('change', () => {
      if (check) { S[k] = el.checked; save(); refreshPanel(); }
      if (REBUILD.has(k)) regenerate(false);
      if (k === 'compare' || k === 'panes') { S.panes = Number(S.panes); makeLab(); refreshPanel(); }
      if (k === 'solver' && S.mode === 'lab') panes.forEach(r => r.clearSolve());
    });
  });

  function setMode(md) {
    S.mode = md; save(); refreshPanel();
    if (md === 'lab' && !panes.length) makeLab();
    if (md === 'build' && !build.m) build.generate(S, S.gen, false);
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
    const { grid, shape, text, size, levels, torus, mix, braid, keys, oneways, teleports, switches, timed, terrain } = r.s;
    const data = ML.toJSON(r.m, { seed: r.s.seed, generator: r.genId, difficulty: r.score ? r.score.score : null, settings: { grid, shape, text, size, levels, torus, mix, braid, keys, oneways, teleports, switches, timed, terrain } });
    download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `maze-${r.s.seed}.json`);
  });
  $('#btn-png').addEventListener('click', () => { const r = current(); if (r) r.cv.toBlob(b => download(b, `maze-${r.s ? r.s.seed : 'leeg'}.png`)); });

  const ARROWS = { ArrowRight: 0, ArrowDown: Math.PI / 2, ArrowLeft: Math.PI, ArrowUp: -Math.PI / 2, d: 0, s: Math.PI / 2, a: Math.PI, w: -Math.PI / 2 };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && W.on) { watchStop(); return; }
    if (W.on || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
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
    else if (S.mode === 'lab') { panes.forEach(r => { r.tick(spf, t); r.draw(t); }); if (panes.some(r => r.phase === 'solve' || r.phase === 'gen')) paneInfo(); }
    else if (S.mode === 'daily') { if (daily) { daily.tick(speedToSpf(70), t); daily.draw(t); dailyHud(); } }
    else {
      build.tick(spf, t); build.draw(t);
      if (hudDirty || build.phase === 'gen' || build.phase === 'solve') { $('#hud-build').textContent = statusText(build, true); hudDirty = false; }
    }
    requestAnimationFrame(frame);
  }

  outputs(); refreshPanel(); setPalette();
  if (S.mode === 'lab') makeLab();
  else if (S.mode === 'daily') { build.generate(S, S.gen, false); requestAnimationFrame(dailyEnsure); }
  else build.generate(S, S.gen, false);
  showScore();
  requestAnimationFrame(frame);
})(window.ML = window.ML || {});
