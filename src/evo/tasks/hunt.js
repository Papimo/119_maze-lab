// Taak Doolhof-zoeker.
(function (ML) {
  'use strict';
  const U = ML.EvoUI._;
  const { $, A, DUEL_COLS, E, EV, GRID_NAMES, HUNT_ASP, T, esc, huntSet, note, pick, runs } = U;
  let evoBar, key, makePanes, seed, setStep, startGen, startShow, taskIn, taskOut;
  U.link(() => ({ evoBar, key, makePanes, seed, setStep, startGen, startShow, taskIn, taskOut } = U));

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



  // klik-acties (data-ev) van deze module
  Object.assign(U.ACTIONS, {
    'hunt-go': () => { const H = E.hunt; if (!H) return; if (H.running) H.running = false; else huntRun(); },
    'hunt-watch': c => huntShow(+c.b.dataset.i, false),
    'hunt-duel': c => huntShow(+c.b.dataset.i, true),
    'hunt-train': () => {
      const H = E.hunt; if (!H) return;
      A.S.evoHunt = H.found.map(f => f.sp); A.S.evoMazeMode = 'hunt'; A.save(); makePanes(); startGen(); evoBar();
      note(`De evolutie traint nu op ${A.S.evoHunt.length} moeilijke doolhoven (Evolueren).`); taskIn();
    },
  });
  Object.assign(U, { huntScore, huntCand, huntRun, huntIn, huntOut, huntShow });
})(window.ML = window.ML || {});
