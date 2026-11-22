// Oplossers: generators die { visit: cell, front: [cells] } geven en eindigen met { found, path }.
(function (ML) {
  'use strict';
  const TAU = Math.PI * 2;

  function trace(prev, s, P) {
    const path = [];
    for (let x = s; x !== -1; x = prev.get(x)) path.push(P.cell(x));
    return { found: true, path: path.reverse() };
  }

  function* bfs(m, P) {
    const prev = new Map([[P.start, -1]]), q = [P.start], out = [];
    for (let h = 0; h < q.length; h++) {
      const s = q[h];
      if (P.isGoal(s)) return trace(prev, s, P);
      P.succ(s, out);
      const front = [];
      for (const t of out) if (!prev.has(t)) { prev.set(t, s); q.push(t); front.push(P.cell(t)); }
      yield { visit: P.cell(s), front };
    }
    return { found: false, path: [] };
  }

  function* dfs(m, P) {
    const prev = new Map(), seen = new Set(), st = [[P.start, -1]], out = [];
    while (st.length) {
      const [s, p] = st.pop();
      if (seen.has(s)) continue;
      seen.add(s); prev.set(s, p);
      if (P.isGoal(s)) return trace(prev, s, P);
      P.succ(s, out);
      const front = [];
      for (const t of out) if (!seen.has(t)) { st.push([t, s]); front.push(P.cell(t)); }
      yield { visit: P.cell(s), front };
    }
    return { found: false, path: [] };
  }

  class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(p, v) {
      const a = this.a; a.push([p, v]);
      let i = a.length - 1;
      while (i > 0) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; }
    }
    pop() {
      const a = this.a, top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let s = i;
          if (l < a.length && a[l][0] < a[s][0]) s = l;
          if (r < a.length && a[r][0] < a[s][0]) s = r;
          if (s === i) break;
          [a[i], a[s]] = [a[s], a[i]]; i = s;
        }
      }
      return top[1];
    }
  }

  function bestFirst(useG) {
    return function* (m, P) {
      const g = new Map([[P.start, 0]]), prev = new Map([[P.start, -1]]), closed = new Set(), H = new Heap(), out = [];
      H.push(P.h(P.start), P.start);
      while (H.size) {
        const s = H.pop();
        if (closed.has(s)) continue;
        closed.add(s);
        if (P.isGoal(s)) return trace(prev, s, P);
        P.succ(s, out);
        const front = [], gs = g.get(s);
        for (const t of out) {
          if (closed.has(t)) continue;
          const ng = gs + 1;
          if (!g.has(t) || ng < g.get(t)) {
            g.set(t, ng); prev.set(t, s);
            H.push(useG ? ng + P.h(t) * 1.0001 : P.h(t), t);
            front.push(P.cell(t));
          }
        }
        yield { visit: P.cell(s), front };
      }
      return { found: false, path: [] };
    };
  }

  // Rechterhand langs de muur: werkt alleen gegarandeerd zonder lussen; teleporters genegeerd.
  function* wallFollower(m, P) {
    const cells = m.cells, n = cells.length, cap = n * 12;
    let c = m.start, mask = P.gain(c, 0);
    const trail = [c], pos = new Map([[c, 0]]);
    let beta = 0;
    const closed = cells[c].nbrs.find(nb => !m.walls[nb.w].open);
    if (closed) beta = closed.ang;
    for (let step = 0; step < cap; step++) {
      if (c === m.goal) return { found: true, path: trail.slice() };
      const opts = cells[c].nbrs.filter(nb => P.canPass(c, nb, mask));
      yield { visit: c, front: [] };
      if (!opts.length) return { found: false, path: trail.slice() };
      let pick = null, bestv = Infinity;
      for (const nb of opts) {
        let v = (((beta - nb.ang) % TAU) + TAU) % TAU;
        if (v < 1e-6) v = TAU;
        if (v < bestv) { bestv = v; pick = nb; }
      }
      const back = cells[pick.c].nbrs.find(nb => nb.c === c);
      beta = back ? back.ang : pick.ang + Math.PI;
      c = pick.c; mask = P.gain(c, mask);
      if (pos.has(c)) {
        const k = pos.get(c);
        for (let i = k + 1; i < trail.length; i++) pos.delete(trail[i]);
        trail.length = k + 1;
      } else { pos.set(c, trail.length); trail.push(c); }
    }
    return { found: false, path: trail.slice() };
  }

  ML.SOLVERS = [
    { id: 'bfs', name: 'Breedte-eerst', desc: 'altijd de kortste route', fn: bfs },
    { id: 'astar', name: 'A*', desc: 'kortste route, zoekt gericht', fn: bestFirst(true) },
    { id: 'greedy', name: 'Gretig', desc: 'snel, maar kortzichtig', fn: bestFirst(false) },
    { id: 'dfs', name: 'Diepte-eerst', desc: 'duikt elke gang in', fn: dfs },
    { id: 'wall', name: 'Rechterhand', desc: 'hand tegen de muur', fn: wallFollower }
  ];
})(window.ML = window.ML || {});
