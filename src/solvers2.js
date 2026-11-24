// Oplossers 2 (v2.5): knooppuntengraaf, bundelzoeken, botsing, micromouse, grenszoeker, zicht, slijmzwam, Q-learning.
// Zelfde vorm als solvers.js (generators met { visit, front } → { found, path, states }).
// Eigen beeld via m.viz (zie render2d vizOf): heat/heat2 per cel, tubes, paths, rays, dots, fog, walls, arrows, chart.
(function (ML) {
  'use strict';
  const TAU = Math.PI * 2;

  // ---- hulp ----
  const viz = (m, o) => (m.viz = Object.assign({ noVisit: true }, o));
  const fail = (path, states) => ({ found: false, path: path || [], states: states || [] });
  const cellsRes = (P, cells, found) => ({ found, path: cells, states: cells.map(c => P.enc(c, 0, 0, 0)) });
  // Cel-graaf zonder sleutels/schakelaars/tijd (P.simple): open randen + teleporters, gericht (eenrichting telt).
  function cellGraph(m, P) {
    const C = m.cells, n = C.length, tp = m.telePartner, adj = new Array(n), radj = Array.from({ length: n }, () => []);
    for (let c = 0; c < n; c++) {
      const a = [];
      for (const nb of C[c].nbrs) if (P.canPass(c, nb, 0, 0, 0)) a.push(nb.c);
      if (tp[c] >= 0) a.push(tp[c]);
      adj[c] = a;
      for (const x of a) radj[x].push(c);
    }
    return { adj, radj };
  }
  function bfsFrom(adj, s, n) {
    const d = new Int32Array(n).fill(-1), par = new Int32Array(n).fill(-1), q = [s];
    d[s] = 0;
    for (let h = 0; h < q.length; h++) { const c = q[h]; for (const x of adj[c]) if (d[x] < 0) { d[x] = d[c] + 1; par[x] = c; q.push(x); } }
    return { d, par, order: q };
  }
  const tracePar = (par, t) => { const p = []; for (let x = t; x !== -1; x = par[x]) p.push(x); return p.reverse(); };
  // loper-pad zonder lussen (zoals walkerTrail in solvers.js)
  function trail(c, s) {
    const cells = [c], st = [s], pos = new Map([[c, 0]]);
    return {
      go(c2, s2) {
        if (pos.has(c2)) { const k = pos.get(c2); for (let i = k + 1; i < cells.length; i++) pos.delete(cells[i]); cells.length = k + 1; st.length = k + 1; st[k] = s2; }
        else { pos.set(c2, cells.length); cells.push(c2); st.push(s2); }
      },
      res(found) { return { found, path: cells.slice(), states: st.slice() }; }
    };
  }
  const fallback = id => (m, P) => { m.viz = null; return ML.SOLVERS.find(x => x.id === id).fn(m, P); };

  // ---- Knooppuntengraaf: gangen tussen kruispunten worden één lijn; Dijkstra over de knooppunten ----
  function* junction(m, P) {
    if (!P.simple) return yield* fallback('astar')(m, P);
    const C = m.cells, n = C.length, tp = m.telePartner, { adj } = cellGraph(m, P);
    const und = Array.from({ length: n }, () => new Set());
    for (let c = 0; c < n; c++) for (const x of adj[c]) { if (tp[c] === x) continue; und[c].add(x); und[x].add(c); }
    const isN = new Uint8Array(n);
    let nn = 0;
    for (let c = 0; c < n; c++) if (und[c].size !== 2 || c === m.start || c === m.goal || tp[c] >= 0) { isN[c] = 1; nn++; }
    const V = viz(m, { heat: new Float32Array(n), heatCol: [46, 196, 182], heat2: new Float32Array(n), heat2Col: [255, 140, 66], paths: [], dots: [] });
    const out = Array.from({ length: n }, () => []);
    let ne = 0;
    for (let c = 0; c < n; c++) {
      if (!isN[c]) continue;
      V.heat[c] = 0.9;
      for (const x of adj[c]) {
        const cells = [c, x];
        let prev = c, cur = x, ok = true;
        if (tp[c] !== x) {
          while (!isN[cur]) {
            let nx = -1;
            for (const y of und[cur]) if (y !== prev) { nx = y; break; }
            if (nx < 0 || !adj[cur].includes(nx)) { ok = false; break; }
            prev = cur; cur = nx; cells.push(cur);
            if (cells.length > n) { ok = false; break; }
          }
        }
        if (!ok) continue;
        out[c].push({ v: cur, len: cells.length - 1, cells });
        ne++;
        V.paths.push({ cells, col: '#2ec4b6', w: 0.08, a: 0.85 });
      }
      yield { visit: c, front: [] };
    }
    V.label = `${n} cellen → ${nn} knooppunten, ${ne} gangen`;
    const dist = new Map([[m.start, 0]]), par = new Map(), done = new Set(), H = new ML.Heap();
    H.push(0, m.start);
    let hit = false;
    while (H.size) {
      const u = H.pop();
      if (done.has(u)) continue;
      done.add(u); V.heat2[u] = 1;
      if (u === m.goal) { hit = true; break; }
      const front = [];
      for (const e of out[u]) {
        const nd = dist.get(u) + e.len;
        if (!dist.has(e.v) || nd < dist.get(e.v)) { dist.set(e.v, nd); par.set(e.v, { u, e }); H.push(nd, e.v); front.push(e.v); }
      }
      V.dots = [{ c: u, col: '#ff8c42', r: 0.24 }];
      yield { visit: u, front };
    }
    V.dots = [];
    if (!hit) return fail();
    const cells = [];
    for (let x = m.goal; par.has(x);) { const { u, e } = par.get(x); cells.unshift(...e.cells.slice(1)); x = u; }
    cells.unshift(m.start);
    return cellsRes(P, cells, true);
  }

  // ---- Bundelzoeken: per laag alleen de K beste (schatting naar doel); mislukt → K × 2 ----
  function* beam(m, P) {
    const n = m.cells.length, out = [];
    const V = viz(m, { heat: new Float32Array(n), heat2: new Float32Array(n), heat2Col: [229, 72, 77], dots: [] });
    for (let K = 2; K <= 8192; K *= 2) {
      V.heat.fill(0); V.heat2.fill(0);
      const prev = new Map([[P.start, -1]]);
      let layer = [P.start], depth = 0, cut = false;
      while (layer.length) {
        const next = [];
        for (const s of layer) {
          P.succ(s, out);
          for (const t of out) if (!prev.has(t)) {
            prev.set(t, s); next.push(t);
            if (P.isGoal(t)) { V.dots = []; V.label = `bundel ${K}: gevonden na ${depth + 1} lagen`; const r = ML.traceStates(prev, t, P); r.found = true; return r; }
          }
        }
        next.sort((a, b) => P.h(a) - P.h(b));
        for (let i = K; i < next.length; i++) { V.heat2[P.cell(next[i])] = 1; cut = true; }
        layer = next.slice(0, K); depth++;
        V.dots = layer.slice(0, 24).map(s => ({ c: P.cell(s), col: '#ff8c42', r: 0.16 }));
        V.label = `bundel ${K} · laag ${depth} · rood = weggegooid`;
        for (const s of layer) { V.heat[P.cell(s)] = 1; yield { visit: P.cell(s), front: [] }; }
      }
      V.label = `bundel ${K} te smal → opnieuw met ${K * 2}`;
      if (!cut) break; // niets weggegooid: echt geen route
    }
    V.dots = [];
    return fail();
  }

  // ---- Botsingsoplosser: twee golven (start/doel), waar ze botsen ligt de route ----
  function* collision(m, P) {
    if (!P.simple) return yield* fallback('bfs')(m, P);
    const n = m.cells.length, { adj, radj } = cellGraph(m, P);
    const dA = new Int32Array(n).fill(-1), dB = new Int32Array(n).fill(-1), pA = new Int32Array(n).fill(-1), pB = new Int32Array(n).fill(-1);
    const V = viz(m, { heat: new Float32Array(n), heatCol: [62, 123, 250], heat2: new Float32Array(n), heat2Col: [229, 72, 77], dots: [] });
    dA[m.start] = 0; dB[m.goal] = 0; V.heat[m.start] = 1; V.heat2[m.goal] = 1;
    let fA = [m.start], fB = [m.goal], meet = m.start === m.goal ? m.goal : -1, wave = 0;
    while (meet < 0 && (fA.length || fB.length)) {
      wave++;
      for (const side of [0, 1]) {
        if (meet >= 0) break;
        const fr = side ? fB : fA, d = side ? dB : dA, p = side ? pB : pA, other = side ? dA : dB, H = side ? V.heat2 : V.heat, G = side ? radj : adj, nx = [];
        for (const c of fr) {
          const front = [];
          for (const x of G[c]) if (d[x] < 0) {
            d[x] = d[c] + 1; p[x] = c; nx.push(x); front.push(x); H[x] = 1;
            if (other[x] >= 0 && meet < 0) meet = x;
          }
          yield { visit: c, front, side };
          if (meet >= 0) break;
        }
        if (side) fB = nx; else fA = nx;
      }
      V.label = `golf ${wave} · blauw vanaf start, rood vanaf doel`;
    }
    if (meet < 0) return fail();
    V.dots = [{ c: meet, col: '#ffffff', r: 0.34 }];
    V.label = `botsing na ${wave} golven`;
    const path = tracePar(pA, meet);
    for (let x = pB[meet]; x !== -1; x = pB[x]) path.push(x);
    return cellsRes(P, path, true);
  }

  // ---- Verkenners: weten niets, ontdekken muren onderweg ----
  // kennis: kw[wand] 0 = onbekend, 1 = open gezien, 2 = dicht gezien; telK[c] = teleporter gezien
  function explorer(m, P) {
    const C = m.cells, n = C.length, tp = m.telePartner;
    const kw = new Uint8Array(m.walls.length), seen = new Uint8Array(n), vis = new Uint8Array(n), telK = new Uint8Array(n);
    return {
      kw, seen, vis, telK,
      sense(c) {
        vis[c] = seen[c] = 1;
        for (const nb of C[c].nbrs) { const ok = P.canPass(c, nb, 0, 0, 0); kw[nb.w] = ok ? 1 : 2; if (ok) seen[nb.c] = 1; }
        if (tp[c] >= 0) { telK[c] = 1; seen[tp[c]] = 1; }
      },
      // bekende open doorgangen vanuit c
      known(c, outA) { outA.length = 0; for (const nb of C[c].nbrs) if (kw[nb.w] === 1 && P.canPass(c, nb, 0, 0, 0)) outA.push(nb.c); if (telK[c]) outA.push(tp[c]); return outA; }
    };
  }
  const wallMarks = (m, kw) => { const w = new Uint8Array(kw.length); for (let i = 0; i < kw.length; i++) if (kw[i] === 2 && !m.walls[i].open) w[i] = 2; return w; };

  // Micromouse: denkt dat alles open is, rekent afstanden vanaf het doel, ontdekt muren, rekent opnieuw.
  function* micromouse(m, P) {
    if (!P.simple) return yield* fallback('astar')(m, P);
    const C = m.cells, n = C.length, tp = m.telePartner, E = explorer(m, P), cap = n * 10;
    const V = viz(m, { heat: new Float32Array(n), heatCol: [90, 169, 255], fog: E.seen, dots: [] });
    let c = m.start, steps = 0, replans = 0;
    const tr = trail(c, P.enc(c, 0, 0, 0)), d = new Int32Array(n), q = new Int32Array(n);
    while (c !== m.goal && steps < cap) {
      E.sense(c);
      // achteruit-BFS vanaf het doel over 'wat zou kunnen': onbekende wand = open, gezien dicht = dicht
      d.fill(-1); d[m.goal] = 0; q[0] = m.goal;
      let qn = 1, mx = 1;
      for (let h = 0; h < qn; h++) {
        const y = q[h];
        for (const nb of C[y].nbrs) {
          const x = nb.c;
          if (d[x] >= 0 || E.kw[nb.w] === 2) continue;
          d[x] = d[y] + 1; if (d[x] > mx) mx = d[x]; q[qn++] = x;
        }
        if (tp[y] >= 0 && E.telK[tp[y]] && d[tp[y]] < 0) { d[tp[y]] = d[y] + 1; q[qn++] = tp[y]; }
      }
      for (let i = 0; i < n; i++) V.heat[i] = d[i] < 0 ? 0 : 0.85 * (1 - d[i] / (mx + 1)) + 0.1;
      let best = -1, bd = 1e9;
      for (const nb of C[c].nbrs) if (P.canPass(c, nb, 0, 0, 0) && d[nb.c] >= 0 && d[nb.c] < bd) { bd = d[nb.c]; best = nb.c; }
      if (tp[c] >= 0 && d[tp[c]] >= 0 && d[tp[c]] < bd) { bd = d[tp[c]]; best = tp[c]; }
      if (best < 0) break;
      if (bd >= d[c]) replans++;
      c = best; steps++;
      tr.go(c, P.enc(c, 0, 0, 0));
      V.walls = wallMarks(m, E.kw);
      V.label = `stappen ${steps} · schatting ${bd} · ${replans}× opnieuw gerekend`;
      yield { visit: c, front: [] };
    }
    return tr.res(c === m.goal);
  }

  // Grenszoeker: steeds naar de dichtstbijzijnde rand van het onbekende; doel gezien → erheen.
  function* frontier(m, P) {
    if (!P.simple) return yield* fallback('bfs')(m, P);
    const n = m.cells.length, E = explorer(m, P), cap = n * 10, nb = [];
    const V = viz(m, { heat: new Float32Array(n), heatCol: [46, 196, 182], fog: E.seen, paths: [], dots: [] });
    let c = m.start, steps = 0;
    const tr = trail(c, P.enc(c, 0, 0, 0)), par = new Int32Array(n), dd = new Int32Array(n);
    while (c !== m.goal && steps < cap) {
      E.sense(c); V.heat[c] = 0.55;
      par.fill(-1); dd.fill(-1); dd[c] = 0;
      const q = [c];
      let t = -1;
      for (let h = 0; h < q.length; h++) {
        const x = q[h];
        if (x === m.goal) { t = x; break; }
        for (const y of E.known(x, nb)) if (dd[y] < 0) { dd[y] = dd[x] + 1; par[y] = x; q.push(y); }
      }
      const toGoal = t >= 0;
      if (!toGoal) for (const x of q) if (!E.vis[x]) { t = x; break; } // q is BFS-volgorde → eerste = dichtstbij
      if (t < 0) break;
      const p = tracePar(par, t);
      V.paths = [{ cells: p, col: '#2ec4b6', w: 0.1, dash: true }];
      c = p[1]; steps++;
      tr.go(c, P.enc(c, 0, 0, 0));
      V.walls = wallMarks(m, E.kw);
      V.label = `stappen ${steps} · ${toGoal ? 'doel gezien → erheen' : 'naar de dichtstbijzijnde rand van het onbekende'}`;
      yield { visit: c, front: [] };
    }
    V.paths = [];
    return tr.res(c === m.goal);
  }

  // Zicht: kijkt elke rechte gang tot het eind in; doel in zicht → rent erheen.
  // Rechtdoor = buur waarvan de hoek het minst afwijkt (< ~26°), dus ook op zeshoek/ringen.
  function* vision(m, P) {
    if (!P.simple) return yield* fallback('dfs')(m, P);
    const C = m.cells, n = C.length, tp = m.telePartner, cap = n * 10, TOL = 0.45;
    const seen = new Uint8Array(n), vis = new Uint8Array(n), kE = new Set();
    const V = viz(m, { heat: new Float32Array(n), heatCol: [255, 209, 102], fog: seen, rays: [], paths: [], dots: [] });
    const angDiff = (a, b) => { const d = Math.abs(((a - b) % TAU + TAU) % TAU); return Math.min(d, TAU - d); };
    const ray = (c, nb0) => {
      const cells = [c];
      let x = c, nb = nb0;
      for (let k = 0; k < 80 && nb; k++) {
        kE.add(x * n + nb.c); x = nb.c; cells.push(x); seen[x] = 1;
        const a = nb.ang; let best = null, bd = TOL;
        for (const nb2 of C[x].nbrs) { const v = angDiff(nb2.ang, a); if (v < bd && P.canPass(x, nb2, 0, 0, 0) && !m.walls[nb2.w].wrap) { bd = v; best = nb2; } }
        nb = best;
      }
      return cells;
    };
    const look = c => {
      seen[c] = 1; V.rays = [];
      for (const nb of C[c].nbrs) if (P.canPass(c, nb, 0, 0, 0)) V.rays.push(ray(c, nb));
      if (tp[c] >= 0) { seen[tp[c]] = 1; kE.add(c * n + tp[c]); }
    };
    const fresh = cells => { let k = 0; for (const x of cells) if (!vis[x]) k++; return k; };
    let c = m.start, steps = 0;
    const stack = [c], tr = trail(c, P.enc(c, 0, 0, 0));
    while (c !== m.goal && steps < cap) {
      vis[c] = 1; V.heat[c] = 0.5; look(c);
      let nx = -1;
      if (seen[m.goal]) { // BFS over geziene doorgangen
        const par = new Int32Array(n).fill(-1), q = [c]; par[c] = c;
        for (let h = 0; h < q.length && par[m.goal] < 0; h++) {
          const x = q[h];
          for (const nb of C[x].nbrs) if (par[nb.c] < 0 && kE.has(x * n + nb.c)) { par[nb.c] = x; q.push(nb.c); }
          if (tp[x] >= 0 && par[tp[x]] < 0 && kE.has(x * n + tp[x])) { par[tp[x]] = x; q.push(tp[x]); }
        }
        if (par[m.goal] >= 0) {
          const p = [m.goal]; while (p[0] !== c) p.unshift(par[p[0]]);
          V.paths = [{ cells: p, col: '#c8322f', w: 0.13, dash: true }];
          nx = p[1]; V.label = `stappen ${steps + 1} · doel in zicht!`;
        }
      }
      if (nx < 0) {
        let bv = -1;
        for (let i = 0; i < V.rays.length; i++) { const r = V.rays[i]; if (!vis[r[1]]) { const v = fresh(r); if (v > bv) { bv = v; nx = r[1]; } } }
        if (nx < 0 && tp[c] >= 0 && !vis[tp[c]]) nx = tp[c];
        if (nx >= 0) stack.push(nx);
        else { stack.pop(); if (!stack.length) break; nx = stack[stack.length - 1]; }
        V.label = `stappen ${steps + 1} · kijkt elke gang tot het eind in`;
      }
      c = nx; steps++;
      tr.go(c, P.enc(c, 0, 0, 0));
      V.dots = [{ c, col: '#ffd166', r: 0.2 }];
      yield { visit: c, front: [] };
    }
    V.rays = []; V.paths = []; V.dots = [];
    return tr.res(c === m.goal);
  }

  // ---- Slijmzwam (Tero-model): buisjes met veel stroming worden dikker, de rest sterft af ----
  // Drukken per ronde met CG (gewogen Laplace, doel = 0, instroom 1 bij start); Gauss-Seidel convergeert niet op groot doolhof.
  function* physarum(m, P) {
    if (!P.simple) return yield* fallback('bfs')(m, P);
    const n = m.cells.length, { adj } = cellGraph(m, P), V = viz(m, { noVisit: false, tubes: [] });
    // 1. uitspreiden (zichtbaar als bezochte cellen)
    const reach = bfsFrom(adj, m.start, n);
    for (const c of reach.order) yield { visit: c, front: [] };
    if (reach.d[m.goal] < 0) return fail();
    // 2. buizen = ongerichte paren tussen bereikbare cellen
    const E = [], key = new Set(), inc = Array.from({ length: n }, () => []);
    for (const a of reach.order) for (const b of adj[a]) {
      if (reach.d[b] < 0) continue;
      const k = Math.min(a, b) * n + Math.max(a, b);
      if (key.has(k)) continue;
      key.add(k); inc[a].push(E.length); inc[b].push(E.length);
      const w = ML.edge(m, a, b);
      E.push([a, b]); V.tubes.push({ a, b, w: 1, ok: !!w && !w.wrap && !w.stair });
    }
    const ne = E.length, ea = Int32Array.from(E, e => e[0]), eb = Int32Array.from(E, e => e[1]), D = new Float64Array(ne).fill(1), p = new Float64Array(n), rv = new Float64Array(n), dv = new Float64Array(n), qv = new Float64Array(n);
    const s0 = m.start, g0 = m.goal;
    const Ap = (x, o) => { o.fill(0); for (let e = 0; e < ne; e++) { const a = ea[e], b = eb[e], f = D[e] * (x[a] - x[b]); o[a] += f; o[b] -= f; } o[g0] = 0; };
    const solve = () => { // warme start met vorige p
      p[g0] = 0; Ap(p, qv);
      let rr0 = 0;
      for (let i = 0; i < n; i++) { rv[i] = (i === s0 ? 1 : 0) - qv[i]; }
      rv[g0] = 0;
      for (let i = 0; i < n; i++) { dv[i] = rv[i]; rr0 += rv[i] * rv[i]; }
      for (let k = 0; k < 400 && rr0 > 1e-10; k++) {
        Ap(dv, qv);
        let dq = 0; for (let i = 0; i < n; i++) dq += dv[i] * qv[i];
        if (dq <= 0) break;
        const al = rr0 / dq; let rr1 = 0;
        for (let i = 0; i < n; i++) { p[i] += al * dv[i]; rv[i] -= al * qv[i]; rr1 += rv[i] * rv[i]; }
        const be = rr1 / rr0;
        for (let i = 0; i < n; i++) dv[i] = rv[i] + be * dv[i];
        dv[g0] = 0; rr0 = rr1;
      }
    };
    V.noVisit = true;
    for (let it = 0; it < 150; it++) {
      solve();
      let ch = 0;
      for (let e = 0; e < ne; e++) {
        const Q = Math.abs(D[e] * (p[ea[e]] - p[eb[e]])), nd = Math.max(1e-5, D[e] + 0.35 * (Q - D[e]));
        ch = Math.max(ch, Math.abs(nd - D[e])); D[e] = nd; V.tubes[e].w = Math.min(1, nd);
      }
      V.label = `ronde ${it + 1} · dikke buizen = veel stroming`;
      yield { visit: s0, front: [] };
      if (it > 25 && ch < 2e-3) break;
    }
    // route = goedkoopste pad met kosten 1/D (dikke buis = goedkoop)
    const dist = new Float64Array(n).fill(Infinity), par = new Int32Array(n).fill(-1), H = new ML.Heap();
    dist[s0] = 0; H.push(0, s0);
    while (H.size) {
      const u = H.pop();
      if (u === g0) break;
      for (const e of inc[u]) {
        const v = E[e][0] === u ? E[e][1] : E[e][0];
        if (!adj[u].includes(v)) continue;
        const nd = dist[u] + 1 / (D[e] + 1e-6);
        if (nd < dist[v]) { dist[v] = nd; par[v] = u; H.push(nd, v); }
      }
    }
    if (par[g0] < 0 && g0 !== s0) return fail();
    const path = tracePar(par, g0);
    V.label = `de slijmzwam koos een route van ${path.length - 1} stappen`;
    return cellsRes(P, path, true);
  }

  // ---- Q-learning: leert per toestand welke zet het beste is; pijltjes worden ronde na ronde beter ----
  // Werkt op de echte toestanden (sleutels, hendels, tijd tellen mee). Laatste rondes zonder toeval.
  function* qlearn(m, P) {
    const n = m.cells.length, rng = ML.makeRng('qlearn'), ROUNDS = 20, GREEDY = 3, cap = Math.max(2000, n * 6 * P.T);
    const Q = new Map(), mvC = new Map(), seenT = new Set(), trans = [];
    const V = viz(m, { heat: new Float32Array(n), heatCol: [200, 50, 47], arrows: new Float32Array(n).fill(NaN), chart: { vals: [], label: 'stappen per ronde' }, dots: [] });
    const movesOf = s => { let r = mvC.get(s); if (!r) { r = P.moves(s); mvC.set(s, r); } return r; };
    // nooit geprobeerde zet = NaN en telt als OPT: tijdens leren 0 (optimistisch → nieuwsgierig), in de slotrondes 'slecht'
    let OPT = 0;
    const qOf = s => { let r = Q.get(s); if (!r) { r = new Float32Array(movesOf(s).length).fill(NaN); Q.set(s, r); } return r; };
    const best = s => { const q = qOf(s); let bi = 0, bv = -Infinity; for (let i = 0; i < q.length; i++) { const v = (q[i] === q[i] ? q[i] : OPT) + rng() * 1e-6; if (v > bv) { bv = v; bi = i; } } return bi; };
    const target = s2 => { // -1 per zet + beste waarde daarna
      if (P.isGoal(s2)) return -1;
      const q2 = qOf(s2); let mq = -Infinity;
      for (let j = 0; j < q2.length; j++) { const v = q2[j] === q2[j] ? q2[j] : OPT; if (v > mq) mq = v; }
      return -1 + 0.99 * (mq === -Infinity ? -1e4 : mq);
    };
    const learn = (s, i, s2, a) => { const q = qOf(s), t = target(s2), o = q[i]; q[i] = o === o ? o + a * (t - o) : t; return o === o ? Math.abs(q[i] - o) : 1; };
    const arrow = s => { const bm = movesOf(s)[best(s)]; V.arrows[P.cell(s)] = bm.kind === 'step' || bm.kind === 'stair' ? bm.ang : NaN; };
    // terugspelen: alle bekende zetten achterstevoren tot de waarden stilstaan (deterministisch doolhof → exact)
    const replay = () => {
      for (let sw = 0; sw < 80; sw++) { let ch = 0; for (let j = trans.length - 3; j >= 0; j -= 3) ch = Math.max(ch, learn(trans[j], trans[j + 1], trans[j + 2], 1)); if (ch < 1e-3) break; }
      for (let j = 0; j < trans.length; j += 3) arrow(trans[j]);
    };
    let last = null;
    for (let ep = 1; ep <= ROUNDS; ep++) {
      const fin = ep > ROUNDS - GREEDY;
      if (fin && OPT === 0) { OPT = -1e4; replay(); }
      const eps = fin ? 0 : 0.05, tr = trail(m.start, P.start), loop = fin ? new Set() : null;
      let s = P.start, k = 0;
      V.heat.fill(0);
      while (!P.isGoal(s) && k < cap) {
        const mv = movesOf(s);
        if (!mv.length) break;
        if (loop) { if (loop.has(s)) break; loop.add(s); }
        const i = rng() < eps ? Math.floor(rng() * mv.length) : best(s), s2 = mv[i].s2, key = s * 16 + i;
        learn(s, i, s2, 0.6);
        if (!seenT.has(key)) { seenT.add(key); trans.push(s, i, s2); }
        arrow(s);
        s = s2; k++;
        const c2 = P.cell(s);
        V.heat[c2] = Math.min(1, V.heat[c2] + 0.3);
        tr.go(c2, s);
        V.dots = [{ c: c2, col: '#c8322f', r: 0.2 }];
        V.label = `ronde ${ep}/${ROUNDS}${fin ? ' (alleen wat hij weet)' : ''} · ${k} stappen${V.chart.vals.length ? ' · vorige ' + V.chart.vals[V.chart.vals.length - 1] : ''}`;
        yield { visit: c2, front: [] };
      }
      V.chart.vals.push(k);
      last = tr.res(P.isGoal(s));
      replay();
    }
    V.dots = [];
    const vals = V.chart.vals;
    V.label = `van ${vals[0]} naar ${vals[vals.length - 1]} stappen`;
    return last || fail();
  }


  ML.SOLVERS.push(
    { id: 'junction', name: 'Knooppuntengraaf', desc: 'gangen worden lijnen tussen kruispunten (zonder sleutels/schakelaars/tijd)', fn: junction },
    { id: 'beam', name: 'Bundelzoeken', desc: 'houdt per laag de N beste; mislukt → bundel ×2', fn: beam },
    { id: 'collision', name: 'Botsingsoplosser', desc: 'twee golven vanaf start en doel (zonder sleutels/schakelaars/tijd)', fn: collision },
    { id: 'micromouse', name: 'Micromouse', desc: 'robotmuis: schat afstanden, ontdekt muren (zonder sleutels/schakelaars/tijd)', fn: micromouse },
    { id: 'frontier', name: 'Grenszoeker', desc: 'naar de dichtstbijzijnde rand van het onbekende (zonder sleutels/schakelaars/tijd)', fn: frontier },
    { id: 'vision', name: 'Zicht', desc: 'kijkt elke rechte gang tot het eind in (zonder sleutels/schakelaars/tijd)', fn: vision },
    { id: 'physarum', name: 'Slijmzwam', desc: 'buisjes met stroming groeien, de rest sterft af (zonder sleutels/schakelaars/tijd)', fn: physarum },
    { id: 'qlearn', name: 'Q-learning', desc: 'leert in 20 rondes welke kant het beste is', fn: qlearn }
  );
})(window.ML = window.ML || {});
