// Koppeling met app.js: init, enter, toetsen, klikken, pagina wisselen. Laadt als laatste en koppelt alle modules.
(function (ML) {
  'use strict';
  const U = ML.EvoUI._;
  const { $, A, E, EV, T, TASKS, V, addAlgo, colorFor, entryById, fresh, isSaved, isl, mm, note, persist, pick, restore, speciate } = U;
  let MUT_PRESET, afterSave, algoDetail, algoGrid, algosRender, anaRender, benchInput, benchRide, benchSave, champCard, drawChart, duelNow, ensureTaskPane, evoBar, exportAlgos, famRender, finishNow, huntRun, huntShow, importFile, legend, libField, makePanes, markSel, mutFinish, mutMake, mutRound, mutSave, openShared, openTask, outputs, pasteCode, rankList, refreshUI, report, resizePop, saveChamp, seed, setStep, shareLink, startDuel, startGen, startShow, status, stepsRender, stopTask, taskIn, taskLegend, taskOut, taskRender, toggleRun, tour, turbo, whyPlay, whyStep, whyWalker;
  U.link(() => ({ MUT_PRESET, afterSave, algoDetail, algoGrid, algosRender, anaRender, benchInput, benchRide, benchSave, champCard, drawChart, duelNow, ensureTaskPane, evoBar, exportAlgos, famRender, finishNow, huntRun, huntShow, importFile, legend, libField, makePanes, markSel, mutFinish, mutMake, mutRound, mutSave, openShared, openTask, outputs, pasteCode, rankList, refreshUI, report, resizePop, saveChamp, seed, setStep, shareLink, startDuel, startGen, startShow, status, stepsRender, stopTask, taskIn, taskLegend, taskOut, taskRender, toggleRun, tour, turbo, whyPlay, whyStep, whyWalker } = U));

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

  // ---- koppeling met app.js ----
  let started = false;
  function init(app) {
    Object.assign(A, app);
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

  Object.assign(U, { setPage, tabsInfo, dotCls, onClick, started, init, enter, key, setPalette });
  U.links.forEach(fn => fn());
  Object.assign(ML.EvoUI, { init, enter, frame: U.frame, key, setPalette, _test: { E, autoSave: U.autoSave, grow: U.grow } }); // _test: alleen voor de rooktest
})(window.ML = window.ML || {});
