// Doolhof-model: algemene graaf van cellen (vloer) en muren.
// Elk element heeft id + type + asset-naam: koppelpunt voor 3D-modellen later.
// Coördinaten: 1 eenheid = celbreedte. 2D: x rechts, y omlaag. 3D: x→x, y→z, level→hoogte.
(function (ML) {
  'use strict';
  const SQ3 = Math.sqrt(3);
  const TAU = Math.PI * 2;

  ML.ASSETS = {
    floor: kind => `floor.${kind}`,      // floor.square | floor.hex | floor.tri | floor.polar
    wallInner: 'wall.inner',
    wallBorder: 'wall.border',
    post: 'wall.post',                   // paaltje op muurhoeken
    door: color => `door.${color}`,
    key: color => `key.${color}`,
    teleporter: pair => `teleporter.${pair}`,
    oneway: 'marker.oneway',
    start: 'marker.start',
    goal: 'marker.goal'
  };
  ML.KEY_COLORS = ['red', 'blue', 'green', 'gold', 'purple', 'cyan'];

  const pk = p => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4);
  function segKey(a, b) {
    const ka = pk(a), kb = pk(b);
    return ka < kb ? ka + '|' + kb : kb + '|' + ka;
  }
  function centroid(pts) {
    let x = 0, y = 0;
    for (const p of pts) { x += p[0]; y += p[1]; }
    return [x / pts.length, y / pts.length];
  }

  // ---- Rasters: leveren polygonen; buren worden later uit gedeelde randen afgeleid ----
  ML.TOPO = {
    square(w, h) {
      const out = [];
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++)
        out.push({ pts: [[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]], center: [c + 0.5, r + 0.5], grid: { r, c } });
      return out;
    },
    hex(w, h) {
      const R = 1 / SQ3, out = [];
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
        const cx = c + 0.5 * (r & 1), cy = r * SQ3 / 2, pts = [];
        for (let k = 0; k < 6; k++) {
          const a = (30 + 60 * k) * Math.PI / 180;
          pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
        }
        out.push({ pts, center: [cx, cy], grid: { r, c } });
      }
      return out;
    },
    tri(w, h) {
      const H = SQ3 / 2, out = [];
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
        const x = c * 0.5, y = r * H, up = ((r + c) & 1) === 0;
        const pts = up ? [[x, y + H], [x + 0.5, y], [x + 1, y + H]] : [[x, y], [x + 1, y], [x + 0.5, y + H]];
        out.push({ pts, center: centroid(pts), grid: { r, c, up } });
      }
      return out;
    },
    polar(R) {
      const n = [1];
      if (R > 1) n.push(6);
      for (let r = 2; r < R; r++) n.push(n[r - 1] * Math.max(1, Math.round(TAU * r / n[r - 1])));
      const pt = (rad, k, N) => { const a = TAU * k / N - Math.PI / 2; return [rad * Math.cos(a), rad * Math.sin(a)]; };
      const out = [];
      { // middelste cel
        const N = R > 1 ? n[1] * 4 : 24, pts = [];
        for (let k = 0; k < N; k++) pts.push(pt(1, k, N));
        out.push({ pts, center: [0, 0], grid: { ring: 0, i: 0 } });
      }
      for (let r = 1; r < R; r++) {
        const Nin = n[r] * 4, hasOuter = r < R - 1;
        const ratio = hasOuter ? n[r + 1] / n[r] : 1, Nout = hasOuter ? n[r + 1] * 4 : Nin;
        for (let j = 0; j < n[r]; j++) {
          const pts = [];
          for (let k = j * 4; k <= (j + 1) * 4; k++) pts.push(pt(r, k, Nin));
          for (let k = (j + 1) * 4 * ratio; k >= j * 4 * ratio; k--) pts.push(pt(r + 1, k, Nout));
          const a = TAU * (j + 0.5) / n[r] - Math.PI / 2;
          out.push({ pts, center: [(r + 0.5) * Math.cos(a), (r + 0.5) * Math.sin(a)], grid: { ring: r, i: j } });
        }
      }
      return out;
    }
  };

  // ---- Silhouetten (u,v in 0..1) ----
  const SHAPES = {
    circle: (u, v) => { const x = u * 2 - 1, y = v * 2 - 1; return x * x + y * y <= 1; },
    ring: (u, v) => { const x = u * 2 - 1, y = v * 2 - 1, r = x * x + y * y; return r <= 1 && r >= 0.16; },
    heart: (u, v) => {
      const x = (u * 2 - 1) * 1.25, y = -(v * 2 - 1) * 1.3 + 0.2, a = x * x + y * y - 1;
      return a * a * a - x * x * y * y * y <= 0;
    },
    star: (u, v) => {
      const x = u * 2 - 1, y = v * 2 - 1, r = Math.hypot(x, y), t = Math.atan2(y, x) + Math.PI / 2;
      return r <= 0.42 + 0.58 * Math.pow(Math.abs(Math.cos(2.5 * t)), 2.2);
    }
  };
  function textMask(text, aspect) {
    const cw = 600, ch = Math.max(20, Math.round(600 * aspect));
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d');
    let fs = ch * 0.78;
    g.font = `900 ${fs}px system-ui, sans-serif`;
    const tw = g.measureText(text).width;
    if (tw > cw * 0.94) { fs *= cw * 0.94 / tw; g.font = `900 ${fs}px system-ui, sans-serif`; }
    const w2 = g.measureText(text).width;
    g.textAlign = 'center';
    const base = ch * 0.5 + fs * 0.35;
    g.fillText(text, cw / 2, base);
    // onderstreping verbindt de letters tot één doolhof
    g.fillRect(cw / 2 - w2 / 2, base + fs * 0.06, w2, Math.max(fs * 0.12, ch * 0.08));
    const d = g.getImageData(0, 0, cw, ch).data;
    return (u, v) => {
      const x = Math.min(cw - 1, Math.floor(u * cw)), y = Math.min(ch - 1, Math.floor(v * ch));
      return d[(y * cw + x) * 4 + 3] > 100;
    };
  }
  ML.applyMask = function (polys, shape, text) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of polys) {
      minx = Math.min(minx, p.center[0]); maxx = Math.max(maxx, p.center[0]);
      miny = Math.min(miny, p.center[1]); maxy = Math.max(maxy, p.center[1]);
    }
    const W = maxx - minx || 1, H = maxy - miny || 1;
    const test = shape === 'text' ? textMask(text || 'MAZE', H / W) : SHAPES[shape];
    if (!test) return polys;
    return polys.filter(p => test((p.center[0] - minx) / W, (p.center[1] - miny) / H));
  };

  // Houd alleen het grootste samenhangende stuk over (generatoren hebben een verbonden graaf nodig).
  ML.largestComponent = function (polys) {
    if (polys.length < 2) return polys;
    const map = new Map(), adj = polys.map(() => []);
    polys.forEach((p, i) => {
      const P = p.pts;
      for (let k = 0; k < P.length; k++) {
        const a = P[k], b = P[(k + 1) % P.length];
        if (pk(a) === pk(b)) continue;
        const key = segKey(a, b), o = map.get(key);
        if (o === undefined) map.set(key, i);
        else if (o !== i) { adj[o].push(i); adj[i].push(o); }
      }
    });
    const comp = new Int32Array(polys.length).fill(-1);
    let best = -1, bestN = 0;
    for (let i = 0; i < polys.length; i++) {
      if (comp[i] >= 0) continue;
      const q = [i]; comp[i] = i;
      for (let h = 0; h < q.length; h++) for (const j of adj[q[h]]) if (comp[j] < 0) { comp[j] = i; q.push(j); }
      if (q.length > bestN) { bestN = q.length; best = i; }
    }
    return polys.filter((_, i) => comp[i] === best);
  };

  // ---- Graaf bouwen ----
  ML.buildMaze = function (polys, kind) {
    const cells = polys.map((p, i) => ({
      i, id: 'c' + i, type: 'cell', asset: ML.ASSETS.floor(kind),
      center: p.center, pts: p.pts, grid: p.grid, level: 0, nbrs: []
    }));
    const segs = new Map();
    for (const c of cells) {
      const P = c.pts;
      for (let k = 0; k < P.length; k++) {
        const a = P[k], b = P[(k + 1) % P.length];
        if (pk(a) === pk(b)) continue;
        const key = segKey(a, b);
        let e = segs.get(key);
        if (!e) { e = { a, b, cs: [] }; segs.set(key, e); }
        e.cs.push(c.i);
      }
    }
    const groups = new Map();
    for (const e of segs.values()) {
      const inner = e.cs.length >= 2;
      const A = inner ? Math.min(e.cs[0], e.cs[1]) : e.cs[0], B = inner ? Math.max(e.cs[0], e.cs[1]) : null;
      const gk = inner ? A + '-' + B : 'b' + A;
      let g = groups.get(gk);
      if (!g) { g = { a: A, b: B, segs: [] }; groups.set(gk, g); }
      g.segs.push([e.a[0], e.a[1], e.b[0], e.b[1]]);
    }
    const walls = [];
    for (const g of groups.values()) {
      let mx = 0, my = 0;
      for (const s of g.segs) { mx += (s[0] + s[2]) / 2; my += (s[1] + s[3]) / 2; }
      const w = {
        i: walls.length, id: 'w' + walls.length, type: 'wall',
        asset: g.b === null ? ML.ASSETS.wallBorder : ML.ASSETS.wallInner,
        a: g.a, b: g.b, segs: g.segs, mid: [mx / g.segs.length, my / g.segs.length],
        level: 0, open: false, door: null, oneway: null
      };
      walls.push(w);
      if (g.b !== null) {
        const ca = cells[g.a].center, cb = cells[g.b].center;
        const ang = Math.atan2(cb[1] - ca[1], cb[0] - ca[0]);
        cells[g.a].nbrs.push({ c: g.b, w: w.i, ang });
        cells[g.b].nbrs.push({ c: g.a, w: w.i, ang: ang + Math.PI });
      }
    }
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity, maxStep = 0;
    for (const c of cells) {
      for (const p of c.pts) {
        minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]);
        miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]);
      }
      for (const nb of c.nbrs) {
        const o = cells[nb.c].center;
        maxStep = Math.max(maxStep, Math.hypot(o[0] - c.center[0], o[1] - c.center[1]));
      }
    }
    const n = cells.length;
    return {
      kind, cells, walls, bounds: { minx, miny, maxx, maxy }, maxStep: maxStep || 1,
      start: 0, goal: 0, ready: false, solution: null,
      keys: [], keyAt: new Int8Array(n).fill(-1), doors: [], oneways: [],
      teleporters: [], telePartner: new Int32Array(n).fill(-1)
    };
  };

  ML.isAdjacent = (m, a, b) => m.cells[a].nbrs.some(nb => nb.c === b);

  // ---- Export voor 3D / later hergebruik ----
  ML.toJSON = function (m, meta) {
    const A = ML.ASSETS, C = m.cells, ents = [], assets = new Set();
    const r3 = v => Math.round(v * 1000) / 1000, P = p => [r3(p[0]), r3(p[1])];
    const add = e => { ents.push(e); assets.add(e.asset); return e; };
    add({ id: 'start', type: 'start', asset: A.start, cell: C[m.start].id, pos: P(C[m.start].center), level: 0 });
    add({ id: 'goal', type: 'goal', asset: A.goal, cell: C[m.goal].id, pos: P(C[m.goal].center), level: 0 });
    m.keys.forEach((k, i) => add({ id: 'key' + i, type: 'key', color: k.color, asset: A.key(k.color), cell: C[k.cell].id, pos: P(C[k.cell].center), level: 0 }));
    for (const wi of m.doors) {
      const w = m.walls[wi], s = w.segs[0], color = ML.KEY_COLORS[w.door];
      add({ id: 'door' + w.door, type: 'door', color, asset: A.door(color), wall: w.id, pos: P(w.mid), angle: r3(Math.atan2(s[3] - s[1], s[2] - s[0])), level: 0 });
    }
    for (const wi of m.oneways) {
      const w = m.walls[wi], to = w.oneway === w.a ? w.b : w.a, f = C[w.oneway].center, t = C[to].center;
      add({ id: 'oneway' + w.i, type: 'oneway', asset: A.oneway, wall: w.id, from: C[w.oneway].id, to: C[to].id, pos: P(w.mid), angle: r3(Math.atan2(t[1] - f[1], t[0] - f[0])), level: 0 });
    }
    m.teleporters.forEach((t, p) => {
      add({ id: `tele${p}a`, type: 'teleporter', pair: p, asset: A.teleporter(p), cell: C[t.a].id, partner: C[t.b].id, pos: P(C[t.a].center), level: 0 });
      add({ id: `tele${p}b`, type: 'teleporter', pair: p, asset: A.teleporter(p), cell: C[t.b].id, partner: C[t.a].id, pos: P(C[t.b].center), level: 0 });
    });
    const posts = new Map();
    for (const w of m.walls) if (!w.open) for (const s of w.segs)
      for (const q of [[s[0], s[1]], [s[2], s[3]]]) { const k = pk(q); if (!posts.has(k)) posts.set(k, P(q)); }
    for (const c of C) assets.add(c.asset);
    for (const w of m.walls) if (!w.open) assets.add(w.asset);
    if (posts.size) assets.add(A.post);
    return {
      format: 'maze-lab/1',
      created: new Date().toISOString(),
      meta,
      coords: { unit: '1 = celbreedte', axes2d: 'x rechts, y omlaag', axes3d: 'x→x, y→z, level→hoogte (y)' },
      assets: [...assets].sort(),
      cells: C.map(c => ({
        id: c.id, type: c.type, asset: c.asset, level: c.level, grid: c.grid,
        center: P(c.center), polygon: c.pts.map(P),
        links: c.nbrs.filter(nb => m.walls[nb.w].open).map(nb => C[nb.c].id)
      })),
      walls: m.walls.filter(w => !w.open).map(w => ({
        id: w.id, type: w.type, asset: w.door !== null ? A.door(ML.KEY_COLORS[w.door]) : w.asset, level: w.level,
        between: [C[w.a].id, w.b === null ? null : C[w.b].id], segments: w.segs.map(s => s.map(r3))
      })),
      posts: [...posts.values()].map((p, i) => ({ id: 'p' + i, type: 'post', asset: A.post, pos: p, level: 0 })),
      entities: ents,
      solution: m.solution ? m.solution.map(i => C[i].id) : null
    };
  };
})(window.ML = window.ML || {});
