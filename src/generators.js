// Doolhof-makers. Elk is een generator die stap voor stap muren opent en events geeft:
// { carve: wallIdx, build: wallIdx (muur erbij), all: true (alle cellen in doolhof), add: cellIdx, add2, cur: cellIdx, walk: [cells], walkFrom }
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

  // Willekeurige wandeling; alleen nieuwe cellen worden aangesloten. Eerlijk, maar traag op het eind.
  function* aldous(m, rng) {
    const n = m.cells.length, inn = new Uint8Array(n);
    let c = rng.int(n), left = n - 1;
    inn[c] = 1;
    yield { add: c, cur: c };
    while (left > 0) {
      const nb = rng.pick(m.cells[c].nbrs);
      if (!inn[nb.c]) { m.walls[nb.w].open = true; inn[nb.c] = 1; left--; yield { carve: nb.w, add: nb.c, cur: nb.c }; }
      else yield { cur: nb.c };
      c = nb.c;
    }
  }

  // ---- Rij-makers: alleen gewoon rechthoekig vierkant raster (m.sq), per verdieping ----
  const wallBetween = (m, a, b) => {
    for (const nb of m.cells[a].nbrs) { const w = m.walls[nb.w]; if (nb.c === b && !w.wrap && !w.stair) return nb.w; }
    return -1;
  };
  function* openStairs(m, rng) { // per verdiepingspaar één trap → alles hangt samen
    for (let l = 0; l + 1 < m.levels; l++) {
      const c = rng.shuffle(m.walls.filter(w => w.stair && w.level === l));
      if (c.length) { c[0].open = true; yield { carve: c[0].i, add: c[0].a, add2: c[0].b, cur: c[0].b }; }
    }
  }
  const gridOnly = fn => function* (m, rng, o) {
    if (!m.sq) { yield* growingTree(m, rng, { mix: 1 }); return; } // ander raster: terugval op diepte-eerst
    yield* fn(m, rng, o);
    yield* openStairs(m, rng);
  };

  function* eller(m, rng) {
    const W = m.sq.w, H = m.sq.h, np = m.np;
    for (let l = 0; l < m.levels; l++) {
      const id = (r, c) => l * np + r * W + c;
      let set = new Int32Array(W), next = 1;
      for (let r = 0; r < H; r++) {
        for (let c = 0; c < W; c++) if (!set[c]) set[c] = next++;
        const last = r === H - 1;
        for (let c = 0; c + 1 < W; c++) {
          if (set[c] === set[c + 1] || !(last || rng() < 0.5)) continue;
          const wi = wallBetween(m, id(r, c), id(r, c + 1));
          m.walls[wi].open = true;
          const old = set[c + 1];
          for (let x = 0; x < W; x++) if (set[x] === old) set[x] = set[c];
          yield { carve: wi, add: id(r, c), add2: id(r, c + 1), cur: id(r, c + 1) };
        }
        if (last) break;
        const groups = new Map();
        for (let c = 0; c < W; c++) { if (!groups.has(set[c])) groups.set(set[c], []); groups.get(set[c]).push(c); }
        const nset = new Int32Array(W);
        for (const [sid, cols] of groups) {
          rng.shuffle(cols);
          const k = 1 + Math.floor(rng() * rng() * cols.length);
          for (let i = 0; i < k; i++) {
            const c = cols[i], wi = wallBetween(m, id(r, c), id(r + 1, c));
            m.walls[wi].open = true; nset[c] = sid;
            yield { carve: wi, add: id(r, c), add2: id(r + 1, c), cur: id(r + 1, c) };
          }
        }
        set = nset;
      }
    }
  }

  function* sidewinder(m, rng) {
    const W = m.sq.w, H = m.sq.h, np = m.np;
    for (let l = 0; l < m.levels; l++) {
      const id = (r, c) => l * np + r * W + c;
      for (let r = 0; r < H; r++) {
        let run = [];
        for (let c = 0; c < W; c++) {
          run.push(c);
          if (c + 1 < W && (r === 0 || rng() < 0.5)) {
            const wi = wallBetween(m, id(r, c), id(r, c + 1));
            m.walls[wi].open = true;
            yield { carve: wi, add: id(r, c), add2: id(r, c + 1), cur: id(r, c + 1) };
          } else if (r > 0) {
            const pc = rng.pick(run), wi = wallBetween(m, id(r, pc), id(r - 1, pc));
            m.walls[wi].open = true;
            yield { carve: wi, add: id(r, pc), add2: id(r - 1, pc), cur: id(r, c) };
            run = [];
          }
        }
      }
    }
  }

  // Recursief opdelen: begint met een lege zaal en zet muren (events 'build').
  function* division(m, rng) {
    const W = m.sq.w, H = m.sq.h, np = m.np;
    for (const w of m.walls) if (w.b !== null && !w.stair && !w.wrap) w.open = true;
    yield { all: true };
    for (let l = 0; l < m.levels; l++) {
      const id = (r, c) => l * np + r * W + c, st = [[0, 0, W, H]];
      while (st.length) {
        const [x, y, rw, rh] = st.pop();
        if (rw < 2 || rh < 2) continue;
        const horiz = rw < rh ? true : rw > rh ? false : rng() < 0.5;
        if (horiz) {
          const wy = y + rng.int(rh - 1), gap = x + rng.int(rw);
          for (let cx = x; cx < x + rw; cx++) {
            if (cx === gap) continue;
            const wi = wallBetween(m, id(wy, cx), id(wy + 1, cx));
            m.walls[wi].open = false;
            yield { build: wi, cur: id(wy, cx) };
          }
          st.push([x, y, rw, wy - y + 1], [x, wy + 1, rw, y + rh - wy - 1]);
        } else {
          const wx = x + rng.int(rw - 1), gap = y + rng.int(rh);
          for (let cy = y; cy < y + rh; cy++) {
            if (cy === gap) continue;
            const wi = wallBetween(m, id(cy, wx), id(cy, wx + 1));
            m.walls[wi].open = false;
            yield { build: wi, cur: id(cy, wx) };
          }
          st.push([x, y, wx - x + 1, rh], [wx + 1, y, x + rw - wx - 1, rh]);
        }
      }
    }
  }

  ML.GENERATORS = [
    { id: 'backtracker', name: 'Diepte-eerst', desc: 'lange kronkelgangen', fn: (m, r) => growingTree(m, r, { mix: 1 }) },
    { id: 'growing', name: 'Groeiende boom', desc: 'kronkel instelbaar', fn: growingTree },
    { id: 'prim', name: 'Prim', desc: 'veel korte zijtakken', fn: prim },
    { id: 'kruskal', name: 'Kruskal', desc: 'eilandjes groeien samen', fn: kruskal },
    { id: 'wilson', name: 'Wilson', desc: 'volkomen eerlijk, traag begin', fn: wilson },
    { id: 'aldous', name: 'Aldous-Broder', desc: 'zwerft blind rond, traag einde', fn: aldous, slow: 8 },
    { id: 'huntkill', name: 'Jagen & doden', desc: 'gangen + zoeken naar gaten', fn: huntKill },
    { id: 'eller', name: 'Eller', desc: 'rij voor rij (alleen vierkant)', fn: gridOnly(eller), grid: true },
    { id: 'sidewinder', name: 'Sidewinder', desc: 'open bovenrij (alleen vierkant)', fn: gridOnly(sidewinder), grid: true },
    { id: 'division', name: 'Opdelen', desc: 'muren in een lege zaal (alleen vierkant)', fn: gridOnly(division), grid: true }
  ];
})(window.ML = window.ML || {});
