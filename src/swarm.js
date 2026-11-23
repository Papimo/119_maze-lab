// Zwerm: N lopers tegelijk vanaf de start, elk een eigen willekeurige diepte-eerst (over de puzzeltoestand,
// dus sleutels/hendels/teleporters tellen mee). De eerste bij het doel wint; de rest stopt en vervaagt.
// Weergave: warmtegloed = bezoeken per cel (paars → rood → geel → witgeel), lopers als witte stipjes.
(window.MLDEF = window.MLDEF || []).push(function (ML) { // MLDEF: ook in de Web Worker (evo.js Pool)
  'use strict';
  const TAU = Math.PI * 2;
  // Hittekaart-kleuren; ook voor de latere hittekaart na afloop (race/Trémaux).
  ML.HEAT_STOPS = ['#3b1f5c', '#a3245a', '#e8562a', '#f7b733', '#fff3b0'];
  const FADE = 1.2; // s: verliezers vervagen na de winst
  const HEAT_FADE = 3.2, HEAT_TO = 0.15; // s: gloed dooft uit na de winst (tot 15%)

  // Afstand (cellen) tot het doel over open gangen, voor "wie ligt voor".
  function goalDist(m) {
    const n = m.cells.length, d = new Int32Array(n).fill(1e9), q = [m.goal];
    d[m.goal] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      for (const nb of m.cells[c].nbrs) if (m.walls[nb.w].open && d[nb.c] > d[c] + 1) { d[nb.c] = d[c] + 1; q.push(nb.c); }
    }
    return d;
  }

  ML.goalDist = goalDist;

  // Heatmap tekenen: per kleurstap één Path2D. Log-schaal, anders domineert de start.
  ML.drawHeat = function (g, r, m, heat, alpha) {
    let mx = 0;
    for (let i = 0; i < heat.length; i++) if (heat[i] > mx) mx = heat[i];
    if (!mx) return;
    const L = Math.log(1 + Math.max(mx, 4)), B = [[], [], [], [], []];
    for (let i = 0; i < heat.length; i++) if (heat[i] > 0) B[Math.min(4, Math.floor(Math.log(1 + heat[i]) / L * 5))].push(i);
    g.save();
    B.forEach((list, k) => { if (!list.length) return; g.globalAlpha = (0.35 + k * 0.12) * (alpha == null ? 1 : alpha); g.fillStyle = ML.HEAT_STOPS[k]; g.fill(r.cellsPath(list)); });
    g.restore();
  };

  class Swarm {
    constructor(m, P, n, seed) {
      this.m = m; this.P = P; this.rng = ML.makeRng(seed); this.n = n;
      this.heat = new Float32Array(m.cells.length); this.reached = 0;
      this.dist = goalDist(m); this.clock = 0; this.winner = null; this.overAt = null; this.alive = n;
      this.out = []; this.cst = [];
      const s0 = P.start, c0 = P.cell(s0);
      this.heat[c0] = n; this.reached = 1;
      this.runners = Array.from({ length: n }, (_, k) => {
        const a = { k: k + 1, st: [s0], vis: new Set([s0]), c: c0, nc: c0, p: 0, dur: 1, jump: false, steps: 0, done: false, trail: [],
          ox: (this.rng() - 0.5) * 0.36, oy: (this.rng() - 0.5) * 0.36 };
        this.next(a);
        return a;
      });
    }
    // Volgende zet van loper a: nieuwe toestand (vooruit) of terug over de eigen stapel.
    next(a) {
      const P = this.P, m = this.m, out = this.out, cst = this.cst, top = a.st[a.st.length - 1];
      P.succ(top, out, cst);
      const opts = [];
      for (let i = 0; i < out.length; i++) if (!a.vis.has(out[i])) opts.push(i);
      let to, d = 1;
      if (opts.length) {
        const i = this.pick(opts, out); to = out[i]; d = cst[i] || 1;
        a.vis.add(to); a.st.push(to);
      } else {
        a.st.pop();
        if (!a.st.length) { this.stuck(a); return; } // alles geprobeerd: vast
        to = a.st[a.st.length - 1]; d = m.cost ? m.cost[P.cell(to)] || 1 : 1;
      }
      a.c = a.nc; a.nc = P.cell(to); a.p = 0; a.dur = Math.max(0.3, d);
      if (a.c !== a.nc) { a.trail.push(a.c); if (a.trail.length > 7) a.trail.shift(); }
      const w = a.c !== a.nc ? ML.edge(m, a.c, a.nc) : null;
      a.jump = a.c !== a.nc && (!w || w.stair); // teleporter of trap: niet over het canvas glijden
    }
    // u = stap-eenheden voor elke loper, t = klok (s) voor het vervagen.
    step(u, t) {
      if (this.winner || !this.alive) return;
      this.clock += u;
      for (const a of this.runners) {
        if (a.done) continue;
        a.p += u;
        while (a.p >= a.dur && !a.done) {
          const left = a.p - a.dur;
          a.steps++;
          if (!this.heat[a.nc]) this.reached++;
          this.heat[a.nc]++;
          if (this.P.isGoal(a.st[a.st.length - 1]) && a.nc === this.P.cell(a.st[a.st.length - 1])) { if (this.onGoal(a, t)) return; a.p = left; continue; }
          this.next(a); a.p = left;
        }
      }
    }
    pick(opts) { return opts[Math.floor(this.rng() * opts.length)]; }
    stuck(a) { a.done = true; this.alive--; }
    onGoal(a, t) { this.win(a, t); return true; }
    // lichtende sliertjes: de laatste cellen van elke loper
    trails(g, r, fade) {
      const C = this.m.cells, P1 = new Path2D(), P2 = new Path2D();
      for (const a of this.runners) {
        if (a.done || a === this.winner || a.trail.length < 1) continue;
        const T = a.trail, [hx, hy] = this.pos(a);
        let px = r.X(hx), py = r.Y(hy);
        for (let i = T.length - 1; i >= 0; i--) {
          const nxt = i === T.length - 1 ? a.c : T[i + 1], w = ML.edge(this.m, T[i], nxt);
          if (!w || w.wrap || w.stair) break;
          const c = C[T[i]].center, x = r.X(c[0] + a.ox), y = r.Y(c[1] + a.oy), tgt = i >= T.length - 3 ? P1 : P2;
          tgt.moveTo(px, py); tgt.lineTo(x, y); px = x; py = y;
        }
      }
      const light = r.pal.maq || !/^#[0-3]/.test(r.pal.bg); // lichte stijl: 'lighter' is daar onzichtbaar
      g.save(); g.globalCompositeOperation = light ? 'source-over' : 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = light ? (this.ants ? 'rgba(30,140,80,1)' : 'rgba(200,80,40,1)') : (this.trailCol || 'rgba(255,214,140,1)');
      g.globalAlpha = 0.16 * (1 - fade); g.lineWidth = Math.max(1, r.s * 0.07); g.stroke(P2);
      g.globalAlpha = 0.34 * (1 - fade); g.lineWidth = Math.max(1, r.s * 0.09); g.stroke(P1);
      g.restore();
    }
    win(a, t) {
      this.winner = a; this.overAt = t; a.c = a.nc; a.p = 0;
      const P = this.P, states = [], path = [];
      for (const s of a.st) { const c = P.cell(s); if (path[path.length - 1] === c && states.length) { states[states.length - 1] = s; continue; } path.push(c); states.push(s); }
      this.result = { found: true, path, states };
    }
    leader() {
      if (this.winner) return this.winner;
      let best = null, bd = 1e9;
      for (const a of this.runners) if (!a.done && this.dist[a.nc] < bd) { bd = this.dist[a.nc]; best = a; }
      return best;
    }
    pos(a) {
      const C = this.m.cells, A = C[a.c].center, B = C[a.nc].center;
      let e = Math.min(1, a.p / a.dur);
      if (a.jump) e = e < 0.5 ? 0 : 1;
      return [A[0] + (B[0] - A[0]) * e + a.ox, A[1] + (B[1] - A[1]) * e + a.oy];
    }
    info() {
      const w = this.winner, p = [`${this.n} lopers`];
      if (!w) p.push(`${this.alive} onderweg`);
      p.push(`${this.reached} cellen bezocht`);
      if (w) p.push(`winnaar #${w.k}: ${w.steps} stappen, route ${this.result.path.length - 1}`);
      else if (!this.alive) p.push('niemand haalde het doel');
      return p.join(' · ');
    }
    // floorFx: warmtegloed + stipjes. Geeft true zolang er iets beweegt.
    draw(g, r, now) {
      const m = this.m;
      const hf = this.overAt == null ? 0 : Math.min(1, Math.max(0, now - this.overAt) / HEAT_FADE);
      ML.drawHeat(g, r, m, this.heat, 1 - (1 - HEAT_TO) * ML.FX.easeInOut(hf));
      return this.drawDots(g, r, now) || (this.overAt != null && hf < 1);
    }
    drawDots(g, r, now) {
      const m = this.m, s = r.s;
      const fade = this.overAt == null ? 0 : Math.min(1, Math.max(0, now - this.overAt) / FADE);
      const lead = this.leader(), rad = Math.max(1.4, s * 0.06);
      g.save();
      if (fade < 1 && ML.V2 && ML.V2.on('trails')) this.trails(g, r, fade);
      if (fade < 1) {
        const dot = new Path2D();
        for (const a of this.runners) {
          if (a === lead) continue;
          const [x, y] = this.pos(a), X = r.X(x), Y = r.Y(y);
          dot.moveTo(X + rad, Y); dot.arc(X, Y, rad, 0, TAU);
        }
        g.globalAlpha = 1 - fade * 0.85;
        g.fillStyle = 'rgba(255,255,255,0.92)'; g.fill(dot);
        g.strokeStyle = 'rgba(60,20,40,0.5)'; g.lineWidth = 1; g.stroke(dot);
      }
      if (lead) { // koploper / winnaar: groter, goud met ring
        const [x, y] = this.winner ? m.cells[lead.nc].center : this.pos(lead), X = r.X(x), Y = r.Y(y), R = rad * 1.9;
        g.globalAlpha = 1;
        g.beginPath(); g.arc(X, Y, R * (1.9 + Math.sin(now * 6) * 0.25), 0, TAU); g.strokeStyle = 'rgba(255,243,176,0.85)'; g.lineWidth = Math.max(1, s * 0.035); g.stroke();
        g.beginPath(); g.arc(X, Y, R, 0, TAU); g.fillStyle = '#ffd34d'; g.fill(); g.strokeStyle = '#5a2a10'; g.lineWidth = Math.max(1, s * 0.03); g.stroke();
      }
      g.restore();
      return this.overAt == null ? this.alive > 0 : fade < 1;
    }
  }
  ML.Swarm = Swarm;

  // Mierenkolonie: mieren lopen willekeurig maar volgen het feromoon van eerdere mieren. Wie het doel haalt,
  // legt feromoon op zijn route (korter = sterker) en begint opnieuw. Feromoon verdampt langzaam. Na genoeg
  // aankomsten met dezelfde beste route is de kolonie "het eens" en wint de beste route.
  class Ants extends Swarm {
    constructor(m, P, n, seed) {
      super(m, P, n, seed);
      this.ants = true; this.pher = new Float32Array(m.cells.length); this.pmax = 1e-6;
      this.arrivals = 0; this.best = null; this.bestLen = 1e9; this.sameBest = 0; this.flash = []; this.trailCol = 'rgba(150,255,190,1)';
      this.Q = Math.max(4, this.dist[P.cell(P.start)] || 10);
    }
    pick(opts, out) {
      if (!this.pher) return super.pick(opts); // tijdens super(): nog geen feromoon
      const P = this.P, ph = this.pher, k = 1 / this.pmax;
      let tot = 0; const w = opts.map(i => { const v = Math.pow(0.12 + ph[P.cell(out[i])] * k, 2.2); tot += v; return v; });
      let x = this.rng() * tot;
      for (let j = 0; j < opts.length; j++) { x -= w[j]; if (x <= 0) return opts[j]; }
      return opts[opts.length - 1];
    }
    reset(a) {
      const s0 = this.P.start;
      a.st = [s0]; a.vis = new Set([s0]); a.c = a.nc = this.P.cell(s0); a.p = 0; a.trail = []; a.steps = 0; a.dur = 1;
      this.next(a);
    }
    stuck(a) { this.reset(a); }
    onGoal(a, t) {
      const P = this.P, len = a.st.length, add = this.Q / len;
      const seen = new Set();
      for (const s of a.st) { const c = P.cell(s); if (seen.has(c)) continue; seen.add(c); this.pher[c] += add; if (this.pher[c] > this.pmax) this.pmax = this.pher[c]; }
      this.arrivals++; this.flash.push(t);
      if (len < this.bestLen) { this.bestLen = len; this.best = a.st.slice(); this.sameBest = 0; }
      else if (len === this.bestLen) this.sameBest++;
      if ((this.sameBest >= 6 && this.arrivals >= Math.max(10, this.n / 4)) || this.arrivals >= this.n * 3) {
        this.win({ k: 'kolonie', st: this.best, c: P.cell(this.best[this.best.length - 1]), nc: P.cell(this.best[this.best.length - 1]), p: 0, steps: this.bestLen - 1, ox: 0, oy: 0 }, t);
        return true;
      }
      this.reset(a);
      return false;
    }
    step(u, t) {
      if (this.winner) return;
      const ev = Math.pow(0.992, u), ph = this.pher;
      let mx = 1e-6;
      for (let i = 0; i < ph.length; i++) { ph[i] *= ev; if (ph[i] > mx) mx = ph[i]; }
      this.pmax = mx;
      super.step(u, t);
    }
    info() {
      const p = [`${this.n} mieren`, `${this.arrivals} keer het doel gehaald`];
      if (this.best) p.push(`beste route ${this.best.length - 1}`);
      if (this.winner) p.push('kolonie is het eens');
      return p.join(' · ');
    }
    // feromoon: groen-cyaan gloeiende banen over open gangen, 4 sterktes
    draw(g, r, now) {
      const m = this.m, C = m.cells, ph = this.pher, k = 1 / this.pmax, B = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      const fade = this.overAt == null ? 0 : Math.min(1, Math.max(0, now - this.overAt) / HEAT_FADE);
      ML.drawHeat(g, r, m, this.heat, 0.28 * (1 - fade * 0.7));
      for (const w of m.walls) {
        if (!w.open || w.b === null || w.wrap || w.stair) continue;
        const v = Math.min(ph[w.a], ph[w.b]) * k;
        if (v < 0.04) continue;
        const A = C[w.a].center, Bc = C[w.b].center, p = B[Math.min(3, Math.floor(v * 4))];
        p.moveTo(r.X(A[0]), r.Y(A[1])); p.lineTo(r.X(Bc[0]), r.Y(Bc[1]));
      }
      g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.strokeStyle = '#7dffb0';
      B.forEach((p, i) => { g.globalAlpha = (0.12 + i * 0.16) * (1 - fade * 0.8); g.lineWidth = Math.max(1.2, r.s * (0.1 + i * 0.06)); g.stroke(p); });
      // aankomst-flits bij het doel
      const gc = C[m.goal].center, gx = r.X(gc[0]), gy = r.Y(gc[1]);
      this.flash = this.flash.filter(t0 => now - t0 < 0.8);
      for (const t0 of this.flash) { const e = (now - t0) / 0.8; g.globalAlpha = 0.6 * (1 - e); g.lineWidth = Math.max(1, r.s * 0.08); g.strokeStyle = '#b6ffd2'; g.beginPath(); g.arc(gx, gy, r.s * (0.3 + e * 1.4), 0, TAU); g.stroke(); }
      g.restore();
      const busy = super.drawDots(g, r, now);
      return busy || this.flash.length > 0;
    }
  }
  ML.Ants = Ants;
}); MLDEF[MLDEF.length - 1](window.ML = window.ML || {});
