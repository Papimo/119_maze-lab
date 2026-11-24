// Evolutie: elke loper in de zwerm heeft eigen "DNA" = gewichten voor hoe hij bij elke stap kiest.
// Per keuze krijgt elke mogelijke zet punten (som van gen × kenmerk), daarna loting met temperatuur (gen "chaos").
// Klassieke oplossers (diepte-eerst, rechterhand, Trémaux…) zijn óók gewoon DNA → eerlijke vergelijking.
// Selectie: toernooi + elite, uniforme kruising, normale mutatie. Score = kortste route / gelopen stappen.
// Snelheid: het doolhof wordt één keer omgezet naar platte rijen (CSR: buren per toestand + richting per rand);
// de loper-engine (ENGINE) is een zelfstandige functie die ook als Web Worker (uit een Blob) draait.
(window.MLDEF = window.MLDEF || []).push(function (ML) { // MLDEF: ook in de Web Worker (evo.js Pool)
  'use strict';
  const TAU = Math.PI * 2;

  // ---- Genen ----
  // k = sleutel, lo/hi = bereik, col = kleur in de zwerm (dominante gen kleurt de loper)
  const GENES = [
    { k: 'fresh', name: 'Nieuwsgierig', lo: -6, hi: 6, col: '#4cc9f0', pos: 'zoekt nieuwe gangen', neg: 'blijft liever op bekend terrein' },
    { k: 'mine', name: 'Eigen spoor', lo: -6, hi: 6, col: '#b388ff', pos: 'loopt graag zijn eigen spoor terug', neg: 'mijdt zijn eigen sporen' },
    { k: 'back', name: 'Terugkrabbelen', lo: -6, hi: 6, col: '#80ed99', pos: 'keert netjes op zijn schreden terug', neg: 'keert nooit om' },
    { k: 'comp', name: 'Kompas', lo: -6, hi: 6, col: '#ffd166', pos: 'loopt op het kompas naar het doel', neg: 'loopt juist van het doel weg' },
    { k: 'hand', name: 'Hand aan de muur', lo: -6, hi: 6, col: '#ff6b6b', pos: 'houdt zijn rechterhand aan de muur', neg: 'houdt zijn linkerhand aan de muur' },
    { k: 'straight', name: 'Rechtdoor', lo: -6, hi: 6, col: '#f4a261', pos: 'gaat het liefst rechtdoor', neg: 'slaat graag af' },
    { k: 'dead', name: 'Doodlopers', lo: -6, hi: 6, col: '#e76f51', pos: 'zoekt doodlopende gangen op', neg: 'onthoudt doodlopers en mijdt ze' },
    { k: 'jct', name: 'Kruispunten', lo: -6, hi: 6, col: '#2ec4b6', pos: 'zoekt kruispunten op', neg: 'kiest rustige gangen' },
    // nieuw in engine 3: geheugen = hoe lang geleden hij een plek zag; feromoon = verse geur die hij zelf achterlaat (vervliegt)
    { k: 'mem', name: 'Geheugen', lo: -6, hi: 6, col: '#f72585', pos: 'loopt vergeten hoeken na', neg: 'blijft dicht bij waar hij net was' },
    { k: 'pher', name: 'Feromoon', lo: -6, hi: 6, col: '#a7c957', pos: 'volgt zijn verse geurspoor', neg: 'mijdt plekken die nog naar hem ruiken' },
    { k: 'chaos', name: 'Chaos', lo: -4, hi: 1.5, col: '#9aa5b1', pos: 'en is vrij grillig', neg: 'en is heel beslist' }
  ];
  const NG = GENES.length, CH = NG - 1;
  // oude DNA's (9 genen, engine ≤ 2) → 11 genen: geheugen + feromoon = 0 vóór chaos (zelfde gedrag)
  function upGenes(gs) { if (Array.isArray(gs) && gs.length === 9) { gs = gs.slice(); gs.splice(8, 0, 0, 0); } return gs; }
  const okGenes = gs => Array.isArray(gs) && gs.length === NG && gs.every(v => typeof v === 'number' && isFinite(v));
  ML.EVO_GENES = GENES;

  // ---- Klassiekers als DNA ----
  const g = o => GENES.map(G => o[G.k] != null ? o[G.k] : (G.k === 'chaos' ? -3 : 0));
  const PRESETS = [
    { id: 'p-dwaal', name: 'Dwaler', desc: 'loopt willekeurig rond', genes: g({ chaos: 1.5 }) },
    { id: 'p-dfs', name: 'Diepte-eerst', desc: 'nieuwe gang in, anders terug', genes: g({ fresh: 6, back: 3 }) },
    { id: 'p-right', name: 'Rechterhand', desc: 'hand tegen de muur', genes: g({ hand: 6, chaos: -4 }) },
    { id: 'p-left', name: 'Linkerhand', desc: 'andere hand tegen de muur', genes: g({ hand: -6, chaos: -4 }) },
    { id: 'p-tremaux', name: 'Trémaux', desc: 'mijdt eigen krijtstrepen', genes: g({ fresh: 3, mine: -4, back: 1 }) },
    { id: 'p-greedy', name: 'Kompas', desc: 'diepte-eerst richting doel', genes: g({ fresh: 8, back: 4, comp: 1.5 }) },
    { id: 'p-dead', name: 'Doodlopers dichten', desc: 'onthoudt en mijdt doodlopers', genes: g({ fresh: 3, back: 1.5, dead: -6 }) }
  ];
  PRESETS.forEach(p => { p.classic = true; });
  ML.EVO_PRESETS = PRESETS;

  // ---- Namen + kleuren ----
  const ADJ = ['Snelle', 'Slimme', 'Brave', 'Gekke', 'Stille', 'Dappere', 'Luie', 'Wijze', 'Wilde', 'Kleine', 'Grote', 'Vlugge', 'Sluwe', 'Koppige', 'Rustige', 'Vrolijke', 'Taaie', 'Nieuwsgierige', 'Gouden', 'Zwervende'];
  const DIER = ['Fret', 'Mier', 'Mol', 'Vos', 'Uil', 'Das', 'Muis', 'Kever', 'Egel', 'Rat', 'Hamster', 'Wezel', 'Spin', 'Slak', 'Kikker', 'Otter', 'Mot', 'Krekel', 'Gekko', 'Pad'];
  function nameOf(id) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } h >>>= 0; return ADJ[h % ADJ.length] + ' ' + DIER[(h >>> 8) % DIER.length]; }
  const norm = (v, i) => { const G = GENES[i]; return (v - G.lo) / (G.hi - G.lo) * 2 - 1; };
  // afstand tussen twee DNA's (genormaliseerd, 0 … ~6)
  function dnaDist(a, b) { let s = 0; for (let i = 0; i < NG; i++) { const d = norm(a[i], i) - norm(b[i], i); s += d * d; } return Math.sqrt(s); }
  function dominant(genes) {
    let bi = 0, bv = -1;
    for (let i = 0; i < CH; i++) { const v = Math.abs(genes[i]) / GENES[i].hi; if (v > bv) { bv = v; bi = i; } }
    return bi;
  }
  function colorOf(genes) { return GENES[dominant(genes)].col; }
  // Leesbare beschrijving: de drie sterkste genen + chaos
  function describe(genes) {
    const idx = [...Array(CH).keys()].sort((a, b) => Math.abs(genes[b]) / GENES[b].hi - Math.abs(genes[a]) / GENES[a].hi);
    const parts = idx.slice(0, 3).filter(i => Math.abs(genes[i]) > 0.6).map(i => genes[i] > 0 ? GENES[i].pos : GENES[i].neg);
    if (!parts.length) parts.push('heeft geen uitgesproken voorkeur');
    const c = genes[CH];
    const tail = c > 0 ? GENES[CH].pos : c < -2 ? GENES[CH].neg : 'en twijfelt soms';
    const s = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' en ' + parts[parts.length - 1] : parts[0];
    return s.charAt(0).toUpperCase() + s.slice(1) + ', ' + tail + '.';
  }

  // ======================================================================
  // ENGINE: zelfstandig (geen ML, geen DOM) → ook bruikbaar in een Web Worker via toString().
  // ctx = platte doolhof-rijen (zie context/pack). Walker leest alleen ctx.
  // ======================================================================
  function ENGINE() {
    'use strict';
    const TAU = Math.PI * 2, CH = 10, NP = 10; // NP = aantal gen-termen (zonder chaos)
    const PH = 24, DEC = new Float64Array(256); for (let t = 0; t < 256; t++) DEC[t] = Math.pow(0.5, t / PH); // feromoon: halveert elke 24 stappen
    const decay = dt => dt < 256 ? DEC[dt] : 0;
    function hashStr(s) {
      let h = 1779033703 ^ s.length;
      for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
      return h >>> 0;
    }
    function makeRng(seed) {
      let a = hashStr(String(seed)) || 1;
      return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const SC = new Float64Array(256), PI = Math.PI, iPI = 1 / Math.PI;
    const LG = new Float64Array(4096); for (let v = 0; v < 4096; v++) LG[v] = Math.log(1 + v); // log(1+bezoeken) uit een tabel
    class Walker {
      constructor(ctx, genes, seed) {
        this.ctx = ctx;
        this.vis = new Uint16Array(ctx.N); this.dead = new Uint8Array(ctx.n);
        this.last = new Int32Array(ctx.N); this.scent = new Float64Array(ctx.n); this.scT = new Int32Array(ctx.n); // geheugen + feromoon
        this.pos = new Int32Array(ctx.N).fill(-1); this.stk = new Int32Array(ctx.N + 1); this.sl = 0; // stapel als vaste rij (geen array.length-knippen)
        if (genes) this.reset(genes, seed);
      }
      reset(genes, seed) {
        const ctx = this.ctx, st = this.stk, pos = this.pos;
        for (let i = 0; i < this.sl; i++) pos[st[i]] = -1;
        this.vis.fill(0); this.dead.fill(0);
        this.g8 = genes[8]; this.g9 = genes[9];
        if (this.g8 || this.g9 || this.memUsed) { this.last.fill(0); this.scent.fill(0); this.scT.fill(0); this.memUsed = !!(this.g8 || this.g9); }
        this.g = genes; this.rng = makeRng(seed); this.T = Math.exp(genes[CH]);
        this.s = ctx.start; this.c = this.nc = ctx.cellOf[ctx.start]; this.hx = 1; this.hy = 0; this.ha = 0; // kijkrichting (+ als hoek)
        this.ag4 = Math.abs(genes[4]); this.iT = 1 / this.T;
        this.vis[this.s] = 1; st[0] = this.s; this.sl = 1; pos[this.s] = 0;
        this.steps = 0; this.done = false; this.reached = false; this.p = 0; this.jump = false;
        if (this.memUsed) this.scent[this.c] = 1;
        return this;
      }
      step() {
        if (this.done) return;
        const ctx = this.ctx, G = this.g, s = this.s, cellOf = ctx.cellOf, c = cellOf[s];
        const a = ctx.off[s], b = ctx.off[s + 1], n = b - a, tc = ctx.tc, kd = ctx.kd, ex = ctx.ex, ey = ctx.ey, dead = this.dead, vis = this.vis;
        if (!n) { this.done = true; return; }
        // doodloper markeren: hooguit één uitweg naar een niet-dode buurcel (start/doel nooit)
        if (c !== ctx.startCell && c !== ctx.goal) {
          let live = 0, last = -1;
          for (let e = a; e < b; e++) { const c2 = tc[e]; if (c2 !== c && !dead[c2] && c2 !== last) { live++; last = c2; } }
          if (live <= 1) dead[c] = 1;
        }
        const st = this.stk, sl = this.sl, prev = sl > 1 ? st[sl - 2] : -1, hx = this.hx, hy = this.hy;
        const eu = ctx.eu, exits = ctx.exits, to = ctx.to, an = ctx.an, euc = eu[c], ha = this.ha, ag4 = this.ag4;
        const g0 = G[0], g1 = G[1], g2 = G[2], g3 = G[3], g4 = G[4], g5 = G[5], g6 = G[6], g7 = G[7];
        const g8 = this.g8, g9 = this.g9, steps = this.steps, last = this.last, scent = this.scent, scT = this.scT;
        let mx = -1e9;
        for (let i = 0; i < n; i++) {
          const e = a + i, s2 = to[e], c2 = tc[e], v = vis[s2];
          let d = euc - eu[c2]; if (d > 1) d = 1; else if (d < -1) d = -1;
          let sc = (v ? g1 * (v < 4096 ? LG[v] : Math.log(1 + v)) : g0) + (s2 === prev ? g2 : 0) + g3 * d + g6 * dead[c2] + g7 * (exits[c2] - 2) * 0.5;
          if (kd[e] === 1) {
            sc += g5 * (hx * ex[e] + hy * ey[e]);
            if (g4) { // hand: draaien vanaf "terug" met de klok mee (rechts) of tegen de klok in (links)
              let th = an[e] - ha; // + = rechtsaf (y omlaag); hoekverschil i.p.v. atan2 per zet
              if (th > PI) th -= TAU; else if (th <= -PI) th += TAU;
              let phi = g4 > 0 ? PI - th : PI + th;
              if (phi < 1e-3 || phi >= TAU) phi = TAU;
              sc += ag4 * (1 - phi * iPI);
            }
          }
          if (g8 && v) { const age = (steps - last[s2]) * 0.015625; sc += g8 * (age > 1 ? 1 : age); } // geheugen: 0 = net gezien, 1 = ≥64 stappen geleden
          if (g9) { const f = scent[c2] * decay(steps - scT[c2]); sc += g9 * (f > 2 ? 2 : f) * 0.5; } // feromoon: verse geur 0..1
          SC[i] = sc; if (sc > mx) mx = sc;
        }
        // loting met temperatuur
        let tot = 0;
        const iT = this.iT;
        if (n === 1) { SC[0] = 1; tot = 1; } // exp(0) = 1: zelfde loting, zonder rekenen
        else for (let i = 0; i < n; i++) { const w = Math.exp((SC[i] - mx) * iT); SC[i] = w; tot += w; }
        let x = this.rng() * tot, k = n - 1;
        for (let i = 0; i < n; i++) { x -= SC[i]; if (x <= 0) { k = i; break; } }
        const e = a + k, t2 = to[e], c2 = tc[e], pos = this.pos;
        // stapel = eenvoudig pad vanaf de start (lus → afknippen)
        const at = pos[t2];
        if (at >= 0) { for (let j = sl - 1; j > at; j--) pos[st[j]] = -1; this.sl = at + 1; }
        else { pos[t2] = sl; st[sl] = t2; this.sl = sl + 1; }
        if (vis[t2] < 65535) vis[t2]++;
        this.s = t2; this.c = c; this.nc = c2; this.steps++;
        if (this.memUsed) { const T = this.steps; this.last[t2] = T; this.scent[c2] = this.scent[c2] * decay(T - this.scT[c2]) + 1; this.scT[c2] = T; }
        if (c2 !== c) { this.jump = kd[e] !== 1; if (!this.jump) { this.hx = ex[e]; this.hy = ey[e]; this.ha = an[e]; } }
        else this.jump = false;
        if (c2 === ctx.goal) { this.done = true; this.reached = true; }
        else if (this.steps >= ctx.cap) this.done = true;
      }
      // 0..1: gehaald = kortste/stappen; niet gehaald = beetje voor de afgelegde afstand
      score() {
        const ctx = this.ctx;
        if (this.reached) return Math.min(1, ctx.opt / Math.max(1, this.steps));
        const d = ctx.dist[this.nc];
        return d >= 1e9 ? 0 : 0.05 * Math.max(0, 1 - d / ctx.d0);
      }
      run() { while (!this.done) this.step(); return this; }
      get st() { return Array.from(this.stk.subarray(0, this.sl)); } // eenvoudig pad vanaf de start
      // Uitleg (zelfde formule als step, zonder te lopen): per mogelijke zet de punten per gen en de kans
      explain() {
        const ctx = this.ctx, G = this.g, s = this.s, c = ctx.cellOf[s], a = ctx.off[s], b = ctx.off[s + 1];
        const st = this.stk, sl = this.sl, prev = sl > 1 ? st[sl - 2] : -1, out = [];
        let mx = -1e9;
        for (let e = a; e < b; e++) {
          const s2 = ctx.to[e], c2 = ctx.tc[e], v = this.vis[s2], P = new Float64Array(NP);
          let d = ctx.eu[c] - ctx.eu[c2]; if (d > 1) d = 1; else if (d < -1) d = -1;
          P[0] = v ? 0 : G[0]; P[1] = v ? G[1] * Math.log(1 + v) : 0; P[2] = s2 === prev ? G[2] : 0; P[3] = G[3] * d;
          P[6] = G[6] * this.dead[c2]; P[7] = G[7] * (ctx.exits[c2] - 2) * 0.5;
          if (G[8] && v) { const age = (this.steps - this.last[s2]) * 0.015625; P[8] = G[8] * (age > 1 ? 1 : age); }
          if (G[9]) { const f = this.scent[c2] * decay(this.steps - this.scT[c2]); P[9] = G[9] * (f > 2 ? 2 : f) * 0.5; }
          if (ctx.kd[e] === 1) {
            const dx = ctx.ex[e], dy = ctx.ey[e], cs = this.hx * dx + this.hy * dy;
            P[5] = G[5] * cs;
            if (G[4]) { const th = Math.atan2(this.hx * dy - this.hy * dx, cs); let phi = G[4] > 0 ? Math.PI - th : Math.PI + th; phi = ((phi % TAU) + TAU) % TAU; if (phi < 1e-3) phi = TAU; P[4] = Math.abs(G[4]) * (1 - phi / Math.PI); }
          }
          let sc = 0; for (let i = 0; i < NP; i++) sc += P[i];
          if (sc > mx) mx = sc;
          out.push({ s2, c2, parts: Array.from(P), sc, visits: v, jump: ctx.kd[e] !== 1 && c2 !== c });
        }
        let tot = 0; out.forEach(o => { o.p = Math.exp((o.sc - mx) / this.T); tot += o.p; });
        out.forEach(o => { o.p /= tot || 1; });
        return out;
      }
    }
    // één run met een hergebruikte loper per doolhof (geen nieuwe rijen per run)
    function evalOne(ctx, genes, seed) {
      const w = ctx._w || (ctx._w = new Walker(ctx));
      return w.reset(genes, seed).run();
    }
    // fitness voor een lijst DNA's over meerdere doolhoven
    // runs > 1: elk doolhof meerdere keren (andere loting), gemiddelde → minder geluk. i0 = nummer van het eerste doolhof (voor zaadjes)
    function evalList(ctxs, genesList, ids, gen, runs, i0) {
      const N = genesList.length, R = runs || 1, o = i0 || 0, fit = new Float64Array(N), ok = new Int32Array(N), steps = new Int32Array(N);
      for (let j = 0; j < N; j++) {
        let s = 0;
        for (let i = 0; i < ctxs.length; i++) for (let r = 0; r < R; r++) {
          const w = evalOne(ctxs[i], genesList[j], ids[j] + '|' + gen + '|' + (i + o) + (r ? '|r' + r : ''));
          s += w.score(); if (w.reached) ok[j]++; steps[j] += w.steps;
        }
        fit[j] = s / (ctxs.length * R);
      }
      return { fit, ok, steps };
    }
    return { Walker, evalOne, evalList, makeRng };
  }
  const ENG = ENGINE();
  const ENGINE_V = 3; // verandert de loper-logica → testscores opnieuw in de geschiedenis

  // ---- Doolhof-context (gedeeld door alle lopers op één doolhof) ----
  function context(m) {
    const P = ML.makeProblem(m), n = m.cells.length, C = m.cells, N = P.N;
    const exits = new Uint8Array(n);
    for (let i = 0; i < n; i++) { let k = 0; for (const nb of C[i].nbrs) if (m.walls[nb.w].open) k++; exits[i] = k; }
    let sl = 0, sn = 0;
    for (let i = 0; i < Math.min(n, 40); i++) for (const nb of C[i].nbrs) { const a = C[i].center, b = C[nb.c].center; sl += Math.hypot(a[0] - b[0], a[1] - b[1]); sn++; }
    const unit = sn ? sl / sn : 1, gc = C[m.goal].center;
    const eu = new Float32Array(n);
    for (let i = 0; i < n; i++) eu[i] = Math.hypot(C[i].center[0] - gc[0], C[i].center[1] - gc[1]) / unit;
    const dist = ML.goalDist(m), c0 = P.cell(P.start);
    const opt = Math.max(1, m.solution ? m.solution.length - 1 : dist[c0]);
    // CSR: per toestand de opvolgers (zelfde volgorde als P.succ), doelcel, soort (0 = zelfde cel, 1 = gewone stap, 2 = sprong) en richting
    const cellOf = new Int32Array(N), off = new Int32Array(N + 1), OUT = [], T = [], TC = [], KD = [], EX = [], EY = [];
    for (let s = 0; s < N; s++) {
      const c = P.cell(s); cellOf[s] = c; off[s] = T.length;
      P.succ(s, OUT);
      for (const s2 of OUT) {
        const c2 = P.cell(s2); let k = 0, dx = 0, dy = 0;
        if (c2 !== c) {
          const w = ML.edge(m, c, c2);
          if (w && !w.stair && !w.wrap) { const a = C[c].center, b = C[c2].center; dx = b[0] - a[0]; dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L; k = 1; }
          else k = 2;
        }
        T.push(s2); TC.push(c2); KD.push(k); EX.push(dx); EY.push(dy);
      }
    }
    off[N] = T.length;
    const ex = Float32Array.from(EX), ey = Float32Array.from(EY), an = new Float64Array(ex.length);
    for (let e = 0; e < an.length; e++) an[e] = Math.atan2(ey[e], ex[e]);
    return { m, P, n, N, cellOf, off, to: Int32Array.from(T), tc: Int32Array.from(TC), kd: Uint8Array.from(KD), ex, ey, an,
      start: P.start, startCell: m.start, goal: m.goal, exits, eu, dist, opt, d0: Math.max(1, dist[c0] < 1e9 ? dist[c0] : opt),
      cap: Math.max(200, Math.min(Math.round(n * 6), opt * 25)) }; // na 25× de kortste route levert aankomen niets meer op
  }
  // alleen de platte rijen (voor een Worker)
  const PACK = ['n', 'N', 'cellOf', 'off', 'to', 'tc', 'kd', 'ex', 'ey', 'an', 'start', 'startCell', 'goal', 'exits', 'eu', 'dist', 'opt', 'd0', 'cap'];
  function pack(ctx) { if (!ctx._pack) { const o = {}; PACK.forEach(k => { o[k] = ctx[k]; }); ctx._pack = o; } return ctx._pack; }

  // Walker met de oude aanroep: new Walker(ctx, genes, seed)
  const Walker = ENG.Walker;

  // ---- Doolhoven ----
  const MAKERS = ['backtracker', 'prim', 'kruskal', 'wilson', 'huntkill'];
  const GRIDS = ['square', 'hex', 'tri', 'polar'];
  const BASE = { grid: 'square', shape: 'rect', text: '', size: 16, levels: 1, torus: false, variant: '', mix: 75, braid: 0,
    keys: 0, oneways: 0, teleports: 0, switches: 0, timed: 0, terrain: 0 };
  // o = { grid ('mix' = afwisselen), size, braid, puzzle, makers ('mix'|'backtracker') }
  function mazeSpec(o, seed, i) {
    const grid = o.grid === 'mix' ? GRIDS[i % GRIDS.length] : o.grid;
    const s = { ...BASE, grid, size: grid === 'polar' ? Math.min(70, Math.round(o.size * 1.2)) : o.size, braid: o.braid, seed };
    if (o.puzzle) { s.keys = 1; s.teleports = 1; s.oneways = 3; }
    const gen = o.makers === 'mix' ? MAKERS[i % MAKERS.length] : 'backtracker';
    return { s, gen };
  }
  // kleine cache: vaste doolhoven worden niet elke generatie opnieuw gebouwd
  const mzCache = new Map();
  function buildMaze(o, seed, i, aspect) {
    const asp = aspect || 0.66, key = [o.grid, o.size, o.braid, o.puzzle ? 1 : 0, o.makers, seed, i, asp.toFixed(3)].join('|');
    if (mzCache.has(key)) return mzCache.get(key);
    const { s, gen } = mazeSpec(o, seed, i);
    const m = ML.buildFull(s, gen, asp);
    const mz = { m, s, gen, ctx: context(m), key };
    if (mzCache.size > 40) mzCache.clear();
    mzCache.set(key, mz);
    return mz;
  }

  // ---- Vaste testbaan (ranglijst): 12 doolhoven, elk algoritme 2× ----
  const TEST = [
    ['square', 18, 0], ['square', 18, 0], ['square', 22, 0], ['square', 18, 35], ['square', 18, 35], ['square', 22, 15],
    ['hex', 14, 0], ['hex', 14, 30], ['tri', 18, 0], ['tri', 18, 25], ['polar', 16, 0], ['polar', 16, 30]
  ];
  // soorten voor het duel (overlappen mag: "Lussen" telt alle doolhoven met lussen)
  const TEST_CATS = [
    { k: 'sq', name: 'Vierkant', f: t => t[0] === 'square' && !t[2] },
    { k: 'loop', name: 'Lussen', f: t => t[2] > 0 },
    { k: 'hex', name: 'Zeshoek', f: t => t[0] === 'hex' },
    { k: 'tri', name: 'Driehoek', f: t => t[0] === 'tri' },
    { k: 'polar', name: 'Ringen', f: t => t[0] === 'polar' }
  ];
  let testSet = null;
  function testMazes() {
    if (!testSet) testSet = TEST.map(([grid, size, braid], i) => {
      const m = ML.buildFull({ ...BASE, grid, size, braid, seed: 'evo-toets-' + (i + 1) }, MAKERS[i % 4], 0.66);
      return context(m);
    });
    return testSet;
  }
  const testCache = new Map();
  // → { score 0..100, solved (aantal gehaald van 24), ratio (gem. stappen / kortste bij gehaald), per: score per testdoolhof, cats: score per soort }
  function testScore(genes) {
    const key = genes.map(v => v.toFixed(3)).join(',');
    if (testCache.has(key)) return testCache.get(key);
    return testCombine(genes, testPart(genes, TEST.map((_, i) => i)));
  }
  // deel van de testbaan (doolhoven idx) → [{ i, s (som van 2 runs), solved, rs }]; workers rekenen elk een stukje
  function testPart(genes, idx) {
    const T = testMazes();
    return idx.map(i => {
      const ctx = T[i]; let s = 0, solved = 0, rs = 0;
      for (let r = 0; r < 2; r++) {
        const w = ENG.evalOne(ctx, genes, 'toets|' + i + '|' + r), sc = w.score();
        s += sc; if (w.reached) { solved++; rs += w.steps / ctx.opt; }
      }
      return { i, s, solved, rs };
    });
  }
  function testCombine(genes, parts) {
    let tot = 0, solved = 0, rs = 0;
    const per = TEST.map(() => 0), N = TEST.length * 2;
    // optellen in vaste volgorde (zelfde afronding als vroeger)
    parts.slice().sort((a, b) => a.i - b.i).forEach(p => { tot += p.s; solved += p.solved; rs += p.rs; per[p.i] = p.s / 2; });
    const cats = {};
    TEST_CATS.forEach(c => { let s = 0, k = 0; TEST.forEach((t, i) => { if (c.f(t)) { s += per[i]; k++; } }); cats[c.k] = Math.round(s / k * 1000) / 10; });
    return testPut(genes, { score: Math.round(tot / N * 1000) / 10, solved, of: N, ratio: solved ? rs / solved : null, per, cats });
  }
  // uitkomst uit een worker in dezelfde cache
  function testPut(genes, res) {
    if (testCache.size > 3000) testCache.clear();
    testCache.set(genes.map(v => v.toFixed(3)).join(','), res);
    return res;
  }
  function bestClassic() {
    let b = null;
    for (const p of PRESETS) { const t = testScore(p.genes); if (!b || t.score > b.t.score) b = { p, t }; }
    return b;
  }

  // ---- Doolhof uit een losse beschrijving (zware testbaan, doolhof-zoeker) ----
  // sp = { grid, size, braid, puzzle (0/1), maker, seed }
  const spCache = new Map();
  function specMaze(sp, aspect) {
    const asp = aspect || 0.66, key = [sp.grid, sp.size, sp.braid, sp.puzzle ? 1 : 0, sp.maker, sp.seed, asp.toFixed(3)].join('|');
    if (spCache.has(key)) return spCache.get(key);
    const s = { ...BASE, grid: sp.grid, size: sp.size, braid: sp.braid, seed: sp.seed };
    if (sp.puzzle) { s.keys = 1; s.teleports = 1; s.oneways = 3; }
    const m = ML.buildFull(s, sp.maker, asp), mz = { m, s, gen: sp.maker, ctx: context(m), key: 'sp|' + key, sp };
    if (spCache.size > 60) spCache.clear();
    spCache.set(key, mz);
    return mz;
  }
  const spName = sp => `${({ square: 'Vierkant', hex: 'Zeshoek', tri: 'Driehoek', polar: 'Ringen' })[sp.grid]} ${sp.size}${sp.braid ? ' · lussen ' + sp.braid + '%' : ''}${sp.puzzle ? ' · puzzel' : ''}`;

  // ---- Zware testbaan: groot (40–70), lussen en puzzels; tweede ranglijst ----
  const HEAVY = [
    ['square', 40, 0, 0], ['square', 56, 20, 0], ['square', 70, 0, 1], ['hex', 40, 25, 0],
    ['tri', 48, 0, 1], ['polar', 50, 30, 0], ['square', 44, 40, 1], ['hex', 46, 0, 1]
  ].map(([grid, size, braid, puzzle], i) => ({ grid, size, braid, puzzle, maker: MAKERS[i % MAKERS.length], seed: 'evo-zwaar-' + (i + 1) }));
  let heavySet = null;
  const heavyMazes = () => heavySet || (heavySet = HEAVY.map(sp => { const m = specMaze(sp).ctx; spCache.clear(); return m; }));
  const heavyCache = new Map();
  function heavyScore(genes) {
    const key = genes.map(v => v.toFixed(3)).join(',');
    if (heavyCache.has(key)) return heavyCache.get(key);
    let tot = 0, solved = 0;
    const per = heavyMazes().map((ctx, i) => { const w = ENG.evalOne(ctx, genes, 'zwaar|' + i), sc = w.score(); tot += sc; if (w.reached) solved++; return sc; });
    const res = { score: Math.round(tot / HEAVY.length * 1000) / 10, solved, of: HEAVY.length, per };
    if (heavyCache.size > 3000) heavyCache.clear();
    heavyCache.set(key, res);
    return res;
  }
  const heavyReady = () => !!heavySet;

  // ---- Evolutie ----
  let uid = 0;
  const newId = () => Date.now().toString(36) + '-' + (uid++).toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  function genome(genes, born, parents, extra) {
    const id = newId();
    return Object.assign({ id, name: nameOf(id), genes: genes.map(v => Math.round(v * 1000) / 1000), born, parents: parents || [], fit: 0 }, extra || {});
  }
  function randomGenes(rng) { return GENES.map(G => G.lo + rng() * (G.hi - G.lo)); }
  // bereik rekt mee met de bronwaarde (Kompas heeft fresh 8 > hi 6): een kind wordt nooit teruggeknipt onder zijn ouder
  const clamp = (v, i, src) => { const G = GENES[i], lo = src != null && src < G.lo ? src : G.lo, hi = src != null && src > G.hi ? src : G.hi; return Math.max(lo, Math.min(hi, v)); };
  // harde grens (import/deelcode): anderhalf keer het gewone bereik
  const clampHard = (v, i) => { const G = GENES[i], r = (G.hi - G.lo) * 0.5; return Math.max(G.lo - r, Math.min(G.hi + r, v)); };
  function gauss(rng) { return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(TAU * rng()); }

  // o = { pop, classics, seeds: [genomen], rng }
  function initPop(o) {
    const rng = o.rng, pop = [];
    if (o.classics) PRESETS.forEach(p => pop.push(genome(p.genes, 0, [], { from: p.name, name: p.name })));
    (o.seeds || []).forEach(s => { if (pop.length < o.pop) pop.push(genome(s.genes, 0, [], { from: s.name, name: s.name })); });
    while (pop.length < o.pop) pop.push(genome(randomGenes(rng), 0));
    return pop.slice(0, o.pop);
  }
  // fitness = gemiddelde score over de doolhoven (en 1 loper per doolhof)
  function evaluate(pop, mazes, gen, runs) {
    const r = ENG.evalList(mazes.map(mz => mz.ctx), pop.map(g => g.genes), pop.map(g => g.id), gen, runs);
    pop.forEach((ge, j) => { ge.fit = r.fit[j]; ge.ok = r.ok[j]; ge.steps = r.steps[j]; });
    return pop;
  }
  // o = { pop, mut (0..1), elite, rng, gen }
  function nextGen(pop, o) {
    const rng = o.rng, N = o.pop, sorted = pop.slice().sort((a, b) => b.fit - a.fit), out = [];
    const elite = Math.min(o.elite == null ? 2 : o.elite, sorted.length);
    for (let i = 0; i < elite; i++) { const e = sorted[i]; out.push(Object.assign({}, e, { fit: 0, elite: true, age: (e.age || 0) + 1 })); }
    const pick = () => { let b = null; for (let i = 0; i < 3; i++) { const c = sorted[Math.floor(rng() * sorted.length)]; if (!b || c.fit > b.fit) b = c; } return b; };
    while (out.length < N) {
      if (rng() < 0.05) { out.push(genome(randomGenes(rng), o.gen)); continue; } // nieuwkomer
      const a = pick(), b = pick(), genes = a.genes.map((v, i) => rng() < 0.5 ? v : b.genes[i]);
      for (let i = 0; i < NG; i++) if (rng() < o.mut) genes[i] = clamp(genes[i] + gauss(rng) * (GENES[i].hi - GENES[i].lo) * 0.12, i, genes[i]);
      // soort erven van de beste ouder (kleur blijft rustig)
      out.push(genome(genes, o.gen, a === b ? [a.name] : [a.name, b.name], { sp: a.sp }));
    }
    return out;
  }
  // Eilanden: I aparte populaties (ge.isl); elke `every` generaties verhuist de beste van elk eiland naar het volgende
  function nextGenIslands(pop, o, I, every) {
    if (!(I > 1)) return nextGen(pop, o);
    const per = k => Math.max(4, Math.floor(o.pop / I) + (k < o.pop % I ? 1 : 0)), groups = [];
    for (let k = 0; k < I; k++) groups.push([]);
    pop.forEach((ge, j) => { const k = ge.isl != null && ge.isl < I ? ge.isl : j % I; groups[k].push(ge); });
    groups.forEach((gr, k) => { while (gr.length < 2) gr.push(genome(randomGenes(o.rng), o.gen)); });
    const best = groups.map(gr => gr.slice().sort((a, b) => b.fit - a.fit)[0]);
    let out = [];
    groups.forEach((gr, k) => {
      const kids = nextGen(gr, { ...o, pop: per(k), elite: 1 });
      kids.forEach(g => { g.isl = k; });
      if (o.gen % (every || 8) === 0) { // migratie: beste van het vorige eiland vervangt het laatste kind
        const m = best[(k + I - 1) % I];
        kids[kids.length - 1] = Object.assign({}, m, { fit: 0, isl: k, migrant: true, elite: false });
      }
      out = out.concat(kids);
    });
    return out;
  }
  const assignIslands = (pop, I) => { pop.forEach((g, j) => { g.isl = I > 1 ? j % I : 0; }); return pop; };

  // ---- Maximaal: Web Workers (uit een Blob, want file:// staat geen worker-bestanden toe) ----
  const Pool = {
    ws: null, broken: false, job: 0, wait: new Map(), canBuild: false,
    size() { return Math.max(1, Math.min(16, navigator.hardwareConcurrency || 4)); },
    ensure() {
      if (this.ws || this.broken) return !!this.ws;
      try {
        // met MLDEF (alle doolhof-bibliotheken) kan de worker zelf doolhoven bouwen; anders alleen lopen
        const defs = (typeof window !== 'undefined' && window.MLDEF) || [];
        this.canBuild = defs.length >= 6;
        const src = this.canBuild
          ? `self.window=self;const ML=self.ML={};\n${defs.map(f => '(' + f.toString() + ')(ML);').join('\n')}\nconst E=ML.Evo,cache=new Map();`
          : `const E=(${ENGINE.toString()})();const cache=new Map();`;
        const body = `onmessage=function(e){const d=e.data;let ctxs;

if(d.build)ctxs=d.specs.map(x=>E.buildMaze(x.o,x.sd,x.i,x.asp).ctx);
else{if(d.clear)cache.clear();if(d.ctxs)for(const k in d.ctxs)cache.set(k,d.ctxs[k]);ctxs=d.keys.map(k=>cache.get(k));}
const r=E.evalList(ctxs,d.genes,d.ids,d.gen,d.runs,d.i0);postMessage({job:d.job,part:d.part,fit:r.fit,ok:r.ok,steps:r.steps,tp:d.test?E.testPart(d.test,d.tidx):null});
if(d.pre)for(const x of d.pre)E.buildMaze(x.o,x.sd,x.i,x.asp);};`; // pre = doolhoven van de volgende generatie alvast bouwen (terwijl de hoofddraad kinderen maakt)
        const url = URL.createObjectURL(new Blob([src + '\n' + body], { type: 'text/javascript' }));
        this.ws = [];
        for (let i = 0; i < this.size(); i++) {
          const w = new Worker(url); w.has = new Set();
          w.onerror = () => { this.broken = true; this.wait.forEach(h => h(null)); };
          w.onmessage = e => { const h = this.wait.get(e.data.job); if (h) h(e.data); };
          this.ws.push(w);
        }
      } catch (e) { this.broken = true; this.ws = null; }
      return !!this.ws;
    },
    // jobs = [{ w (worker-index), msg, apply(d) }] → Promise; terugval = fb() op de hoofddraad
    run(jobs, fb) {
      const job = ++this.job;
      return new Promise(resolve => {
        let left = jobs.length, over = false;
        const end = ok => { if (over) return; over = true; clearTimeout(timer); this.wait.delete(job); if (!ok) { this.broken = true; fb(); } resolve(); };
        const timer = setTimeout(() => end(false), 20000);
        this.wait.set(job, d => { if (!d) return end(false); jobs[d.part].apply(d); if (--left === 0) end(true); });
        jobs.forEach((j, p) => this.ws[j.w].postMessage(Object.assign({ job, part: p }, j.msg)));
      });
    },
    // doolhoven op de hoofddraad gebouwd, rijen naar de workers (populatie verdeeld)
    evaluate(pop, mazes, gen, runs) {
      if (!this.ensure() || this.broken) { evaluate(pop, mazes, gen, runs); return Promise.resolve(pop); }
      const W = this.ws.length, per = Math.ceil(pop.length / W), keys = mazes.map(mz => mz.key), jobs = [];
      for (let p = 0; p * per < pop.length; p++) {
        const part = pop.slice(p * per, (p + 1) * per), w = this.ws[p];
        let clear = false;
        if (w.has.size > 60) { w.has.clear(); clear = true; }
        const ctxs = {};
        mazes.forEach(mz => { if (!w.has.has(mz.key)) { ctxs[mz.key] = pack(mz.ctx); w.has.add(mz.key); } });
        jobs.push({ w: p, msg: { clear, ctxs, keys, genes: part.map(g => g.genes), ids: part.map(g => g.id), gen, runs },
          apply: d => part.forEach((ge, j) => { ge.fit = d.fit[j]; ge.ok = d.ok[j]; ge.steps = d.steps[j]; }) });
      }
      return this.run(jobs, () => evaluate(pop, mazes, gen, runs)).then(() => pop);
    },
    // doolhoven bouwen ín de workers: specs = [{ o, sd, i, asp }]; elk doolhof wordt door 1 worker (of een paar bij weinig doolhoven) gebouwd
    // x = { next: specs van de volgende generatie (zelfde worker bouwt ze alvast), test: genes → x.onTest(testScore) in een worker }
    evaluateSpecs(pop, specs, gen, runs, fallbackMazes, x) {
      if (!this.ensure() || this.broken || !this.canBuild) return null;
      const W = this.ws.length, M = specs.length, c = Math.max(1, Math.floor(W / M)), per = Math.ceil(pop.length / c), N = pop.length;
      const sum = new Float64Array(N), ok = new Int32Array(N), st = new Int32Array(N), jobs = [], next = x && x.next;
      specs.forEach((sp, i) => {
        for (let p = 0; p * per < N; p++) {
          const from = p * per, part = pop.slice(from, from + per), w = jobs.length % W;
          const pre = next && next[i] && !jobs.some(j => j.w === w && j.msg.pre && j.msg.pre[0] === next[i]) ? [next[i]] : null;
          jobs.push({ w, msg: { build: true, specs: [sp], genes: part.map(g => g.genes), ids: part.map(g => g.id), gen, runs, i0: sp.i, pre },
            apply: d => { for (let j = 0; j < part.length; j++) { sum[from + j] += d.fit[j]; ok[from + j] += d.ok[j]; st[from + j] += d.steps[j]; } } });
        }
      });
      // testbaan van de vorige beste: doolhoven verdeeld over alle jobs (gelijke last)
      const tparts = [];
      if (x && x.test) {
        jobs.forEach(j => { j.msg.test = x.test; j.msg.tidx = []; });
        TEST.forEach((_, i) => jobs[(jobs.length - 1 - i % jobs.length)].msg.tidx.push(i));
        jobs.forEach(j => { const ap = j.apply; j.apply = d => { ap(d); if (d.tp) tparts.push(...d.tp); }; });
      }
      let fell = false;
      return this.run(jobs, () => { fell = true; evaluate(pop, fallbackMazes(), gen, runs); }).then(() => {
        if (!fell) pop.forEach((ge, j) => { ge.fit = sum[j] / M; ge.ok = ok[j]; ge.steps = st[j]; });
        if (!fell && tparts.length === TEST.length) x.onTest(testCombine(x.test, tparts));
        return pop;
      });
    }
  };

  // ---- Opslag: bibliotheek met bewaarde algoritmes ----
  // item = { id, name, genes, born, parents (namen), parent (id waarvan dit een versie is), ver, folder, tags[], note, created, date, hist[{d,s,v}] }
  const STORE = 'mazelab.algos';
  const today = () => new Date().toISOString().slice(0, 10);
  function migrate(a) {
    a.parents = a.parents || []; a.tags = Array.isArray(a.tags) ? a.tags : []; a.folder = a.folder || ''; a.note = a.note || '';
    a.created = a.created || a.date || today(); a.date = a.date || a.created; a.ver = a.ver || 1; a.parent = a.parent || null;
    a.hist = Array.isArray(a.hist) ? a.hist : [];
    return a;
  }
  function loadAlgos() { try { return JSON.parse(localStorage.getItem(STORE) || '[]').filter(a => a && (a.genes = upGenes(a.genes)) && okGenes(a.genes)).map(migrate); } catch (e) { return []; } }
  function saveAlgos(list) { try { localStorage.setItem(STORE, JSON.stringify(list)); } catch (e) { /* geen opslag */ } syncSolvers(list); }
  function newAlgo(o) { return migrate({ id: newId(), name: o.name, genes: o.genes.map(v => Math.round(v * 1000) / 1000), born: o.born || 0, parents: o.parents || [], parent: o.parent || null, ver: o.ver || 1,
    folder: o.folder || '', tags: (o.tags || []).slice(), note: o.note || '', created: today() }); }
  // testscore-geschiedenis bijhouden (nieuw item of nieuwe engine-versie) → true als er iets veranderd is
  function stampHist(a) {
    const last = a.hist[a.hist.length - 1];
    if (last && last.v === ENGINE_V) return false;
    a.hist.push({ d: today(), s: testScore(a.genes).score, v: ENGINE_V });
    if (a.hist.length > 30) a.hist.splice(0, a.hist.length - 30);
    return true;
  }
  // deelcode: "MLDNA1:" + base64(json)
  function toCode(a) { return 'MLDNA1:' + btoa(unescape(encodeURIComponent(JSON.stringify({ n: a.name, g: a.genes, b: a.born })))); }
  // korte code (voor link + QR): "MLDNA2." + base64url( versie, NG × int16 (gen × 1000, exact), naam utf-8 )
  function toShort(a) {
    const nm = unescape(encodeURIComponent(String(a.name || '').slice(0, 24))), b = [2];
    a.genes.forEach(v => { const x = Math.max(-32767, Math.min(32767, Math.round(v * 1000))) & 0xffff; b.push(x >> 8, x & 255); });
    let bin = String.fromCharCode(...b) + nm;
    return 'MLDNA2.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromShort(str) {
    const m = /MLDNA2\.([A-Za-z0-9_-]+)/.exec(str || ''); if (!m) return null;
    try {
      const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/')), L = 1 + NG * 2;
      if (bin.charCodeAt(0) !== 2 || bin.length < L) return null;
      const gs = [];
      for (let i = 0; i < NG; i++) { let x = (bin.charCodeAt(1 + 2 * i) << 8) | bin.charCodeAt(2 + 2 * i); if (x > 32767) x -= 65536; gs.push(x / 1000); }
      if (!okGenes(gs)) return null;
      return { name: decodeURIComponent(escape(bin.slice(L))).slice(0, 40) || 'Gedeeld', genes: gs.map((v, i) => clampHard(v, i)), born: 0 };
    } catch (e) { return null; }
  }
  function fromCode(str) {
    const sh = fromShort(str); if (sh) return sh;
    const m = /MLDNA1:([A-Za-z0-9+/=]+)/.exec(str || '');
    if (!m) return null;
    try {
      const o = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      const gs = upGenes(o.g);
      if (!okGenes(gs)) return null;
      return { name: String(o.n || 'Geïmporteerd').slice(0, 40), genes: gs.map((v, i) => clampHard(v, i)), born: o.b | 0 };
    } catch (e) { return null; }
  }

  // ---- Eregalerij: top 20 van alle records (automatisch) ----
  const FAME = 'mazelab.fame', FAME_N = 20;
  function loadFame() { try { const l = JSON.parse(localStorage.getItem(FAME) || '[]'); return Array.isArray(l) ? l.filter(a => a && (a.genes = upGenes(a.genes)) && okGenes(a.genes)) : []; } catch (e) { return []; } }
  // → plaats (1..20) als het erin komt, anders 0
  function addFame(o) {
    const list = loadFame(), key = o.genes.map(v => (+v).toFixed(3)).join();
    if (list.some(a => a.genes.map(v => (+v).toFixed(3)).join() === key)) return 0;
    const e = { id: o.id || newId(), name: o.name, genes: o.genes.map(v => Math.round(v * 1000) / 1000), test: o.test, heavy: o.heavy, gen: o.gen | 0, born: o.born | 0,
      parents: o.parents || [], from: o.from || '', date: today(), run: o.run || '' };
    list.push(e); list.sort((a, b) => b.test - a.test || (b.heavy || 0) - (a.heavy || 0));
    const pos = list.indexOf(e) + 1;
    if (pos > FAME_N) return 0;
    try { localStorage.setItem(FAME, JSON.stringify(list.slice(0, FAME_N))); } catch (e2) { /* geen opslag */ }
    return pos;
  }
  function delFame(id) { try { localStorage.setItem(FAME, JSON.stringify(loadFame().filter(a => a.id !== id))); } catch (e) { /* geen opslag */ } }

  // ---- Bewaarde algoritmes als oplosser (Bouwen, Lab, race, Kijken): ML.SOLVERS krijgt items met evo: true ----
  function solverFn(genes, name) {
    return function* (m, P) {
      const ctx = context(m), w = new ENG.Walker(ctx, genes, 'oplosser|' + name + '|' + (m.s ? m.s.seed : ''));
      while (!w.done) { w.step(); yield { visit: w.nc, front: [] }; }
      const states = w.st.slice(), path = [];
      for (const st of states) { const c = ctx.cellOf[st]; if (path[path.length - 1] !== c) path.push(c); }
      return { found: w.reached, path, states };
    };
  }
  function syncSolvers(list) {
    const S = ML.SOLVERS; if (!S) return;
    for (let i = S.length - 1; i >= 0; i--) if (S[i].evo) S.splice(i, 1);
    (list || loadAlgos()).slice().sort((a, b) => testScore(b.genes).score - testScore(a.genes).score).slice(0, 12).forEach(a => {
      S.push({ id: 'evo-' + a.id, name: '🧬 ' + a.name, desc: `eigen algoritme (testbaan ${testScore(a.genes).score})`, fn: solverFn(a.genes, a.name), evo: true });
    });
    if (ML.onSolversChanged) ML.onSolversChanged();
  }

  ML.Evo = { GENES, PRESETS, TEST, TEST_CATS, HEAVY, Walker, ENGINE_V, context, pack, buildMaze, mazeSpec, specMaze, spName, testScore, testPut, testPart, testCombine, testMazes, heavyScore, heavyReady, bestClassic,
    initPop, evaluate, evalList: ENG.evalList, nextGen, nextGenIslands, assignIslands, Pool, loadFame, addFame, delFame, syncSolvers, solverFn, MAKERS, GRIDS,
    evalOne: ENG.evalOne, genome, nameOf, colorOf, describe, dominant, norm, dnaDist, clamp, clampHard, upGenes, okGenes, randomGenes,
    loadAlgos, saveAlgos, newAlgo, stampHist, toCode, toShort, fromCode, newId, today };
  // eigen algoritmes meteen als oplosser (niet in de Web Worker: daar is geen ML.SOLVERS)
  if (ML.SOLVERS && typeof localStorage !== 'undefined') { try { syncSolvers(); } catch (e) { /* geen opslag */ } }
}); MLDEF[MLDEF.length - 1](window.ML = window.ML || {});
