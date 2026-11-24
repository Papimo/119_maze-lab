// Taak Duel.
(function (ML) {
  'use strict';
  const U = ML.EvoUI._;
  const { $, DUEL_COLS, E, EV, T, entries, esc, sureOf, sureTag } = U;
  let key, setStep, startShow, taskIn;
  U.link(() => ({ key, setStep, startShow, taskIn } = U));

  // ---- Duel ----
  function startDuel(list, keepMaze) {
    if (!list || list.length < 2) return;
    E.duel.list = list.slice(0, 4).map((a, k) => ({ id: a.id || 'duel-' + k, name: a.name, genes: a.genes.slice(), col: DUEL_COLS[k] }));
    E.duel.done = false; E.duel.res = null;
    startShow('duel', E.duel.list, keepMaze);
    setStep('busy'); taskIn();
  }
  function duelDone() {
    const D = E.duel; if (!D || !D.list) return;
    D.done = true;
    D.res = D.list.map((_, k) => T.runs.map(run => { const w = run.ws[k]; return { steps: w.steps, ok: w.reached, opt: run.mz.ctx.opt }; }));
    setStep('done'); taskIn();
  }
  function duelIn() {
    const D = E.duel; if (!D) return '';
    const ids = new Set(D.pick.map(p => p.id)), cand = entries();
    D.pick.forEach(p => { if (!cand.some(c => c.id === p.id)) cand.unshift({ ...p, t: EV().testScore(p.genes) }); });
    const busy = T.show && T.show.kind === 'duel' && T.phase === 'run';
    return `<p class="hint" style="margin-top:0">Kies 2–4 deelnemers. Ze lopen tegelijk door hetzelfde doolhof, elk met eigen kleur en spoor.</p>
      <div class="dpick">${cand.slice(0, 24).map(a => { const on = ids.has(a.id), fixed = a.id === E.task.algo.id;
        return `<label class="${on ? 'on' : ''}"><input type="checkbox" data-duel="${esc(a.id)}"${on ? ' checked' : ''}${fixed ? ' disabled' : ''}><i class="sw" style="background:${EV().colorOf(a.genes)}"></i>${esc(a.name)}<small>${a.t.score}</small></label>`; }).join('')}</div>
      <div class="btns"><button class="btn primary" data-ev="duel-start"${D.pick.length < 2 || busy ? ' disabled' : ''}>${D.list ? 'Opnieuw (zelfde doolhof)' : 'Start duel'}</button>${D.done ? '<button class="btn" data-ev="duel-again">Ander doolhof</button>' : ''}</div>`;
  }
  function duelOut() {
    const D = E.duel;
    if (!D || !D.list) return '<p class="hint" style="margin-top:0">Nog niet gestart. Kies links de deelnemers en druk op Start duel. Hier verschijnt dan per deelnemer: stappen in dit doolhof, Score op de testbaan (met zekerheid) en per doolhof-soort.</p>';
    const cats = EV().TEST_CATS, ts = D.list.map(a => EV().testScore(a.genes));
    const best = key => Math.max(...ts.map(key));
    const cell = (v, b, base, k) => `<td class="${v === b ? 'best' : ''}">${v}${k && base != null ? `<small>${v - base > 0 ? '+' : ''}${Math.round((v - base) * 10) / 10}</small>` : ''}</td>`;
    const mazeCol = k => {
      if (!D.done || !D.res) return '<td>…</td>';
      const r = D.res[k], tot = r.reduce((s, x) => s + (x.ok ? x.steps : 0), 0), ok = r.every(x => x.ok);
      const bestTot = Math.min(...D.res.map(rr => rr.every(x => x.ok) ? rr.reduce((s, x) => s + x.steps, 0) : 1e9));
      return `<td class="${ok && tot === bestTot ? 'best' : ''}">${ok ? tot + ' st.' : '✗'}</td>`;
    };
    let win = '';
    if (D.done && D.res) { const tots = D.res.map(r => r.every(x => x.ok) ? r.reduce((s, x) => s + x.steps, 0) : 1e9), m = Math.min(...tots); win = m < 1e9 ? `🏁 Dit doolhof: <b>${esc(D.list[tots.indexOf(m)].name)}</b> was het snelst.` : 'Niemand haalde het doel binnen de limiet.'; }
    const tw = ts.indexOf(ts.reduce((a, b) => b.score > a.score ? b : a));
    return `<p style="margin-top:0">${D.done ? win : 'Bezig…'}${D.done ? `<br>📏 Score testbaan: <b>${esc(D.list[tw].name)}</b> is algemeen het sterkst.` : ''}</p>
      <div class="duel-wrap"><table class="duel"><thead><tr><th></th><th>Dit doolhof</th><th title="Score 0–100 op de testbaan">Score</th><th title="t.o.v. ${esc(D.list[0].name)}, per testdoolhof vergeleken">Zeker?</th>${cats.map(c => `<th>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>
      ${D.list.map((a, k) => `<tr><th><i class="sw" style="background:${a.col}"></i>${esc(a.name)}</th>${mazeCol(k)}${cell(ts[k].score, best(t => t.score), ts[0].score, k)}<td>${k ? sureTag(sureOf(ts[k].per, ts[0].per)) : '<small>basis</small>'}</td>${cats.map(c => cell(ts[k].cats[c.k], best(t => t.cats[c.k]), ts[0].cats[c.k], k)).join('')}</tr>`).join('')}
      </tbody></table></div><p class="hint">Groen = beste in die kolom; kleine getallen = verschil met de eerste rij.</p>`;
  }



  // klik-acties (data-ev) van deze module
  Object.assign(U.ACTIONS, {
    'duel-start': () => { if (E.duel) startDuel(E.duel.pick, true); },
    'duel-again': () => { if (E.duel) { T.salt++; T.forced = null; T.mazes = []; startDuel(E.duel.pick, false); } },
  });
  Object.assign(U, { startDuel, duelDone, duelIn, duelOut });
})(window.ML = window.ML || {});
