// 2D-weergave op canvas. Leest alleen het model + view-state; 3D-weergave kan later naast deze komen.
(function (ML) {
  'use strict';
  const KEYCOL = { red: '#e5484d', blue: '#3e7bfa', green: '#30a46c', gold: '#f5b301', purple: '#8e4ec6', cyan: '#12a5b8' };
  ML.KEYCOL = KEYCOL;

  ML.PALETTES = {
    blauwdruk: { name: 'Blauwdruk', bg: '#0f2c4c', floor: '#143a63', dark: '#0b2240', wall: '#e9f2ff', cur: '#ffd166', walk: '#ff8fab', visitA: '#1f5f8b', visitB: '#7fc8e8', front: '#ffd166', path: '#ffd166', start: '#06d6a0', goal: '#ef476f', accent: '#ffd166' },
    neon: { name: 'Neon', bg: '#07060d', floor: '#0e0c1a', dark: '#07060d', wall: '#7df9ff', cur: '#ffffff', walk: '#ff4fd8', visitA: '#3a0ca3', visitB: '#f72585', front: '#ffffff', path: '#fffb7d', start: '#39ff14', goal: '#ff3864', accent: '#fffb7d', glow: true },
    papier: { name: 'Papier', bg: '#e9dfc8', floor: '#f7f0df', dark: '#dccfb2', wall: '#2b2118', cur: '#c0392b', walk: '#d98e73', visitA: '#efe0b0', visitB: '#94d2bd', front: '#ee9b00', path: '#c0392b', start: '#2a9d8f', goal: '#c0392b', accent: '#9b2226' }
  };

  const hex2rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
  const BUCKETS = 32;

  ML.Render2D = class {
    constructor(canvas) { this.cv = canvas; this.g = canvas.getContext('2d'); this.pal = ML.PALETTES.blauwdruk; this._grad = null; }
    setPalette(p) { this.pal = p; this._grad = null; }
    grad() {
      if (!this._grad) { this._grad = []; for (let i = 0; i < BUCKETS; i++) this._grad.push(mix(this.pal.visitA, this.pal.visitB, i / (BUCKETS - 1))); }
      return this._grad;
    }
    fit(m) {
      const cv = this.cv, b = m.bounds, pad = Math.max(10, Math.min(cv.width, cv.height) * 0.04);
      const bw = b.maxx - b.minx || 1, bh = b.maxy - b.miny || 1;
      this.s = Math.max(0.1, Math.min((cv.width - 2 * pad) / bw, (cv.height - 2 * pad) / bh));
      this.ox = (cv.width - bw * this.s) / 2 - b.minx * this.s;
      this.oy = (cv.height - bh * this.s) / 2 - b.miny * this.s;
    }
    X(x) { return this.ox + x * this.s; }
    Y(y) { return this.oy + y * this.s; }
    poly(g, pts) {
      g.moveTo(this.X(pts[0][0]), this.Y(pts[0][1]));
      for (let i = 1; i < pts.length; i++) g.lineTo(this.X(pts[i][0]), this.Y(pts[i][1]));
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

    draw(m, vs) {
      const g = this.g, cv = this.cv, P = this.pal;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = P.bg; g.fillRect(0, 0, cv.width, cv.height);
      if (!m || !cv.width) return;
      this.m = m; this.fit(m);
      const C = m.cells, n = C.length, s = this.s, lw = Math.max(1, s * 0.1);

      // vloer
      const inM = [], outM = [];
      for (let i = 0; i < n; i++) (!vs.inMaze || vs.inMaze[i] ? inM : outM).push(i);
      this.fillCells(inM, P.floor);
      this.fillCells(outM, P.dark);

      // bezochte cellen, kleur naar volgorde
      if (vs.order && vs.nOrder > 0) {
        const grad = this.grad(), buckets = Array.from({ length: BUCKETS }, () => []);
        for (let i = 0; i < n; i++) {
          const o = vs.order[i];
          if (o >= 0) buckets[Math.min(BUCKETS - 1, Math.floor(o / vs.nOrder * BUCKETS))].push(i);
        }
        buckets.forEach((b, k) => this.fillCells(b, grad[k]));
      }
      if (vs.front) {
        const f = [];
        for (let i = 0; i < n; i++) if (vs.front[i] && vs.order[i] < 0) f.push(i);
        this.fillCells(f, P.front, 0.45);
      }
      if (vs.walk && vs.walk.length > (vs.walkFrom || 0)) this.fillCells(vs.walk.slice(vs.walkFrom || 0), P.walk, 0.75);
      if (vs.cur >= 0 && vs.cur < n) this.fillCells([vs.cur], P.cur);

      // muren
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = P.wall; g.lineWidth = lw;
      g.beginPath();
      for (const w of m.walls) {
        if (w.open || w.door !== null) continue;
        for (const q of w.segs) { g.moveTo(this.X(q[0]), this.Y(q[1])); g.lineTo(this.X(q[2]), this.Y(q[3])); }
      }
      g.stroke();

      // deuren
      for (const wi of m.doors) {
        const w = m.walls[wi];
        g.strokeStyle = KEYCOL[ML.KEY_COLORS[w.door]]; g.lineWidth = lw * 2.8;
        g.beginPath();
        for (const q of w.segs) { g.moveTo(this.X(q[0]), this.Y(q[1])); g.lineTo(this.X(q[2]), this.Y(q[3])); }
        g.stroke();
      }

      // eenrichting-pijlen
      g.strokeStyle = P.accent; g.lineWidth = Math.max(1.2, lw * 0.9);
      for (const wi of m.oneways) {
        const w = m.walls[wi], f = C[w.oneway].center, t = C[w.oneway === w.a ? w.b : w.a].center;
        const a = Math.atan2(t[1] - f[1], t[0] - f[0]), x = this.X(w.mid[0]), y = this.Y(w.mid[1]), r = s * 0.26;
        g.beginPath();
        g.moveTo(x + Math.cos(a + 2.4) * r, y + Math.sin(a + 2.4) * r);
        g.lineTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7);
        g.lineTo(x + Math.cos(a - 2.4) * r, y + Math.sin(a - 2.4) * r);
        g.stroke();
      }

      // teleporters
      m.teleporters.forEach((t, p) => {
        const col = `hsl(${(p * 137 + 200) % 360} 90% 62%)`;
        for (const c of [t.a, t.b]) {
          const x = this.X(C[c].center[0]), y = this.Y(C[c].center[1]);
          g.strokeStyle = col; g.lineWidth = Math.max(1.2, s * 0.07);
          g.beginPath(); g.arc(x, y, s * 0.32, 0, Math.PI * 2); g.stroke();
          g.beginPath(); g.arc(x, y, s * 0.17, 0, Math.PI * 2); g.stroke();
        }
      });

      // sleutels
      for (const k of m.keys) {
        const x = this.X(C[k.cell].center[0]), y = this.Y(C[k.cell].center[1]);
        g.strokeStyle = KEYCOL[k.color]; g.lineWidth = Math.max(1.5, s * 0.09);
        g.beginPath(); g.arc(x - s * 0.13, y, s * 0.12, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(x - s * 0.01, y); g.lineTo(x + s * 0.27, y);
        g.moveTo(x + s * 0.2, y); g.lineTo(x + s * 0.2, y + s * 0.11);
        g.moveTo(x + s * 0.27, y); g.lineTo(x + s * 0.27, y + s * 0.09);
        g.stroke();
      }

      // start / doel
      if (m.ready) {
        const sc = C[m.start].center, gc = C[m.goal].center;
        g.fillStyle = P.start;
        g.beginPath(); g.arc(this.X(sc[0]), this.Y(sc[1]), s * 0.28, 0, Math.PI * 2); g.fill();
        g.strokeStyle = P.goal; g.fillStyle = P.goal; g.lineWidth = Math.max(1.5, s * 0.08);
        g.beginPath(); g.arc(this.X(gc[0]), this.Y(gc[1]), s * 0.3, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.arc(this.X(gc[0]), this.Y(gc[1]), s * 0.12, 0, Math.PI * 2); g.fill();
      }

      // gevonden pad
      if (vs.path && vs.path.length > 1) {
        const path = vs.path, upto = Math.max(1, Math.floor((path.length - 1) * (vs.pathT == null ? 1 : vs.pathT)));
        const jumps = [];
        g.strokeStyle = P.path; g.lineWidth = Math.max(2, s * 0.22);
        if (P.glow) { g.shadowColor = P.path; g.shadowBlur = Math.min(24, s * 0.7); }
        g.beginPath();
        for (let i = 0; i <= upto; i++) {
          const c = C[path[i]].center, x = this.X(c[0]), y = this.Y(c[1]);
          const jump = i > 0 && !ML.isAdjacent(m, path[i - 1], path[i]);
          if (i === 0 || jump) { g.moveTo(x, y); if (jump) jumps.push(i); } else g.lineTo(x, y);
        }
        g.stroke(); g.shadowBlur = 0;
        if (jumps.length) {
          g.setLineDash([lw * 2, lw * 2]); g.lineWidth = Math.max(1, lw);
          g.beginPath();
          for (const i of jumps) {
            const a = C[path[i - 1]].center, b = C[path[i]].center;
            g.moveTo(this.X(a[0]), this.Y(a[1])); g.lineTo(this.X(b[0]), this.Y(b[1]));
          }
          g.stroke(); g.setLineDash([]);
        }
        const hc = C[path[upto]].center;
        g.fillStyle = P.path;
        g.beginPath(); g.arc(this.X(hc[0]), this.Y(hc[1]), s * 0.2, 0, Math.PI * 2); g.fill();
      }
    }
  };
})(window.ML = window.ML || {});
