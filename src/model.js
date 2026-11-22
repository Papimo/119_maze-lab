// Doolhof-model: algemene graaf van cellen (vloer) en muren.
// Elk element heeft id + type + asset-naam: koppelpunt voor 3D-modellen later.
// Coördinaten: 1 eenheid = celbreedte. 2D: x rechts, y omlaag. 3D: x→x, y→z, level→hoogte.
(function (ML) {
  'use strict';
  const SQ3 = Math.sqrt(3);
  const TAU = Math.PI * 2;

  ML.ASSETS = {
    floor: kind => `floor.${kind}`,      // floor.square | floor.hex | floor.tri | floor.polar
    terrain: id => `terrain.${id}`,      // laag op de vloer: terrain.mud | terrain.water | terrain.ice
    wallInner: 'wall.inner',
    wallBorder: 'wall.border',
    wallWrap: 'wall.wrap',               // torus: rand die aan de overkant doorloopt
    post: 'wall.post',                   // paaltje op muurhoeken
    stair: dir => `stair.${dir}`,        // stair.up | stair.down
    door: color => `door.${color}`,
    key: color => `key.${color}`,
    lever: color => `switch.${color}`,
    switchDoor: color => `door.switch.${color}`,
    timedDoor: 'door.timed',
    teleporter: pair => `teleporter.${pair}`,
    oneway: 'marker.oneway',
    start: 'marker.start',
    goal: 'marker.goal'
  };
  ML.KEY_COLORS = ['red', 'blue', 'green', 'gold', 'purple', 'cyan'];
  ML.SWITCH_COLORS = ['orange', 'pink', 'lime'];
  // Kosten = prijs om de cel binnen te gaan. IJs glijdt (goedkoper).
  ML.TERRAIN = [
    { id: 'normal', name: 'Gewoon', cost: 1 },
    { id: 'mud', name: 'Modder', cost: 3 },
    { id: 'water', name: 'Water', cost: 6 },
    { id: 'ice', name: 'IJs', cost: 0.5 }
  ];

  // Prioriteitsrij (kleinste eerst) voor Dijkstra/A*.
  ML.Heap = class {
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
  };

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
  // o.levels: aantal verdiepingen (naast elkaar getekend, verschoven met levelDX).
  // o.torus {w,h}: vierkant raster waarvan de randen aan de overkant doorlopen.
  // o.sq {w,h}: gewoon rechthoekig vierkant raster (voor rij-makers als Eller).
  ML.buildMaze = function (polys, kind, o) {
    o = o || {};
    const L = Math.max(1, Math.min(4, (o.levels | 0) || 1)), np = polys.length;
    let bx0 = Infinity, bx1 = -Infinity;
    for (const p of polys) for (const q of p.pts) { if (q[0] < bx0) bx0 = q[0]; if (q[0] > bx1) bx1 = q[0]; }
    const levelW = bx1 - bx0, dx = L > 1 ? levelW + Math.max(1.5, levelW * 0.08) : 0;
    const cells = [];
    for (let l = 0; l < L; l++) for (let j = 0; j < np; j++) {
      const p = polys[j], off = l * dx;
      cells.push({
        i: cells.length, id: 'c' + cells.length, type: 'cell', asset: ML.ASSETS.floor(kind),
        center: [p.center[0] + off, p.center[1]], lc: p.center,
        pts: off ? p.pts.map(q => [q[0] + off, q[1]]) : p.pts,
        grid: p.grid, level: l, nbrs: []
      });
    }
    const tor = o.torus || null, gridIdx = new Map();
    if (tor) for (const c of cells) gridIdx.set(c.level + ',' + c.grid.r + ',' + c.grid.c, c.i);
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
    const eq = (u, v) => Math.abs(u - v) < 1e-6;
    const groups = new Map();
    for (const e of segs.values()) {
      let A, B = null, wrap = false;
      if (e.cs.length >= 2) { A = Math.min(e.cs[0], e.cs[1]); B = Math.max(e.cs[0], e.cs[1]); }
      else {
        A = e.cs[0];
        if (tor) { // randstuk → cel aan de overkant
          const c = cells[A], off = c.level * dx, ax = e.a[0] - off, bx = e.b[0] - off, r = c.grid.r, cc = c.grid.c, l = c.level;
          let pr;
          if (eq(ax, 0) && eq(bx, 0)) pr = gridIdx.get(l + ',' + r + ',' + (tor.w - 1));
          else if (eq(ax, tor.w) && eq(bx, tor.w)) pr = gridIdx.get(l + ',' + r + ',0');
          else if (eq(e.a[1], 0) && eq(e.b[1], 0)) pr = gridIdx.get(l + ',' + (tor.h - 1) + ',' + cc);
          else if (eq(e.a[1], tor.h) && eq(e.b[1], tor.h)) pr = gridIdx.get(l + ',0,' + cc);
          if (pr !== undefined && pr !== A) { B = Math.max(A, pr); A = Math.min(A, pr); wrap = true; }
        }
      }
      const gk = B !== null ? A + '-' + B : 'b' + A;
      let g = groups.get(gk);
      if (!g) { g = { a: A, b: B, segs: [], wrap: false, wm: null }; groups.set(gk, g); }
      g.segs.push([e.a[0], e.a[1], e.b[0], e.b[1]]);
      if (wrap) { g.wrap = true; g.wm = g.wm || {}; g.wm[e.cs[0]] = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]; }
    }
    const walls = [];
    const newWall = props => {
      const w = Object.assign({
        i: walls.length, id: 'w' + walls.length, type: 'wall', level: 0, open: false,
        door: null, oneway: null, sw: null, swInv: false, timed: null, stair: false, wrap: false, wm: null
      }, props);
      walls.push(w);
      return w;
    };
    for (const g of groups.values()) {
      let mx = 0, my = 0;
      for (const s of g.segs) { mx += (s[0] + s[2]) / 2; my += (s[1] + s[3]) / 2; }
      const w = newWall({
        asset: g.b === null ? ML.ASSETS.wallBorder : g.wrap ? ML.ASSETS.wallWrap : ML.ASSETS.wallInner,
        a: g.a, b: g.b, segs: g.segs, level: cells[g.a].level, wrap: g.wrap, wm: g.wm,
        mid: g.wrap ? g.wm[g.a] : [mx / g.segs.length, my / g.segs.length]
      });
      if (g.b !== null) {
        const ca = cells[g.a].center, cb = cells[g.b].center;
        let angA, angB;
        if (g.wrap) { // richting = naar de eigen rand, niet dwars door het doolhof
          angA = Math.atan2(g.wm[g.a][1] - ca[1], g.wm[g.a][0] - ca[0]);
          angB = Math.atan2(g.wm[g.b][1] - cb[1], g.wm[g.b][0] - cb[0]);
        } else { angA = Math.atan2(cb[1] - ca[1], cb[0] - ca[0]); angB = angA + Math.PI; }
        cells[g.a].nbrs.push({ c: g.b, w: w.i, ang: angA });
        cells[g.b].nbrs.push({ c: g.a, w: w.i, ang: angB });
      }
    }
    // Trappen: kandidaat-doorgangen tussen dezelfde plek op twee verdiepingen. Makers openen er een paar.
    if (L > 1) {
      const rng = ML.makeRng((o.seed || '') + '|stairs'), k = Math.max(1, Math.round(np / 25));
      let prev = new Set();
      for (let l = 0; l + 1 < L; l++) {
        const picks = rng.shuffle([...Array(np).keys()].filter(j => !prev.has(j))).slice(0, k);
        for (const j of picks) {
          const a = l * np + j, b = a + np;
          const w = newWall({ type: 'stair', asset: ML.ASSETS.stair('up'), a, b, segs: [], mid: cells[a].center, level: l, stair: true });
          cells[a].nbrs.push({ c: b, w: w.i, ang: -Math.PI / 2 });
          cells[b].nbrs.push({ c: a, w: w.i, ang: Math.PI / 2 });
        }
        prev = new Set(picks);
      }
    }
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity, maxStep = 0;
    for (const c of cells) {
      for (const p of c.pts) {
        minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]);
        miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]);
      }
      for (const nb of c.nbrs) {
        const w = walls[nb.w];
        if (w.stair || w.wrap) continue;
        const q = cells[nb.c].lc;
        maxStep = Math.max(maxStep, Math.hypot(q[0] - c.lc[0], q[1] - c.lc[1]));
      }
    }
    const n = cells.length;
    return {
      kind, cells, walls, bounds: { minx, miny, maxx, maxy }, maxStep: maxStep || 1,
      levels: L, np, levelDX: dx, levelW, levelX0: bx0, torus: tor, sq: o.sq || null,
      start: 0, goal: 0, ready: false, solution: null, solutionStates: null, solutionCost: 0,
      keys: [], keyAt: new Int8Array(n).fill(-1), doors: [], oneways: [],
      teleporters: [], telePartner: new Int32Array(n).fill(-1),
      terrain: new Uint8Array(n), cost: new Float32Array(n).fill(1), minCost: 1, weighted: false,
      switches: [], switchAt: new Int8Array(n).fill(-1), swDoors: [], timed: [], period: 6
    };
  };

  // Doolhof uit instellingen (vorm + silhouet + verdiepingen + torus). Nog zonder gangen.
  ML.makeMaze = function (s, aspect) {
    const size = s.size | 0, torus = !!s.torus && s.grid === 'square';
    const L = Math.max(1, Math.min(4, (s.levels | 0) || 1));
    aspect = s.aspect || aspect || 0.66;
    let polys, sq = null, tor = null;
    if (s.grid === 'polar') polys = ML.TOPO.polar(Math.max(3, Math.round(size / 2)));
    else {
      const shape = torus ? 'rect' : s.shape;
      const a = shape === 'text' ? 0.32 : shape !== 'rect' ? 1 : Math.min(1.6, aspect * L);
      const rowsHex = Math.max(3, Math.round(size * a / (SQ3 / 2)));
      if (s.grid === 'hex') polys = ML.TOPO.hex(size, rowsHex);
      else if (s.grid === 'tri') polys = ML.TOPO.tri(size * 2, rowsHex);
      else {
        const rows = Math.max(3, Math.round(size * a));
        polys = ML.TOPO.square(size, rows);
        if (shape === 'rect') sq = { w: size, h: rows };
        if (torus) tor = { w: size, h: rows };
      }
      if (shape !== 'rect') polys = ML.applyMask(polys, shape, s.text);
    }
    polys = ML.largestComponent(polys);
    return ML.buildMaze(polys, s.grid, { levels: L, torus: tor, sq, seed: s.seed });
  };

  // Open doorgang tussen twee cellen (of null).
  ML.edge = function (m, a, b) {
    for (const nb of m.cells[a].nbrs) if (nb.c === b && m.walls[nb.w].open) return m.walls[nb.w];
    return null;
  };
  ML.isAdjacent = (m, a, b) => ML.edge(m, a, b) !== null;

  // ---- Export voor 3D / later hergebruik ----
  // Coördinaten per verdieping lokaal (zelfde x/y op elke verdieping), hoogte = level.
  ML.toJSON = function (m, meta) {
    const A = ML.ASSETS, C = m.cells, ents = [], assets = new Set(), dx = m.levelDX;
    const r3 = v => Math.round(v * 1000) / 1000, P = p => [r3(p[0]), r3(p[1])];
    const loc = (p, l) => P([p[0] - l * dx, p[1]]);
    const cpos = i => loc(C[i].center, C[i].level);
    const ang = w => { const s = w.segs[0]; return s ? r3(Math.atan2(s[3] - s[1], s[2] - s[0])) : 0; };
    const add = e => { ents.push(e); assets.add(e.asset); return e; };
    add({ id: 'start', type: 'start', asset: A.start, cell: C[m.start].id, pos: cpos(m.start), level: C[m.start].level });
    add({ id: 'goal', type: 'goal', asset: A.goal, cell: C[m.goal].id, pos: cpos(m.goal), level: C[m.goal].level });
    m.keys.forEach((k, i) => add({ id: 'key' + i, type: 'key', color: k.color, asset: A.key(k.color), cell: C[k.cell].id, pos: cpos(k.cell), level: C[k.cell].level }));
    for (const wi of m.doors) {
      const w = m.walls[wi], color = ML.KEY_COLORS[w.door];
      add({ id: 'door' + w.door, type: 'door', color, asset: A.door(color), wall: w.id, pos: loc(w.mid, w.level), angle: ang(w), level: w.level });
    }
    m.switches.forEach((sw, j) => add({ id: 'switch' + j, type: 'switch', color: sw.color, asset: A.lever(sw.color), cell: C[sw.cell].id, pos: cpos(sw.cell), level: C[sw.cell].level }));
    for (const wi of m.swDoors) {
      const w = m.walls[wi], color = ML.SWITCH_COLORS[w.sw];
      add({ id: 'swdoor' + w.i, type: 'switchDoor', color, asset: A.switchDoor(color), wall: w.id, switch: 'switch' + w.sw, startsOpen: w.swInv, pos: loc(w.mid, w.level), angle: ang(w), level: w.level });
    }
    for (const wi of m.timed) {
      const w = m.walls[wi];
      add({ id: 'timed' + w.i, type: 'timedDoor', asset: A.timedDoor, wall: w.id, period: m.period, openSteps: w.timed.open, phase: w.timed.phase, pos: loc(w.mid, w.level), angle: ang(w), level: w.level });
    }
    for (const wi of m.oneways) {
      const w = m.walls[wi], to = w.oneway === w.a ? w.b : w.a, f = C[w.oneway].center, t = C[to].center;
      add({ id: 'oneway' + w.i, type: 'oneway', asset: A.oneway, wall: w.id, from: C[w.oneway].id, to: C[to].id, pos: loc(w.mid, w.level), angle: r3(Math.atan2(t[1] - f[1], t[0] - f[0])), level: w.level });
    }
    m.teleporters.forEach((t, p) => {
      add({ id: `tele${p}a`, type: 'teleporter', pair: p, asset: A.teleporter(p), cell: C[t.a].id, partner: C[t.b].id, pos: cpos(t.a), level: C[t.a].level });
      add({ id: `tele${p}b`, type: 'teleporter', pair: p, asset: A.teleporter(p), cell: C[t.b].id, partner: C[t.a].id, pos: cpos(t.b), level: C[t.b].level });
    });
    for (const w of m.walls) if (w.stair && w.open) {
      add({ id: 'stair' + w.i, type: 'stair', asset: A.stair('up'), from: C[w.a].id, to: C[w.b].id, pos: cpos(w.a), level: C[w.a].level, toLevel: C[w.b].level });
      assets.add(A.stair('down'));
    }
    const posts = new Map();
    for (const w of m.walls) if (!w.open && !w.stair) for (const s of w.segs)
      for (const q of [[s[0], s[1]], [s[2], s[3]]]) {
        const k = w.level + ':' + pk(q);
        if (!posts.has(k)) posts.set(k, { pos: loc(q, w.level), level: w.level });
      }
    for (const c of C) { assets.add(c.asset); if (m.terrain[c.i]) assets.add(A.terrain(ML.TERRAIN[m.terrain[c.i]].id)); }
    for (const w of m.walls) if (!w.open && !w.stair) assets.add(w.asset);
    if (posts.size) assets.add(A.post);
    return {
      format: 'maze-lab/2',
      created: new Date().toISOString(),
      meta,
      coords: { unit: '1 = celbreedte', axes2d: 'x rechts, y omlaag', axes3d: 'x→x, y→z, level→hoogte (y)' },
      levels: m.levels, torus: m.torus, timedPeriod: m.timed.length ? m.period : null,
      assets: [...assets].sort(),
      cells: C.map(c => {
        const t = m.terrain[c.i], o = {
          id: c.id, type: c.type, asset: c.asset, level: c.level, grid: c.grid,
          center: cpos(c.i), polygon: c.pts.map(p => loc(p, c.level)),
          links: c.nbrs.filter(nb => m.walls[nb.w].open).map(nb => C[nb.c].id)
        };
        if (t) { o.terrain = ML.TERRAIN[t].id; o.terrainAsset = A.terrain(o.terrain); o.cost = ML.TERRAIN[t].cost; }
        return o;
      }),
      walls: m.walls.filter(w => !w.open && !w.stair).map(w => ({
        id: w.id, type: w.type, asset: w.asset, level: w.level, wrap: w.wrap || undefined,
        between: [C[w.a].id, w.b === null ? null : C[w.b].id],
        segments: w.segs.map(s => [r3(s[0] - w.level * dx), r3(s[1]), r3(s[2] - w.level * dx), r3(s[3])])
      })),
      posts: [...posts.values()].map((p, i) => ({ id: 'p' + i, type: 'post', asset: A.post, pos: p.pos, level: p.level })),
      entities: ents,
      solution: m.solution ? m.solution.map(i => C[i].id) : null
    };
  };
})(window.ML = window.ML || {});
