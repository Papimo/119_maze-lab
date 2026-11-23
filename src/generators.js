// Doolhof-makers. Elk is een generator die stap voor stap muren opent en events geeft:
// { carve: wallIdx, build: wallIdx (muur erbij), all: true (alle cellen in doolhof), add: cellIdx, add2, cur: cellIdx, walk: [cells], walkFrom }
(window.MLDEF = window.MLDEF || []).push(function (ML) { // MLDEF: ook in de Web Worker (evo.js Pool)
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

  // Doolhof van doolhoven (lappendeken): het veld wordt in blokken verdeeld; elk blok krijgt een eigen
  // klein doolhof met een eigen karakter (diepte-eerst, Prim-achtig of gemengd). Daarna verbinden losse
  // deuren de blokken tot één groot doolhof (Kruskal over de blokken) → blijft perfect. Werkt op elk raster.
  function* patchwork(m, rng) {
    const C = m.cells, n = C.length, b = m.bounds;
    const cs = Math.sqrt(Math.max(1e-6, (b.maxx - b.minx) * (b.maxy - b.miny)) / n) || 1;
    const B = cs * Math.max(4, Math.min(9, Math.round(Math.sqrt(n) / 4)));
    const blk = new Int32Array(n), keys = new Map();
    for (const c of C) {
      const k = Math.floor((c.center[0] - b.minx) / B) + ',' + Math.floor((c.center[1] - b.miny) / B);
      if (!keys.has(k)) keys.set(k, keys.size);
      blk[c.i] = keys.get(k);
    }
    const N = keys.size, byBlk = Array.from({ length: N }, () => []), style = new Float32Array(N);
    for (let i = 0; i < n; i++) byBlk[blk[i]].push(i);
    m.blocks = blk; m.blockN = N; m.blockStyle = style;
    const inn = new Uint8Array(n);
    for (const k of rng.shuffle([...Array(N).keys()])) {
      const mix = style[k] = rng.pick([1, 1, 0, 0.5]);
      for (const s0 of rng.shuffle(byBlk[k].slice())) {
        if (inn[s0]) continue;
        inn[s0] = 1; const list = [s0];
        yield { add: s0, cur: s0 };
        while (list.length) {
          const idx = rng() < mix ? list.length - 1 : rng.int(list.length), c = list[idx];
          const o = C[c].nbrs.filter(nb => !inn[nb.c] && blk[nb.c] === k);
          if (!o.length) { list.splice(idx, 1); continue; }
          const p = rng.pick(o);
          m.walls[p.w].open = true; inn[p.c] = 1; list.push(p.c);
          yield { carve: p.w, add: p.c, cur: p.c };
        }
      }
    }
    // stukken (componenten) zoeken en met deuren aan elkaar knopen
    const comp = new Int32Array(n).fill(-1);
    let nc = 0;
    for (let i = 0; i < n; i++) {
      if (comp[i] >= 0) continue;
      const q = [i]; comp[i] = nc;
      for (let h = 0; h < q.length; h++) for (const nb of C[q[h]].nbrs) if (comp[nb.c] < 0 && m.walls[nb.w].open) { comp[nb.c] = nc; q.push(nb.c); }
      nc++;
    }
    const par = Int32Array.from({ length: nc }, (_, i) => i), find = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
    const cand = rng.shuffle(m.walls.filter(w => w.b !== null && !w.open && comp[w.a] !== comp[w.b]));
    for (const w of cand) {
      const x = find(comp[w.a]), y = find(comp[w.b]);
      if (x === y) continue;
      par[x] = y; w.open = true;
      yield { carve: w.i, cur: w.b };
    }
  }

  // Spiegel: linkerhelft diepte-eerst, rechterhelft = spiegelbeeld. Even breedte: één deur in het midden;
  // oneven: middenkolom wordt een rechte gang met links en rechts dezelfde deur. Blijft perfect.
  function* mirror(m, rng) {
    const W = m.sq.w, H = m.sq.h, np = m.np, C = m.cells, half = Math.floor(W / 2);
    const wb = (a, b) => { const nb = C[a].nbrs.find(x => x.c === b); return nb ? nb.w : -1; };
    const open = (a, b) => { const w = wb(a, b); if (w >= 0) m.walls[w].open = true; return w; };
    for (let l = 0; l < m.levels; l++) {
      const id = (r, c) => l * np + r * W + c, rc = i => [Math.floor((i - l * np) / W), (i - l * np) % W];
      const mir = i => { const [r, c] = rc(i); return id(r, W - 1 - c); };
      const inn = new Uint8Array(np), s0 = id(rng.int(H), rng.int(Math.max(1, half)));
      if (half < 1) continue;
      inn[s0 - l * np] = 1;
      const st = [s0];
      yield { add: s0, add2: mir(s0), cur: s0 };
      while (st.length) {
        const c = st[st.length - 1];
        const o = C[c].nbrs.filter(nb => { if (nb.c < l * np || nb.c >= (l + 1) * np) return false; const [, cc] = rc(nb.c); return cc < half && !inn[nb.c - l * np]; });
        if (!o.length) { st.pop(); continue; }
        const p = rng.pick(o);
        m.walls[p.w].open = true; inn[p.c - l * np] = 1; st.push(p.c);
        const w2 = open(mir(c), mir(p.c));
        yield { carve: p.w, add: p.c, add2: mir(p.c), cur: p.c };
        if (w2 >= 0) yield { carve: w2, cur: mir(p.c) };
      }
      const r = rng.int(H);
      if (W % 2) {
        for (let y = 0; y + 1 < H; y++) { const w = open(id(y, half), id(y + 1, half)); yield { carve: w, add: id(y, half), add2: id(y + 1, half), cur: id(y + 1, half) }; }
        yield { carve: open(id(r, half - 1), id(r, half)), cur: id(r, half) };
        yield { carve: open(id(r, half), id(r, half + 1)), cur: id(r, half + 1) };
      } else yield { carve: open(id(r, half - 1), id(r, half)), cur: id(r, half) };
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
    { id: 'division', name: 'Opdelen', desc: 'muren in een lege zaal (alleen vierkant)', fn: gridOnly(division), grid: true },
    { id: 'patchwork', name: 'Doolhof van doolhoven', desc: 'blokken met elk een eigen karakter, deuren ertussen', fn: patchwork },
    { id: 'mirror', name: 'Spiegel', desc: 'symmetrisch (alleen vierkant)', fn: gridOnly(mirror), grid: true }
  ];
}); MLDEF[MLDEF.length - 1](window.ML = window.ML || {});
