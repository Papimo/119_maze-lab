// Lab: panelen naast elkaar (oplossers/makers), race, zwerm/mieren, vergelijkingsgrafiek.
(function (ML) {
  'use strict';
  const A = ML.App;
  const { $, S, save, SWARMY, isSwarmSolver, byId, pal, boardHtml, statusText, Runner } = A;

  // ---- Lab ----
  const panes = []; // vaste array (andere bestanden houden hem vast): leegmaken met length = 0
  const paneGen = i => S.compare === 'makers' ? S.paneGen[i] : S.gen;
  const raceIds = () => S.raceSel.slice(0, S.panes);
  const paneSolver = i => S.compare === 'solvers' ? S.paneSel[i] : isSwarmSolver(S.solver) ? 'bfs' : S.solver;

  function makeLab() {
    const grid = $('#lab-grid');
    grid.innerHTML = '';
    panes.length = 0;
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
        arr[i] = sel.value; save(); A.refreshPanel();
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


  Object.assign(A, { panes, paneGen, raceIds, paneSolver, makeLab, drawChart, paneInfo });
})(window.ML = window.ML || {});
