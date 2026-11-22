// Doolhof-makers. Elk is een generator die stap voor stap muren opent en events geeft:
// { carve: wallIdx, add: cellIdx, add2, cur: cellIdx, walk: [cells], walkFrom }
(function (ML) {
  'use strict';

  function* growingTree(m, rng, opts) {
    const mix = opts && opts.mix != null ? opts.mix : 1;
    const n = m.cells.length, inn = new Uint8Array(n), s = rng.int(n), list = [s];
    inn[s] = 1;
    yield { add: s, cur: s };
    while (list.length) {
      const idx = rng() < mix ? list.length - 1 : rng.int(list.length), c = list[idx];
      const opts2 = m.cells[c].nbrs.filter(nb => !inn[nb.c]);
      if (!opts2.length) {
        list.splice(idx, 1);
        yield { cur: list.length ? list[list.length - 1] : -1 };
        continue;
      }
      const p = rng.pick(opts2);
      m.walls[p.w].open = true; inn[p.c] = 1; list.push(p.c);
      yield { carve: p.w, add: p.c, cur: p.c };
    }
  }

  function* prim(m, rng) {
    const n = m.cells.length, inn = new Uint8Array(n), F = [];
    const addCell = c => { inn[c] = 1; for (const nb of m.cells[c].nbrs) if (!inn[nb.c]) F.push(nb); };
    const s = rng.int(n);
    addCell(s);
    yield { add: s, cur: s };
    while (F.length) {
      const i = rng.int(F.length), nb = F[i];
      F[i] = F[F.length - 1]; F.pop();
      if (inn[nb.c]) continue;
      m.walls[nb.w].open = true; addCell(nb.c);
      yield { carve: nb.w, add: nb.c, cur: nb.c };
    }
  }

  function* kruskal(m, rng) {
    const n = m.cells.length, par = new Int32Array(n);
    for (let i = 0; i < n; i++) par[i] = i;
    const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const ws = rng.shuffle(m.walls.filter(w => w.b !== null).map(w => w.i));
    for (const wi of ws) {
      const w = m.walls[wi], a = find(w.a), b = find(w.b);
      if (a === b) continue;
      par[a] = b; w.open = true;
      yield { carve: wi, add: w.a, add2: w.b, cur: w.a };
    }
  }

  function* wilson(m, rng) {
    const n = m.cells.length, inn = new Uint8Array(n), pos = new Int32Array(n).fill(-1);
    const order = rng.shuffle([...Array(n).keys()]);
    inn[order[0]] = 1;
    yield { add: order[0], cur: order[0] };
    let ptr = 1;
    for (;;) {
      while (ptr < n && inn[order[ptr]]) ptr++;
      if (ptr >= n) return;
      let c = order[ptr];
      const path = [c], pw = [];
      pos[c] = 0;
      while (!inn[c]) { // willekeurige wandeling, lussen worden weggeknipt
        const nb = rng.pick(m.cells[c].nbrs);
        if (pos[nb.c] >= 0) {
          const k = pos[nb.c];
          for (let i = k + 1; i < path.length; i++) pos[path[i]] = -1;
          path.length = k + 1; pw.length = k;
        } else { pos[nb.c] = path.length; path.push(nb.c); pw.push(nb.w); }
        c = nb.c;
        yield { walk: path, walkFrom: 0, cur: c };
      }
      for (let i = 0; i < pw.length; i++) {
        m.walls[pw[i]].open = true; inn[path[i]] = 1;
        yield { carve: pw[i], add: path[i], cur: path[i], walk: path, walkFrom: i + 1 };
      }
      for (const x of path) pos[x] = -1;
    }
  }

  function* huntKill(m, rng) {
    const n = m.cells.length, inn = new Uint8Array(n);
    let c = rng.int(n), low = 0;
    inn[c] = 1;
    yield { add: c, cur: c };
    for (;;) {
      const opts = m.cells[c].nbrs.filter(nb => !inn[nb.c]);
      if (opts.length) {
        const p = rng.pick(opts);
        m.walls[p.w].open = true; inn[p.c] = 1; c = p.c;
        yield { carve: p.w, add: c, cur: c };
        continue;
      }
      let found = -1;
      while (low < n && inn[low]) low++;
      for (let i = low; i < n; i++) {
        if (inn[i]) continue;
        const ins = m.cells[i].nbrs.filter(nb => inn[nb.c]);
        if (ins.length) {
          const p = rng.pick(ins);
          m.walls[p.w].open = true; inn[i] = 1; c = i; found = i;
          yield { carve: p.w, add: i, cur: i };
          break;
        }
      }
      if (found < 0) return;
    }
  }

  ML.GENERATORS = [
    { id: 'backtracker', name: 'Diepte-eerst', desc: 'lange kronkelgangen', fn: (m, r) => growingTree(m, r, { mix: 1 }) },
    { id: 'growing', name: 'Groeiende boom', desc: 'kronkel instelbaar', fn: growingTree },
    { id: 'prim', name: 'Prim', desc: 'veel korte zijtakken', fn: prim },
    { id: 'kruskal', name: 'Kruskal', desc: 'eilandjes groeien samen', fn: kruskal },
    { id: 'wilson', name: 'Wilson', desc: 'volkomen eerlijk, traag begin', fn: wilson },
    { id: 'huntkill', name: 'Jagen & doden', desc: 'gangen + zoeken naar gaten', fn: huntKill }
  ];
})(window.ML = window.ML || {});
