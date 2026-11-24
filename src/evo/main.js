// Koppeling met app.js: init, enter, toetsen, klikken, pagina wisselen. Laadt als laatste en koppelt alle modules.
(function (ML) {
  'use strict';
  const U = ML.EvoUI._;
  const { $, A, E, EV, T, TASKS, V, colorFor, entryById, fresh, isl, note, persist, pick, restore, speciate } = U;
  let rulesAvail, algoDetail, algoGrid, algosRender, anaRender, autoSave, benchInput, champCard, drawChart, ensureTaskPane, evoBar, finishNow, frame, grow, importFile, legend, libField, makePanes, markSel, openShared, outputs, rankList, refreshUI, resizePop, saveChamp, startGen, status, taskIn, taskLegend, taskRender, toggleRun, tour, turbo, whyPlay;
  U.link(() => ({ rulesAvail, algoDetail, algoGrid, algosRender, anaRender, autoSave, benchInput, champCard, drawChart, ensureTaskPane, evoBar, finishNow, frame, grow, importFile, legend, libField, makePanes, markSel, openShared, outputs, rankList, refreshUI, resizePop, saveChamp, startGen, status, taskIn, taskLegend, taskRender, toggleRun, tour, turbo, whyPlay } = U));

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

  // klikken: data-ev="naam" → U.ACTIONS[naam](c), elke module meldt zijn eigen acties aan; task-<soort> → 'task-*'
  // c = { e, b (knop), act, id (data-id), a (algoritme bij id), mine (eigen algoritme bij id), algos (bibliotheek) }
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
    const fn = U.ACTIONS[act] || (act.startsWith('task-') && TASKS[act.slice(5)] ? U.ACTIONS['task-*'] : null);
    if (!fn) return;
    const algos = EV().loadAlgos();
    fn({ e, b, act, id, a: id && id !== '*evo' ? entryById(id) : null, mine: id ? algos.find(x => x.id === id) || null : null, algos });
  }


  const RULE_NOTE = {
    evoMutKind: v => ({ gauss: 'Mutatie: kleine stapjes rond de ouders.', cauchy: 'Mutatie: grote sprongen — meestal klein, soms ver weg.', self: 'Mutatie zelfregelend: elk DNA evolueert zijn eigen stapgrootte σ (zie kampioen).' })[v] || '',
    evoLamarck: v => v ? 'Lamarck aan: lopers leren tijdens hun leven en geven dat door (trager per generatie).' : 'Lamarck uit.',
    evoSelect: v => ({ fitness: 'Selectie op fitness: de besten krijgen kinderen.', novelty: 'Selectie op nieuwheid: wie zich anders gedraagt krijgt kinderen. Kampioen = beste ooit.', mix: 'Selectie: half fitness, half nieuwheid.' })[v] || ''
  };
  // ---- koppeling met app.js ----
  let started = false;
  function init(app) {
    Object.assign(A, app);
    if (A.S.evoTaskSpeed == null) A.S.evoTaskSpeed = 75;
    if (!restore()) E.base = '';
    else speciate();
    const fo = document.querySelector('[data-key="evoFast"] option[value="max"]');
    if (fo) fo.textContent = `Maximaal (${EV().Pool.size()} kernen)`;
    rulesAvail();
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
        else if (k === 'evoMutKind' || k === 'evoLamarck' || k === 'evoSelect') { champCard(); persist(); note(RULE_NOTE[k](A.S[k])); }
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


  // klik-acties (data-ev) van deze module
  Object.assign(U.ACTIONS, {
    page: c => setPage(c.b.dataset.page),
    unsel: () => { E.sel = null; markSel(); algoDetail(); },
    'sel-go': c => { E.sel = c.id; setPage('algos'); const el = document.querySelector('#algo-grid .acard.sel'); if (el) el.scrollIntoView({ block: 'nearest' }); },
  });
  Object.assign(U, { setPage, tabsInfo, dotCls, onClick, started, init, enter, key, setPalette });
  U.links.forEach(fn => fn());
  Object.assign(ML.EvoUI, { init, enter, frame: U.frame, key, setPalette, _test: { E, autoSave: U.autoSave, grow: U.grow } }); // _test: alleen voor de rooktest
})(window.ML = window.ML || {});
