// Tekenen: hittekaart + lopers per paneel, paneel-teksten, grafiek.
(function (ML) {
  'use strict';
  const U = ML.EvoUI._;
  const { $, E, EV, T, TAU, V } = U;
  let drawWhy, key, record;
  U.link(() => ({ drawWhy, key, record } = U));

  // ---- tekenen in een paneel ----
  // hittekaart per soort (evolutie) of per deelnemer (taak): sleutel w.hk
  function heatAdd(run, w) {
    let h = run.heatBy.get(w.hk);
    if (!h) { h = new Float32Array(run.heat.length); h[run.mz.ctx.cellOf[run.mz.ctx.start]] = 1; run.heatBy.set(w.hk, h); }
    h[w.nc]++;
  }
  function drawRun(run, g, r, now) {
    const v = run.v, m = run.mz.m, C = m.cells, s = r.s, show = v.show, many = show && run.ws.length > 4;
    const rad = Math.max(1.6, s * (show && !many ? 0.17 : show ? 0.13 : 0.1)), hs = v.heatSel;
    ML.drawHeat(g, r, m, hs != null ? run.heatBy.get(hs) || new Float32Array(run.heat.length) : run.heat, show ? 0.4 : 0.5);
    const by = new Map();
    let lead = null, ld = 1e9, champ = null;
    for (const w of run.ws) {
      if (w.done && !w.reached) continue;
      if (hs != null && w.hk !== hs) continue; // alleen de gekozen soort
      if (w.ge.id === v.champId) champ = w;
      if (w.reached) continue;
      const d = run.mz.ctx.dist[w.nc]; if (d < ld) { ld = d; lead = w; }
      const p = posOf(w, C), X = r.X(p[0]), Y = r.Y(p[1]);
      let path = by.get(w.col); if (!path) by.set(w.col, path = new Path2D());
      path.moveTo(X + rad, Y); path.arc(X, Y, rad, 0, TAU);
    }
    g.save();
    // taak: het pad dat elke loper nu "denkt" (stapel), elk in eigen kleur, iets verschoven
    if (show && !many) {
      const cellOf = run.mz.ctx.cellOf, k0 = (run.ws.length - 1) / 2;
      g.lineCap = g.lineJoin = 'round'; g.lineWidth = Math.max(2, s * (run.ws.length > 1 ? 0.1 : 0.14));
      run.ws.forEach((w, k) => {
        if (hs != null && w.hk !== hs) return;
        const o = (k - k0) * s * 0.12, pl = new Path2D();
        let first = true, pc = -1;
        const S = w.stk; for (let q = 0; q < w.sl; q++) { const c = cellOf[S[q]]; if (c === pc) continue; const ce = C[c].center; const X = r.X(ce[0]) + o, Y = r.Y(ce[1]) + o; if (first) pl.moveTo(X, Y); else pl.lineTo(X, Y); first = false; pc = c; }
        g.globalAlpha = 0.85; g.strokeStyle = w.col; g.stroke(pl);
      });
      g.globalAlpha = 1;
    }
    for (const [col, path] of by) { g.fillStyle = col; g.fill(path); g.strokeStyle = 'rgba(15,10,20,0.55)'; g.lineWidth = 1; g.stroke(path); }
    const ring = (w, colr, k) => {
      const p = w.reached ? C[m.goal].center : posOf(w, C), X = r.X(p[0]), Y = r.Y(p[1]);
      g.beginPath(); g.arc(X, Y, rad * k * (1 + Math.sin(now * 6) * 0.12), 0, TAU); g.strokeStyle = colr; g.lineWidth = Math.max(1.5, s * 0.04); g.stroke();
    };
    if (lead && (!show || many)) ring(lead, 'rgba(255,243,176,0.9)', 2.2);
    if (champ && !show && !champ.reached) ring(champ, '#ffffff', 1.7);
    // aankomst-flitsen bij het doel
    const gc = C[m.goal].center, gx = r.X(gc[0]), gy = r.Y(gc[1]);
    run.flash = run.flash.filter(f => now - f.t < 0.9);
    for (const f of run.flash) { const e = (now - f.t) / 0.9; g.globalAlpha = 0.8 * (1 - e); g.strokeStyle = f.col; g.lineWidth = Math.max(1.5, s * 0.07); g.beginPath(); g.arc(gx, gy, s * (0.3 + e * 1.6), 0, TAU); g.stroke(); }
    g.globalAlpha = 1;
    if (v === T && E.task && E.task.kind === 'why' && show && show.kind === 'solo' && run === v.runs[0]) drawWhy(run, g, r);
    g.restore();
    return v.phase === 'run' || run.flash.length > 0;
  }
  function posOf(w, C) {
    const a = C[w.c].center, b = C[w.nc].center;
    let e = Math.min(1, w.p);
    if (w.jump) e = e < 0.5 ? 0 : 1;
    return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
  }
  function paneStats(v, final) {
    if (!v.runs) return;
    v.runs.forEach((run, i) => {
      const el = v.panes[i] && v.panes[i].el; if (!el) return;
      const n = run.ws.length, ok = run.order.length, f = run.order[0], show = v.show;
      let txt;
      if (show && show.kind === 'mut') txt = `${ok}/${n} binnen` + (run.cut ? ` · ${run.cut} niet afgewacht` : '') + (f ? ` · eerste: ${f.ge.name} (${f.steps} st.)` : '');
      else if (show && show.kind === 'duel') txt = run.ws.map(w => `${w.ge.name}: ${w.reached ? w.steps + ' ✓' : w.done ? '✗' : w.steps + '…'}`).join(' · ');
      else if (show) { const w = run.ws[0]; txt = (show.kind === 'preview' ? 'Voorproefje · ' : '') + (w.reached ? `Gehaald in ${w.steps} stappen (kortste ${run.mz.ctx.opt}) · score ${Math.round(w.score() * 100)}` : final ? 'Niet gehaald binnen de limiet' : `${w.steps} stappen…`); }
      else txt = `${ok}/${n} gehaald` + (f ? ` · eerste: ${f.ge.name} (${f.steps} st.)` : '') + (i === 0 && V.mazes.length > V.runs.length ? ` · +${V.mazes.length - V.runs.length} doolhoven op de achtergrond` : '');
      el.querySelector('.pane-stats').textContent = txt;
      el.classList.toggle('winner', !!final && ok > 0 && !show && ok === n);
    });
  }

  // ---- grafiek ----
  function drawChart() {
    const cv = $('#cv-evo'); if (!cv || !cv.clientWidth) return;
    const d = window.devicePixelRatio || 1, W = cv.width = Math.round(cv.clientWidth * d), H = cv.height = Math.round(cv.clientHeight * d);
    const g = cv.getContext('2d'), css = getComputedStyle(document.body), muted = css.getPropertyValue('--muted').trim() || '#8b98a8', line = css.getPropertyValue('--line').trim() || '#263040';
    g.clearRect(0, 0, W, H);
    const L = 34 * d, R = 10 * d, T_ = 22 * d, B = 20 * d, hs = E.hist, bc = EV().bestClassic();
    let top = bc.t.score; for (const h of hs) { if (h.best > top) top = h.best; if (h.test > top) top = h.test; }
    const ymax = Math.min(100, Math.max(40, Math.ceil(top / 10) * 10 + 5));
    const n = Math.max(2, hs.length), X = i => L + (W - L - R) * i / (n - 1), Y = v => T_ + (H - T_ - B) * (1 - v / ymax);
    g.font = `${11 * d}px system-ui, sans-serif`; g.fillStyle = muted; g.strokeStyle = line; g.lineWidth = d;
    for (let v = 0; v <= ymax; v += ymax > 60 ? 20 : 10) { g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - R, Y(v)); g.stroke(); g.fillText(v, 6 * d, Y(v) + 4 * d); }
    // klassieker-lat
    g.setLineDash([6 * d, 5 * d]); g.strokeStyle = '#ff6b6b'; g.lineWidth = 1.5 * d;
    g.beginPath(); g.moveTo(L, Y(bc.t.score)); g.lineTo(W - R, Y(bc.t.score)); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#ff6b6b'; g.fillText(`beste klassieker: ${bc.p.name} ${bc.t.score}`, L + 6 * d, Y(bc.t.score) - 5 * d);
    const stride = Math.max(1, Math.floor(hs.length / (W / d))); // lange geschiedenis: niet elk punt tekenen
    const plot = (key, col, w) => {
      if (!hs.length) return;
      g.strokeStyle = col; g.lineWidth = w * d; g.lineJoin = 'round'; g.beginPath();
      for (let i = 0; i < hs.length; i += stride) { const x = X(i), y = Y(hs[i][key]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    };
    plot('mean', muted, 1.2); plot('best', '#ffd166', 1.2);
    g.globalAlpha = 0.45; plot('test', '#4cc9f0', 1.2); g.globalAlpha = 1;
    if (hs.length) { // record = beste testscore tot nu toe (traplijn)
      let rec = -1; g.strokeStyle = '#4cc9f0'; g.lineWidth = 2.6 * d; g.beginPath();
      hs.forEach((h, i) => { const x = X(i); if (h.test > rec) { if (i) g.lineTo(x, Y(rec)); rec = h.test; } if (i) g.lineTo(x, Y(rec)); else g.moveTo(x, Y(rec)); });
      g.stroke();
    }
    let lx = L; g.textBaseline = 'middle';
    [['#4cc9f0', 'kampioen (record score testbaan)'], ['#4cc9f077', 'beste v.d. generatie, score testbaan'], ['#ffd166', 'score beste (eigen doolhoven)'], [muted, 'gemiddelde']].forEach(([c, s]) => {
      g.fillStyle = c; g.fillRect(lx, 8 * d, 14 * d, 3 * d); g.fillStyle = muted; g.fillText(s, lx + 18 * d, 10 * d); lx += g.measureText(s).width + 34 * d;
    });
    g.textBaseline = 'alphabetic';
    if (hs.length) { g.fillStyle = muted; g.textAlign = 'right'; g.fillText(`generatie ${hs[hs.length - 1].gen}`, W - R, H - 5 * d); g.textAlign = 'left'; g.fillText(`generatie ${hs[0].gen}`, L, H - 5 * d); }
  }


  Object.assign(U, { heatAdd, drawRun, posOf, paneStats, drawChart });
})(window.ML = window.ML || {});
