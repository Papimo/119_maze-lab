// Deeltjes + animatie-curves. Posities in modeleenheden (1 = cel), tijd in seconden.
(function (ML) {
  'use strict';
  const TAU = Math.PI * 2, R = Math.random;
  const CONFETTI = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#f78c6b', '#c77dff', '#ffffff'];

  ML.FX = {
    // 0→1 met doorschieten (veer)
    spring: x => x >= 1 ? 1 : 1 - Math.exp(-5 * x) * Math.cos(9 * x),
    easeOut: x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3),

    sparks(list, x, y, col, n) {
      for (let i = 0; i < (n || 22); i++) {
        const a = R() * TAU, v = 1.5 + R() * 3.5;
        list.push({ k: 's', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, max: 0.45 + R() * 0.45, col, r: 0.04 + R() * 0.05 });
      }
    },
    // Draaikolk: naar binnen (vertrek) of naar buiten (aankomst)
    vortex(list, x, y, col, out) {
      for (let i = 0; i < 40; i++)
        list.push({ k: 'v', cx: x, cy: y, a: R() * TAU, w: 7 + R() * 5, r0: 0.25 + R() * 0.7, t: -R() * 0.25, max: 0.75, col, out });
    },
    confetti(list, x, y) {
      for (let i = 0; i < 110; i++) {
        const a = -Math.PI / 2 + (R() - 0.5) * 2.4, v = 3 + R() * 6;
        list.push({ k: 'c', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: R() * TAU, vr: (R() - 0.5) * 14, t: 0, max: 1.6 + R() * 0.9, col: CONFETTI[i % CONFETTI.length], w: 0.14 + R() * 0.08, h: 0.08 });
      }
    },
    step(list, dt) {
      const drag = Math.pow(0.04, dt), air = Math.pow(0.5, dt);
      let j = 0;
      for (const p of list) {
        p.t += dt;
        if (p.k === 's') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= drag; p.vy *= drag; }
        else if (p.k === 'c') { p.vy += 9 * dt; p.vx *= air; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }
        if (p.t < p.max) list[j++] = p;
      }
      list.length = j;
    },
    draw(g, list, X, Y, s) {
      for (const p of list) {
        if (p.t < 0) continue;
        const life = p.t / p.max;
        if (p.k === 's') {
          g.globalAlpha = 1 - life; g.fillStyle = p.col;
          g.beginPath(); g.arc(X(p.x), Y(p.y), Math.max(0.8, p.r * s * (1 - life * 0.5)), 0, TAU); g.fill();
        } else if (p.k === 'v') {
          const r = p.out ? p.r0 * life : p.r0 * (1 - life), a = p.a + p.w * p.t * (p.out ? 1 : -1);
          g.globalAlpha = Math.sin(life * Math.PI); g.fillStyle = p.col;
          g.beginPath(); g.arc(X(p.cx + Math.cos(a) * r), Y(p.cy + Math.sin(a) * r), Math.max(0.8, 0.045 * s), 0, TAU); g.fill();
        } else {
          g.globalAlpha = life > 0.7 ? (1 - life) / 0.3 : 1; g.fillStyle = p.col;
          g.save(); g.translate(X(p.x), Y(p.y)); g.rotate(p.rot);
          g.fillRect(-p.w * s / 2, -p.h * s / 2, p.w * s, p.h * s * Math.abs(Math.cos(p.rot * 1.7)) + 0.5);
          g.restore();
        }
      }
      g.globalAlpha = 1;
    }
  };
})(window.ML = window.ML || {});
