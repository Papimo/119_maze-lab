// Lussen, start/doel, puzzel-elementen (sleutels+deuren, eenrichting, teleporters)
// en het zoekprobleem dat alle oplossers gebruiken.
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

  // Lussen: doodlopende stukken openbreken → meerdere routes.
  ML.braid = function (m, rng, p) {
    if (p <= 0) return;
    const ends = [];
    for (let i = 0; i < m.cells.length; i++) if (openCount(m, i) === 1) ends.push(i);
    rng.shuffle(ends);
    for (const c of ends) {
      if (openCount(m, c) !== 1 || rng() >= p) continue;
      const closed = m.cells[c].nbrs.filter(nb => !m.walls[nb.w].open);
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

  // Toestand = cel × verzamelde sleutels (bitmasker).
  ML.makeProblem = function (m) {
    const K = m.keys.length, M = 1 << K, cells = m.cells, walls = m.walls, keyAt = m.keyAt, tp = m.telePartner;
    const gain = (c, mask) => keyAt[c] >= 0 ? mask | (1 << keyAt[c]) : mask;
    const canPass = (c, nb, mask) => {
      const w = walls[nb.w];
      if (!w.open) return false;
      if (w.door !== null && !((mask >> w.door) & 1)) return false;
      if (w.oneway !== null && w.oneway !== c) return false;
      return true;
    };
    const g = cells[m.goal].center, step = m.maxStep, tel = m.teleporters;
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    return {
      M, gain, canPass,
      start: m.start * M + gain(m.start, 0),
      cell: s => (s / M) | 0,
      isGoal: s => ((s / M) | 0) === m.goal,
      succ(s, out) {
        out.length = 0;
        const c = (s / M) | 0, mask = s % M;
        for (const nb of cells[c].nbrs) if (canPass(c, nb, mask)) out.push(nb.c * M + gain(nb.c, mask));
        const t = tp[c];
        if (t >= 0) out.push(t * M + gain(t, mask));
        return out;
      },
      h(s) { // ondergrens in stappen (A*/gretig)
        const c = cells[(s / M) | 0].center;
        let best = dist(c, g);
        for (const t of tel) {
          const A = cells[t.a].center, B = cells[t.b].center;
          best = Math.min(best, dist(c, A) + dist(B, g), dist(c, B) + dist(A, g));
        }
        return best / step;
      }
    };
  };

  // Snelle kortste oplossing (cellenlijst) of null.
  ML.solvePath = function (P) {
    const prev = new Map([[P.start, -1]]), q = [P.start], out = [];
    for (let h = 0; h < q.length; h++) {
      const s = q[h];
      if (P.isGoal(s)) {
        const path = [];
        for (let x = s; x !== -1; x = prev.get(x)) path.push(P.cell(x));
        return path.reverse();
      }
      P.succ(s, out);
      for (const t of out) if (!prev.has(t)) { prev.set(t, s); q.push(t); }
    }
    return null;
  };

  ML.placePuzzle = function (m, rng, o) {
    const n = m.cells.length;
    m.keys = []; m.keyAt.fill(-1); m.teleporters = []; m.telePartner.fill(-1); m.doors = []; m.oneways = [];
    for (const w of m.walls) { w.door = null; w.oneway = null; }
    const used = new Set([m.start, m.goal]);

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
    const T = Math.min(o.teleports | 0, Math.floor((n - 2) / 2));
    for (let t = 0; t < T; t++) {
      const a = take(), b = take();
      if (a < 0 || b < 0) break;
      m.teleporters.push({ a, b }); m.telePartner[a] = b; m.telePartner[b] = a;
    }

    // Deuren op de route, sleutel k ligt altijd vóór deur k (eventueel achter eerdere deuren).
    const K0 = Math.min(o.keys | 0, ML.KEY_COLORS.length);
    if (K0 > 0) {
      const cp = cellPath(m), pathSet = new Set(cp), pw = [];
      for (let i = 0; i + 1 < cp.length; i++) {
        const nb = m.cells[cp[i]].nbrs.find(x => x.c === cp[i + 1]);
        if (nb) pw.push(nb.w);
      }
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

    // Eenrichting: alleen als het doolhof oplosbaar blijft.
    const O = o.oneways | 0;
    if (O > 0) {
      const ok = () => ML.solvePath(ML.makeProblem(m)) !== null;
      const cands = rng.shuffle(m.walls.filter(w => w.open && w.b !== null && w.door === null));
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

  ML.mazeStats = function (m) {
    let de = 0, jn = 0;
    for (let i = 0; i < m.cells.length; i++) {
      const k = openCount(m, i);
      if (k === 1) de++; else if (k >= 3) jn++;
    }
    return { cells: m.cells.length, deadEnds: de, junctions: jn, route: m.solution ? m.solution.length : 0 };
  };
})(window.ML = window.ML || {});
