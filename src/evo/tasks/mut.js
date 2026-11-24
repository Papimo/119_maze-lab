// Taak Mutantenlab.
(function (ML) {
  'use strict';
  const U = ML.EvoUI._;
  const { $, A, E, EV, T, TAU, esc, fresh, note, opts, pick, r1, scoreBox, sureOf } = U;
  let duelNow, goalHtml, openTask, saveVersion, setStep, startShow, taskIn, taskOut;
  U.link(() => ({ duelNow, goalHtml, openTask, saveVersion, setStep, startShow, taskIn, taskOut } = U));

  // ---- Mutantenlab: algoritme → N mutanten (vast voor de hele reeks) → elke ronde een ánder doolhof ----
  // Score = 0–100 (100 = elke keer de kortste route), zelfde maat als de testbaan. Winnaar = hoogste gemiddelde over alle rondes.
  // Stopregel is alleen voor het kijken: wie afgekapt wordt, wordt onzichtbaar afgemaakt (zelfde zaadje) → iedereen een eerlijke score.
  // Zekerheid: verschil met het origineel per doolhof (gepaard); gemiddeld verschil ≥ 2× de standaardfout en ≥ 3 doolhoven = zeker.
  const MUT_STR = { mini: 0.03, klein: 0.06, middel: 0.12, groot: 0.25 }, STR_ORDER = ['mini', 'klein', 'middel', 'groot'];
  const MUT_PRESET = { snel: { n: 8, rounds: 3, need: 1, maxT: 4 }, grondig: { n: 24, rounds: 10, need: 3, maxT: 8 } };
  const AUTO_MAX = 8;

  function mutMake() {
    const M = E.mut; if (!M) return;
    const Ev = EV(), r = ML.makeRng(M.src.name + '|mut|' + Math.random()), G = Ev.GENES, f = MUT_STR[M.str] || 0.12;
    const list = [{ id: 'mut-0', name: M.src.name + (M.auto && M.hist.length ? ' (huidige)' : ' (origineel)'), genes: M.src.genes.slice(), col: '#ffffff', base: true }];
    for (let k = 1; k <= M.n; k++) {
      let genes;
      do { genes = M.src.genes.map((v, i) => r() < 0.5 ? Ev.clamp(v + Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(TAU * r()) * (G[i].hi - G[i].lo) * f, i, v) : v); } while (genes.join() === M.src.genes.join()); // bereik rekt mee als de bron erbuiten ligt (Kompas: fresh 8)
      list.push({ id: `mut-${k}`, name: `${M.src.name} m${k}`, genes: genes.map(v => Math.round(v * 100) / 100), col: `hsl(${Math.round(k * 360 / M.n)},85%,62%)` });
    }
    M.list = list; M.sc = list.map(() => []); M.round = 0; M.target = +M.rounds; M.extended = false; M.res = null; M.lead = []; M.pick = 0; M.saved = null; M.saveName = null; M.saveNote = null;
  }
  function mutRound() {
    const M = E.mut; if (!M) return;
    M.round++; M.busy = true;
    T.salt++; T.forced = null; // nieuw zaadje = nieuw doolhof
    startShow('mut', M.list, false);
    setStep('busy'); taskIn();
  }
  // tempo: een ronde duurt minstens ~1,5 s (doorkweken 0,6 s), anders is er niets te volgen; herhaling rustig
  function mutRate(spd) {
    const M = E.mut, k = T.show && T.show.kind, run = T.runs && T.runs[0];
    if (!M || !run || !E.task || E.task.kind !== 'mut') return spd;
    const opt = run.mz.ctx.opt || 30;
    if (k === 'replay') return Math.min(spd, opt * 1.2);
    if (k === 'mut') return Math.min(spd, opt * 3 / (M.auto ? 0.6 : 1.5));
    return spd;
  }
  // stopregel: genoeg binnen of tijd op → rest niet afwachten (wel uitrekenen in mutDone); kansloos (> 2× stappen eerste) → afkappen
  function mutCheck(t, alive) {
    const M = E.mut, run = T.runs && T.runs[0]; if (!M || !run) return alive;
    const n = run.ws.length, need = M.need ? Math.min(M.need, n) : n, first = run.order[0];
    const cut = w => { w.done = true; w.cut = true; w.p = 1; run.cut++; };
    if (first) for (const w of run.ws) if (!w.done && w.steps > Math.max(first.steps * 2, first.steps + 30)) { cut(w); alive--; }
    if (run.order.length >= need || t - T.t0 > M.maxT) { for (const w of run.ws) if (!w.done) cut(w); return 0; }
    return alive;
  }
  // tussenstand: gemiddelde over de gespeelde rondes, beste eerst
  function mutStand() {
    const M = E.mut;
    return M.list.map((a, k) => { const s = M.sc[k], avg = s.length ? s.reduce((x, y) => x + y, 0) / s.length : 0; return { a, k, s, avg }; })
      .sort((x, y) => y.avg - x.avg);
  }
  function mutDone() {
    const M = E.mut; if (!M || !M.list) return;
    const run = T.runs[0], Ev = EV();
    run.ws.forEach((w, k) => {
      const sc = w.cut ? Ev.evalOne(run.mz.ctx, M.list[k].genes, w.seed).score() : w.score();
      M.sc[k].push(r1(sc * 100));
    });
    const st = mutStand();
    M.lead.push({ round: M.round, name: st[0].a.name, avg: r1(st[0].avg) });
    if (M.round < M.target && M.busy) { M.wait = true; setTimeout(() => { M.wait = false; if (E.mut === M && M.busy) mutRound(); }, M.auto ? 300 : 900); taskOut(); return; }
    mutFinish();
  }
  // klaar (of gestopt na ≥1 ronde): eindstand, zekerheid, sterkte bijstellen, evt. doorkweken
  function mutFinish() {
    const M = E.mut, Ev = EV();
    const st = mutStand(), base = st.find(x => x.a.base);
    M.res = st.map(x => ({ ...x, avg: r1(x.avg), t: Ev.testScore(x.a.genes).score, sure: x.a.base ? sureOf() : sureOf(x.s, base.s, 1) }));
    const w = M.res[0], bAvg = base.avg;
    if (M.auto && M.busy && w.sure.k === 'maybe' && !M.extended) { // twijfel → eerst langer meten
      M.extended = true; M.target += 5; taskOut(); mutRound(); return;
    }
    // sterkte bijstellen voor de volgende reeks
    const muts = M.res.filter(x => !x.a.base), bad = muts.filter(x => x.avg < bAvg * 0.5).length / Math.max(1, muts.length), si = STR_ORDER.indexOf(M.str);
    M.strNote = '';
    if (bad > 0.6 && si > 0) { M.str = STR_ORDER[si - 1]; M.strNote = `Sterkte omlaag naar <b>${M.str}</b>: ${Math.round(bad * 100)}% van de mutanten was veel slechter.`; }
    else if (bad < 0.1 && w.sure.k !== 'yes' && si < STR_ORDER.length - 1) { M.str = STR_ORDER[si + 1]; M.strNote = `Sterkte omhoog naar <b>${M.str}</b>: de mutanten leken te veel op het origineel.`; }
    if (M.auto) {
      M.hist.push({ n: M.hist.length + 1, name: w.a.name, gain: r1(w.avg - bAvg), sure: w.sure.k === 'yes' && !w.a.base });
      if (w.sure.k === 'yes' && !w.a.base && M.hist.length < AUTO_MAX && M.busy) {
        M.src = { ...M.src, id: null, name: `${M.root} r${M.hist.length}`, genes: w.a.genes.slice() };
        taskOut();
        setTimeout(() => { if (E.mut === M && M.auto && M.busy) { mutMake(); mutRound(); } }, 700);
        return;
      }
      M.auto = false;
    }
    // kiezen: winnaar, of bij doorkweken de beste gevonden (= huidige bron) als er geen zekere winnaar meer was
    const evolved = M.src.genes.join() !== M.orig0.join();
    M.pick = !w.a.base ? 0 : evolved ? M.res.indexOf(base) : -1;
    M.busy = false; setStep('done'); taskIn();
    // winnaar nog één keer rustig laten lopen naast het origineel, op het laatste doolhof
    const show = [M.res.find(x => x.a.base).a]; if (!w.a.base) show.push(w.a);
    startShow('replay', show, true);
  }
  const canSave = x => x && (!x.a.base || x.a.genes.join() !== E.mut.orig0.join());
  function mutIn() {
    const M = E.mut; if (!M) return '';
    const dis = M.busy ? ' disabled' : '';
    const sel = (id, opts, v) => `<select data-mut="${id}"${dis}>${opts.map(([k, t]) => `<option value="${k}"${String(k) === String(v) ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
    const pre = Object.keys(MUT_PRESET).find(p => Object.entries(MUT_PRESET[p]).every(([k, v]) => +M[k] === v));
    const pb = (p, t, d) => `<button class="btn mut-pre${pre === p ? ' on' : ''}" data-ev="mut-preset" data-p="${p}"${dis}><b>${t}</b><small>${d}</small></button>`;
    return `<p class="hint" style="margin-top:0">Het lab maakt <b>één groep</b> varianten van <b>${esc(M.src.name)}</b>. Die groep loopt <b>elke ronde een ander doolhof</b>. Winnaar = <b>hoogste gemiddelde score</b> over alle rondes. Het origineel loopt mee als maatstaf.</p>
      <div class="mut-pres">${pb('snel', '⚡ Snel', '8 mutanten · 3 doolhoven')}${pb('grondig', '🔬 Grondig', '24 mutanten · 10 doolhoven')}</div>
      <details class="ev-set"${pre ? '' : ' open'}><summary>Meer instellingen</summary>
      <div class="frow2"><span>Mutanten</span>${sel('n', [[8, 8], [16, 16], [24, 24], [40, 40]], M.n)}</div>
      <div class="frow2"><span>Sterkte</span>${sel('str', STR_ORDER.map(s => [s, s]), M.str)}</div>
      <div class="frow2"><span>Rondes</span>${sel('rounds', [[1, '1 doolhof'], [3, '3 doolhoven'], [5, '5 doolhoven'], [10, '10 doolhoven'], [20, '20 doolhoven']], M.rounds)}</div>
      <div class="frow2"><span>Kijken tot</span>${sel('need', [[1, 'de eerste binnen is'], [3, '3 binnen zijn'], [5, '5 binnen zijn'], [0, 'iedereen klaar is']], M.need)}</div>
      <div class="frow2"><span>of na</span>${sel('maxT', [[4, '4 s'], [8, '8 s'], [15, '15 s'], [30, '30 s']], M.maxT)}</div>
      <p class="hint">Sterkte past zich na elke reeks vanzelf aan. Wie je niet ziet uitlopen, wordt op de achtergrond afgemaakt: de uitslag is altijd eerlijk.</p></details>
      <div class="btns"><button class="btn primary" data-ev="mut-go"${dis}>${M.busy && !M.auto ? 'Bezig…' : M.round ? 'Nieuwe reeks' : 'Start'}</button><button class="btn" data-ev="mut-auto"${dis} title="Steeds de zekere winnaar als nieuwe bron, tot er geen zekere winst meer is (max ${AUTO_MAX} reeksen)">${M.auto ? '🔁 Doorkweken…' : '🔁 Doorkweken'}</button>${M.busy ? '<button class="btn" data-ev="mut-stop">Stop</button>' : ''}</div>
      ${goalHtml()}`;
  }
  // tabel: plaats, naam, score, score per ronde, (testbaan), verschil met origineel + zekerheid
  function mutTable(rows, done) {
    const M = E.mut, base = rows.find(x => x.a.base), R = M.sc[0].length, perR = R <= 10;
    const head = `<tr><th>#</th><th>Algoritme</th><th title="gemiddelde over alle rondes, 0–100">Score</th>${perR ? Array.from({ length: R }, (_, i) => `<th>R${i + 1}</th>`).join('') : '<th>laagste</th><th>hoogste</th>'}${done ? '<th title="12 vaste doolhoven, zelfde maat, ter controle">Testbaan</th>' : ''}<th>Δ</th></tr>`;
    const body = rows.slice(0, done ? 41 : 12).map((x, i) => {
      const d = r1(x.avg - base.avg), idx = done ? M.res.indexOf(x) : -1, on = done && M.pick === idx, clk = done && canSave(x);
      const cells = perR ? x.s.map((v, j) => `<td${!x.a.base && v > base.s[j] ? ' class="win"' : ''}>${v}</td>`).join('') : `<td>${Math.min(...x.s)}</td><td>${Math.max(...x.s)}</td>`;
      const sure = x.sure ? `<span title="${esc(x.sure.txt)}">${x.sure.icon}</span>` : '';
      return `<tr class="${i ? '' : 'top'}${on ? ' pick' : ''}${clk ? ' clk' : ''}"${clk ? ` data-ev="mut-pick" data-k="${idx}" title="klik om deze te kiezen"` : ''}><td>${i + 1}</td><th><i class="sw" style="background:${x.a.col}"></i>${esc(x.a.name)}${x.a.base ? ' <small>maatstaf</small>' : ''}</th><td class="${i ? '' : 'best'}"><b>${r1(x.avg)}</b></td>${cells}${done ? `<td>${x.t}</td>` : ''}<td>${x.a.base ? '' : (d > 0 ? '+' : '') + d} ${sure}</td></tr>`;
    }).join('');
    return `<div class="duel-wrap"><table class="duel mut-tab"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }
  function autoHtml() {
    const M = E.mut; if (!M.hist || !M.hist.length) return '';
    return `<div class="tree"><b>Doorkweken</b> ${M.hist.map(h => `reeks ${h.n}: ${h.gain > 0 ? '+' : ''}${h.gain} ${h.sure ? '✅' : '❌'}`).join(' · ')}${!M.auto && !M.busy ? ' → klaar' : ''}</div>`;
  }
  function mutOut() {
    const M = E.mut; if (!M) return '';
    let html = '';
    const run = T.runs && T.runs[0], played = M.list ? M.sc[0].length : 0;
    if (M.busy && M.auto && !played && M.hist.length) html += `<div class="wait">Reeks ${M.hist.length} gaf een zekere winnaar. Reeks ${M.hist.length + 1} start met die winnaar als bron…</div>`;
    if (M.busy && run && T.show && T.show.kind === 'mut') {
      const ser = M.auto ? `Reeks ${M.hist.length + 1} · ` : '';
      if (M.wait) html += `<div class="wait">${ser}Ronde ${M.round} klaar. Ronde ${M.round + 1} van ${M.target} start zo, op een nieuw doolhof…</div>`;
      else {
        const n = run.ws.length, need = M.need ? Math.min(M.need, n) : n, got = run.order.length;
        const el = performance.now() / 1000 - T.t0, left = Math.max(0, Math.ceil(M.maxT - el)), p = Math.min(1, Math.max(got / need, el / M.maxT));
        html += `<div class="wait">${ser}Ronde <b>${M.round}/${M.target}</b> (doolhof ${M.round}) · <b>${got}</b> binnen · ${run.cut} afgekapt · nog max ${left} s</div>
          <div class="prog"><i style="width:${Math.round(p * 100)}%"></i></div>
          <div class="wsec">Binnen deze ronde</div><ol class="arrivals">${run.order.slice(0, 6).map(w => `<li><i class="sw" style="background:${w.col}"></i>${esc(w.ge.name)}<em>${w.steps} st.</em></li>`).join('') || '<li class="hint">nog niemand…</li>'}</ol>`;
      }
      if (played) html += `<p><b>Tussenstand na ${played} ${played > 1 ? 'doolhoven' : 'doolhof'}</b> · score 0–100, beste eerst</p>` + mutTable(mutStand(), false);
      html += autoHtml();
    } else if (M.res) {
      const w = M.res[0], base = M.res.find(x => x.a.base), d = r1(w.avg - base.avg), s = w.sure;
      const evolved = M.src.genes.join() !== M.orig0.join();
      if (w.a.base) html += evolved
        ? `<div class="mut-win"><span class="md">🔁</span><div><b>Doorkweken klaar</b><span>Geen zekere winst meer. Beste gevonden: <b>${esc(M.src.name)}</b>.</span></div></div>`
        : `<div class="mut-win lose"><b>Geen mutant was beter</b><span>Het origineel won met score ${base.avg} over ${played} doolhoven. Probeer opnieuw: de sterkte is al aangepast.</span></div>`;
      else html += `<div class="mut-win ${s.k}"><span class="md">${s.k === 'yes' ? '🏆' : '🤔'}</span><div><b>${esc(w.a.name)}</b><span>score <b>${w.avg}</b> over <b>${played}</b> verschillende doolhoven · origineel ${base.avg} <em class="up">+${d}</em></span><span class="sure">${s.icon} ${esc(s.txt)}</span></div>
        ${s.k === 'maybe' ? '<button class="btn primary" data-ev="mut-more">+5 doolhoven</button>' : ''}</div>`;
      const wg = !w.a.base ? w.a.genes : evolved ? M.src.genes : null; // winnaar op de testbaan, zelfde scorevak als elders
      if (wg) html += scoreBox(EV().testScore(wg), null, { name: 'origineel', t: EV().testScore(M.orig0) });
      if (M.strNote) html += `<p class="hint">${M.strNote}</p>`;
      html += `<p class="hint">Score = gemiddelde van R1…R${played}, 0–100 (100 = elke keer de kortste route). Groen = beter dan het origineel op dat doolhof. Testbaan = 12 vaste doolhoven, zelfde maat, ter controle. Klik een rij om die te bewaren. Het doolhof laat de winnaar nog eens rustig lopen.</p>` + mutTable(M.res, true);
      html += autoHtml() + mutSaveBox();
      if (M.lead.length > 1) html += `<div class="tree"><b>Koploper per ronde</b> ${M.lead.map(l => `R${l.round}: ${esc(l.name.replace(M.src.name + ' ', ''))} (${l.avg})`).join(' · ')}</div>`;
    } else if (!M.busy) html += '<p class="hint">Kies ⚡ Snel of 🔬 Grondig en druk op Start. Of laat het lab zelf doorkweken. Het doolhof laat nu een voorproefje van het origineel zien.</p>';
    return html;
  }

  // bewaren: gekozen rij met eigen naam, map en notitie
  function mutSaveBox() {
    const M = E.mut, x = M.res[M.pick];
    if (M.saved) return `<div class="after mut-save"><h4>✓ Bewaard als <b>${esc(M.saved.name)}</b></h4><span class="hint" style="width:100%;margin:0">Staat nu bij Algoritmes en kan als oplosser gekozen worden. Zet hem meteen in:</span>
      <button class="btn primary" data-ev="mut-go-build">▶ Laat hem lopen (Bouwen)</button><button class="btn primary" data-ev="mut-go-race">🏁 Race tegen klassiekers (Lab)</button>
      <button class="btn" data-ev="mut-again">Nieuwe reeks met ${esc(M.saved.name)} als bron</button><button class="btn" data-ev="mut-duel">Duel met origineel</button><button class="btn" data-ev="mut-bench">Naar werkbank</button>
      <div style="width:100%">${goalHtml()}</div></div>`;
    if (!canSave(x)) return '<div class="after mut-save"><h4>Kies een mutant</h4><span class="hint" style="margin:0">Klik een rij in de tabel om die te bewaren.</span></div>';
    const algos = EV().loadAlgos(), parent = algos.find(a => a.genes.join() === M.orig0.join());
    const name = M.saveName != null ? M.saveName : `${M.root.replace(/ v\d+$/, '')} v${parent ? parent.ver + 1 : 2}`;
    const nt = M.saveNote != null ? M.saveNote : `Mutantenlab: score ${x.avg} over ${M.sc[0].length} doolhoven, testbaan ${x.t}${M.hist.length ? `, ${M.hist.length} reeksen doorgekweekt` : ''}, vanaf ${M.root}`;
    return `<div class="after mut-save"><h4>💾 Bewaar <i class="sw" style="background:${x.a.col}"></i>${esc(x.a.name)} als nieuw algoritme</h4>
      <label class="frow" style="width:100%"><span>Naam</span><input id="mut-name" value="${esc(name)}" maxlength="40"></label>
      <label class="frow" style="width:100%"><span>Map</span><input id="mut-folder" value="${esc(M.saveFolder != null ? M.saveFolder : parent ? parent.folder || '' : '')}" maxlength="30" placeholder="(geen)"></label>
      <label class="frow" style="width:100%"><span>Notitie</span><textarea id="mut-note" rows="2" maxlength="500">${esc(nt)}</textarea></label>
      <button class="btn primary" data-ev="mut-save">Bewaar</button><button class="btn" data-ev="mut-duel">Eerst duel met origineel</button>
      <div style="width:100%">${goalHtml({ name: x.a.name, s: x.t, g: x.a.genes })}</div></div>`;
  }
  function mutSave() {
    const M = E.mut; if (!M || !M.res) return;
    const x = M.res[M.pick]; if (!canSave(x)) { note('Kies eerst een mutant in de tabel.'); return; }
    const algos = EV().loadAlgos(), parent = algos.find(a => a.genes.join() === M.orig0.join());
    const ver = parent ? parent.ver + 1 : 2;
    const name = ($('#mut-name') ? $('#mut-name').value : M.saveName || '').trim().slice(0, 40) || `${M.root.replace(/ v\d+$/, '')} v${ver}`;
    const folder = ($('#mut-folder') ? $('#mut-folder').value : M.saveFolder || '').trim().slice(0, 30);
    const nt = ($('#mut-note') ? $('#mut-note').value : M.saveNote || '').slice(0, 500);
    const a = saveVersion({ name, genes: x.a.genes, parent: parent ? parent.id : M.rootId, ver, parents: [M.root], folder, tags: parent && parent.tags && parent.tags.length ? parent.tags : ['mutant'], born: E.gen, note: nt });
    if (!a) return;
    M.saved = a; note(`${a.name} bewaard.`);
    taskOut();
  }



  // klik-acties (data-ev) van deze module
  Object.assign(U.ACTIONS, {
    'mut-go': () => { const M = E.mut; if (!M) return; M.rounds = +M.rounds; M.auto = false; M.hist = []; mutMake(); mutRound(); },
    'mut-auto': () => { const M = E.mut; if (!M) return; M.rounds = +M.rounds; M.auto = true; M.hist = []; M.src = { ...M.src, genes: M.orig0.slice(), name: M.root }; mutMake(); mutRound(); },
    'mut-preset': c => { const M = E.mut; if (M && !M.busy) { Object.assign(M, MUT_PRESET[c.b.dataset.p]); taskIn(); } },
    'mut-more': () => { const M = E.mut; if (M && M.res) { M.target = M.sc[0].length + 5; M.res = null; M.saved = null; mutRound(); } },
    'mut-go-build': () => { const M = E.mut; if (M && M.saved && A.go) A.go('build', M.saved); },
    'mut-go-race': () => { const M = E.mut; if (M && M.saved && A.go) A.go('race', M.saved); },
    'mut-stop': () => {
      const M = E.mut; if (!M) return;
      M.busy = false; M.wait = false; M.auto = false; if (T.show && T.show.kind === 'mut' && T.phase === 'run') T.running = false;
      if (M.list && M.sc[0].length) mutFinish(); else { M.round = 0; setStep('pick'); taskIn(); }
    },
    'mut-pick': c => { const M = E.mut; if (M && M.res) { M.pick = +c.b.dataset.k; M.saved = null; M.saveNote = null; taskOut(); } },
    'mut-save': () => { if (E.mut) mutSave(); },
    'mut-again': () => { const M = E.mut; if (M && M.saved) openTask('mut', { ...M.saved, mine: true }); },
    'mut-bench': () => { const M = E.mut; if (M && M.saved) openTask('bench', { ...M.saved, mine: true }); },
    'mut-duel': () => {
      const M = E.mut; if (!M || !M.res || !M.res[M.pick]) return;
      const x = M.res[M.pick];
      duelNow([{ id: 'mut-orig', name: M.root, genes: M.orig0 }, { id: M.saved ? M.saved.id : 'mut-best', name: M.saved ? M.saved.name : x.a.name, genes: x.a.genes }]);
    },
  });
  Object.assign(U, { MUT_STR, STR_ORDER, MUT_PRESET, AUTO_MAX, mutMake, mutRound, mutRate, mutCheck, mutStand, mutDone, mutFinish, canSave, mutIn, mutTable, autoHtml, mutOut, mutSaveBox, mutSave });
})(window.ML = window.ML || {});
