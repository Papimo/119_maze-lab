// Thema's met eigen leven (maquette-varianten). Palet heeft `life: '<naam>'` → ML.THEME_LIFE[naam](m).
// Een leven-object heeft step(dt), floor(g, r, now) (onder de muren) en top(g, r, now) (op halve muurhoogte).
(function (ML) {
  'use strict';
  const TAU = Math.PI * 2;
  const base = ML.PALETTES.maquette;

  ML.PALETTES.tuin = Object.assign({}, base, {
    name: 'Tuinhaag + vogeltjes', life: 'tuin', bg: '#6f8a4b', floor: '#ddd2b4', dark: '#bfb08c', wall: '#4f8a35', label: '#2d3d1f', cur: '#f0b43a', walk: '#e7a96b',
    visitA: '#e8dfc4', visitB: '#bcd69f', front: '#f0b43a', path: '#e09a2a', start: '#f4f0e0', goal: '#3d8fd0', accent: '#a0692a',
    maq: { bg2: '#24391a', grain: 'rgba(90,70,40,0.2)', top: '#5f9e3f', side: '#2f5c22', sideLo: '#22451a', border: '#4a3a24', w: 0.3, h: 0.36,
      shadow: ['rgba(15,30,5,0.5)', 0.2, 0.3, 0.3], pathW: 0.09, ter: base.maq.ter, terA: base.maq.terA }
  });

  ML.drawBird = function (g, x, y, s, a, flying, flap, peck, shadowH) {
    if (shadowH > 0) { g.fillStyle = 'rgba(0,0,0,0.15)'; g.beginPath(); g.ellipse(x, y + s * 1.2 * shadowH, s * 0.12, s * 0.06, 0, 0, TAU); g.fill(); }
    g.save(); g.translate(x, y); const fx = Math.cos(a) >= 0 ? 1 : -1; g.scale(fx, 1);
    g.fillStyle = '#6b4a2e'; g.beginPath(); g.ellipse(0, 0, s * 0.13, s * 0.085, -0.15, 0, TAU); g.fill();
    g.fillStyle = '#e07a3c'; g.beginPath(); g.ellipse(s * 0.04, s * 0.03, s * 0.07, s * 0.05, 0, 0, TAU); g.fill();
    g.fillStyle = '#6b4a2e'; g.beginPath(); g.moveTo(-s * 0.1, -s * 0.02); g.lineTo(-s * 0.22, -s * 0.06); g.lineTo(-s * 0.2, s * 0.03); g.fill();
    const hy = -s * 0.07 + peck * s * 0.07, hx = s * 0.11 + peck * s * 0.02;
    g.beginPath(); g.arc(hx, hy, s * 0.055, 0, TAU); g.fill();
    g.fillStyle = '#e8b13a'; g.beginPath(); g.moveTo(hx + s * 0.05, hy - s * 0.01); g.lineTo(hx + s * 0.1, hy + s * 0.005); g.lineTo(hx + s * 0.05, hy + s * 0.02); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.arc(hx + s * 0.02, hy - s * 0.012, s * 0.012, 0, TAU); g.fill();
    if (flying) { const w = Math.sin(flap) * s * 0.18; g.fillStyle = '#4e3520'; g.beginPath(); g.moveTo(-s * 0.04, -s * 0.03); g.quadraticCurveTo(-s * 0.02, -s * 0.03 - w * 1.2, s * 0.06, -s * 0.03 - w); g.lineTo(s * 0.04, -s * 0.02); g.fill(); }
    else { g.fillStyle = '#4e3520'; g.beginPath(); g.ellipse(-s * 0.02, -s * 0.01, s * 0.08, s * 0.04, -0.3, 0, TAU); g.fill(); }
    g.restore();
  };

  // vaste punten langs muurtoppen (bladeren, vogelplekken)
  function wallPoints(m, step, seed) {
    const r = ML.makeRng(seed), pts = [];
    for (const w of m.walls) if (!w.open && !w.stair) for (const q of w.segs) {
      const L = Math.hypot(q[2] - q[0], q[3] - q[1]), n = Math.max(1, Math.round(L / step));
      for (let i = 0; i <= n; i++) { const t = i / n; pts.push([q[0] + (q[2] - q[0]) * t, q[1] + (q[3] - q[1]) * t, r(), r(), r()]); }
    }
    return pts;
  }
  function cacheLayer(T, name, r, draw) {
    const key = name + [r.cv.width, r.cv.height, r.s, r.ox, r.oy].join();
    if (T._c && T._c[name] && T._c[name].key === key) return T._c[name].c;
    const c = document.createElement('canvas'); c.width = r.cv.width; c.height = r.cv.height;
    draw(c.getContext('2d'));
    (T._c = T._c || {})[name] = { key, c };
    return c;
  }

  class GardenLife {
    constructor(m) {
      this.m = m; this.r = ML.makeRng('tuin' + m.cells.length); this.leaf = wallPoints(m, 0.11, 'blad');
      const spots = this.spots = wallPoints(m, 1, 'vogel');
      const nb = Math.max(3, Math.min(10, Math.round(m.cells.length / 70)));
      this.birds = spots.length ? Array.from({ length: nb }, () => ({ at: spots[Math.floor(this.r() * spots.length)], to: null, t0: 0, next: 2 + this.r() * 6, hop: -1, dir: this.r() * TAU })) : [];
      this.flowers = m.cells.filter(() => this.r() < 0.18).map(c => [c.center[0] + (this.r() - 0.5) * 0.5, c.center[1] + (this.r() - 0.5) * 0.5, Math.floor(this.r() * 3)]);
      this.t = 0;
    }
    step(dt) {
      this.t += dt;
      for (const b of this.birds) {
        if (b.to && this.t - b.t0 > 1.3) { b.at = b.to; b.to = null; b.next = this.t + 4 + this.r() * 8; }
        if (!b.to && this.t > b.next) { b.to = this.spots[Math.floor(this.r() * this.spots.length)]; b.t0 = this.t; b.dir = Math.atan2(b.to[1] - b.at[1], b.to[0] - b.at[0]); }
        if (!b.to && this.r() < dt * 0.7) { b.hop = this.t; b.dir = this.r() < 0.5 ? 0 : Math.PI; }
      }
    }
    floor(g, r, now) {
      const s = r.s, m = this.m;
      g.drawImage(cacheLayer(this, 'f', r, f => {
        for (const [x, y, k] of this.flowers) {
          const X = r.X(x), Y = r.Y(y), col = ['#f2a7c3', '#ffffff', '#f7d046'][k];
          f.fillStyle = col; for (let p = 0; p < 5; p++) { f.beginPath(); f.arc(X + Math.cos(p * TAU / 5) * s * 0.05, Y + Math.sin(p * TAU / 5) * s * 0.05, s * 0.035, 0, TAU); f.fill(); }
          f.fillStyle = '#e08a2a'; f.beginPath(); f.arc(X, Y, s * 0.025, 0, TAU); f.fill();
        }
      }), 0, 0);
      const gc = m.cells[m.goal].center, gx = r.X(gc[0]), gy = r.Y(gc[1]); // fontein bij het doel
      g.save(); g.fillStyle = 'rgba(80,150,210,0.55)'; g.beginPath(); g.arc(gx, gy, s * 0.38, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = Math.max(1, s * 0.03);
      for (let k = 0; k < 3; k++) { const ph = (now * 0.5 + k / 3) % 1; g.globalAlpha = 1 - ph; g.beginPath(); g.arc(gx, gy, s * (0.08 + ph * 0.3), 0, TAU); g.stroke(); }
      g.restore();
      return true;
    }
    top(g, r, now) {
      const s = r.s, hp = r.hp;
      g.save(); g.translate(0, hp * 0.5); // render2d staat hier op halve muurhoogte; bladeren/vogels op de muurtop
      g.drawImage(cacheLayer(this, 't', r, f => {
        const cols = ['#7dbd52', '#4d8a31', '#3b7026', '#8fcf5f'];
        for (const [x, y, a, b, c] of this.leaf) { f.fillStyle = cols[Math.floor(a * 4)]; f.beginPath(); f.arc(r.X(x) + (b - 0.5) * s * 0.22, r.Y(y) - hp + (c - 0.5) * s * 0.2, s * (0.04 + a * 0.05), 0, TAU); f.fill(); }
      }), 0, 0);
      for (const b of this.birds) {
        let x = b.at[0], y = b.at[1], h = 0, fl = false;
        if (b.to) { const e = Math.min(1, (this.t - b.t0) / 1.3); x += (b.to[0] - x) * e; y += (b.to[1] - y) * e; h = Math.sin(e * Math.PI) * 1.4; fl = true; }
        const hop = b.hop < 0 ? 0 : Math.max(0, 1 - (this.t - b.hop) / 0.25), hy = Math.sin(hop * Math.PI) * 0.12;
        ML.drawBird(g, r.X(x), r.Y(y) - hp - (h + hy) * s, s * 1.1, b.dir, fl, now * 26, fl ? 0 : Math.max(0, Math.sin(now * 3 + x * 7) - 0.8) * 5, 0);
      }
      g.restore();
      return true;
    }
  }
  ML.THEME_LIFE = { tuin: m => new GardenLife(m) };
})(window.ML = window.ML || {});
