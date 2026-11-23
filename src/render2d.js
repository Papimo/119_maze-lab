// 2D-weergave op canvas. Leest alleen het model + view-state; 3D-weergave kan later naast deze komen.
// draw() geeft true terug zolang er iets beweegt (dan tekent de Runner het volgende beeld ook).
(function (ML) {
  'use strict';
  const TAU = Math.PI * 2;
  const KEYCOL = { red: '#e5484d', blue: '#3e7bfa', green: '#30a46c', gold: '#f5b301', purple: '#8e4ec6', cyan: '#12a5b8' };
  const SWCOL = { orange: '#ff8c42', pink: '#ff5fa2', lime: '#9be15d' };
  const TERCOL = [null, '#7a5230', '#2f7fd8', '#bfefff'];
  const TIMEDCOL = '#ff9f1c';
  ML.KEYCOL = KEYCOL; ML.SWCOL = SWCOL; ML.TERCOL = TERCOL;
  ML.teleColor = p => `hsl(${(p * 137 + 200) % 360} 90% 62%)`;

  // maq = kartonnen maquette: muren met hoogte (h, in celmaten), lagen in cache, rustig leven.
  ML.PALETTES = {
    maquette: { name: 'Kartonnen maquette', bg: '#cfc6b6', floor: '#f1ebdf', dark: '#d9cfbd', wall: '#fffaf0', label: '#6b5d48', cur: '#c8322f', walk: '#e2a184', visitA: '#efe1c2', visitB: '#a9cfc0', front: '#d9a441', path: '#c8322f', start: '#2f8f74', goal: '#c8322f', accent: '#8d6a3a',
      maq: { bg2: '#a99f8e', grain: 'rgba(120,95,60,0.05)', top: '#fffaf0', side: '#cdbfa6', sideLo: '#b4a589', border: '#8d806a', w: 0.13, h: 0.34,
        shadow: ['rgba(70,48,20,0.36)', 0.2, 0.26, 0.3], pathW: 0.09, ter: [null, '#a07a52', '#5aa0d8', '#dceef5'], terA: [0, 0.55, 0.75, 0.8] } },
    blauwdruk: { name: 'Blauwdruk', bg: '#0f2c4c', floor: '#143a63', dark: '#0b2240', wall: '#e9f2ff', cur: '#ffd166', walk: '#ff8fab', visitA: '#1f5f8b', visitB: '#7fc8e8', front: '#ffd166', path: '#ffd166', start: '#06d6a0', goal: '#ef476f', accent: '#ffd166' },
    neon: { name: 'Neon', bg: '#07060d', floor: '#0e0c1a', dark: '#07060d', wall: '#7df9ff', cur: '#ffffff', walk: '#ff4fd8', visitA: '#3a0ca3', visitB: '#f72585', front: '#ffffff', path: '#fffb7d', start: '#39ff14', goal: '#ff3864', accent: '#fffb7d', glow: true },
    aurora: { name: 'Aurora (nacht)', bg: '#05101a', floor: '#0a1824', dark: '#050c14', wall: '#9fffe0', cur: '#ffffff', walk: '#c58bff', visitA: '#0d4f5c', visitB: '#8a4dff', front: '#e6fffa', path: '#ffe08a', start: '#5dffb0', goal: '#ff7ab8', accent: '#9fffe0', glow: true, aurora: true },
    zon: { name: 'Zonsondergang', bg: '#2b1638', floor: '#3a1d45', dark: '#22102c', wall: '#ffd9a8', cur: '#fff4e0', walk: '#ff8a65', visitA: '#6b2d5c', visitB: '#ff9e5e', front: '#ffe3b3', path: '#fff1c1', start: '#7cf0c8', goal: '#ff5d73', accent: '#ffd9a8', glow: true, sunset: true },
    papier: { name: 'Papier', bg: '#e9dfc8', floor: '#f7f0df', dark: '#dccfb2', wall: '#2b2118', cur: '#c0392b', walk: '#d98e73', visitA: '#efe0b0', visitB: '#94d2bd', front: '#ee9b00', path: '#c0392b', start: '#2a9d8f', goal: '#c0392b', accent: '#9b2226' }
  };

  const hex2rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgbStr = (A, B, t) => `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
  const BUCKETS = 64;
  ML.ANIM = { RIP: 0.6, TAIL: 0.45, WALL: 0.42, CLOCK: 0.7, HEAD: 0.12 };
  const A = ML.ANIM;
  const END = 2.6; // eindscène in seconden
  const PATH_FADE_AT = 1.8, PATH_FADE = 1.8, PATH_FADE_TO = 0.28; // oplossing vervaagt na de eindgolf
  const shade = (hex, f) => { const c = hex2rgb(hex).map(v => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)); return `rgb(${c[0]},${c[1]},${c[2]})`; };
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  ML.Render2D = class {
    constructor(canvas) { this.cv = canvas; this.g = canvas.getContext('2d'); this.pal = ML.PALETTES.blauwdruk; this._grad = null; }
    setPalette(p) { this.pal = p; this._grad = null; }
    grad() {
      if (!this._grad) {
        const a = hex2rgb(this.pal.visitA), b = hex2rgb(this.pal.visitB);
        this._grad = []; this._gradRGB = [];
        for (let i = 0; i < BUCKETS; i++) {
          const t = i / (BUCKETS - 1);
          this._grad.push(rgbStr(a, b, t));
          this._gradRGB.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
        }
      }
      return this._grad;
    }
    fit(m) {
      const cv = this.cv, b = m.bounds, M = this.pal.maq, hh = M && !this.noWalls ? M.h : 0;
      const pad = Math.max(10, Math.min(cv.width, cv.height) * (M ? 0.05 : 0.04)) + (m.levels > 1 ? 14 : 0);
      const bw = b.maxx - b.minx || 1, bh = (b.maxy - b.miny || 1) + hh;
      this.s = Math.max(0.1, Math.min((cv.width - 2 * pad) / bw, (cv.height - 2 * pad) / bh));
      this.ox = (cv.width - bw * this.s) / 2 - b.minx * this.s;
      this.oy = (cv.height - bh * this.s) / 2 - b.miny * this.s + hh * this.s;
      this.hp = hh * this.s; // muurhoogte in px
    }
    // ---- maquette: vaste lagen ----
    cellsPath(list) { const p = new Path2D(), C = this.m.cells; for (const i of list) this.poly(p, C[i].pts); return p; }
    wallPath(m, anim) {
      const p = new Path2D();
      for (const w of m.walls) if (!w.open && !w.stair && !(anim && anim.has(w.i))) this.segPath(p, w);
      return p;
    }
    // Tafel, grondplaat, vloer, korrel, zalen. Opnieuw bij ander doolhof/formaat/palet.
    floorLayer(m) {
      const cv = this.cv, W = cv.width, H = cv.height, M = this.pal.maq, s = this.s, hp = this.hp;
      const key = [W, H, s, this.ox, this.oy, m.ready ? 1 : 0].join();
      const L = this._floor;
      if (L && L.m === m && L.key === key && L.pal === this.pal) return L.c;
      const c = L && L.c.width === W && L.c.height === H ? L.c : mkCanvas(W, H), f = c.getContext('2d');
      f.setTransform(1, 0, 0, 1, 0, 0);
      const gr = f.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
      gr.addColorStop(0, this.pal.bg); gr.addColorStop(1, M.bg2); f.fillStyle = gr; f.fillRect(0, 0, W, H);
      const all = this.cellsPath(m.cells.map(x => x.i));
      f.save(); f.translate(0, hp * 0.35); f.fillStyle = f.strokeStyle = M.border; f.lineWidth = s * 0.3; f.lineJoin = 'round'; f.fill(all); f.stroke(all); f.restore();
      f.fillStyle = f.strokeStyle = this.pal.floor; f.lineWidth = 1; f.fill(all); f.stroke(all);
      const r = ML.makeRng('korrel'), n = Math.min(60000, Math.round(W * H / 260));
      f.save(); f.clip(all); f.fillStyle = M.grain;
      for (let i = 0; i < n; i++) { const z = 0.6 + r() * 1.6; f.fillRect(r() * W, r() * H, z, z); }
      f.restore();
      if (m.rooms && m.rooms.length) { const p = this.cellsPath(m.rooms.flat()); f.fillStyle = f.strokeStyle = shade(this.pal.floor, -0.07); f.fill(p); f.stroke(p); }
      this._floor = { m, key, pal: this.pal, c };
      return c;
    }
    // Muren: slagschaduw, zijkant (gestapeld per px), bovenkant. Vast doolhof → cache; tijdens bouwen goedkoop en direct.
    maqWalls(g, m, anim, live) {
      const cv = this.cv, M = this.pal.maq, s = this.s, hp = this.hp * (live && this.rise != null ? this.rise : 1), lw = Math.max(1.2, s * M.w);
      const key = [cv.width, cv.height, s, this.ox, this.oy].join();
      if (!live && this._walls && this._walls.m === m && this._walls.key === key && this._walls.pal === this.pal) { g.drawImage(this._walls.c, 0, 0); return; }
      let t = g, c = null;
      if (!live) { c = this._walls && this._walls.c.width === cv.width && this._walls.c.height === cv.height ? this._walls.c : mkCanvas(cv.width, cv.height); t = c.getContext('2d'); t.setTransform(1, 0, 0, 1, 0, 0); t.clearRect(0, 0, c.width, c.height); }
      const P = this.wallPath(m, anim), [col, dx, dy, bl] = M.shadow;
      t.save(); t.lineCap = 'square'; t.lineJoin = 'miter'; t.lineWidth = lw;
      if (live) { t.save(); t.translate(dx * s, dy * s); t.strokeStyle = 'rgba(70,48,20,0.22)'; t.stroke(P); t.restore(); }
      else { t.save(); t.shadowColor = col; t.shadowOffsetX = dx * s; t.shadowOffsetY = dy * s; t.shadowBlur = bl * s; t.strokeStyle = col; t.stroke(P); t.restore(); }
      const steps = Math.ceil(hp), inc = live ? Math.max(1, hp / 5) : 1;
      for (let k = 0; k <= steps; k += inc) { t.save(); t.translate(0, -Math.min(k, hp)); t.strokeStyle = k < steps * 0.25 ? M.sideLo : M.side; t.stroke(P); t.restore(); }
      t.translate(0, -hp); t.strokeStyle = M.top; t.stroke(P);
      t.restore();
      if (!live) { this._walls = { m, key, pal: this.pal, c }; g.drawImage(c, 0, 0); }
      else this._walls = null;
    }
    // Water golft, ijs glinstert (rustig leven; t = 0 → stil).
    lifeFloor(g, m, t) {
      const s = this.s, C = m.cells;
      g.save(); g.lineWidth = Math.max(1, s * 0.045); g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,255,0.65)'; g.beginPath();
      for (let i = 0; i < C.length; i++) if (m.terrain[i] === 2) {
        const x = this.X(C[i].center[0]), y = this.Y(C[i].center[1]), u = s * 0.12;
        for (let k = -1; k <= 1; k += 2) {
          const yy = y + k * s * 0.15, ph = t * 2.2 + i * 0.7 + k;
          g.moveTo(x - 2.4 * u, yy + Math.sin(ph - 2.6) * u * 0.4);
          for (let j = -2; j <= 2; j++) g.lineTo(x + j * u * 1.2, yy + Math.sin(ph + j * 1.3) * u * 0.4);
        }
      }
      g.stroke();
      g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(1, s * 0.04);
      for (let i = 0; i < C.length; i++) if (m.terrain[i] === 3) {
        const ph = (t * 0.55 + (i * 0.618) % 1) % 1; if (ph > 0.18) continue;
        const k = Math.sin(ph / 0.18 * Math.PI), x = this.X(C[i].center[0]) + s * ((i * 37 % 7) / 7 - 0.5) * 0.5, y = this.Y(C[i].center[1]), u = s * 0.2 * k;
        g.globalAlpha = k; g.beginPath(); g.moveTo(x - u, y); g.lineTo(x + u, y); g.moveTo(x, y - u); g.lineTo(x, y + u); g.stroke();
      }
      g.restore();
    }
    X(x) { return this.ox + x * this.s; }
    Y(y) { return this.oy + y * this.s; }
    poly(g, pts) {
      g.moveTo(this.X(pts[0][0]), this.Y(pts[0][1]));
      for (let i = 1; i < pts.length; i++) g.lineTo(this.X(pts[i][0]), this.Y(pts[i][1]));
      g.closePath();
    }
    polyScaled(g, c, f) {
      const cx = c.center[0], cy = c.center[1], P = c.pts;
      g.moveTo(this.X(cx + (P[0][0] - cx) * f), this.Y(cy + (P[0][1] - cy) * f));
      for (let i = 1; i < P.length; i++) g.lineTo(this.X(cx + (P[i][0] - cx) * f), this.Y(cy + (P[i][1] - cy) * f));
      g.closePath();
    }
    fillCells(list, color, alpha) {
      if (!list.length) return;
      const g = this.g, C = this.m.cells;
      g.beginPath();
      for (const i of list) this.poly(g, C[i].pts);
      g.globalAlpha = alpha == null ? 1 : alpha;
      g.fillStyle = color; g.fill();
      g.strokeStyle = color; g.lineWidth = 0.6; g.stroke(); // dicht naadjes tussen cellen
      g.globalAlpha = 1;
    }
    segPath(g, w) { for (const q of w.segs) { g.moveTo(this.X(q[0]), this.Y(q[1])); g.lineTo(this.X(q[2]), this.Y(q[3])); } }
    // Cel onder een schermpunt (canvas-pixels) of -1.
    cellAt(px, py) {
      const m = this.m;
      if (!m || !this.s) return -1;
      const x = (px - this.ox) / this.s, y = (py - this.oy) / this.s;
      for (const c of m.cells) {
        const P = c.pts;
        let inside = false;
        for (let i = 0, j = P.length - 1; i < P.length; j = i++)
          if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) inside = !inside;
        if (inside) return c.i;
      }
      return -1;
    }
    // Toestand voor deuren/hendels/sleutels: uit vs.state, anders klok (tijddeuren) en alles dicht.
    stateOf(m, vs, now) {
      if (vs.state != null && vs.P) return vs.P.dec(vs.state);
      return { k: 0, sw: 0, t: m.timed.length ? Math.floor(now / A.CLOCK) % m.period : 0, clock: true };
    }
    head(x, y, col, r) {
      const g = this.g, X = this.X(x), Y = this.Y(y), R = this.s * (r || 0.22);
      const gr = g.createRadialGradient(X, Y, 0, X, Y, R * 3.2);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.18, col); gr.addColorStop(0.45, col + '55'); gr.addColorStop(1, col + '00');
      g.fillStyle = gr; g.beginPath(); g.arc(X, Y, R * 3.2, 0, TAU); g.fill();
      g.fillStyle = col; g.beginPath(); g.arc(X, Y, R * 0.8, 0, TAU); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(X, Y, R * 0.35, 0, TAU); g.fill();
    }
    // Race-deelnemers: bezochte cellen = speldjes in het eigen kwadrant, staart + kop, daarna de route.
    drawRace(g, m, R, now, lw) {
      const C = m.cells, s = this.s, M = this.pal.maq, n = R.length, Q = n > 1 ? [[-1, -1], [1, -1], [-1, 1], [1, 1]] : [[0, 0]];
      const off = 0.2, rad = Math.max(1.2, s * 0.09);
      let busy = false;
      R.forEach((r, k) => {
        const q = Q[k % Q.length], ox = q[0] * off, oy = q[1] * off, px = c => this.X(C[c].center[0] + ox * 0.6), py = c => this.Y(C[c].center[1] + oy * 0.6);
        g.globalAlpha = r.done && r.path ? 0.35 : 0.6; g.fillStyle = r.col; g.beginPath();
        if (!this.hideList) for (const i of r.list) { const x = this.X(C[i].center[0] + ox), y = this.Y(C[i].center[1] + oy); g.moveTo(x + rad, y); g.arc(x, y, rad, 0, TAU); }
        g.fill(); g.globalAlpha = 1;
        if (!r.done) { // staart
          busy = true;
          g.strokeStyle = r.col; g.lineCap = 'round';
          for (let i = 1; i < r.tail.length; i++) {
            const a = r.tail[i - 1].c, b = r.tail[i].c, w = ML.edge(m, a, b);
            if (!w || w.wrap || w.stair) continue;
            g.globalAlpha = 0.25 + 0.55 * i / r.tail.length; g.lineWidth = Math.max(1, s * 0.14 * i / r.tail.length);
            g.beginPath(); g.moveTo(px(a), py(a)); g.lineTo(px(b), py(b)); g.stroke();
          }
          g.globalAlpha = 1;
          const c = C[r.cur].center; this.head(c[0] + ox * 0.6, c[1] + oy * 0.6, r.col, 0.15);
          return;
        }
        if (!r.path) return;
        const L = r.path.length - 1, upto = Math.floor(Math.min(1, r.pathT) * L);
        if (r.pathT < 1) busy = true;
        g.strokeStyle = r.col; g.lineWidth = Math.max(2, s * (r.rank === 1 ? 0.11 : 0.07)); g.lineCap = 'round'; g.lineJoin = 'round';
        if (M) { g.shadowColor = 'rgba(60,30,10,0.3)'; g.shadowOffsetX = s * 0.04; g.shadowOffsetY = s * 0.06; }
        g.beginPath();
        for (let i = 0; i <= upto; i++) {
          const c = r.path[i];
          if (i === 0) { g.moveTo(px(c), py(c)); continue; }
          const w = ML.edge(m, r.path[i - 1], c);
          if (!w || w.stair || w.wrap) g.moveTo(px(c), py(c)); else g.lineTo(px(c), py(c));
        }
        g.stroke(); g.shadowColor = 'transparent'; g.shadowOffsetX = g.shadowOffsetY = 0;
        const hc = C[r.path[upto]].center; this.head(hc[0] + ox * 0.6, hc[1] + oy * 0.6, r.col, 0.13);
      });
      const win = R.find(r => r.rank === 1);
      if (win) { // vlaggetje van de winnaar op het doel
        const c = C[m.goal].center, x = this.X(c[0]), y = this.Y(c[1]), wv = this.pal.maq ? Math.sin(now * 3) * s * 0.04 : 0; // golft mee met rustig leven
        g.strokeStyle = this.pal.label || this.pal.wall; g.lineWidth = Math.max(1.5, s * 0.06);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - s * 0.9); g.stroke();
        g.fillStyle = win.col; g.beginPath(); g.moveTo(x, y - s * 0.9); g.quadraticCurveTo(x + s * 0.3, y - s * 0.8 + wv, x + s * 0.55, y - s * 0.72); g.lineTo(x, y - s * 0.55); g.closePath(); g.fill();
      }
      return busy;
    }
    // Brugdek over de kruiscel (weave): slagschaduw op de vloer, dikte, dek met randen en planken.
    // Maquette: aangeroepen binnen translate(0,-hp) → dek ligt op muurhoogte.
    bridgeDecks(g, m, lw) {
      const P = this.pal, M = P.maq, s = this.s, hp = this.hp, C = m.cells;
      const top = M ? M.top : P.floor, side = M ? M.side : P.wall, edge = M ? M.sideLo : P.wall;
      for (const wi of m.bridges) {
        const w = m.walls[wi], a = C[w.a].center, b = C[w.b].center, v = C[w.via].center;
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = Math.hypot(b[0] - a[0], b[1] - a[1]) * s * 0.29, H = s * 0.31;
        const X = this.X(v[0]), Y = this.Y(v[1]);
        const rect = (ox, oy, fill, grow) => { g.save(); g.translate(X + ox, Y + oy); g.rotate(ang); g.fillStyle = fill; g.fillRect(-L - grow, -H - grow, 2 * (L + grow), 2 * (H + grow)); g.restore(); };
        const thick = M ? Math.max(2, hp * 0.35) : Math.max(1.5, s * 0.1);
        g.save(); if (M) g.filter = `blur(${Math.max(1, s * 0.06)}px)`;
        rect(s * 0.1, (M ? hp : 0) + s * 0.14, M ? 'rgba(70,48,20,0.32)' : 'rgba(0,0,0,0.35)', 0);
        g.restore();
        for (let k = thick; k > 0; k -= 1) rect(0, k, k > thick * 0.6 ? edge : side, 0);
        rect(0, 0, top, 0);
        g.save(); g.translate(X, Y); g.rotate(ang);
        g.strokeStyle = edge; g.lineWidth = Math.max(1, lw * 0.45);
        g.beginPath(); g.moveTo(-L, -H); g.lineTo(L, -H); g.moveTo(-L, H); g.lineTo(L, H); g.stroke();
        if (s > 10) { // planken
          g.globalAlpha = 0.18; g.lineWidth = 1; g.beginPath();
          for (let x = -L + s * 0.16; x < L; x += s * 0.16) { g.moveTo(x, -H); g.lineTo(x, H); }
          g.stroke(); g.globalAlpha = 1;
        }
        g.restore();
      }
    }
    stairIcon(x, y, col, up) {
      const g = this.g, u = this.s * 0.11, X = this.X(x), Y = this.Y(y);
      g.strokeStyle = col; g.lineWidth = Math.max(1.2, this.s * 0.06);
      g.beginPath();
      g.moveTo(X - 1.8 * u, Y + 1.6 * u); g.lineTo(X - 1.8 * u, Y + 0.6 * u); g.lineTo(X - 0.6 * u, Y + 0.6 * u);
      g.lineTo(X - 0.6 * u, Y - 0.4 * u); g.lineTo(X + 0.6 * u, Y - 0.4 * u); g.lineTo(X + 0.6 * u, Y - 1.4 * u); g.lineTo(X + 1.8 * u, Y - 1.4 * u);
      g.stroke();
      g.fillStyle = col; g.beginPath();
      const ax = X + 1.5 * u, ay = Y + 1.1 * u, d = up ? -1 : 1;
      g.moveTo(ax - 0.6 * u, ay - 0.4 * u * d); g.lineTo(ax + 0.6 * u, ay - 0.4 * u * d); g.lineTo(ax, ay + 0.6 * u * d); g.closePath(); g.fill();
    }

    // Helle golf langs de route: kop met staart van ~6 cellen.
    endWave(g, m, path, e) {
      const C = m.cells, s = this.s, L = path.length - 1, head = Math.min(1, e * 1.5) * L, upto = Math.min(L, Math.floor(head));
      if (head >= L + 3) return;
      const pt = i => [this.X(C[path[i]].center[0]), this.Y(C[path[i]].center[1])];
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      g.shadowColor = '#ffffff'; g.shadowBlur = s * 0.8; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = Math.max(3, s * 0.16);
      g.beginPath();
      for (let i = Math.max(0, upto - 6); i <= upto; i++) {
        const [x, y] = pt(i);
        if (i === Math.max(0, upto - 6) || path[i - 1] === path[i] || !ML.edge(m, path[i - 1], path[i]) || ML.edge(m, path[i - 1], path[i]).wrap) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke(); g.shadowBlur = 0;
      const [hx, hy] = pt(upto), gr = g.createRadialGradient(hx, hy, 0, hx, hy, s * 1.1);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(hx, hy, s * 1.1, 0, TAU); g.fill();
      g.restore();
    }

    draw(m, vs, now) {
      const g = this.g, cv = this.cv, P = this.pal, M = P.maq;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = M ? M.bg2 : P.bg; g.fillRect(0, 0, cv.width, cv.height);
      if (!m || !cv.width) return false;
      this.m = m; this.fit(m);
      const C = m.cells, W = m.walls, n = C.length, s = this.s, lw = Math.max(1, s * 0.1), FX = ML.FX;
      const st = this.stateOf(m, vs, now), hp = this.hp, life = M && vs.life ? now : 0;
      let busy = false;

      // camera (Kijken: inzoomen op het doel / nieuw doolhof groeit uit het midden). cam = { x, y, z, px, py }
      if (vs.cam && !this.noWalls) {
        const c = vs.cam, fx = c.x == null ? cv.width / 2 : this.X(c.x), fy = c.y == null ? cv.height / 2 : this.Y(c.y);
        g.translate(c.px == null ? cv.width / 2 : c.px, c.py == null ? cv.height / 2 : c.py); g.scale(c.z, c.z); g.translate(-fx, -fy);
      }
      // maquette-bouw: bij geanimeerd bouwen klappen alle muren eerst omhoog (pop-upboek)
      this.rise = null;
      if (M && vs.riseT != null) { const e = (now - vs.riseT) / 0.9; if (e < 1) { this.rise = Math.max(0, FX.spring(Math.max(0, e))); busy = true; } }

      // eindscène: camera zoomt even uit, route licht op in één golf
      let endE = null;
      if (vs.endT != null) {
        endE = Math.max(0, (now - vs.endT) / END);
        if (endE >= 1) endE = null;
        else {
          busy = true;
          const z = 1 - 0.07 * Math.sin(Math.min(1, endE * 1.25) * Math.PI);
          g.translate(cv.width / 2, cv.height / 2); g.scale(z, z); g.translate(-cv.width / 2, -cv.height / 2);
        }
      }

      // vloer
      const inM = [], outM = [];
      for (let i = 0; i < n; i++) (!vs.inMaze || vs.inMaze[i] ? inM : outM).push(i);
      if (M) { g.drawImage(this.floorLayer(m), 0, 0); this.fillCells(outM, P.dark, 0.8); }
      else { this.fillCells(inM, P.floor); this.fillCells(outM, P.dark); }

      // verdiepingen: label boven elke verdieping
      if (m.levels > 1) {
        g.fillStyle = P.label || P.wall; g.globalAlpha = 0.6; g.textAlign = 'center'; g.textBaseline = 'bottom';
        g.font = `600 ${Math.round(Math.max(11, Math.min(15, s * 0.6)))}px system-ui, sans-serif`;
        for (let l = 0; l < m.levels; l++) g.fillText(`Verdieping ${l + 1}`, this.X(m.levelX0 + l * m.levelDX + m.levelW / 2), this.Y(m.bounds.miny) - 6 - hp);
        g.globalAlpha = 1;
      }

      // bezochte cellen: kleur naar volgorde; verse cellen ploppen op als rimpel
      if (vs.order && vs.nOrder > 0 && !vs.noVisit) {
        const grad = this.grad(), gr = this._gradRGB, buckets = Array.from({ length: BUCKETS }, () => []);
        const vt = vs.vt, side = vs.side, cut = now - A.RIP;
        const bucketOf = i => { let b = Math.min(BUCKETS - 1, Math.floor(vs.order[i] / vs.nOrder * BUCKETS)); if (side && side[i]) b = BUCKETS - 1 - b; return b; };
        for (let i = 0; i < n; i++) {
          if (vs.order[i] < 0 || (vt && vt[i] > cut)) continue;
          buckets[bucketOf(i)].push(i);
        }
        buckets.forEach((b, k) => this.fillCells(b, grad[k]));
        const rec = vs.recent;
        if (vt && rec && rec.length) {
          busy = true;
          const fr = hex2rgb(P.front);
          for (const i of rec) {
            const e = (now - vt[i]) / A.RIP;
            if (e < 0 || e >= 1) continue;
            const k = FX.easeOut(e);
            g.beginPath(); this.polyScaled(g, C[i], 0.3 + 0.7 * FX.spring(Math.min(1, e * 1.3)));
            g.fillStyle = rgbStr(fr, gr[bucketOf(i)], k); g.fill();
          }
          g.strokeStyle = P.front; g.lineWidth = Math.max(1, s * 0.05);
          for (let j = Math.max(0, rec.length - 160); j < rec.length; j++) {
            const i = rec[j], e = (now - vt[i]) / A.RIP;
            if (e < 0 || e >= 1) continue;
            g.globalAlpha = 0.5 * (1 - e);
            g.beginPath(); g.arc(this.X(C[i].center[0]), this.Y(C[i].center[1]), s * (0.25 + e * 0.9), 0, TAU); g.stroke();
          }
          g.globalAlpha = 1;
        }
      }

      // terrein (over de bezochte kleur heen, zodat het zichtbaar blijft)
      if (m.weighted) {
        const lists = [[], [], [], []];
        for (let i = 0; i < n; i++) if (m.terrain[i]) lists[m.terrain[i]].push(i);
        for (let t = 1; t <= 3; t++) this.fillCells(lists[t], M ? M.ter[t] : TERCOL[t], M ? M.terA[t] : t === 3 ? 0.35 : 0.45);
        if (M && s > 6) {
          g.globalAlpha = 0.45; g.fillStyle = '#28180a'; g.beginPath();
          for (const i of lists[1]) {
            const x = this.X(C[i].center[0]), y = this.Y(C[i].center[1]);
            for (const [ox, oy] of [[-0.2, 0.1], [0.15, -0.12], [0.06, 0.2], [-0.12, -0.2]]) { g.moveTo(x + ox * s + s * 0.04, y + oy * s); g.arc(x + ox * s, y + oy * s, s * 0.04, 0, TAU); }
          }
          g.fill(); g.globalAlpha = 1;
          this.lifeFloor(g, m, life);
        } else if (s > 12) {
          g.globalAlpha = 0.55; g.fillStyle = '#2a1a0c'; g.beginPath();
          for (const i of lists[1]) {
            const x = this.X(C[i].center[0]), y = this.Y(C[i].center[1]);
            for (const [ox, oy] of [[-0.2, 0.1], [0.15, -0.12], [0.06, 0.2]]) { g.moveTo(x + ox * s + s * 0.04, y + oy * s); g.arc(x + ox * s, y + oy * s, s * 0.04, 0, TAU); }
          }
          g.fill();
          g.strokeStyle = '#d6ebff'; g.lineWidth = Math.max(1, s * 0.05); g.beginPath();
          for (const i of lists[2]) {
            const x = this.X(C[i].center[0]), y = this.Y(C[i].center[1]), u = s * 0.13;
            g.moveTo(x - 2 * u, y); g.quadraticCurveTo(x - u, y - u, x, y); g.quadraticCurveTo(x + u, y + u, x + 2 * u, y);
          }
          g.stroke();
          g.globalAlpha = 0.85; g.strokeStyle = '#ffffff'; g.beginPath();
          for (const i of lists[3]) {
            const x = this.X(C[i].center[0]) + s * 0.14, y = this.Y(C[i].center[1]) - s * 0.14, u = s * 0.08;
            g.moveTo(x - u, y); g.lineTo(x + u, y); g.moveTo(x, y - u); g.lineTo(x, y + u);
          }
          g.stroke(); g.globalAlpha = 1;
        }
      }

      // eigen vloerlaag (zwerm, voetstappen, thema-leven): onder de muren
      if (vs.theme) busy = vs.theme.floor(g, this, now) || busy;
      if (vs.floorFx) busy = vs.floorFx(g, this, now) || busy;
      if (ML.V2) busy = ML.V2.layers('floor', g, this, m, vs, now) || busy;

      // doodlopers dichten: gevulde cellen
      if (vs.dead) {
        const d = [];
        for (let i = 0; i < n; i++) if (vs.dead[i]) d.push(i);
        this.fillCells(d, P.dark, 0.85);
      }
      if (vs.front) {
        const f = [];
        for (let i = 0; i < n; i++) if (vs.front[i] && vs.order[i] < 0) f.push(i);
        this.fillCells(f, P.front, 0.45);
      }
      if (vs.walk && vs.walk.length > (vs.walkFrom || 0)) this.fillCells(vs.walk.slice(vs.walkFrom || 0), P.walk, 0.75);
      if (vs.cur >= 0 && vs.cur < n) this.fillCells([vs.cur], P.cur);

      // weave: gang onder een brug iets donkerder (onderdoorgang)
      if (m.bridges && m.bridges.length) this.fillCells(m.bridges.map(i => W[i].via), '#2a1a0c', M ? 0.2 : 0.28);

      // muren (+ veer-animatie bij openen/sluiten tijdens bouwen)
      const anim = vs.wallAnim;
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (M) {
        if (!this.noWalls) this.maqWalls(g, m, anim, !!vs.inMaze);
        if (anim && anim.size && !this.noWalls) { // maquette: muur klapt neer (openen) of klapt veerkrachtig omhoog (bouwen)
          const lw2 = Math.max(1.2, s * M.w), H0 = hp * (this.rise != null ? this.rise : 1);
          g.save(); g.lineCap = 'square'; g.lineWidth = lw2;
          for (const [wi, a] of anim) {
            const x = (now - a.t0) / A.WALL;
            if (x >= 1 || x < 0) continue;
            busy = true;
            const f = FX.spring(x), h = Math.max(0, H0 * (a.dir < 0 ? 1 - FX.easeOut(x) : f)), p = new Path2D();
            this.segPath(p, W[wi]);
            for (let k = 0; k < h; k += Math.max(1, hp / 6)) { g.save(); g.translate(0, -k); g.strokeStyle = M.side; g.stroke(p); g.restore(); }
            g.save(); g.translate(0, -h); g.strokeStyle = M.top; g.stroke(p); g.restore();
          }
          g.restore();
        }
        g.save(); g.translate(0, -hp);
      }
      else if (!this.noWalls) {
        g.strokeStyle = P.wall; g.lineWidth = lw;
        g.beginPath();
        for (const w of W) if (!w.open && !w.stair && !(anim && anim.has(w.i))) this.segPath(g, w);
        g.stroke();
      }
      if (anim && anim.size && !M && !this.noWalls) {
        g.strokeStyle = P.wall;
        for (const [wi, a] of anim) {
          const x = (now - a.t0) / A.WALL;
          if (x >= 1 || x < 0) continue;
          busy = true;
          const w = W[wi], f = FX.spring(x);
          g.lineWidth = lw * (1 + 0.6 * (1 - x));
          g.beginPath();
          for (const q of w.segs) {
            const mx = (q[0] + q[2]) / 2, my = (q[1] + q[3]) / 2;
            if (a.dir < 0) { // openen: twee helften trekken zich terug naar de hoeken
              const v = Math.max(0, 1 - f);
              g.moveTo(this.X(q[0]), this.Y(q[1])); g.lineTo(this.X(q[0] + (mx - q[0]) * v), this.Y(q[1] + (my - q[1]) * v));
              g.moveTo(this.X(q[2]), this.Y(q[3])); g.lineTo(this.X(q[2] + (mx - q[2]) * v), this.Y(q[3] + (my - q[3]) * v));
            } else { // sluiten: groeit vanuit het midden, schiet iets door
              const v = Math.max(0, f);
              g.moveTo(this.X(mx + (q[0] - mx) * v), this.Y(my + (q[1] - my) * v)); g.lineTo(this.X(mx + (q[2] - mx) * v), this.Y(my + (q[3] - my) * v));
            }
          }
          g.stroke();
        }
      }
      if (m.bridges && m.bridges.length) this.bridgeDecks(g, m, lw);
      if (M) { g.restore(); g.translate(0, -hp * 0.5); } // alles hierna staat op halve muurhoogte

      // sleuteldeuren (verbleekt als de sleutel op zak is)
      for (const wi of m.doors) {
        const w = W[wi], got = (st.k >> w.door) & 1;
        g.strokeStyle = KEYCOL[ML.KEY_COLORS[w.door]]; g.lineWidth = got ? lw * 0.8 : lw * 2.8; g.globalAlpha = got ? 0.25 : 1;
        g.beginPath(); this.segPath(g, w); g.stroke();
      }
      g.globalAlpha = 1;
      // schakeldeuren: gestreept als dicht, stippel als open
      for (const wi of m.swDoors) {
        const w = W[wi], on = (st.sw >> w.sw) & 1, pass = on !== (w.swInv ? 1 : 0);
        g.strokeStyle = SWCOL[ML.SWITCH_COLORS[w.sw]];
        if (pass) { g.lineWidth = Math.max(1, lw * 0.7); g.globalAlpha = 0.45; g.setLineDash([lw * 0.6, lw * 1.4]); }
        else { g.lineWidth = lw * 2.4; g.setLineDash([lw * 1.6, lw * 0.9]); }
        g.beginPath(); this.segPath(g, w); g.stroke();
        g.globalAlpha = 1;
      }
      // getimede deuren
      for (const wi of m.timed) {
        const w = W[wi], open = ((st.t + w.timed.phase) % m.period) < w.timed.open;
        g.strokeStyle = TIMEDCOL;
        if (open) { g.lineWidth = Math.max(1, lw * 0.7); g.globalAlpha = 0.4; g.setLineDash([lw * 0.4, lw * 1.2]); }
        else { g.lineWidth = lw * 2.4; g.setLineDash([lw * 1.1, lw * 0.7]); }
        g.beginPath(); this.segPath(g, w); g.stroke();
        g.globalAlpha = 1;
      }
      g.setLineDash([]);

      // eenrichting-pijlen
      g.strokeStyle = P.accent; g.lineWidth = Math.max(1.2, lw * 0.9);
      for (const wi of m.oneways) {
        const w = W[wi], f = C[w.oneway].center, t = C[w.oneway === w.a ? w.b : w.a].center;
        const a = Math.atan2(t[1] - f[1], t[0] - f[0]), x = this.X(w.mid[0]), y = this.Y(w.mid[1]), r = s * 0.26;
        g.beginPath();
        g.moveTo(x + Math.cos(a + 2.4) * r, y + Math.sin(a + 2.4) * r);
        g.lineTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7);
        g.lineTo(x + Math.cos(a - 2.4) * r, y + Math.sin(a - 2.4) * r);
        g.stroke();
      }

      // torus: open randen krijgen een pijltje naar buiten (je komt aan de overkant uit)
      if (m.torus) {
        g.fillStyle = P.accent; g.globalAlpha = 0.65; g.beginPath();
        for (const w of W) {
          if (!w.wrap || !w.open) continue;
          for (const ci in w.wm) {
            const q = w.wm[ci], c = C[ci].center, a = Math.atan2(q[1] - c[1], q[0] - c[0]);
            const x = q[0] + Math.cos(a) * 0.12, y = q[1] + Math.sin(a) * 0.12, r = 0.13;
            g.moveTo(this.X(x + Math.cos(a) * r), this.Y(y + Math.sin(a) * r));
            g.lineTo(this.X(x + Math.cos(a + 2.4) * r), this.Y(y + Math.sin(a + 2.4) * r));
            g.lineTo(this.X(x + Math.cos(a - 2.4) * r), this.Y(y + Math.sin(a - 2.4) * r));
            g.closePath();
          }
        }
        g.fill(); g.globalAlpha = 1;
      }

      // trappen
      for (const w of W) if (w.stair && w.open) {
        const col = `hsl(${(w.i * 67) % 360} 75% 66%)`;
        this.stairIcon(C[w.a].center[0], C[w.a].center[1], col, true);
        this.stairIcon(C[w.b].center[0], C[w.b].center[1], col, false);
      }

      // teleporters
      m.teleporters.forEach((t, p) => {
        const col = ML.teleColor(p);
        for (const c of [t.a, t.b]) {
          const x = this.X(C[c].center[0]), y = this.Y(C[c].center[1]);
          g.strokeStyle = col; g.lineWidth = Math.max(1.2, s * 0.07);
          if (M) { // twee ringen die tegen elkaar in draaien
            g.lineCap = 'round';
            for (const [r, dir, k] of [[0.32, 1, 3], [0.18, -1, 2]]) {
              const a0 = life * 1.3 * dir + p;
              for (let j = 0; j < k; j++) { g.beginPath(); g.arc(x, y, s * r, a0 + j * TAU / k, a0 + j * TAU / k + TAU / k * 0.62); g.stroke(); }
            }
            continue;
          }
          g.beginPath(); g.arc(x, y, s * 0.32, 0, TAU); g.stroke();
          g.beginPath(); g.arc(x, y, s * 0.17, 0, TAU); g.stroke();
        }
      });

      // hendels
      m.switches.forEach((sw, j) => {
        const c = C[sw.cell].center, x = this.X(c[0]), y = this.Y(c[1]), col = SWCOL[sw.color], on = (st.sw >> j) & 1;
        g.fillStyle = col; g.beginPath(); g.arc(x, y + s * 0.14, s * 0.15, Math.PI, 0); g.fill();
        const a = on ? -Math.PI / 4 : -3 * Math.PI / 4, ex = x + Math.cos(a) * s * 0.32, ey = y + s * 0.1 + Math.sin(a) * s * 0.32;
        g.strokeStyle = col; g.lineWidth = Math.max(1.5, s * 0.07);
        g.beginPath(); g.moveTo(x, y + s * 0.1); g.lineTo(ex, ey); g.stroke();
        g.beginPath(); g.arc(ex, ey, s * 0.075, 0, TAU); g.fill();
      });

      // sleutels (vaag als opgepakt)
      m.keys.forEach((k, j) => {
        const x = this.X(C[k.cell].center[0]), y = this.Y(C[k.cell].center[1]) + (M ? Math.sin(life * 2 + k.cell) * s * 0.04 : 0);
        g.globalAlpha = (st.k >> j) & 1 ? 0.15 : 1;
        g.strokeStyle = KEYCOL[k.color]; g.lineWidth = Math.max(1.5, s * 0.09);
        g.beginPath(); g.arc(x - s * 0.13, y, s * 0.12, 0, TAU); g.stroke();
        g.beginPath(); g.moveTo(x - s * 0.01, y); g.lineTo(x + s * 0.27, y);
        g.moveTo(x + s * 0.2, y); g.lineTo(x + s * 0.2, y + s * 0.11);
        g.moveTo(x + s * 0.27, y); g.lineTo(x + s * 0.27, y + s * 0.09);
        g.stroke();
      });
      g.globalAlpha = 1;

      // start / doel
      if (m.ready) {
        const sc = C[m.start].center, gc = C[m.goal].center, sx = this.X(sc[0]), sy = this.Y(sc[1]), gx = this.X(gc[0]), gy = this.Y(gc[1]);
        if (M) { // start ademt (met schaduwtje), doel klopt
          const k = 1 + Math.sin(life * 2.4) * 0.06, ph = (life * 0.6) % 1;
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(sx + s * 0.06, sy + s * 0.1, s * 0.26, s * 0.18, 0, 0, TAU); g.fill();
          g.fillStyle = P.start; g.beginPath(); g.arc(sx, sy, s * 0.26 * k, 0, TAU); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.arc(sx - s * 0.08, sy - s * 0.08, s * 0.08, 0, TAU); g.fill();
          g.strokeStyle = P.goal; g.lineWidth = Math.max(1.5, s * 0.07);
          if (life) { g.globalAlpha = 1 - ph; g.beginPath(); g.arc(gx, gy, s * (0.3 + ph * 0.55), 0, TAU); g.stroke(); g.globalAlpha = 1; }
        } else { g.fillStyle = P.start; g.beginPath(); g.arc(sx, sy, s * 0.28, 0, TAU); g.fill(); }
        g.strokeStyle = P.goal; g.fillStyle = P.goal; g.lineWidth = Math.max(1.5, s * (M ? 0.07 : 0.08));
        g.beginPath(); g.arc(gx, gy, s * 0.3, 0, TAU); g.stroke();
        g.beginPath(); g.arc(gx, gy, s * 0.12, 0, TAU); g.fill();
      }

      // pad (oplossing of spelerspoor), kop glijdt tussen cellen
      let headPos = null;
      if (vs.path && vs.path.length > 1) {
        const path = vs.path, L = path.length - 1, fpos = Math.min(L, (vs.pathT == null ? 1 : vs.pathT) * L);
        const upto = Math.floor(fpos), frac = fpos - upto, jumps = [];
        // na de eindgolf vervaagt de oplossing rustig naar een zachte schaduw (niet bij zelf spelen)
        let pk = 1;
        if (vs.endT != null && vs.player == null) {
          const e = (now - vs.endT - PATH_FADE_AT) / PATH_FADE;
          if (e > 0) { pk = 1 - (1 - PATH_FADE_TO) * FX.easeInOut(Math.min(1, e)); if (e < 1) busy = true; }
        }
        g.strokeStyle = P.path; g.lineWidth = Math.max(2, s * (M ? M.pathW : 0.22)); g.globalAlpha = (vs.player != null ? (M ? 0.8 : 0.55) : 1) * pk;
        if (P.glow) { g.shadowColor = P.path; g.shadowBlur = Math.min(24, s * 0.7) * pk; }
        if (M) { g.shadowColor = 'rgba(60,30,10,0.3)'; g.shadowOffsetX = s * 0.05; g.shadowOffsetY = s * 0.08; } // rode draad met eigen schaduwtje
        g.beginPath();
        for (let i = 0; i <= upto; i++) {
          const c = C[path[i]].center, x = this.X(c[0]), y = this.Y(c[1]);
          if (i === 0) { g.moveTo(x, y); continue; }
          const a = path[i - 1], b = path[i];
          if (a === b) continue;
          const w = ML.edge(m, a, b);
          if (w && w.wrap) { g.lineTo(this.X(w.wm[a][0]), this.Y(w.wm[a][1])); g.moveTo(this.X(w.wm[b][0]), this.Y(w.wm[b][1])); g.lineTo(x, y); }
          else if (!w || w.stair) { jumps.push(i); g.moveTo(x, y); }
          else g.lineTo(x, y);
        }
        const hc = C[path[upto]].center;
        headPos = [hc[0], hc[1]];
        if (upto < L && frac > 0) {
          const nb = C[path[upto + 1]].center, w = ML.edge(m, path[upto], path[upto + 1]);
          if (w && !w.stair && !w.wrap) {
            headPos = [hc[0] + (nb[0] - hc[0]) * frac, hc[1] + (nb[1] - hc[1]) * frac];
            g.lineTo(this.X(headPos[0]), this.Y(headPos[1]));
          }
        }
        g.stroke(); g.shadowBlur = 0; g.shadowOffsetX = g.shadowOffsetY = 0; g.globalAlpha = 1;
        if (endE !== null) this.endWave(g, m, path, endE);
        if (jumps.length) {
          g.setLineDash([lw * 2, lw * 2]); g.lineWidth = Math.max(1, lw);
          g.beginPath();
          for (const i of jumps) {
            const a = C[path[i - 1]].center, b = C[path[i]].center;
            g.moveTo(this.X(a[0]), this.Y(a[1])); g.lineTo(this.X(b[0]), this.Y(b[1]));
          }
          g.stroke(); g.setLineDash([]);
        }
      }

      this.headPos = headPos || (vs.cur != null && vs.cur >= 0 && C[vs.cur] ? C[vs.cur].center : null);
      // race: per deelnemer eigen hoekje in de cel (speldjes), eigen spoor, kop en route
      this.hideList = !!vs.noVisit;
      if (vs.race) busy = this.drawRace(g, m, vs.race, now, lw) || busy;

      // komeet-staart van de zoeker
      if (vs.tail && vs.tail.length) {
        const T = vs.tail;
        g.strokeStyle = P.cur;
        for (let i = 1; i < T.length; i++) {
          const a = T[i - 1], b = T[i], age = (now - b.t) / A.TAIL;
          if (age >= 1 || a.c === b.c) continue;
          const w = ML.edge(m, a.c, b.c);
          if (!w || w.wrap || w.stair) continue;
          busy = true;
          g.globalAlpha = (1 - age) * 0.75; g.lineWidth = s * 0.3 * (1 - age) + 1;
          g.beginPath(); g.moveTo(this.X(C[a.c].center[0]), this.Y(C[a.c].center[1])); g.lineTo(this.X(C[b.c].center[0]), this.Y(C[b.c].center[1])); g.stroke();
        }
        g.globalAlpha = 1;
        if (vs.phase === 'solve' || vs.phase === 'gen') { const c = C[T[T.length - 1].c].center; this.head(c[0], c[1], P.cur, 0.2); busy = true; }
      }

      // kop van pad of speler
      if (vs.player != null) {
        const pa = vs.playerAnim, to = C[vs.player].center;
        let x = to[0], y = to[1];
        if (pa) {
          const e = (now - pa.t0) / A.HEAD;
          const w = pa.from !== vs.player ? ML.edge(m, pa.from, vs.player) : null;
          if (e < 1 && w && !w.wrap && !w.stair) {
            const f = C[pa.from].center, k = FX.easeOut(e);
            x = f[0] + (to[0] - f[0]) * k; y = f[1] + (to[1] - f[1]) * k; busy = true;
          }
        }
        this.head(x, y, P.start, 0.26);
      } else if (headPos && vs.path) this.head(headPos[0], headPos[1], P.path, 0.2);

      // deeltjes
      if (vs.fx && vs.fx.length) { FX.draw(g, vs.fx, x => this.X(x), y => this.Y(y), s); busy = true; }
      // eigen bovenlaag (thema-leven, licht/donker); maquette: staat op halve muurhoogte
      if (vs.theme) busy = vs.theme.top(g, this, now) || busy;
      if (vs.topFx) busy = vs.topFx(g, this, now) || busy;
      if (ML.V2) {
        busy = ML.V2.layers('top', g, this, m, vs, now) || busy;
        g.setTransform(1, 0, 0, 1, 0, 0);
        if (!this.noWalls) busy = ML.V2.layers('screen', g, this, m, vs, now) || busy;
      }
      return busy;
    }
  };
})(window.ML = window.ML || {});
