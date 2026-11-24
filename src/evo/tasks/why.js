// Taak Uitleg-replay.
(function (ML) {
  'use strict';
  const U = ML.EvoUI._;
  const { $, E, EV, T, TAU, esc, opts, pick } = U;
  let heatAdd, paneStats, stepsRender, taskIn, taskOut;
  U.link(() => ({ heatAdd, paneStats, stepsRender, taskIn, taskOut } = U));

  // ---- Uitleg-replay: per stap welke zetten er waren, de punten per gen en de kans ----
  function whyWalker() { return E.task && E.task.kind === 'why' && T.show && T.show.kind === 'solo' && T.runs && T.runs[0] ? { run: T.runs[0], w: T.runs[0].ws[0] } : null; }
  function whyStep(n) {
    const o = whyWalker(); if (!o) return;
    const { run, w } = o;
    if (!E.xp) E.xp = { last: null };
    if (n < 0) { // terug: opnieuw vanaf de start met hetzelfde zaadje (deterministisch)
      const k = Math.max(0, w.steps + n);
      w.reset(w.ge.genes, w.seed); run.heat.fill(0); run.heatBy.clear(); run.order.length = 0;
      for (let i = 0; i < k - 1; i++) { w.step(); run.heat[w.nc]++; heatAdd(run, w); }
      if (k > 0) { const ex = w.explain(); w.step(); run.heat[w.nc]++; heatAdd(run, w); E.xp.last = { opts: ex, pick: w.s }; } else E.xp.last = null;
    } else for (let i = 0; i < n && !w.done; i++) { const ex = w.explain(); w.step(); run.heat[w.nc]++; heatAdd(run, w); E.xp.last = { opts: ex, pick: w.s }; }
    w.p = 1; T.running = false; T.phase = w.done ? 'pause' : 'run'; T.endT = Infinity;
    T.panes[0].dirty = true; paneStats(T, w.done);
    E.task.step = w.done ? 'done' : 'busy'; stepsRender(); taskIn(); taskOut();
  }
  function whyIn() {
    return `<p class="hint" style="margin-top:0">Elke zet krijgt punten (gen × kenmerk). Daarna loot de loper met “chaos” als temperatuur: hoe hoger de punten, hoe groter de kans. In het doolhof: cirkel = kans per zet.</p>
      <div class="btns"><button class="btn" data-ev="why-back10">−10</button><button class="btn" data-ev="why-back">◀ Stap</button><button class="btn primary" data-ev="why-step">Stap ▶</button><button class="btn" data-ev="why-10">+10</button></div>
      <div class="btns" style="margin-top:6px"><button class="btn" data-ev="why-play">${T.running && T.phase === 'run' ? 'Pauze' : 'Speel af'}</button><button class="btn" data-ev="why-restart">Vanaf het begin</button></div>`;
  }
  function whyOut() { return `<div id="why-tab">${whyHtml()}</div>`; }
  function whyTable() { const el = $('#why-tab'); if (el) el.innerHTML = whyHtml(); }
  function whyHtml() {
    const o = whyWalker(); if (!o) return '';
    const { w } = o, G = EV().GENES, cur = w.done ? null : w.explain(), L = E.xp && E.xp.last;
    const row = (x, picked) => {
      const chips = x.parts.map((v, i) => Math.abs(v) >= 0.05 ? `<em style="border-color:${G[i].col}" title="${esc(G[i].name)}">${v > 0 ? '+' : ''}${v.toFixed(1)} ${esc(G[i].name)}</em>` : '').join('');
      return `<div class="wrow${picked ? ' pick' : ''}"><b>${Math.round(x.p * 100)}%</b><span>${x.visits ? `al ${x.visits}× geweest` : 'nieuw'}${x.jump ? ' · sprong' : ''} · ${x.sc.toFixed(1)} pt</span><div class="chips">${chips || '<em>geen voorkeur</em>'}</div></div>`;
    };
    let html = `<p style="margin-top:0"><b>Stap ${w.steps}</b>${w.reached ? ' · doel bereikt ✓' : w.done ? ' · gestopt (limiet)' : ''} · temperatuur ${w.T.toFixed(2)}</p>`;
    if (L) html += '<div class="wsec">Vorige keuze</div>' + L.opts.slice().sort((a, b) => b.p - a.p).map(x => row(x, x.s2 === L.pick)).join('');
    if (cur) html += `<div class="wsec">Nu te kiezen (${cur.length})</div>` + cur.slice().sort((a, b) => b.p - a.p).map(x => row(x, false)).join('');
    return html;
  }
  function drawWhy(run, g, r) {
    const w = run.ws[0]; if (!w || w.done) return;
    const C = run.mz.m.cells, s = r.s, G = EV().GENES, opts = w.explain(), pc = C[w.nc].center;
    g.font = `600 ${Math.max(9, s * 0.32)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    opts.forEach(o => {
      const c = C[o.c2].center, X = r.X(c[0]), Y = r.Y(c[1]);
      let bi = 0; o.parts.forEach((v, i) => { if (v > o.parts[bi]) bi = i; });
      g.globalAlpha = 0.85; g.strokeStyle = g.fillStyle = o.parts[bi] > 0 ? G[bi].col : '#cfd8e3'; g.lineWidth = Math.max(1.5, s * 0.06);
      g.beginPath(); g.moveTo(r.X(pc[0]), r.Y(pc[1])); g.lineTo(X, Y); g.stroke();
      g.beginPath(); g.arc(X, Y, s * (0.18 + 0.32 * Math.sqrt(o.p)), 0, TAU); g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1; g.stroke();
      g.fillStyle = '#fff'; g.strokeStyle = '#000a'; g.lineWidth = 3; const t = Math.round(o.p * 100) + '%'; g.strokeText(t, X, Y); g.fillText(t, X, Y);
    });
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }

  function whyPlay() {
    const o = whyWalker(); if (!o) return;
    if (o.w.done) whyStep(-o.w.steps);
    T.running = !(T.running && T.phase === 'run'); T.phase = 'run';
    E.task.step = 'busy'; stepsRender(); taskIn();
  }


  // klik-acties (data-ev) van deze module
  Object.assign(U.ACTIONS, {
    'why-step': () => whyStep(1),
    'why-10': () => whyStep(10),
    'why-back': () => whyStep(-1),
    'why-back10': () => whyStep(-10),
    'why-restart': () => { const o = whyWalker(); if (o) whyStep(-o.w.steps); },
    'why-play': () => whyPlay(),
  });
  Object.assign(U, { whyWalker, whyStep, whyIn, whyOut, whyTable, whyHtml, drawWhy, whyPlay });
})(window.ML = window.ML || {});
