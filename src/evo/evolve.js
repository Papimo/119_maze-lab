// Pagina Evolueren: generatie afronden, automatisch (bewaren/stoppen/meegroeien), turbo, kampioen, ranglijst, legenda.
(function (ML) {
  'use strict';
  const U = ML.EvoUI._;
  const { $, A, E, EV, HUNT_ASP, T, V, addAlgo, dnaHtml, entries, esc, fresh, huntSet, isSaved, isl, mm, nEval, note, persist, rng, runs, scoreBox, speciate, subOf } = U;
  let afterSave, algoDetail, algoGrid, drawChart, famRender, finishNow, huntMazes, key, liveCard, makePanes, mazesFor, rate, setPage, specsFor, startGen, tabsInfo, viewAspect;
  U.link(() => ({ afterSave, algoDetail, algoGrid, drawChart, famRender, finishNow, huntMazes, key, liveCard, makePanes, mazesFor, rate, setPage, specsFor, startGen, tabsInfo, viewAspect } = U));

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
    if (a) { E.autoA = { id: a.id, name: a.name, s: tb.score }; note(`💾 Nieuwe kampioen ${a.name} (${tb.score}) automatisch bewaard.`); if (E.page === 'algos') { algoGrid(); algoDetail(); } }
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
        heavy: null };
      // zware score in een worker (hoofddraad blokkeert niet); daarna kampioenkaart bijwerken
      if (Ev.heavyReady()) Ev.heavyScoreAsync(best.genes).then(h => { if (E.champ && E.champ.id === best.id) { E.champ.heavy = h.score; champCard(); } });
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
        const specs = mm() === 'hunt' ? huntSet().map((sp, i) => ({ sp, i, asp: HUNT_ASP })) : specsFor(g0); // zoeker: zelfde volgorde/zaadjes als huntMazes
        const pr = P.evaluateSpecs(E.pop, specs, g0, runs(), () => mazesFor(g0),
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
      el.textContent = `Turbo${A.S.evoFast === 'max' && !EV().Pool.broken ? ` (${EV().Pool.size()} kernen${EV().Pool.canBuild ? ', bouwen in workers' : ''})` : ''}: ${E.turboDone}${E.turboN ? '/' + E.turboN : ''} generaties · ${gps}/s · generatie ${E.gen} · ${E.seen.size} verschillende doolhoven`;
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

  function toggleRun() { if (E.turbo) { E.turbo = 0; return; } V.running = !V.running; if (V.running && V.phase === 'idle') startGen(); evoBar(); }

  function resizePop() {
    const N = Number(A.S.evoPop);
    if (E.pop.length > N) E.pop = E.pop.slice().sort((a, b) => (b.fit || 0) - (a.fit || 0)).slice(0, N);
    const r = rng();
    while (E.pop.length < N) E.pop.push(EV().genome(EV().randomGenes(r), E.gen, [], { isl: E.pop.length % isl() }));
    speciate(); persist();
  }


  // klik-acties (data-ev) van deze module
  Object.assign(U.ACTIONS, {
    'save-champ': () => saveChamp(),
    seed: ({ a }) => { if (a) { seed(a); setPage('evolve'); } },
    run: () => toggleRun(),
    skip: () => { if (V.phase === 'run') finishNow(); else startGen(); },
    turbo: c => turbo(+c.b.dataset.turbo),
    mm: c => { A.S.evoMazeMode = c.b.dataset.mm; A.save(); makePanes(); startGen(); evoBar(); },
    reset: () => {
      if (!confirm('Opnieuw beginnen? De huidige populatie en grafiek gaan weg (bewaarde algoritmes blijven).')) return;
      E.turbo = 0; fresh(A.S.evoSeedSaved ? EV().loadAlgos() : []); refreshUI(true); startGen(); evoBar();
    },
  });
  Object.assign(U, { advance, autoSave, stall, autoInfo, autoChecks, grow, flushPend, record, refreshUI, turbo, champCard, rankList, status, evoBar, outputs, legend, taskLegend, saveChamp, seed, toggleRun, resizePop });
})(window.ML = window.ML || {});
