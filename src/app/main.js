// Bouwen, paneel, knoppen, toetsen, 3D/camera/sfeer, animatielus en opstart. Laatst geladen.
(function (ML) {
  'use strict';
  const A = ML.App;
  const { $, S, save, speedToSpf, byId, SWARMY, isSwarmSolver, pal, statusText, Runner,
    panes, paneGen, raceIds, paneSolver, makeLab, drawChart, paneInfo,
    dailyEnsure, dailyKey, dailyFrame, dailyRunner,
    W, watchStart, watchStop, watchMineBtn, watchNext, watchFrame } = A;

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
  function setPalette() { build.setPalette(pal()); panes.forEach(r => r.setPalette(pal())); const dy = dailyRunner(); if (dy) dy.setPalette(pal()); if (ML.EvoUI) ML.EvoUI.setPalette(pal()); }

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
  $('#watch-exit').addEventListener('click', watchStop);
  $('#watch-mine').addEventListener('click', () => { S.watchMine = !S.watchMine; save(); watchMineBtn(); watchNext(); });

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const current = () => S.mode === 'lab' ? panes[0] : S.mode === 'daily' ? dailyRunner() : build;
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
    if (S.mode === 'daily') { dailyKey(e); return; }
    if (e.key === 'n') $('#btn-new').click();
    else if (e.key === 's' || e.key === 'Enter') solveAll();
    else if (e.key === ' ') { e.preventDefault(); $('#btn-pause').click(); }
  });

  // ---- Lus ----
  function frame(now) {
    const t = now / 1000, spf = paused ? 0 : speedToSpf(S.speed);
    if (W.on) watchFrame(t);
    else if (S.mode === 'lab') { panes.forEach(r => { r.tick(spf, t); r.draw(t); }); if (panes.some(r => r.phase === 'solve' || r.phase === 'gen' || r.phase === 'race' || r.phase === 'swarm')) paneInfo(); }
    else if (S.mode === 'daily') dailyFrame(t);
    else if (S.mode === 'evo') ML.EvoUI.frame(t);
    else {
      build.tick(spf, t); build.draw(t);
      if (S.view3d) v3of(build).render(t);
      if (hudDirty || build.phase === 'gen' || build.phase === 'solve' || build.phase === 'swarm') { $('#hud-build').textContent = statusText(build, true); hudDirty = false; }
    }
    requestAnimationFrame(frame);
  }

  // eigen algoritme inzetten vanuit Evolutie: 'build' = lopen in Bouwen, 'race' = race tegen klassiekers in Lab
  function evoGo(where, a) {
    const id = 'evo-' + a.id;
    if (!ML.SOLVERS.some(x => x.id === id)) { ML.SOLVERS.push({ id, name: '🧬 ' + a.name, desc: 'eigen algoritme', fn: ML.Evo.solverFn(a.genes, a.name), evo: true }); fillSolvers(); }
    const setKey = (k, v) => { S[k] = v; const el = $(`[data-key="${k}"]`); if (el) el.value = v; };
    if (where === 'watch') { S.watchMine = true; save(); watchStart(); return; }
    if (where === 'race') {
      setKey('compare', 'race'); setKey('panes', 4); S.raceSel = [id, 'dfs', 'tremaux', 'wall']; save();
      setMode('lab'); makeLab(); refreshPanel();
    } else { setKey('solver', id); save(); setMode('build'); }
    newSeed(); regenerate(false);
    setTimeout(solveAll, 400);
  }
  ML.EvoUI.init({ Runner, S, save, pal, go: evoGo });
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

  Object.assign(A, { build, v3of, set3D, refreshPanel, regenerate, recalibrate, solveAll, setMode, fillSolvers });
})(window.ML = window.ML || {});
