// Pagina Taak: openen, stappen, In/Uit-kolommen, bewaren als versie.
(function (ML) {
  'use strict';
  const U = ML.EvoUI._;
  const { $, A, E, EV, T, TASKS, entryById, esc, note, pick } = U;
  let benchIn, benchOut, benchRide, champCard, duelDone, duelIn, duelOut, huntIn, huntOut, mutDone, mutIn, mutOut, rankList, setPage, startDuel, startShow, tabsInfo, todoHtml, whyIn, whyOut, whyTable;
  U.link(() => ({ benchIn, benchOut, benchRide, champCard, duelDone, duelIn, duelOut, huntIn, huntOut, mutDone, mutIn, mutOut, rankList, setPage, startDuel, startShow, tabsInfo, todoHtml, whyIn, whyOut, whyTable } = U));

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


  Object.assign(U, { stopTask, openTask, duelNow, taskRender, stepsRender, setStep, taskIn, taskOut, taskTick, taskEnded, afterHtml, saveVersion });
})(window.ML = window.ML || {});
