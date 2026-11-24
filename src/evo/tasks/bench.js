// Taak Werkbank.
(function (ML) {
  'use strict';
  const U = ML.EvoUI._;
  const { $, E, EV, T, esc, note, pick, scoreBox, signed } = U;
  let duelNow, saveVersion, setStep, startShow, stepsRender, taskIn, taskOut;
  U.link(() => ({ duelNow, saveVersion, setStep, startShow, stepsRender, taskIn, taskOut } = U));

  // ---- Werkbank ----
  function benchRide() {
    const B = E.bench; if (!B) return;
    startShow('solo', [{ id: 'bench', name: B.name, genes: B.genes.slice(), col: '#ffd34d' }], true);
    setStep('busy');
  }
  function benchIn() {
    const B = E.bench; if (!B) return '';
    return `<p class="hint" style="margin-top:0">Schuif aan de genen van <b>${esc(B.src.name)}</b>. Elke wijziging start meteen een proefrit in het doolhof; de testbaan rekent rechts mee. Streepje = origineel.</p>
      <label class="frow"><span>Naam</span><input id="bench-name" value="${esc(B.name)}" maxlength="40"></label>
      <div class="bench-sl">${EV().GENES.map((G, i) => `<label class="bsl" title="+ ${esc(G.pos)} · − ${esc(G.neg)}"><span><i class="sw" style="background:${G.col}"></i>${esc(G.name)}</span>
        <span class="bw"><input type="range" data-g="${i}" min="${G.lo}" max="${G.hi}" step="0.1" value="${B.genes[i]}"><s style="left:${(B.src.genes[i] - G.lo) / (G.hi - G.lo) * 100}%" title="origineel ${B.src.genes[i].toFixed(1)}"></s></span><output>${B.genes[i].toFixed(1)}</output></label>`).join('')}</div>
      <p class="desc" id="bench-desc">${esc(EV().describe(B.genes))}</p>
      <div class="btns"><button class="btn" data-ev="bench-nudge">Kleine mutatie</button><button class="btn" data-ev="bench-reset">Terug naar origineel</button><button class="btn" data-ev="bench-ride">Proefrit opnieuw</button></div>`;
  }
  function benchOut() {
    const B = E.bench; if (!B) return '';
    const t = EV().testScore(B.genes), o = EV().testScore(B.src.genes), d = Math.round((t.score - o.score) * 10) / 10;
    const sign = signed;
    const w = T.runs && T.runs[0] && T.runs[0].ws[0];
    return `${scoreBox(t, null, d || t.per.join() !== o.per.join() ? { name: 'origineel (' + o.score + ')', t: o } : null)}
      <div class="cats">${EV().TEST_CATS.map(c => `<span>${esc(c.name)} <b>${t.cats[c.k]}</b> ${sign(Math.round((t.cats[c.k] - o.cats[c.k]) * 10) / 10)}</span>`).join('')}</div>
      <p class="hint">Proefrit: ${!w ? '—' : w.reached ? `gehaald in ${w.steps} stappen (kortste ${T.runs[0].mz.ctx.opt})` : w.done ? 'niet gehaald binnen de limiet' : 'bezig…'}</p>
      <div class="btns"><button class="btn" data-ev="bench-duel">Vergelijk met origineel (duel)</button></div>`;
  }
  let benchTimer = 0;
  function benchInput(inp) {
    const B = E.bench; if (!B) return;
    const i = +inp.dataset.g; B.genes[i] = Number(inp.value);
    inp.closest('.bsl').querySelector('output').textContent = B.genes[i].toFixed(1);
    $('#bench-desc').textContent = EV().describe(B.genes);
    clearTimeout(benchTimer); benchTimer = setTimeout(benchRide, 160);
  }
  function benchSave() {
    const B = E.bench; if (!B) return;
    const name = (B.name || '').trim().slice(0, 40) || B.src.name + ' v' + (B.src.ver + 1);
    const a = saveVersion({ name, genes: B.genes.map(v => Math.round(v * 1000) / 1000), parent: B.src.id, ver: B.src.ver + 1, parents: [B.src.name], folder: B.src.folder, tags: B.src.tags, born: E.gen, note: `Getweakt vanaf ${B.src.name}` });
    if (!a) return;
    note(`${a.name} bewaard als versie ${a.ver} van ${B.src.name}.`);
    E.bench = { src: pick({ ...a, mine: true }), genes: a.genes.slice(), name: `${name.replace(/ v\d+$/, '')} v${a.ver + 1}` };
    E.task.algo = E.bench.src; stepsRender(); taskIn(); taskOut();
  }



  // klik-acties (data-ev) van deze module
  Object.assign(U.ACTIONS, {
    'bench-ride': () => benchRide(),
    'bench-duel': () => { const B = E.bench; if (B) duelNow([{ ...B.src }, { id: 'bench-edit', name: B.name, genes: B.genes }]); },
    'bench-reset': () => { const B = E.bench; if (!B) return; B.genes = B.src.genes.slice(); taskIn(); benchRide(); },
    'bench-nudge': () => {
      const B = E.bench; if (!B) return;
      const r = ML.makeRng(Math.random()), G = EV().GENES;
      B.genes = B.genes.map((v, i) => r() < 0.4 ? EV().clamp(v + (r() * 2 - 1) * (G[i].hi - G[i].lo) * 0.12, i, v) : v).map(v => Math.round(v * 10) / 10);
      taskIn(); benchRide();
    },
  });
  Object.assign(U, { benchRide, benchIn, benchOut, benchTimer, benchInput, benchSave });
})(window.ML = window.ML || {});
