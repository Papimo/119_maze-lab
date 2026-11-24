// Evolutie-scherm: gedeelde toestand (E, tonelen V/T), opslag, soorten, scoretaal, hulpjes. Laadt als eerste; maakt ML.EvoUI._ (= U) aan.
(function (ML) {
  'use strict';
  const U = { links: [], link: fn => U.links.push(fn), ACTIONS: {} }; // gedeelde namen; main.js roept alle links aan zodra alles geladen is. ACTIONS: data-ev → fn(c)
  ML.EvoUI = { _: U };

  const $ = s => document.querySelector(s);
  const TAU = Math.PI * 2;
  const EV = () => ML.Evo;
  const STORE = 'mazelab.evo';
  const GRID_NAMES = { square: 'Vierkant', hex: 'Zeshoek', tri: 'Driehoek', polar: 'Ringen' };
  const SP_COLS = ['#4cc9f0', '#ffd166', '#ff6b6b', '#80ed99', '#b388ff', '#f4a261', '#2ec4b6', '#ff8fab', '#e9ff70', '#a0c4ff'];
  const DUEL_COLS = ['#ffd166', '#4cc9f0', '#ff6b6b', '#80ed99'];
  const SP_THR = 1.15, SP_MAX = 10; // begin-drempel soort (DNA-afstand; past zich aan → 3–7 soorten) en maximaal aantal soorten
  const TASKS = { bench: { name: 'Werkbank', icon: '🔧' }, mut: { name: 'Mutantenlab', icon: '🧬' }, duel: { name: 'Duel', icon: 'vs' }, why: { name: 'Uitleg', icon: '❔' }, hunt: { name: 'Zoeker', icon: '🎯' } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const A = {}; // { Runner, S, save, pal, go } — init vult hem

  // E = evolutie + pagina-toestand
  const E = { pop: [], gen: 0, hist: [], base: '', champ: null, species: [], spSeq: 0, spMap: new Map(), spThr: SP_THR,
    turbo: 0, turboN: 0, turboDone: 0, turboT0: 0, uiT: 0, rankT: 0, saveT: 0, lastT: 0, pend: null,
    msg: '', msgT: 0, seen: new Set(), page: 'algos', sel: null, libQ: '', libFolder: '', libSort: 'score',
    task: null, bench: null, mut: null, duel: null, hunt: null, xp: null, treeSel: null };
  // toneel: panelen + lopers in doolhoven
  const mkView = () => ({ panes: [], runs: null, mazes: [], show: null, phase: 'idle', running: true, firstT: null, endT: 0, t0: 0, forced: null, salt: 0, heatSel: null, champId: null, aspect: 0 });
  const V = mkView(), T = mkView();

  const opts = () => ({ grid: A.S.evoGrid, size: A.S.evoSize, braid: A.S.evoBraid, puzzle: A.S.evoPuzzle, makers: A.S.evoMakers });
  const rng = () => ML.makeRng(E.base + '|ga|' + E.gen);
  // evolutie-regels (engine 4): mutatiesoort, Lamarck, selectie → opties voor nextGen/evaluate. Alles uit = oude gedrag (bit-gelijk)
  const LAM_K = 4; // proefstapjes per loper (rekenwerk × (1 + LAM_K), = Ev.LAMARCK_COST)
  const evoOpts = () => ({ mutKind: A.S.evoMutKind || 'gauss', select: A.S.evoSelect || 'fitness', lamarck: A.S.evoLamarck ? LAM_K : 0 });
  const evoRules = () => (EV().ENGINE_V | 0) >= 4;  // engine kent de nieuwe regels
  const mm = () => A.S.evoMazeMode || 'new';
  // nieuw per generatie: minstens 4 doolhoven tellen mee (anders is de fitness vooral geluk); de rest rekent op de achtergrond
  const nEval = () => mm() === 'hunt' ? Math.max(1, huntSet().length) : mm() === 'set' ? Number(A.S.evoSetN) || 6 : mm() === 'new' ? Math.max(4, Number(A.S.evoMazes) || 1) : Number(A.S.evoMazes) || 1;
  const nPanes = () => mm() === 'set' || mm() === 'hunt' ? Math.min(Number(A.S.evoMazes) || 1, nEval()) : Number(A.S.evoMazes) || 1;
  const runs = () => Number(A.S.evoRuns) || 1;          // runs per doolhof (gemiddelde → minder geluk)
  const isl = () => Number(A.S.evoIslands) || 1;        // aantal eilanden
  const huntSet = () => Array.isArray(A.S.evoHunt) ? A.S.evoHunt : [];
  const HUNT_ASP = 0.66;                                 // doolhof-zoeker: vaste verhouding → zelfde doolhof overal
  const mazeSeed = (i, gen) => mm() === 'new' ? `${E.base}|g${gen}|${i}` : `${E.base}|vast|${i}`;

  // ---- opslag van de lopende evolutie ----
  function persist() {
    E.saveT = performance.now();
    try {
      const slim = g => ({ id: g.id, name: g.name, genes: g.genes, born: g.born, parents: g.parents, fit: g.fit, age: g.age, from: g.from, sp: g.sp, isl: g.isl, sig: g.sig });
      const sp = E.species.map(s => ({ id: s.id, name: s.name, col: s.col, c: s.c }));
      localStorage.setItem(STORE, JSON.stringify({ gen: E.gen, base: E.base, pop: E.pop.map(slim), hist: E.hist.slice(-1500), champ: E.champ, species: sp, spSeq: E.spSeq, spThr: E.spThr, growG: E.growG || 0, autoA: E.autoA || null, arch: (E.arch || []).slice(-300) }));
    } catch (e) { /* geen opslag */ }
  }
  function restore() {
    try {
      const o = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (o && Array.isArray(o.pop)) { o.pop.forEach(g => { if (g) g.genes = EV().upGenes(g.genes); }); if (o.champ) o.champ.genes = EV().upGenes(o.champ.genes); (o.species || []).forEach(sp => { if (sp && sp.c) sp.c = EV().upGenes(sp.c); }); }
      if (o && Array.isArray(o.pop) && o.pop.length && o.pop[0].genes && o.pop[0].genes.length === EV().GENES.length) {
        Object.assign(E, { gen: o.gen | 0, base: o.base || ML.randomSeed(), pop: o.pop, hist: o.hist || [], champ: o.champ || null,
          species: Array.isArray(o.species) ? o.species : [], spSeq: o.spSeq | 0, spThr: o.spThr || SP_THR, growG: o.growG | 0, autoA: o.autoA || null, arch: Array.isArray(o.arch) ? o.arch : [] });
        return true;
      }
    } catch (e) { /* kapot */ }
    return false;
  }
  function fresh(seeds) {
    E.base = String(ML.randomSeed()); E.gen = 0; E.hist = []; E.champ = null; E.species = []; E.spSeq = 0; E.spThr = SP_THR; E.growG = 0; E.autoA = null; E.stopFrom = 0; E.arch = []; E.lam = null;
    E.pop = EV().assignIslands(EV().initPop({ pop: A.S.evoPop, classics: A.S.evoClassics, seeds, rng: rng() }), isl());
    speciate(); persist();
  }

  // ---- soorten: lopers met lijkend DNA horen bij één familie (eigen kleur + naam) ----
  const nv = genes => genes.map((v, i) => EV().norm(v, i));
  const vd = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); };
  function speciate() {
    const sps = E.species;
    sps.forEach(s => { s.n = 0; s.sum = s.c.map(() => 0); s.best = -1; });
    const sorted = E.pop.slice().sort((a, b) => (b.fit || 0) - (a.fit || 0));
    for (const ge of sorted) {
      const v = nv(ge.genes);
      let best = null, bd = 1e9;
      for (const s of sps) { const d = vd(v, s.c); if (d < bd) { bd = d; best = s; } }
      // erfde soort nog dichtbij? dan blijven (kleur springt niet)
      const own = ge.sp != null ? sps.find(s => s.id === ge.sp) : null;
      if (own && vd(v, own.c) < E.spThr * 1.25) best = own;
      else if (!best || (bd > E.spThr && sps.length < SP_MAX)) {
        const used = new Set(sps.map(s => s.col));
        best = { id: ++E.spSeq, name: ge.from || ge.name, col: SP_COLS.find(c => !used.has(c)) || SP_COLS[E.spSeq % SP_COLS.length], c: v.slice(), n: 0, sum: v.map(() => 0), best: -1 };
        sps.push(best);
      }
      ge.sp = best.id; best.n++; best.sum.forEach((_, i) => { best.sum[i] += v[i]; });
      if ((ge.fit || 0) > best.best) best.best = ge.fit || 0;
    }
    E.species = sps.filter(s => s.n > 0);
    E.species.forEach(s => { s.c = s.sum.map(x => x / s.n); delete s.sum; });
    E.species.sort((a, b) => b.n - a.n);
    E.spMap = new Map(E.species.map(s => [s.id, s]));
    // drempel bijsturen: te weinig soorten → strenger, te veel → ruimer
    if (E.species.length < 3) E.spThr = Math.max(0.2, E.spThr * 0.85);
    else if (E.species.length > 7) E.spThr = Math.min(2.5, E.spThr * 1.1);
  }
  const colorFor = ge => A.S.evoColor === 'gene' ? EV().colorOf(ge.genes) : (E.spMap.get(ge.sp) || { col: '#cfd8e3' }).col;

  function note(s) { E.msg = s; E.msgT = performance.now() / 1000; toast(); }
  function toast() { const el = $('#evo-toast'); if (!el) return; if (E.msg) el.textContent = E.msg; el.classList.toggle('show', !!E.msg); }

  // ---- DNA-balkjes ----
  const geneZ = (G, v) => G.k === 'chaos' ? (v - G.lo) / (G.hi - G.lo) : v / G.hi;
  function dnaHtml(genes) {
    return '<div class="dna">' + EV().GENES.map((G, i) => {
      const v = genes[i], z = geneZ(G, v), w = Math.abs(z) * 50;
      const st = G.k === 'chaos' ? `left:0;width:${z * 100}%` : z >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`;
      return `<div class="gene" title="${esc(G.name)}: ${v.toFixed(2)}"><span>${esc(G.name)}</span><b><i style="${st};background:${G.col}"></i></b></div>`;
    }).join('') + '</div>';
  }
  // mini-versie voor kaarten: 9 staafjes (doorschijnend = negatief)
  function dnaStrip(genes) {
    return '<div class="dstrip">' + EV().GENES.map((G, i) => { const z = geneZ(G, genes[i]);
      return `<i style="height:${Math.max(8, Math.abs(z) * 100)}%;background:${G.col};opacity:${z < 0 ? 0.4 : 1}" title="${esc(G.name)} ${genes[i].toFixed(1)}"></i>`; }).join('') + '</div>';
  }
  const isSaved = genes => EV().loadAlgos().some(a => a.genes.join() === genes.join());

  // ---- alle algoritmes (klassiekers + bibliotheek + kampioen) ----
  // ---- één scoretaal: Score 0–100 (100 = elke keer de kortste route); testbaan = 12 vaste doolhoven × 2 ----
  // zekerheid: gepaard per doolhof, ≥3 doolhoven en verschil ≥ 2× de standaardfout. Testbaan: per = 0–1 (scale 100); mutantenlab: al 0–100 (scale 1)
  function sureOf(as, bs, scale = 100) {
    const n = Math.min(as ? as.length : 0, bs ? bs.length : 0); if (!n) return { k: 'base', icon: '', txt: '' };
    const d = []; for (let i = 0; i < n; i++) d.push((as[i] - bs[i]) * scale);
    const m = d.reduce((a, b) => a + b, 0) / n;
    if (Math.abs(m) < 0.05) return { k: 'eq', icon: '🟰', txt: 'even goed' };
    const sd = n > 1 ? Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : Infinity, se = sd / Math.sqrt(n);
    const sure = n >= 3 && (se === 0 || Math.abs(m) >= 2 * se);
    if (m > 0) return sure ? { k: 'yes', icon: '✅', txt: 'zeker beter' } : { k: 'maybe', icon: '🤔', txt: n < 3 ? 'misschien beter (nog te weinig doolhoven)' : 'misschien beter' };
    return sure ? { k: 'no', icon: '❌', txt: 'zeker slechter' } : { k: 'maybe', icon: '🤔', txt: 'misschien slechter' };
  }
  const signed = v => v > 0 ? `<em class="up">+${v}</em>` : v < 0 ? `<em class="down">${v}</em>` : '<em>±0</em>';
  const sureTag = su => su.icon ? `<span class="sure ${su.k}" title="${esc(su.txt)}: per testdoolhof vergeleken (wisselt het per doolhof, dan kan het geluk zijn)">${su.icon} ${esc(su.txt)}</span>` : '';
  // ---- scoretaal "vijf treden": 0–100 in vijf banden; zwaar = zelfde banden (eerlijk: daar is alles laag) ----
  const BANDS = [{ max: 20, w: 'verdwaalt', c: '#ff6b6b' }, { max: 40, w: 'zwak', c: '#ff9f5a' }, { max: 60, w: 'redelijk', c: '#ffd166' }, { max: 80, w: 'goed', c: '#a7e06b' }, { max: 101, w: 'bijna perfect', c: '#4fd18b' }];
  const HBANDS = [{ max: 20, w: 'makkelijk', c: '#8a96b8' }, { max: 40, w: 'te doen', c: '#9a86d6' }, { max: 60, w: 'pittig', c: '#b072e6' }, { max: 80, w: 'lastig', c: '#d05cdc' }, { max: 101, w: 'heel lastig', c: '#f04fc0' }];
  const band = (s, B = BANDS) => B.find(b => (+s || 0) < b.max) || B[B.length - 1];
  // vijf vakjes; mark = positie van een ijkpunt (driehoekje), B = HBANDS voor moeilijkheid
  function treden(s, o = {}) {
    const B = o.B || BANDS, b = band(s, B), v = +s || 0;
    const seg = B.map((x, i) => { const p = Math.max(0, Math.min(1, (v - i * 20) / 20)); return `<i>${p ? `<b style="width:${r1(p * 100)}%;background:${b.c}"></b>` : ''}</i>`; }).join('');
    return `<span class="trd${o.sm ? ' sm' : ''}"${o.title ? ` title="${esc(o.title)}"` : ''}>${seg}${o.mark != null ? `<u style="left:${o.mark}%" title="${esc(o.markName || '')} ${o.mark}"></u>` : ''}</span>`;
  }
  const scoreWord = (s, B) => { const b = band(s, B); return `<span class="sword" style="color:${b.c};background:${b.c}22;border-color:${b.c}66">${b.w}</span>`; };
  const INFO = {
    t: () => { const bc = EV().bestClassic(), dw = EV().testScore(EV().PRESETS[0].genes); return `<b>Score 0–100, hoger = beter.</b> 100 = elke keer de kortste route. Testbaan = 12 vaste doolhoven, elk 2×; iedereen loopt dezelfde, dus scores zijn eerlijk te vergelijken.<p>Vijf treden: verdwaalt (0–20) · zwak · redelijk · goed · bijna perfect (80–100). Ijkpunten: ${esc(EV().PRESETS[0].name)} (willekeurig) ${dw.score} · ${esc(bc.p.name)} (beste klassieker) ${bc.t.score} = ▼.</p>`; },
    h: () => { const bc = EV().bestClassic(), kh = EV().heavyReady() ? EV().heavyScore(bc.p.genes).score : null; return `<b>Zwaar = zelfde maat, veel moeilijkere doolhoven.</b> 8 grote doolhoven met lussen en puzzels${kh != null ? `; ook ${esc(bc.p.name)} haalt hier maar ${kh}` : ''}.<p>Zelfde treden als de testbaan, dus bijna alles staat hier op “verdwaalt”: vergelijk zwaar alleen met zwaar.</p>`; },
    mk: () => `<b>Hoe kinderen afwijken van hun ouders.</b><p><b>Normaal</b>: kleine stapjes rond de ouder (klokvorm), zoals altijd.<br><b>Grote sprongen</b>: meestal klein, maar soms een flinke sprong (zware staart). Helpt uit een vastgelopen stand.<br><b>Zelfregelend</b>: elk DNA draagt zijn eigen stapgrootte σ mee en die evolueert mee; goede lopers krijgen vanzelf de juiste σ (te zien bij de kampioen).</p>`,
    lam: () => `<b>Lamarck: leren tijdens het leven.</b> Na het lopen probeert elke loper ${LAM_K} kleine aanpassingen aan zijn genen op dezelfde doolhoven en houdt de beste; zijn kinderen erven wat hij geleerd heeft.<p>Sneller vooruit, maar kost ${esc(EV().LAMARCK_COST || '×' + (LAM_K + 1) + ' rekentijd')}.</p>`,
    sel: () => `<b>Wie mag kinderen krijgen?</b><p><b>Fitness</b>: de besten op deze doolhoven (zoals altijd).<br><b>Nieuwheid</b>: wie zich anders gedraagt dan alles wat er al was (archief van gedrag). Vindt soms routes die fitness mist, omdat het niet vastloopt op één idee.<br><b>Mix</b>: half fitness, half nieuwheid.</p><p>De kampioen blijft altijd de beste op de testbaan (“beste ooit”).</p>`,
    d: () => `<b>Moeilijkheid = 100 − score op dit doolhof.</b> Hoger = moeilijker doolhof = beter gevonden. Paars, zodat je het niet verwart met een algoritme-score.<p>“voor klassieker”: hoe moeilijk hetzelfde doolhof is voor de beste klassieker. Rood = moeilijker voor jouw algoritme dan voor de klassieker (een zwakke plek).</p>`
  };
  const info = k => `<details class="inf" onclick="event.stopPropagation()"><summary title="Uitleg">i</summary><div>${INFO[k]()}</div></details>`;
  const kompasMark = heavy => { const bc = EV().bestClassic(); if (!heavy) return { mark: bc.t.score, markName: bc.p.name }; return EV().heavyReady() ? { mark: EV().heavyScore(bc.p.genes).score, markName: bc.p.name } : {}; };
  // scorevak: grote Score (testbaan) in treden, optioneel zwaar en een vergelijking vs = { name, t }
  function scoreBox(t, h, vs) {
    let cmp = '';
    if (vs && vs.t) cmp = ` · ${signed(r1(t.score - vs.t.score))} t.o.v. ${esc(vs.name)} ${sureTag(sureOf(t.per, vs.t.per))}`;
    const bc = EV().bestClassic(), dw = EV().testScore(EV().PRESETS[0].genes), b = band(t.score);
    const hv = h && h.score != null ? `<div class="es-hv"><span>Zwaar ${info('h')}</span><b style="color:${band(h.score).c}">${h.score}</b>${scoreWord(h.score)}${treden(h.score, { sm: true, ...kompasMark(true) })}</div>` : '';
    return `<div class="evo-score"><div class="es-top"><b style="color:${b.c}">${t.score}<small>/100</small></b>${scoreWord(t.score)}${info('t')}</div>
      ${treden(t.score, kompasMark(false))}
      <div class="es-tk"><span style="left:0">${esc(EV().PRESETS[0].name)} ${dw.score}</span><span class="c" style="left:${bc.t.score}%">▼ ${esc(bc.p.name)} ${bc.t.score}</span><span class="r">100 = perfect</span></div>
      <div class="es-cmp">Testbaan · ${t.solved}/${t.of} gehaald${cmp}</div>${hv}</div>`;
  }
  const vsClassic = () => { const bc = EV().bestClassic(); return { name: bc.p.name, t: bc.t, id: bc.p.id }; };
  function entries() {
    const Ev = EV(), mine = Ev.loadAlgos().map(a => ({ ...a, mine: true }));
    const list = [...Ev.PRESETS, ...mine];
    if (E.champ && !E.champ.from && !mine.some(a => a.genes.join() === E.champ.genes.join())) list.push({ ...E.champ, live: true });
    const hv = Ev.heavyReady();
    list.forEach(a => { a.t = Ev.testScore(a.genes); a.h = hv ? Ev.heavyScore(a.genes) : null; });
    return list.sort((a, b) => b.t.score - a.t.score || (b.t.solved - a.t.solved));
  }
  const entryById = id => entries().find(a => a.id === id) || (E.champ && E.champ.id === id ? E.champ : null)
    || (E.task && E.task.algo.id === id ? E.task.algo : null) || EV().loadFame().find(a => a.id === id) || null;
  function subOf(a) {
    if (a.classic) return a.desc;
    if (a.live) return 'kampioen, nog niet bewaard';
    return [a.ver > 1 ? 'v' + a.ver : '', a.folder, a.born != null ? `gen ${a.born}` : '', a.created].filter(Boolean).join(' · ');
  }
  const pick = a => ({ id: a.id, name: a.name, genes: a.genes.slice(), ver: a.ver || 1, mine: !!a.mine || isSaved(a.genes), classic: !!a.classic, folder: a.folder || '', tags: a.tags || [] });

  const r1 = v => Math.round(v * 10) / 10;

  function addAlgo(o) {
    const list = EV().loadAlgos();
    if (list.some(a => a.genes.join() === o.genes.join())) return false;
    const a = EV().newAlgo(o); EV().stampHist(a); list.push(a);
    EV().saveAlgos(list); return a;
  }

  Object.assign(U, { evoOpts, evoRules, LAM_K, $, TAU, EV, STORE, GRID_NAMES, SP_COLS, DUEL_COLS, SP_THR, SP_MAX, TASKS, esc, A, E, mkView, V, T, opts, rng, mm, nEval, nPanes, runs, isl, huntSet, HUNT_ASP, mazeSeed, persist, restore, fresh, nv, vd, speciate, colorFor, note, toast, geneZ, dnaHtml, dnaStrip, isSaved, sureOf, signed, sureTag, scoreBox, vsClassic, BANDS, HBANDS, band, treden, scoreWord, info, kompasMark, entries, entryById, subOf, pick, r1, addAlgo });
})(window.ML = window.ML || {});
