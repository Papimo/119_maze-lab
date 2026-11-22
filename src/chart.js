// Grafiek bij vergelijken (Lab): links groeicurves (bezochte cellen per stap) als draadjes met speld,
// rechts kartonnen blokjes per maat. Kleuren uit het palet, deelnemers in hun eigen kleur.
(function (ML) {
  'use strict';
  const TAU = Math.PI * 2;
  ML.RACECOL = ['#c8322f', '#2f6fb0', '#2f8f74', '#d9a441'];
  const hex2rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const shade = (hex, f) => { const c = hex2rgb(hex).map(v => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)); return `rgb(${c[0]},${c[1]},${c[2]})`; };
  const nice = v => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
  const fmt = v => v >= 10000 ? Math.round(v / 1000) + 'k' : v >= 1000 ? (v / 1000).toFixed(1).replace('.0', '') + 'k' : String(Math.round(v * 10) / 10);

  ML.Chart = class {
    constructor(cv) { this.cv = cv; this.g = cv.getContext('2d'); }
    // entries: [{ name, col, hist: [[stap, bezocht]...], done, found, win }], metrics: [{ label, vals: [per entry of null] }]
    draw(pal, entries, metrics, title) {
      const cv = this.cv, d = window.devicePixelRatio || 1, W = Math.round(cv.clientWidth * d), H = Math.round(cv.clientHeight * d);
      if (!W || !H) return;
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const g = this.g, M = pal.maq, ink = pal.label || pal.wall, paper = pal.floor, board = M ? M.bg2 : pal.bg;
      g.setTransform(d, 0, 0, d, 0, 0);
      const w = W / d, h = H / d;
      g.clearRect(0, 0, w, h);
      // ondergrond: plank met karton erop (kartonnen kaartje met slagschaduw)
      g.fillStyle = board; g.fillRect(0, 0, w, h);
      g.save(); g.shadowColor = 'rgba(40,25,10,0.35)'; g.shadowOffsetX = 3; g.shadowOffsetY = 4; g.shadowBlur = 8;
      g.fillStyle = paper; g.fillRect(8, 8, w - 16, h - 16); g.restore();
      g.font = '600 11px system-ui, sans-serif'; g.textBaseline = 'alphabetic';
      if (!entries.length) { g.fillStyle = ink; g.globalAlpha = 0.6; g.textAlign = 'center'; g.fillText('Los op om te vergelijken', w / 2, h / 2); g.globalAlpha = 1; return; }
      const split = Math.round(w * 0.5);
      this.curves(g, pal, entries, 22, 30, split - 30, h - 54, ink, title);
      this.blocks(g, pal, entries, metrics, split + 14, 30, w - split - 34, h - 58, ink);
    }

    curves(g, pal, E, x0, y0, cw, ch, ink, title) {
      let maxX = 1, maxY = 1;
      for (const e of E) for (const p of e.hist) { if (p[0] > maxX) maxX = p[0]; if (p[1] > maxY) maxY = p[1]; }
      maxX = nice(maxX); maxY = nice(maxY);
      const X = v => x0 + 24 + v / maxX * (cw - 24), Y = v => y0 + ch - v / maxY * ch;
      g.fillStyle = ink; g.textAlign = 'left'; g.globalAlpha = 0.85; g.fillText(title || 'Bezocht per stap', x0, y0 - 10); g.globalAlpha = 1;
      // potloodlijntjes
      g.strokeStyle = ink; g.lineWidth = 1; g.globalAlpha = 0.18; g.setLineDash([2, 4]); g.beginPath();
      for (let k = 1; k <= 4; k++) { const y = Math.round(Y(maxY * k / 4)) + 0.5; g.moveTo(X(0), y); g.lineTo(X(maxX), y); }
      g.stroke(); g.setLineDash([]); g.globalAlpha = 0.5; g.beginPath(); g.moveTo(X(0), Y(0) + 0.5); g.lineTo(X(maxX), Y(0) + 0.5); g.stroke(); g.globalAlpha = 1;
      g.font = '10px system-ui, sans-serif'; g.fillStyle = ink; g.globalAlpha = 0.6;
      g.textAlign = 'right'; g.fillText(fmt(maxY), X(0) - 4, Y(maxY) + 4); g.fillText('0', X(0) - 4, Y(0) + 3);
      g.textAlign = 'center'; g.fillText(fmt(maxX) + ' stappen', X(maxX) - 20, Y(0) + 14); g.globalAlpha = 1;
      // draadjes: eerst schaduw, dan kleur
      E.forEach((e, k) => {
        const pts = e.hist;
        if (pts.length < 2) return;
        const path = new Path2D();
        path.moveTo(X(pts[0][0]), Y(pts[0][1]));
        for (const p of pts) path.lineTo(X(p[0]), Y(p[1]));
        g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
        g.translate(1.5, 2.5); g.strokeStyle = 'rgba(40,25,10,0.22)'; g.lineWidth = 3; g.stroke(path); g.restore();
        g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = e.col; g.lineWidth = e.win ? 3.2 : 2.2; g.stroke(path); g.restore();
        const L = pts[pts.length - 1], px = X(L[0]), py = Y(L[1]);
        if (e.done) { // speld: kop met glimlicht, of kruisje als vastgelopen
          if (e.found) {
            g.fillStyle = 'rgba(40,25,10,0.3)'; g.beginPath(); g.arc(px + 1.5, py + 2.5, 5, 0, TAU); g.fill();
            g.fillStyle = e.col; g.beginPath(); g.arc(px, py, 5, 0, TAU); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(px - 1.5, py - 1.5, 1.7, 0, TAU); g.fill();
            if (e.win) { // vlaggetje
              g.strokeStyle = ink; g.lineWidth = 1.2; g.beginPath(); g.moveTo(px, py - 5); g.lineTo(px, py - 22); g.stroke();
              g.fillStyle = e.col; g.beginPath(); g.moveTo(px, py - 22); g.lineTo(px + 12, py - 18); g.lineTo(px, py - 14); g.closePath(); g.fill();
            }
          } else { g.strokeStyle = e.col; g.lineWidth = 2; g.beginPath(); g.moveTo(px - 4, py - 4); g.lineTo(px + 4, py + 4); g.moveTo(px + 4, py - 4); g.lineTo(px - 4, py + 4); g.stroke(); }
        } else { g.fillStyle = e.col; g.beginPath(); g.arc(px, py, 3, 0, TAU); g.fill(); }
      });
      // legenda onderaan
      g.font = '600 10.5px system-ui, sans-serif'; g.textAlign = 'left';
      let lx = x0;
      for (const e of E) {
        g.fillStyle = e.col; g.fillRect(lx, y0 + ch + 22, 10, 10);
        g.fillStyle = ink; const t = (e.rank ? e.rank + ' ' : '') + e.name; g.fillText(t, lx + 14, y0 + ch + 31);
        lx += g.measureText(t).width + 26;
      }
    }

    blocks(g, pal, E, metrics, x0, y0, cw, ch, ink) {
      const n = E.length, gw = cw / Math.max(1, metrics.length), depth = 6;
      const bw = Math.max(6, Math.min(26, (gw - 18) / n - 4));
      g.textAlign = 'center';
      metrics.forEach((mt, gi) => {
        const vals = mt.vals.filter(v => v != null), max = vals.length ? Math.max(...vals, 1e-9) : 1;
        const gx = x0 + gi * gw + gw / 2 - (n * (bw + 4)) / 2;
        const base = y0 + ch;
        // sokkel
        g.fillStyle = shade(pal.floor, -0.12); g.fillRect(gx - 6, base, n * (bw + 4) + 8, 4);
        mt.vals.forEach((v, k) => {
          const bx = gx + k * (bw + 4), col = E[k].col;
          if (v == null) { g.strokeStyle = ink; g.globalAlpha = 0.25; g.setLineDash([2, 3]); g.strokeRect(bx + 0.5, base - 14.5, bw, 14); g.setLineDash([]); g.globalAlpha = 1; return; }
          const bh = Math.max(2, (v / max) * (ch - 26)), top = base - bh;
          g.fillStyle = 'rgba(40,25,10,0.2)'; g.fillRect(bx + depth, top + 2, bw, bh - 2); // slagschaduw
          g.fillStyle = shade(col, -0.32); // zijkant
          g.beginPath(); g.moveTo(bx + bw, top); g.lineTo(bx + bw + depth, top - depth); g.lineTo(bx + bw + depth, base - depth); g.lineTo(bx + bw, base); g.closePath(); g.fill();
          g.fillStyle = shade(col, 0.35); // bovenkant
          g.beginPath(); g.moveTo(bx, top); g.lineTo(bx + depth, top - depth); g.lineTo(bx + bw + depth, top - depth); g.lineTo(bx + bw, top); g.closePath(); g.fill();
          g.fillStyle = col; g.fillRect(bx, top, bw, bh);
          g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(bx, top, bw * 0.3, bh); // golfkarton-glans
          if (v === Math.min(...vals) && vals.length > 1 && mt.low) { g.fillStyle = ink; g.fillText('★', bx + bw / 2 + depth / 2, top - depth - 14); }
          g.fillStyle = ink; g.font = '600 10px system-ui, sans-serif'; g.fillText(fmt(v), bx + bw / 2 + depth / 2, top - depth - 3);
        });
        g.fillStyle = ink; g.globalAlpha = 0.75; g.font = '600 10.5px system-ui, sans-serif';
        g.fillText(mt.label, x0 + gi * gw + gw / 2, base + 18); g.globalAlpha = 1;
      });
    }
  };
})(window.ML = window.ML || {});
