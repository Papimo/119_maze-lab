// Lussen, start/doel, terrein, puzzel-elementen (sleutels+deuren, schakelaars, getimede deuren,
// eenrichting, teleporters) en het zoekprobleem dat alle oplossers gebruiken.
(function (ML) {
  'use strict';

  const openCount = (m, c) => { let k = 0; for (const nb of m.cells[c].nbrs) if (m.walls[nb.w].open) k++; return k; };
  ML.openCount = openCount;

  function bfsDist(m, from, pass) {
    const n = m.cells.length, d = new Int32Array(n).fill(-1), q = [from];
    d[from] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      for (const nb of m.cells[c].nbrs)
        if (d[nb.c] < 0 && pass(m.walls[nb.w], c)) { d[nb.c] = d[c] + 1; q.push(nb.c); }
      const t = m.telePartner[c];
      if (t >= 0 && d[t] < 0) { d[t] = d[c] + 1; q.push(t); }
    }
    return d;
  }
  const argmax = d => { let b = 0; for (let i = 1; i < d.length; i++) if (d[i] > d[b]) b = i; return b; };

  // Lussen: doodlopende stukken openbreken → meerdere routes. (Geen extra trappen.)
  ML.braid = function (m, rng, p) {
    if (p <= 0) return;
    const ends = [];
    for (let i = 0; i < m.cells.length; i++) if (openCount(m, i) === 1) ends.push(i);
    rng.shuffle(ends);
    for (const c of ends) {
      if (openCount(m, c) !== 1 || rng() >= p) continue;
      const closed = m.cells[c].nbrs.filter(nb => { const w = m.walls[nb.w]; return !w.open && !w.stair && !w.lock && !w.bridge; });
      if (!closed.length) continue;
      const pref = closed.filter(nb => openCount(m, nb.c) === 1);
      m.walls[rng.pick(pref.length ? pref : closed).w].open = true;
    }
  };

  // Start en doel zo ver mogelijk uit elkaar.
  ML.placeEnds = function (m, rng) {
    const pass = w => w.open;
    m.start = argmax(bfsDist(m, rng.int(m.cells.length), pass));
    m.goal = argmax(bfsDist(m, m.start, pass));
  };

  // Terrein in vlekken: modder, water, ijs. pct 0..100 → tot ~60% van de cellen.
  ML.placeTerrain = function (m, rng, pct) {
    const n = m.cells.length, T = m.terrain;
    T.fill(0); m.cost.fill(1);
    let placed = 0;
    if (pct > 0) {
      const target = Math.round(n * Math.min(0.6, pct / 100 * 0.6));
      for (let guard = 0; placed < target && guard < n * 2; guard++) {
        const s = rng.int(n);
        if (T[s]) continue;
        const type = 1 + rng.int(3), size = 3 + rng.int(10), q = [s];
        T[s] = type; placed++;
        for (let h = 0; h < q.length && q.length < size; h++)
          for (const nb of rng.shuffle(m.cells[q[h]].nbrs.slice())) {
            if (q.length >= size || T[nb.c] || m.walls[nb.w].stair) continue;
            T[nb.c] = type; q.push(nb.c); placed++;
          }
      }
    }
    let minC = 1;
    for (let i = 0; i < n; i++) { m.cost[i] = ML.TERRAIN[T[i]].cost; if (m.cost[i] < minC) minC = m.cost[i]; }
    m.minCost = minC; m.weighted = placed > 0;
  };

  function cellPath(m) {
    const n = m.cells.length, prev = new Int32Array(n).fill(-2), q = [m.start];
    prev[m.start] = -1;
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (c === m.goal) break;
      const push = x => { if (prev[x] === -2) { prev[x] = c; q.push(x); } };
      for (const nb of m.cells[c].nbrs) if (m.walls[nb.w].open) push(nb.c);
      if (m.telePartner[c] >= 0) push(m.telePartner[c]);
    }
    if (prev[m.goal] === -2) return [];
    const p = [];
    for (let x = m.goal; x !== -1; x = prev[x]) p.push(x);
    return p.reverse();
  }
  // Muren die een cellenroute doorloopt (geen teleport/wachten).
  function pathWalls(m, path) {
    const out = [];
    for (let i = 0; i + 1 < path.length; i++) {
      if (path[i] === path[i + 1]) continue;
      const w = ML.edge(m, path[i], path[i + 1]);
      if (w) out.push(w);
    }
    return out;
  }

  // Toestand = cel × tijd (mod periode) × schakelaars (bits) × sleutels (bits), als één getal.
  // Elke stap = 1 tik. Met getimede deuren mag je ook wachten (stap op de plek).
  ML.makeProblem = function (m) {
    const cells = m.cells, walls = m.walls, keyAt = m.keyAt, swAt = m.switchAt, tp = m.telePartner, costA = m.cost;
    const K = m.keys.length, KM = 1 << K, SN = m.switches.length, SM = 1 << SN;
    const T = m.timed.length ? m.period : 1, n = cells.length, per = KM * SM * T;
    const enc = (c, t, sw, k) => ((c * T + t) * SM + sw) * KM + k;
    const dec = s => {
      const k = s % KM; let r = (s - k) / KM;
      const sw = r % SM; r = (r - sw) / SM;
      const t = r % T;
      return { c: (r - t) / T, t, sw, k };
    };
    const cellOf = s => Math.floor(s / per);
    const timedOpen = (w, t) => ((t + w.timed.phase) % m.period) < w.timed.open;
    const canPass = (c, nb, k, sw, t) => {
      const w = walls[nb.w];
      if (!w.open) return false;
      if (w.door !== null && !((k >> w.door) & 1)) return false;
      if (w.oneway !== null && w.oneway !== c) return false;
      if (w.sw !== null && (((sw >> w.sw) & 1) === 1) === w.swInv) return false;
      if (w.timed && !timedOpen(w, t)) return false;
      return true;
    };
    const enter = (c2, t, sw, k) => {
      const kk = keyAt[c2] >= 0 ? k | (1 << keyAt[c2]) : k;
      const ss = swAt[c2] >= 0 ? sw ^ (1 << swAt[c2]) : sw;
      return enc(c2, (t + 1) % T, ss, kk);
    };
    const g = cells[m.goal].lc, step = m.maxStep * (m.bridges && m.bridges.length ? 2 : 1), tel = m.teleporters, minC = m.minCost, tor = m.torus;
    const dist = (a, b) => {
      let dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1]);
      if (tor) { dx = Math.min(dx, tor.w - dx); dy = Math.min(dy, tor.h - dy); }
      return Math.hypot(dx, dy);
    };
    return {
      T, KM, SM, N: n * per, enc, dec, cell: cellOf, canPass, timedOpen,
      weighted: !!m.weighted, simple: K === 0 && SN === 0 && T === 1,
      start: enc(m.start, 0, 0, 0),
      isGoal: s => cellOf(s) === m.goal,
      succ(s, out, cost) {
        out.length = 0; if (cost) cost.length = 0;
        const { c, t, sw, k } = dec(s);
        for (const nb of cells[c].nbrs) if (canPass(c, nb, k, sw, t)) { out.push(enter(nb.c, t, sw, k)); if (cost) cost.push(costA[nb.c]); }
        const tt = tp[c];
        if (tt >= 0) { out.push(enter(tt, t, sw, k)); if (cost) cost.push(1); }
        if (T > 1) { out.push(enc(c, (t + 1) % T, sw, k)); if (cost) cost.push(1); }
        return out;
      },
      // Voor lopers (muurvolger, Trémaux, speler): zetten met richting en soort.
      moves(s) {
        const { c, t, sw, k } = dec(s), res = [];
        for (const nb of cells[c].nbrs) if (canPass(c, nb, k, sw, t))
          res.push({ c: nb.c, w: nb.w, ang: nb.ang, s2: enter(nb.c, t, sw, k), kind: walls[nb.w].stair ? 'stair' : 'step' });
        if (tp[c] >= 0) res.push({ c: tp[c], w: -1, ang: 0, s2: enter(tp[c], t, sw, k), kind: 'tele' });
        if (T > 1) res.push({ c, w: -1, ang: 0, s2: enc(c, (t + 1) % T, sw, k), kind: 'wait' });
        return res;
      },
      h(s) { // ondergrens van de kosten (A*/gretig); verdiepingen tellen niet mee
        const c = cells[cellOf(s)].lc;
        let best = dist(c, g);
        for (const t of tel) {
          const A = cells[t.a].lc, B = cells[t.b].lc;
          best = Math.min(best, dist(c, A) + dist(B, g), dist(c, B) + dist(A, g));
        }
        return best / step * minC;
      }
    };
  };

  function traceStates(prev, s, P) {
    const states = [];
    for (let x = s; x !== -1; x = prev.get(x)) states.push(x);
    states.reverse();
    return { path: states.map(P.cell), states };
  }
  ML.traceStates = traceStates;

  // Is het doel bereikbaar? (snel, breedte-eerst)
  ML.canSolve = function (P) {
    const big = P.N > 5e7, seen = big ? new Set([P.start]) : new Uint8Array(P.N), q = [P.start], out = [];
    if (!big) seen[P.start] = 1;
    for (let h = 0; h < q.length; h++) {
      const s = q[h];
      if (P.isGoal(s)) return true;
      P.succ(s, out);
      for (const t of out) {
        if (big ? seen.has(t) : seen[t]) continue;
        if (big) seen.add(t); else seen[t] = 1;
        q.push(t);
      }
    }
    return false;
  };

  // Goedkoopste oplossing (Dijkstra) → { path, states, cost } of null.
  ML.solvePath = function (P) {
    const dist = new Map([[P.start, 0]]), prev = new Map([[P.start, -1]]), done = new Set(), H = new ML.Heap(), out = [], cst = [];
    H.push(0, P.start);
    while (H.size) {
      const s = H.pop();
      if (done.has(s)) continue;
      done.add(s);
      const d = dist.get(s);
      if (P.isGoal(s)) { const r = traceStates(prev, s, P); r.cost = d; return r; }
      P.succ(s, out, cst);
      for (let i = 0; i < out.length; i++) {
        const t = out[i], nd = d + cst[i];
        if (!dist.has(t) || nd < dist.get(t)) { dist.set(t, nd); prev.set(t, s); H.push(nd, t); }
      }
    }
    return null;
  };

  // Welke cellen zijn bereikbaar, en na hoeveel stappen (eerste keer)?
  ML.exploreCells = function (P, n) {
    const depth = new Int32Array(n).fill(-1), dS = new Map([[P.start, 0]]), q = [P.start], out = [];
    depth[P.cell(P.start)] = 0;
    for (let h = 0; h < q.length; h++) {
      const s = q[h], d = dS.get(s);
      P.succ(s, out);
      for (const t of out) if (!dS.has(t)) {
        dS.set(t, d + 1); q.push(t);
        const c = P.cell(t);
        if (depth[c] < 0) depth[c] = d + 1;
      }
    }
    return depth;
  };

  ML.placePuzzle = function (m, rng, o) {
    const n = m.cells.length;
    m.keys = []; m.keyAt.fill(-1); m.teleporters = []; m.telePartner.fill(-1); m.doors = []; m.oneways = [];
    m.switches = []; m.switchAt.fill(-1); m.swDoors = []; m.timed = [];
    for (const w of m.walls) { w.door = null; w.oneway = null; w.sw = null; w.swInv = false; w.timed = null; }
    const used = new Set([m.start, m.goal]);
    const busy = w => w.b === null || w.stair || w.bridge || w.door !== null || w.sw !== null || w.timed || w.oneway !== null;

    // Teleporters: bij voorkeur in doodlopende hoekjes.
    const pool = [];
    for (let i = 0; i < n; i++) if (!used.has(i) && openCount(m, i) === 1) pool.push(i);
    rng.shuffle(pool);
    let pi = 0;
    const take = () => {
      while (pi < pool.length) { const c = pool[pi++]; if (!used.has(c)) { used.add(c); return c; } }
      for (let t = 0; t < n * 2; t++) { const c = rng.int(n); if (!used.has(c)) { used.add(c); return c; } }
      return -1;
    };
    const TP = Math.min(o.teleports | 0, Math.floor((n - 2) / 2));
    for (let t = 0; t < TP; t++) {
      const a = take(), b = take();
      if (a < 0 || b < 0) break;
      m.teleporters.push({ a, b }); m.telePartner[a] = b; m.telePartner[b] = a;
    }

    // Deuren op de route, sleutel k ligt altijd vóór deur k (eventueel achter eerdere deuren).
    const K0 = Math.min(o.keys | 0, ML.KEY_COLORS.length);
    if (K0 > 0) {
      const cp = cellPath(m), pathSet = new Set(cp), pw = pathWalls(m, cp).filter(w => !w.stair && !w.bridge).map(w => w.i);
      const K = Math.min(K0, Math.max(0, pw.length - 1));
      for (let k = 0; k < K; k++) m.walls[pw[Math.floor((k + 1) * pw.length / (K + 1))]].door = k;
      for (let k = 0; k < K; k++) {
        const d = bfsDist(m, m.start, w => w.open && (w.door === null || w.door < k));
        let best = -1, score = -1;
        for (let i = 0; i < n; i++) {
          if (d[i] < 0 || used.has(i)) continue;
          const s = d[i] + (pathSet.has(i) ? 0 : n) + (openCount(m, i) === 1 ? n : 0);
          if (s > score) { score = s; best = i; }
        }
        if (best < 0) { for (const w of m.walls) if (w.door !== null && w.door >= k) w.door = null; break; }
        m.keys.push({ cell: best, color: ML.KEY_COLORS[k] });
        m.keyAt[best] = k; used.add(best);
      }
      m.doors = m.walls.filter(w => w.door !== null).map(w => w.i);
    }

    // Schakelaars: hendel j opent deur(en) j op de route en sluit 1–2 andere gangen (val).
    const SN = Math.min(o.switches | 0, ML.SWITCH_COLORS.length);
    for (let j = 0; j < SN; j++) {
      const sol = ML.solvePath(ML.makeProblem(m));
      if (!sol) break;
      const pws = pathWalls(m, sol.path).filter(w => !busy(w));
      if (pws.length < 2) break;
      const w = pws[Math.min(pws.length - 1, Math.floor(pws.length * (0.35 + 0.5 * rng())))];
      w.sw = j; w.swInv = false;
      m.switches.push({ cell: -1, color: ML.SWITCH_COLORS[j] });
      const depth = ML.exploreCells(ML.makeProblem(m), n), onPath = new Set(sol.path);
      let best = -1, score = -1;
      for (let i = 0; i < n; i++) {
        if (depth[i] < 0 || used.has(i) || m.telePartner[i] >= 0) continue;
        const s = depth[i] + (onPath.has(i) ? 0 : n) + (openCount(m, i) === 1 ? n : 0);
        if (s > score) { score = s; best = i; }
      }
      if (best < 0) { w.sw = null; m.switches.pop(); break; }
      m.switches[j].cell = best; m.switchAt[best] = j; used.add(best);
      if (!ML.canSolve(ML.makeProblem(m))) { w.sw = null; m.switchAt[best] = -1; m.switches.pop(); break; }
      const pathIdx = new Set(pathWalls(m, sol.path).map(x => x.i));
      const others = rng.shuffle(m.walls.filter(x => x.open && !busy(x) && !pathIdx.has(x.i)));
      let added = 0;
      for (let t = 0; t < Math.min(others.length, 8) && added < 2; t++) {
        const x = others[t];
        x.sw = j; x.swInv = true;
        if (ML.canSolve(ML.makeProblem(m))) added++; else { x.sw = null; x.swInv = false; }
      }
    }
    m.swDoors = m.walls.filter(w => w.sw !== null).map(w => w.i);

    // Getimede deuren: open 3 van elke 6 tikken, elk met eigen fase. Wachten mag, dus altijd oplosbaar.
    const TD = o.timed | 0;
    if (TD > 0) {
      m.period = 6;
      const sol = ML.solvePath(ML.makeProblem(m));
      const onRoute = rng.shuffle(sol ? pathWalls(m, sol.path).filter(w => !busy(w)) : []);
      const rest = rng.shuffle(m.walls.filter(w => w.open && !busy(w)));
      const pick = [...onRoute.slice(0, Math.ceil(TD / 2)), ...rest];
      for (const w of pick) {
        if (m.timed.length >= TD) break;
        if (w.timed) continue;
        w.timed = { phase: rng.int(m.period), open: 3 };
        m.timed.push(w.i);
      }
    }

    // Eenrichting: alleen als het doolhof oplosbaar blijft.
    const O = o.oneways | 0;
    if (O > 0) {
      const ok = () => ML.canSolve(ML.makeProblem(m));
      const cands = rng.shuffle(m.walls.filter(w => w.open && !busy(w) && !w.wrap));
      let placed = 0, tries = 0;
      for (const w of cands) {
        if (placed >= O || tries++ > O * 6) break;
        const first = rng() < 0.5 ? w.a : w.b;
        w.oneway = first;
        if (!ok()) {
          w.oneway = first === w.a ? w.b : w.a;
          if (!ok()) { w.oneway = null; continue; }
        }
        placed++;
      }
      m.oneways = m.walls.filter(w => w.oneway !== null).map(w => w.i);
    }
  };

  // Kamers & zalen (vierkant raster): blokken van 2-4 x 2-3 cellen waarvan de binnenmuren weg zijn.
  // Ruimte van 1 cel rond elke zaal, zodat zalen niet aan elkaar plakken. Lussen ontstaan vanzelf.
  ML.placeRooms = function (m, rng) {
    const C = m.cells, n = C.length, at = new Map(), room = new Int16Array(n).fill(-1), groups = [];
    for (const c of C) if (c.grid && c.grid.r != null) at.set(c.level + ',' + c.grid.r + ',' + c.grid.c, c.i);
    const want = Math.max(1, Math.min(12, Math.round(n / 70)));
    for (let t = 0; t < want * 25 && groups.length < want; t++) {
      const c0 = C[rng.int(n)], w = 2 + rng.int(3), h = 2 + rng.int(2), l = c0.level, r0 = c0.grid.r, k0 = c0.grid.c, cells = [];
      let ok = true;
      for (let r = r0 - 1; r <= r0 + h && ok; r++) for (let k = k0 - 1; k <= k0 + w && ok; k++) {
        const i = at.get(l + ',' + r + ',' + k), inside = r >= r0 && r < r0 + h && k >= k0 && k < k0 + w;
        if (i !== undefined && room[i] >= 0) ok = false;
        else if (inside) { if (i === undefined) ok = false; else cells.push(i); }
      }
      if (!ok) continue;
      for (const i of cells) room[i] = groups.length;
      groups.push(cells);
    }
    for (const w of m.walls) if (!w.stair && w.b !== null && room[w.a] >= 0 && room[w.a] === room[w.b]) w.open = true;
    m.rooms = groups; m.roomOf = room;
  };

  // Weave (vierkant raster): een rechte gang (kruiscel x, alleen N-Z of alleen O-W open) krijgt een brug
  // dwars eroverheen tussen de twee buren. Brug = randtype 'bridge' (open, a/b = buren, via = x).
  // Om het doolhof perfect te houden gaat er per brug één muur dicht op de oude route tussen a en b.
  ML.placeWeave = function (m, rng) {
    const C = m.cells, n = C.length, at = new Map(), cross = new Uint8Array(n);
    for (const c of C) if (c.grid && c.grid.r != null) at.set(c.level + ',' + c.grid.r + ',' + c.grid.c, c.i);
    const wallTo = (a, b) => { for (const nb of C[a].nbrs) { const w = m.walls[nb.w]; if (nb.c === b && !w.wrap && !w.stair && !w.bridge) return w; } return null; };
    const want = Math.max(1, Math.round(n / 14));
    const cand = rng.shuffle(C.filter(c => c.grid && c.grid.r != null).map(c => c.i));
    const D = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    let made = 0;
    for (const x of cand) {
      if (made >= want) break;
      const g = C[x].grid, l = C[x].level;
      const nb4 = D.map(([dr, dc]) => at.get(l + ',' + (g.r + dr) + ',' + (g.c + dc)));
      if (nb4.some(v => v === undefined || cross[v])) continue;
      const w4 = nb4.map(v => wallTo(x, v));
      if (w4.some(w => !w)) continue;
      const vert = w4[0].open && w4[2].open && !w4[1].open && !w4[3].open;
      const hor = w4[1].open && w4[3].open && !w4[0].open && !w4[2].open;
      if (!vert && !hor) continue;
      const a = vert ? nb4[1] : nb4[0], b = vert ? nb4[3] : nb4[2], side = vert ? [w4[1], w4[3]] : [w4[0], w4[2]];
      // oude route a → b (BFS over open randen), daarop een muur kiezen die dicht mag
      const prev = new Int32Array(n).fill(-1), pw = new Int32Array(n).fill(-1), q = [a];
      prev[a] = a;
      for (let h = 0; h < q.length && prev[b] < 0; h++) for (const e of C[q[h]].nbrs) {
        const w = m.walls[e.w];
        if (w.open && prev[e.c] < 0) { prev[e.c] = q[h]; pw[e.c] = e.w; q.push(e.c); }
      }
      if (prev[b] < 0) continue;
      const route = [];
      for (let c = b; c !== a; c = prev[c]) route.push(m.walls[pw[c]]);
      const ok = route.filter(w => !w.stair && !w.bridge && !w.wrap && !w.lock && !cross[w.a] && !cross[w.b] && w.a !== x && w.b !== x);
      if (!ok.length) continue;
      rng.pick(ok).open = false;
      side.forEach(w => { w.lock = true; });
      cross[x] = 1;
      const ca = C[a].center, cb = C[b].center;
      const w = Object.assign({
        i: m.walls.length, id: 'w' + m.walls.length, type: 'bridge', asset: ML.ASSETS.bridge, level: l, open: true,
        door: null, oneway: null, sw: null, swInv: false, timed: null, stair: false, wrap: false, wm: null,
        a, b, segs: [], mid: C[x].center, bridge: true, via: x
      });
      m.walls.push(w);
      const ang = Math.atan2(cb[1] - ca[1], cb[0] - ca[0]);
      C[a].nbrs.push({ c: b, w: w.i, ang });
      C[b].nbrs.push({ c: a, w: w.i, ang: ang + Math.PI });
      made++;
    }
    m.bridges = m.walls.filter(w => w.bridge).map(w => w.i);
  };

  // Na het maken: lussen, start/doel, terrein, puzzel, goedkoopste oplossing.
  ML.finishMaze = function (m, s, genId) {
    if (s.variant === 'rooms' && s.grid === 'square') ML.placeRooms(m, ML.makeRng(s.seed + '|zalen'));
    if (s.variant === 'weave' && s.grid === 'square' && !m.bridges) ML.placeWeave(m, ML.makeRng(s.seed + '|weave'));
    const prng = ML.makeRng(s.seed + '|p|' + genId);
    ML.braid(m, prng, (s.braid || 0) / 100);
    ML.placeEnds(m, prng);
    ML.placeTerrain(m, prng, s.terrain || 0);
    ML.placePuzzle(m, prng, s);
    const sol = ML.solvePath(ML.makeProblem(m));
    m.solution = sol ? sol.path : null;
    m.solutionStates = sol ? sol.states : null;
    m.solutionCost = sol ? sol.cost : 0;
    m.ready = true;
    return m;
  };

  // Compleet doolhof zonder animatie (moeilijkheid zoeken, dagelijks doolhof).
  ML.buildFull = function (s, genId, aspect) {
    const m = ML.makeMaze(s, aspect), gen = ML.GENERATORS.find(g => g.id === genId) || ML.GENERATORS[0];
    const it = gen.fn(m, ML.makeRng(s.seed + '|' + gen.id), { mix: (s.mix == null ? 75 : s.mix) / 100 });
    for (let r = it.next(); !r.done; r = it.next());
    return ML.finishMaze(m, s, gen.id);
  };

  ML.mazeStats = function (m) {
    let de = 0, jn = 0, st = 0;
    for (let i = 0; i < m.cells.length; i++) {
      const k = openCount(m, i);
      if (k === 1) de++; else if (k >= 3) jn++;
    }
    for (const w of m.walls) if (w.stair && w.open) st++;
    const br = m.bridges ? m.bridges.length : 0;
    return {
      cells: m.cells.length, deadEnds: de, junctions: jn, stairs: st, bridges: br,
      route: m.solution ? m.solution.length - 1 : 0, cost: m.solutionCost, weighted: m.weighted
    };
  };
})(window.ML = window.ML || {});
