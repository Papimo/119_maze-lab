// Pagina Algoritmes (startscherm): kaarten, detail, "Wat wil je doen?", doelenladder, export/import.
(function (ML) {
  'use strict';
  const U = ML.EvoUI._;
  const { $, E, EV, V, addAlgo, dnaHtml, dnaStrip, entries, entryById, esc, isSaved, note, r1, scoreBox, subOf, vsClassic } = U;
  let champCard, dotCls, rankList, seed, shareHtml, turbo;
  U.link(() => ({ champCard, dotCls, rankList, seed, shareHtml, turbo } = U));

  // "Wat wil je doen?" met het algoritme al gekozen
  function todoHtml(a) {
    const id = esc(a.id), b = (ev, t, s) => `<button class="todo-b" data-ev="${ev}" data-id="${id}"><b>${t}</b><small>${s}</small></button>`;
    return `<div class="todo"><h4>Wat wil je doen met ${esc(a.name)}?</h4>
      <div class="todo-g"><span>Verbeteren</span>${b('task-bench', '🔧 Werkbank', 'genen zelf bijschuiven + proefrit')}${b('task-mut', '🧬 Mutanten', 'varianten over meerdere doolhoven, beste gemiddelde wint')}</div>
      <div class="todo-g"><span>Laten strijden</span>${b('task-duel', 'vs Duel', '2–4 algoritmes in hetzelfde doolhof')}</div>
      <div class="todo-g"><span>Begrijpen</span>${b('task-why', '❔ Uitleg', 'stap voor stap: waarom die kant op?')}${b('tree', '🌳 Stamboom', 'versies en ouders (Analyse)')}</div>
      <div class="todo-g"><span>Zwakte zoeken</span>${b('task-hunt', '🎯 Zoeker', 'de moeilijkste doolhoven voor dit algoritme')}</div>
      <div class="todo-g"><span>Verder kweken</span>${b('seed', '＋ Zaai in evolutie', 'doet mee vanaf de volgende generatie')}</div>
      <div class="todo-g"><span>Inzetten</span>${b('go-build', '▶ Bouwen', 'laat hem een nieuw doolhof oplossen')}${b('go-race', '🏁 Race', 'tegen drie klassiekers in Lab')}</div>
      <div class="todo-g"><span>Tonen & delen</span>${b('go-watch', '📺 Kijken', 'eindeloos kijken, alleen eigen algoritmes')}${b('share', '🔗 Link + QR', 'korte link of QR-code voor een ander apparaat')}</div></div>`;
  }

  // ---------------- Algoritmes (startscherm) ----------------
  function algosRender() {
    const algos = EV().loadAlgos();
    let dirty = false; algos.forEach(a => { if (EV().stampHist(a)) dirty = true; });
    if (dirty) EV().saveAlgos(algos);
    const folders = [...new Set(algos.map(a => a.folder).filter(Boolean))].sort();
    const fs = $('#lib-folder');
    fs.innerHTML = `<option value="">Alles</option><option value="*mine">Alleen eigen</option><option value="*classic">Alleen klassiekers</option>${folders.map(f => `<option value="${esc(f)}">📁 ${esc(f)}</option>`).join('')}`;
    fs.value = folders.includes(E.libFolder) || E.libFolder.startsWith('*') ? E.libFolder : '';
    $('#lib-folders').innerHTML = folders.map(f => `<option value="${esc(f)}">`).join('');
    $('#lib-sort').value = E.libSort;
    if (document.activeElement !== $('#lib-q')) $('#lib-q').value = E.libQ;
    algoGrid(); algoDetail();
    const lad = $('#lib-ladder'); if (lad) lad.innerHTML = goalHtml();
  }
  function algoCard(a) {
    const tags = (a.tags || []).slice(0, 3).map(t => `<em class="tag">${esc(t)}</em>`).join('');
    return `<div class="acard${a.classic ? ' classic' : ''}${E.sel === a.id ? ' sel' : ''}" data-ev="sel" data-id="${esc(a.id)}" title="${esc(EV().describe(a.genes))}">
      <div class="ac-top"><i class="sw" style="background:${EV().colorOf(a.genes)}"></i><b>${esc(a.name)}</b>${a.ver > 1 && !/ v\d+$/.test(a.name) ? `<em class="ver">v${a.ver}</em>` : ''}</div>
      <div class="ac-sc"><b title="Score 0–100 op de testbaan">${a.t.score}</b><span>score · ${a.t.solved}/${a.t.of}${a.h ? `<br>zwaar ${a.h.score}` : ''}</span></div>
      <small class="ac-sub">${esc(subOf(a))}</small>${tags ? `<div class="ac-tags">${tags}</div>` : ''}${dnaStrip(a.genes)}</div>`;
  }
  function algoGrid() {
    const el = $('#algo-grid'); if (!el) return;
    const q = E.libQ.trim().toLowerCase(), f = E.libFolder;
    const list = entries().filter(a => !a.live).filter(a => {
      if (f === '*mine' && !a.mine) return false;
      if (f === '*classic' && !a.classic) return false;
      if (f && !f.startsWith('*') && a.folder !== f) return false;
      if (!q) return true;
      return [a.name, a.note, a.folder, (a.tags || []).join(' '), a.desc].join(' ').toLowerCase().includes(q);
    });
    if (E.libSort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (E.libSort === 'new') list.sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
    const mine = list.filter(a => a.mine), cls = list.filter(a => a.classic);
    el.innerHTML = `<div class="ag-h">Lopende evolutie</div><div class="acards"><div class="acard live${E.sel === '*evo' ? ' sel' : ''}" id="ac-live" data-ev="sel" data-id="*evo"></div></div>`
      + (f === '*classic' ? '' : `<div class="ag-h">Mijn algoritmes <small>${mine.length}</small></div>` + (mine.length ? `<div class="acards">${mine.map(algoCard).join('')}</div>`
        : `<p class="hint">${q || f ? 'Niets gevonden.' : 'Nog niets bewaard. Bewaar een kampioen bij Evolueren, of importeer / plak een deelcode (rechtsboven).'}</p>`))
      + (f === '*mine' || (f && !f.startsWith('*')) ? '' : `<div class="ag-h">Klassiekers <small>${cls.length}</small></div>` + (cls.length ? `<div class="acards">${cls.map(algoCard).join('')}</div>` : '<p class="hint">Niets gevonden.</p>'));
    liveCard();
  }
  function spark() {
    const hs = E.hist; if (hs.length < 2) return '';
    const n = hs.length, st = Math.max(1, Math.floor(n / 120)), pts = [];
    let rec = -1, mx = 1;
    hs.forEach(h => { if (h.test > mx) mx = h.test; });
    for (let i = 0; i < n; i++) { if (hs[i].test > rec) rec = hs[i].test; if (i % st === 0 || i === n - 1) pts.push(`${(i / (n - 1) * 200).toFixed(1)},${(38 - rec / mx * 34).toFixed(1)}`); }
    return `<svg class="spark" viewBox="0 0 200 40" preserveAspectRatio="none"><polyline points="${pts.join(' ')}"/></svg>`;
  }
  function liveCard() {
    const el = $('#ac-live'); if (!el) return;
    const c = E.champ, bc = EV().bestClassic();
    el.innerHTML = `<div class="ac-top"><i class="${dotCls()}"></i><b>Generatie ${E.gen}</b><small>${E.pop.length} lopers · ${E.species.length} soorten${E.turbo ? ' · turbo' : V.running ? '' : ' · gepauzeerd'}</small></div>
      ${c ? `<div class="ac-sc"><b>${c.test}</b><span>kampioen <b>${esc(c.name)}</b><br>${c.test > bc.t.score ? '🏆 boven' : 'nog onder'} ${esc(bc.p.name)} (${bc.t.score})</span></div>` : '<p class="hint">Nog geen generatie klaar.</p>'}
      ${spark()}`;
  }
  function markSel() { document.querySelectorAll('#algo-grid .acard').forEach(c => c.classList.toggle('sel', c.dataset.id === E.sel)); }
  function algoDetail() {
    const el = $('#algo-det'); if (!el) return;
    if (E.sel === '*evo') { el.innerHTML = evoDetail(); return; }
    const a = E.sel ? entryById(E.sel) : null;
    if (!a) { el.innerHTML = '<div class="det-empty"><h3>Kies een algoritme</h3><p class="hint">Klik een kaart. Daarna kies je wat je ermee wilt: verbeteren, laten strijden, begrijpen, een zwakte zoeken of verder kweken in de evolutie. De evolutie loopt intussen gewoon door.</p></div>'; return; }
    const Ev = EV(), t = a.t || Ev.testScore(a.genes), h = Ev.heavyReady() ? Ev.heavyScore(a.genes) : null, id = esc(a.id);
    const mine = a.mine ? a : null, saved = !!mine || isSaved(a.genes);
    const cats = Ev.TEST_CATS.map(c => `<span>${esc(c.name)} <b>${t.cats[c.k]}</b></span>`).join('') + (h ? `<span>Zware testbaan <b>${h.score}</b> (${h.solved}/${h.of})</span>` : '')
      + (mine ? '<span>🧬 ook als oplosser in Bouwen, Lab en Kijken</span>' : '');
    let html = `<div class="det-head"><i class="sw" style="background:${Ev.colorOf(a.genes)}"></i><h3>${esc(a.name)}</h3><button class="btn x" data-ev="unsel" title="Sluiten (Esc)">✕</button></div>
      <small class="det-sub0">${esc(a.classic ? 'klassieker · ' + a.desc : mine ? subOf(a) : a.live ? 'kampioen van de lopende evolutie, nog niet bewaard' : 'uit de eregalerij')}</small>
      ${scoreBox(t, h, a.id === vsClassic().id ? null : vsClassic())}
      <p class="desc">${esc(Ev.describe(a.genes))}</p>${dnaHtml(a.genes)}<div class="cats">${cats}</div>`;
    if (!saved) html += `<div class="btns"><button class="btn primary" data-ev="save-any" data-id="${id}">Bewaar in mijn algoritmes</button></div>`;
    if (E.share === a.id) html += shareHtml(a);
    html += todoHtml(a);
    if (mine) {
      const { chain, kids } = lineage(a);
      html += `<h4 class="det-sub">Gegevens</h4><div class="det-fields" data-id="${id}">
        <label class="frow"><span>Naam</span><input data-f="name" value="${esc(a.name)}" maxlength="40"></label>
        <label class="frow"><span>Map</span><input data-f="folder" list="lib-folders" value="${esc(a.folder)}" placeholder="bv. Snelle lopers"></label>
        <label class="frow"><span>Labels</span><input data-f="tags" value="${esc((a.tags || []).join(', '))}" placeholder="komma's ertussen"></label>
        <label class="frow"><span>Notitie</span><textarea data-f="note" rows="2" placeholder="Wat is er bijzonder aan?">${esc(a.note)}</textarea></label></div>
        <div class="tree"><b>Stamboom</b> ${chain.length ? chain.map(p => esc(p.name) + (p.ver > 1 ? ' v' + p.ver : '')).join(' → ') + ' → ' : ''}<u>${esc(a.name)}</u>${kids.length ? ` · nieuwere versies: ${kids.map(k => esc(k.name)).join(', ')}` : ''}${a.parents && a.parents.length && !a.parent ? ` · ouders ${a.parents.map(esc).join(' × ')}` : ''}</div>
        <div class="tree"><b>Testscore</b> ${(a.hist || []).slice(-6).map(x => `${esc(x.d)}: ${x.s}`).join(' · ') || '—'}</div>
        <div class="btns"><button class="btn" data-ev="code" data-id="${id}">Deelcode kopiëren</button><button class="btn" data-ev="del" data-id="${id}">Verwijder</button></div>`;
    }
    el.innerHTML = html;
  }
  function evoDetail() {
    const c = E.champ;
    let html = `<div class="det-head"><i class="${dotCls()}"></i><h3>Lopende evolutie</h3><button class="btn x" data-ev="unsel" title="Sluiten (Esc)">✕</button></div>
      <small class="det-sub0">generatie ${E.gen} · ${E.pop.length} lopers · ${E.species.length} soorten</small>
      <p class="hint">Loopt op de achtergrond door, ook als je hier of met een taak bezig bent. Instellingen, turbo en de ranglijst staan bij Evolueren.</p>
      <div class="btns"><button class="btn primary" data-ev="page" data-page="evolve">Naar Evolueren →</button></div>`;
    if (c) {
      const saved = !!c.from || isSaved(c.genes);
      html += `<h4 class="det-sub">Kampioen: ${esc(c.name)}</h4>${scoreBox(EV().testScore(c.genes), { score: c.heavy }, c.from ? null : vsClassic())}
        <p class="desc">${esc(EV().describe(c.genes))}</p>${dnaHtml(c.genes)}
        ${saved ? '' : '<div class="btns"><button class="btn primary" data-ev="save-champ">Bewaar kampioen</button></div>'}${todoHtml(c)}`;
    }
    return html;
  }
  function lineage(a) {
    const algos = EV().loadAlgos(), find = id => algos.find(x => x.id === id) || EV().PRESETS.find(p => p.id === id);
    const chain = []; let cur = a, guard = 0;
    while (cur && cur.parent && guard++ < 20) { const p = find(cur.parent); if (!p) break; chain.unshift(p); cur = p; }
    const kids = a.id ? algos.filter(x => x.parent === a.id) : [];
    return { chain, kids };
  }
  function libField(el) {
    const det = el.closest('.det-fields'); if (!det) return;
    const algos = EV().loadAlgos(), a = algos.find(x => x.id === det.dataset.id); if (!a) return;
    const f = el.dataset.f, v = el.value;
    if (f === 'name') { if (!v.trim()) return; a.name = v.trim().slice(0, 40); }
    else if (f === 'folder') a.folder = v.trim().slice(0, 30);
    else if (f === 'tags') a.tags = v.split(',').map(s => s.trim()).filter(Boolean).slice(0, 8).map(s => s.slice(0, 20));
    else if (f === 'note') a.note = v.slice(0, 500);
    EV().saveAlgos(algos);
    if (f === 'folder') algosRender(); else algoGrid();
    rankList();
  }

  // doelen: klassiekers als ladder, jouw beste eigen algoritme ertussen
  function goalHtml(extra) {
    const Ev = EV(), cls = Ev.PRESETS.map(p => ({ name: p.name, s: Ev.testScore(p.genes).score, g: p.genes })).filter(c => c.s >= 10).sort((a, b) => a.s - b.s); // Dwaler is geen doel
    const own = Ev.loadAlgos().map(a => ({ name: a.name, s: Ev.testScore(a.genes).score, g: a.genes })).concat(extra ? [extra] : []);
    const mine = own.slice().sort((a, b) => b.s - a.s)[0];
    const next = mine ? cls.find(c => c.s >= mine.s) : cls[0]; // gelijk = nog niet verslagen
    const bar = (goals, me, nx, unit) => {
      const top = Math.max(100, ...goals.map(c => c.s));
      const dots = goals.map(c => `<i class="lg-c${me && me.s > c.s ? ' beat' : ''}${c.mile ? ' mile' : ''}" style="left:${c.s / top * 100}%" title="${esc(c.name)} ${c.s}${unit}">${c === nx ? `<span class="${c.s / top < 0.2 ? 'l' : c.s / top > 0.8 ? 'r' : ''}">doel: ${esc(c.name)}</span>` : ''}</i>`).join('');
      return `<div class="lg-bar">${dots}${me ? `<i class="lg-me" style="left:${me.s / top * 100}%" title="${esc(me.name)} ${me.s}${unit}"></i>` : ''}</div>`;
    };
    // trap 1: klassiekers op de testbaan
    if (!mine || next) {
      const txt = !mine ? `Nog geen eigen algoritme. Eerste doel: <b>${esc(cls[0].name)}</b> verslaan.`
        : `Jouw beste: <b>${esc(mine.name)}</b> ${mine.s} · volgende doel: <b>${esc(next.name)}</b> ${next.s} <small>(${next.s === mine.s ? 'gelijk: net iets beter nodig' : 'nog ' + r1(next.s - mine.s)})</small>`;
      return `<div class="ladder"><div class="lg-t"><em class="lg-k">Trap 1 · testbaan</em>${txt}</div>${bar(cls, mine, next, '')}</div>`;
    }
    // trap 2: zware testbaan (klassiekers + mijlpalen 50/70/90)
    if (!Ev.heavyReady()) return `<div class="ladder"><div class="lg-t"><em class="lg-k">Trap 1 ✓</em>🏆 Jouw <b>${esc(mine.name)}</b> (${mine.s}) verslaat alle klassiekers. Volgende trap: de zware testbaan <small>(wordt klaargezet…)</small></div>${bar(cls, mine, null, '')}</div>`;
    const hc = Ev.PRESETS.map(p => ({ name: p.name, s: Ev.heavyScore(p.genes).score })).filter(c => c.s >= 5);
    const miles = [50, 70, 90].filter(v => !hc.some(c => Math.abs(c.s - v) < 2)).map(v => ({ name: 'zwaar ' + v, s: v, mile: true }));
    const goals = hc.concat(miles).sort((a, b) => a.s - b.s);
    const hm = own.map(o => ({ name: o.name, s: Ev.heavyScore(o.g).score })).sort((a, b) => b.s - a.s)[0];
    const nx = goals.find(c => c.s >= hm.s);
    const txt = nx ? `Zware testbaan: jouw beste <b>${esc(hm.name)}</b> ${hm.s} · volgende doel: <b>${esc(nx.name)}</b> ${nx.s} <small>(nog ${r1(nx.s - hm.s)})</small>`
      : `👑 Jouw <b>${esc(hm.name)}</b> (${hm.s}) verslaat ook alles op de zware testbaan. Alle doelen gehaald!`;
    return `<div class="ladder heavy"><div class="lg-t"><em class="lg-k">Trap 2 · zware testbaan</em>${txt}</div>${bar(goals, hm, nx, ' zwaar')}</div>`;
  }

  function afterSave() { champCard(); rankList(); liveCard(); if (E.page === 'algos') { algoGrid(); algoDetail(); } }

  function exportAlgos() {
    const data = { format: 'maze-lab-dna/2', genes: EV().GENES.map(G => G.k), algos: EV().loadAlgos() };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    a.download = 'maze-lab-algoritmes.json'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function importFile(f) {
    const rd = new FileReader();
    rd.onload = () => {
      let n = 0;
      try {
        const o = JSON.parse(rd.result), NG = EV().GENES.length, str = (v, k) => typeof v === 'string' ? v.slice(0, k) : '';
        for (const x of (o.algos || [])) if ((x.genes = EV().upGenes(x.genes)) && EV().okGenes(x.genes)) {
          if (addAlgo({ name: str(x.name, 40) || 'Geïmporteerd', genes: x.genes.map((v, i) => EV().clampHard(v, i)), born: x.born | 0, parents: Array.isArray(x.parents) ? x.parents.map(p => str(p, 40)) : [],
            ver: x.ver | 0 || 1, folder: str(x.folder, 30), tags: Array.isArray(x.tags) ? x.tags.map(t => str(t, 20)).filter(Boolean) : [], note: str(x.note, 500) })) n++;
        }
      } catch (e) { /* ongeldig */ }
      note(n ? `${n} algoritme${n === 1 ? '' : 's'} geïmporteerd.` : 'Niets nieuws gevonden in dat bestand.'); afterSave(); if (E.page === 'algos') algosRender();
    };
    rd.readAsText(f);
  }
  function pasteCode() {
    const s = prompt('Plak een deelcode of link (MLDNA1:…, MLDNA2.… of …#dna=…)');
    if (!s) return;
    const o = EV().fromCode(s);
    note(!o ? 'Dat is geen geldige deelcode.' : addAlgo(o) ? `${o.name} toegevoegd.` : `${o.name} stond er al.`); afterSave();
  }

  Object.assign(U, { todoHtml, algosRender, algoCard, algoGrid, spark, liveCard, markSel, algoDetail, evoDetail, lineage, libField, goalHtml, afterSave, exportAlgos, importFile, pasteCode });
})(window.ML = window.ML || {});
