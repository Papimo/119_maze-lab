// Oplossers: generators die { visit: cell, front: [cells], side?, dead? } geven
// en eindigen met { found, path: [cells], states: [toestanden] }.
(function (ML) {
  'use strict';
  const TAU = Math.PI * 2;

  function trace(prev, s, P) { const r = ML.traceStates(prev, s, P); r.found = true; return r; }
  const fail = (path, states) => ({ found: false, path: path || [], states: states || [] });

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
    return fail();
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
    return fail();
  }

  // useG: kosten tellen (Dijkstra/A*), useH: schatting naar doel (A*/gretig).
  function bestFirst(useG, useH) {
    return function* (m, P) {
      const g = new Map([[P.start, 0]]), prev = new Map([[P.start, -1]]), closed = new Set(), H = new ML.Heap(), out = [], cst = [];
      H.push(useH ? P.h(P.start) : 0, P.start);
      while (H.size) {
        const s = H.pop();
        if (closed.has(s)) continue;
        closed.add(s);
        if (P.isGoal(s)) return trace(prev, s, P);
        P.succ(s, out, cst);
        const front = [], gs = g.get(s);
        for (let i = 0; i < out.length; i++) {
          const t = out[i];
          if (closed.has(t)) continue;
          const ng = gs + (useG ? cst[i] : 1);
          if (!g.has(t) || ng < g.get(t)) {
            g.set(t, ng); prev.set(t, s);
            H.push(useG ? ng + (useH ? P.h(t) * 1.0001 : 0) : P.h(t), t);
            front.push(P.cell(t));
          }
        }
        yield { visit: P.cell(s), front };
      }
      return fail();
    };
  }

  // Van start én doel tegelijk; alleen zonder sleutels/schakelaars/tijd (anders breedte-eerst).
  function* bidir(m, P) {
    if (!P.simple) return yield* bfs(m, P);
    const C = m.cells, tp = m.telePartner, goal = m.goal;
    const fw = c => { const r = []; for (const nb of C[c].nbrs) if (P.canPass(c, nb, 0, 0, 0)) r.push(nb.c); if (tp[c] >= 0) r.push(tp[c]); return r; };
    const bw = c => {
      const r = [];
      for (const nb of C[c].nbrs) {
        const back = C[nb.c].nbrs.find(e => e.w === nb.w);
        if (back && P.canPass(nb.c, back, 0, 0, 0)) r.push(nb.c);
      }
      if (tp[c] >= 0) r.push(tp[c]);
      return r;
    };
    const pa = new Map([[P.start, -1]]), pb = new Map([[goal, -1]]), qa = [P.start], qb = [goal];
    let ha = 0, hb = 0, meet = P.start === goal ? goal : -1;
    while (meet < 0 && ha < qa.length && hb < qb.length) {
      const A = (qa.length - ha) <= (qb.length - hb);
      const q = A ? qa : qb, pm = A ? pa : pb, om = A ? pb : pa, c = A ? qa[ha++] : qb[hb++], front = [];
      for (const t of (A ? fw(c) : bw(c))) {
        if (pm.has(t)) continue;
        pm.set(t, c); q.push(t); front.push(t);
        if (om.has(t)) { meet = t; break; }
      }
      yield { visit: c, front, side: A ? 0 : 1 };
    }
    if (meet < 0) return fail();
    const path = [];
    for (let x = meet; x !== -1; x = pa.get(x)) path.push(x);
    path.reverse();
    for (let x = pb.get(meet); x !== -1; x = pb.get(x)) path.push(x);
    return { found: true, path, states: path.slice() };
  }

  // Doodlopers dichten: vul steeds cellen met één uitgang; wat overblijft is de route (of het lussennet).
  function* deadEnd(m, P) {
    const C = m.cells, W = m.walls, n = C.length, tp = m.telePartner;
    const prot = new Uint8Array(n);
    prot[m.start] = prot[m.goal] = 1;
    for (const k of m.keys) prot[k.cell] = 1;
    for (const s of m.switches) prot[s.cell] = 1;
    for (let i = 0; i < n; i++) if (tp[i] >= 0) prot[i] = 1;
    const deg = new Int32Array(n), dead = new Uint8Array(n), st = [];
    for (let i = 0; i < n; i++) {
      for (const nb of C[i].nbrs) if (W[nb.w].open) deg[i]++;
      if (deg[i] <= 1 && !prot[i]) st.push(i);
    }
    while (st.length) {
      const c = st.pop();
      if (dead[c]) continue;
      dead[c] = 1;
      yield { visit: c, front: [], dead: c };
      for (const nb of C[c].nbrs) if (W[nb.w].open && !dead[nb.c] && --deg[nb.c] <= 1 && !prot[nb.c]) st.push(nb.c);
    }
    const prev = new Map([[P.start, -1]]), q = [P.start], out = [];
    for (let h = 0; h < q.length; h++) {
      const s = q[h];
      if (P.isGoal(s)) return trace(prev, s, P);
      P.succ(s, out);
      const front = [];
      for (const t of out) if (!prev.has(t) && !dead[P.cell(t)]) { prev.set(t, s); q.push(t); front.push(P.cell(t)); }
      yield { visit: P.cell(s), front };
    }
    return fail();
  }

  // Loper-hulp: pad bijhouden zonder lussen (zelfde cel weer → stuk ertussen weg).
  function walkerTrail(c, s) {
    const trail = [c], tst = [s], pos = new Map([[c, 0]]);
    return {
      trail, tst,
      go(c2, s2) {
        if (pos.has(c2)) {
          const k = pos.get(c2);
          for (let i = k + 1; i < trail.length; i++) pos.delete(trail[i]);
          trail.length = k + 1; tst.length = k + 1; tst[k] = s2;
        } else { pos.set(c2, trail.length); trail.push(c2); tst.push(s2); }
      },
      res(found) { return { found, path: trail.slice(), states: tst.slice() }; }
    };
  }

  // Rechterhand langs de muur: werkt alleen gegarandeerd zonder lussen; teleporters en trappen genegeerd.
  function* wallFollower(m, P) {
    const cells = m.cells, cap = cells.length * 12 * P.T;
    let s = P.start, c = P.cell(s), beta = 0;
    const tr = walkerTrail(c, s);
    const closed = cells[c].nbrs.find(nb => !m.walls[nb.w].open && !m.walls[nb.w].stair);
    if (closed) beta = closed.ang;
    for (let step = 0; step < cap; step++) {
      if (c === m.goal) return tr.res(true);
      const mv = P.moves(s), opts = mv.filter(x => x.kind === 'step');
      yield { visit: c, front: [] };
      if (!opts.length) {
        const wt = mv.find(x => x.kind === 'wait');
        if (wt) { s = wt.s2; continue; }
        return tr.res(false);
      }
      let pick = null, bestv = Infinity;
      for (const nb of opts) {
        let v = (((beta - nb.ang) % TAU) + TAU) % TAU;
        if (v < 1e-6) v = TAU;
        if (v < bestv) { bestv = v; pick = nb; }
      }
      const back = cells[pick.c].nbrs.find(nb => nb.w === pick.w);
      beta = back ? back.ang : pick.ang + Math.PI;
      s = pick.s2; c = pick.c;
      tr.go(c, s);
    }
    return tr.res(false);
  }

  // Trémaux: zet een streepje bij elke doorgang. Bekend kruispunt via een nieuwe gang → terug.
  // Nooit een gang met twee streepjes. Vindt altijd de uitgang (ook met lussen).
  function* tremaux(m, P) {
    const cells = m.cells, n = cells.length, cap = n * 16 * P.T, rng = ML.makeRng('tremaux');
    const marks = new Map(), seen = new Uint16Array(n);
    let s = P.start, c = P.cell(s), from = null;
    const tr = walkerTrail(c, s);
    seen[c] = 1;
    for (let step = 0; step < cap; step++) {
      if (c === m.goal) return tr.res(true);
      const mv = P.moves(s), cc = c;
      const ek = x => x.kind === 'tele' ? 't' + Math.min(cc, x.c) : x.w;
      const cnt = x => marks.get(ek(x)) || 0;
      yield { visit: c, front: [] };
      const usable = mv.filter(x => x.kind !== 'wait' && cnt(x) < 2);
      if (!usable.length) {
        const wt = mv.find(x => x.kind === 'wait');
        if (wt) { s = wt.s2; continue; }
        return tr.res(false);
      }
      const back = from === null ? null : usable.find(x => ek(x) === from);
      let pick;
      if (back && seen[c] > 1 && cnt(back) === 1) pick = back;
      else {
        const zero = usable.filter(x => cnt(x) === 0 && x !== back);
        pick = zero.length ? rng.pick(zero) : back || usable.reduce((a, b) => cnt(a) <= cnt(b) ? a : b);
      }
      const key = ek(pick);
      marks.set(key, (marks.get(key) || 0) + 1);
      from = key; s = pick.s2; c = pick.c;
      if (seen[c] < 65535) seen[c]++;
      tr.go(c, s);
    }
    return tr.res(false);
  }

  ML.SOLVERS = [
    { id: 'bfs', name: 'Breedte-eerst', desc: 'minste stappen, negeert terrein', fn: bfs },
    { id: 'dijkstra', name: 'Dijkstra', desc: 'goedkoopste route, terrein telt', fn: bestFirst(true, false) },
    { id: 'astar', name: 'A*', desc: 'goedkoopste route, zoekt gericht', fn: bestFirst(true, true) },
    { id: 'greedy', name: 'Gretig', desc: 'snel, maar kortzichtig', fn: bestFirst(false, true) },
    { id: 'bidir', name: 'Bidirectioneel', desc: 'van twee kanten (zonder sleutels/schakelaars/tijd)', fn: bidir },
    { id: 'dfs', name: 'Diepte-eerst', desc: 'duikt elke gang in', fn: dfs },
    { id: 'deadend', name: 'Doodlopers dichten', desc: 'vult doodlopende gangen op', fn: deadEnd },
    { id: 'tremaux', name: 'Trémaux', desc: 'krijtstreepjes, vindt altijd uit', fn: tremaux },
    { id: 'wall', name: 'Rechterhand', desc: 'hand tegen de muur', fn: wallFollower }
  ];
})(window.ML = window.ML || {});
