// Zelf spelen + dagelijks doolhof (zaadje uit de datum) + eigen records (localStorage).
(function (ML) {
  'use strict';
  const STORE = 'mazelab.daily';
  const pad = v => String(v).padStart(2, '0');

  ML.Daily = {
    ymd(d) { d = d || new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },
    // Vaste recepten: iedereen krijgt op dezelfde dag hetzelfde doolhof (vaste verhouding, los van schermgrootte).
    settings(ymd) {
      const rng = ML.makeRng('daily|' + ymd), day = new Date(ymd + 'T12:00:00').getDay();
      const grid = ['hex', 'square', 'tri', 'square', 'polar', 'hex', 'square'][day];
      const gens = ML.GENERATORS.filter(g => !g.grid || grid === 'square').map(g => g.id);
      const s = {
        grid, aspect: 0.62, text: 'MAZE',
        shape: grid === 'polar' ? 'rect' : rng.pick(['rect', 'rect', 'rect', 'circle', 'heart', 'star', 'ring']),
        size: grid === 'polar' ? 20 + rng.int(10) : 14 + rng.int(8),
        gen: rng.pick(gens), mix: 40 + rng.int(60),
        braid: rng() < 0.5 ? 5 + rng.int(15) : 0,
        seed: 'dag-' + ymd,
        levels: grid !== 'polar' && rng() < 0.25 ? 2 : 1,
        torus: grid === 'square' && rng() < 0.2,
        terrain: rng() < 0.3 ? 15 + rng.int(25) : 0,
        keys: rng() < 0.4 ? 1 + rng.int(2) : 0,
        switches: rng() < 0.25 ? 1 : 0,
        timed: rng() < 0.25 ? 1 + rng.int(3) : 0,
        oneways: rng() < 0.3 ? 2 + rng.int(5) : 0,
        teleports: rng() < 0.3 ? 1 : 0
      };
      if ((ML.GENERATORS.find(g => g.id === s.gen) || {}).grid) s.shape = 'rect';
      return s;
    },
    load() { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { return {}; } },
    save(all) { try { localStorage.setItem(STORE, JSON.stringify(all)); } catch (e) { /* geen opslag */ } },
    // Geeft { rec, newTime, newMoves } terug.
    record(ymd, res) {
      const all = this.load(), rec = all[ymd] || { done: 0 };
      const newTime = !rec.time || res.time < rec.time, newMoves = !rec.moves || res.moves < rec.moves;
      if (newTime) rec.time = res.time;
      if (newMoves) rec.moves = res.moves;
      rec.done++; rec.best = res.best;
      all[ymd] = rec; this.save(all);
      return { rec, newTime, newMoves };
    },
    fmt(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${pad(s % 60)}`; }
  };

  // Speler op een Runner (gebruikt r.m, r.P, r.vs, r.stepFx, r.goalFx).
  ML.Play = {
    start(r) {
      const m = r.m, P = r.P;
      r.phase = 'play'; r.result = null;
      r.play = { s: P.start, trail: [m.start], moves: 0, cost: 0, t0: 0, tEnd: 0, done: false, gaveUp: false };
      r.vs = { cur: -1, path: [m.start], pathT: 1, state: P.start, player: m.start, playerAnim: null };
      r.dirty = true;
    },
    go(r, mv) {
      const p = r.play, m = r.m, P = r.P;
      if (!p || p.done || !mv) return false;
      if (!p.t0) p.t0 = performance.now();
      const s0 = p.s, c0 = P.cell(s0);
      p.s = mv.s2; p.moves++;
      p.cost += mv.kind === 'wait' || mv.kind === 'tele' ? 1 : m.cost[mv.c];
      p.trail.push(mv.c);
      const v = r.vs;
      v.path = p.trail; v.pathT = 1; v.state = p.s; v.player = mv.c;
      v.playerAnim = { from: c0, t0: performance.now() / 1000 };
      r.stepFx(s0, p.s, c0, mv.c);
      if (P.isGoal(p.s)) { p.done = true; p.tEnd = performance.now(); r.goalFx(); }
      r.dirty = true;
      if (r.onPlay) r.onPlay(r, p);
      return true;
    },
    // Pijltje: buur met de dichtstbijzijnde richting (y omlaag; rechts = 0).
    arrow(r, ang) {
      if (!r.play) return;
      let best = null, bd = 1.25;
      for (const mv of r.P.moves(r.play.s)) {
        if (mv.kind !== 'step') continue;
        const d = Math.abs(((mv.ang - ang) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        if (d < bd) { bd = d; best = mv; }
      }
      this.go(r, best);
    },
    special(r) { if (r.play) this.go(r, r.P.moves(r.play.s).find(x => x.kind === 'stair' || x.kind === 'tele')); },
    wait(r) { if (r.play) this.go(r, r.P.moves(r.play.s).find(x => x.kind === 'wait')); },
    click(r, px, py) {
      if (!r.play) return;
      const c = r.r.cellAt(px, py);
      if (c < 0) return;
      const mv = r.P.moves(r.play.s);
      this.go(r, c === r.P.cell(r.play.s) ? mv.find(x => x.kind === 'wait') : mv.find(x => x.c === c && x.kind !== 'wait'));
    }
  };
})(window.ML = window.ML || {});
