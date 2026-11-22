// Moeilijkheidsscore 0–100.
// Onderdelen: lengte van de route, hoeveel een "mens-achtige" gretige zoeker verdwaalt,
// keuzes onderweg, en puzzel-elementen. Weging begint als gok (PRIOR) en wordt geijkt op de eigen
// records van het dagelijkse doolhof (mazelab.daily): ridge-regressie richting de gok, dus met weinig
// gespeelde dagen blijft het dicht bij de gok.
(function (ML) {
  'use strict';
  const clamp = v => Math.max(0, Math.min(1, v));
  const LABELS = [[20, 'Heel makkelijk'], [40, 'Makkelijk'], [60, 'Gemiddeld'], [80, 'Moeilijk'], [101, 'Extreem']];
  const KEYS = ['length', 'wander', 'choices', 'puzzle'];
  const PRIOR = [0.32, 0.28, 0.15, 0.25];
  const CALIB = 'mazelab.calib', CV = 2, MIN_DAYS = 3, LAMBDA = 0.6;

  let W = PRIOR.slice(), calInfo = { n: 0, w: PRIOR.slice() };
  try {
    const c = JSON.parse(localStorage.getItem(CALIB) || 'null');
    if (c && c.v === CV && c.w && c.n >= MIN_DAYS) { W = c.w; calInfo = { n: c.n, w: c.w }; }
  } catch (e) { /* geen opslag */ }

  ML.difficultyParts = function (m) {
    if (!m || !m.solution) return null;
    const P = ML.makeProblem(m), L = Math.max(1, m.solution.length - 1);
    const greedy = ML.SOLVERS.find(x => x.id === 'greedy').fn(m, P);
    let E = 0;
    for (let r = greedy.next(); !r.done && E < 200000; r = greedy.next()) E++;
    let D = 0;
    for (const c of m.solution) if (ML.openCount(m, c) >= 3 || m.telePartner[c] >= 0) D++;
    let inv = 0;
    for (const wi of m.swDoors) if (m.walls[wi].swInv) inv++;
    const puzzle = m.keys.length * 1.2 + m.switches.length * 1.6 + inv * 0.3 + m.timed.length * 0.5 +
      m.oneways.length * 0.12 + m.teleporters.length * 0.5 + (m.levels - 1) * 0.8 + (m.weighted ? 0.6 : 0) + (m.torus ? 0.6 : 0) +
      (m.bridges ? m.bridges.length * 0.08 : 0);
    return {
      length: clamp(Math.log(L + 1) / Math.log(500)),
      wander: clamp((E / (L + 1) - 1) / 5),
      choices: clamp(D / (L + 1) * 2.5),
      puzzle: clamp(puzzle / 8)
    };
  };
  const scoreOf = (parts, w) => Math.round(100 * clamp(KEYS.reduce((a, k, i) => a + w[i] * parts[k], 0)));

  ML.difficulty = function (m) {
    const parts = ML.difficultyParts(m);
    if (!parts) return { score: 0, label: 'onoplosbaar', parts: null };
    const score = scoreOf(parts, W);
    return { score, label: LABELS.find(x => score < x[0])[1], parts, calibrated: calInfo.n };
  };

  // Hoe zwaar voelde een gespeeld doolhof: tijd (log, 5 min = vol) + omwegen (stappen t.o.v. kortste).
  const felt = rec => clamp(0.55 * Math.log(1 + rec.time / 1000) / Math.log(301) + 0.45 * clamp((rec.moves / Math.max(1, rec.best) - 1) / 3));

  // 4x4 lineair stelsel (Gauss met pivot).
  function solve(A, b) {
    const n = b.length, M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      if (Math.abs(M[c][c]) < 1e-12) return null;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    return M.map((r, i) => r[n] / r[i]);
  }

  // IJken: dagdoolhoven met een record opnieuw maken (onderdelen gecachet per dag), dan ridge naar PRIOR.
  ML.calibrate = function () {
    if (!ML.Daily) return calInfo;
    const recs = ML.Daily.load();
    let cache = {};
    try { const c = JSON.parse(localStorage.getItem(CALIB) || 'null'); if (c && c.v === CV && c.parts) cache = c.parts; } catch (e) { /* leeg */ }
    const days = Object.keys(recs).filter(d => recs[d] && recs[d].time && recs[d].moves && recs[d].best).sort().slice(-60);
    const X = [], y = [];
    for (const d of days) {
      if (!cache[d]) {
        const s = ML.Daily.settings(d), m = ML.buildFull(s, s.gen, s.aspect), p = ML.difficultyParts(m);
        if (!p) continue;
        cache[d] = KEYS.map(k => Math.round(p[k] * 1000) / 1000);
      }
      X.push(cache[d]); y.push(felt(recs[d]));
    }
    let w = PRIOR.slice();
    if (X.length >= MIN_DAYS) {
      const A = KEYS.map((_, i) => KEYS.map((__, j) => (i === j ? LAMBDA : 0) + X.reduce((a, r) => a + r[i] * r[j], 0)));
      const b = KEYS.map((_, i) => LAMBDA * PRIOR[i] + X.reduce((a, r, t) => a + r[i] * y[t], 0));
      const sol = solve(A, b);
      if (sol) w = sol.map(v => Math.max(0.02, Math.min(0.8, Math.round(v * 1000) / 1000)));
    }
    calInfo = { n: X.length, w };
    if (X.length >= MIN_DAYS) W = w;
    try { localStorage.setItem(CALIB, JSON.stringify({ v: CV, n: X.length, w, parts: cache })); } catch (e) { /* geen opslag */ }
    return calInfo;
  };
  ML.calibInfo = () => ({ ...calInfo, prior: PRIOR.slice(), keys: KEYS.slice(), min: MIN_DAYS });
})(window.ML = window.ML || {});
