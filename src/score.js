// Moeilijkheidsscore 0–100. Eerste ijking op gevoel; bijstellen na spelen.
// Onderdelen: lengte van de route, hoeveel een "mens-achtige" gretige zoeker verdwaalt,
// keuzes onderweg, en puzzel-elementen.
(function (ML) {
  'use strict';
  const clamp = v => Math.max(0, Math.min(1, v));
  const LABELS = [[20, 'Heel makkelijk'], [40, 'Makkelijk'], [60, 'Gemiddeld'], [80, 'Moeilijk'], [101, 'Extreem']];

  ML.difficulty = function (m) {
    if (!m || !m.solution) return { score: 0, label: 'onoplosbaar', parts: null };
    const P = ML.makeProblem(m), L = Math.max(1, m.solution.length - 1);
    const greedy = ML.SOLVERS.find(x => x.id === 'greedy').fn(m, P);
    let E = 0;
    for (let r = greedy.next(); !r.done && E < 200000; r = greedy.next()) E++;
    let D = 0;
    for (const c of m.solution) if (ML.openCount(m, c) >= 3 || m.telePartner[c] >= 0) D++;
    let inv = 0;
    for (const wi of m.swDoors) if (m.walls[wi].swInv) inv++;
    const puzzle = m.keys.length * 1.2 + m.switches.length * 1.6 + inv * 0.3 + m.timed.length * 0.5 +
      m.oneways.length * 0.12 + m.teleporters.length * 0.5 + (m.levels - 1) * 0.8 + (m.weighted ? 0.6 : 0) + (m.torus ? 0.6 : 0);
    const parts = {
      length: clamp(Math.log(L + 1) / Math.log(500)),
      wander: clamp((E / (L + 1) - 1) / 5),
      choices: clamp(D / (L + 1) * 2.5),
      puzzle: clamp(puzzle / 8)
    };
    const score = Math.round(100 * (0.32 * parts.length + 0.28 * parts.wander + 0.15 * parts.choices + 0.25 * parts.puzzle));
    return { score, label: LABELS.find(x => score < x[0])[1], parts };
  };
})(window.ML = window.ML || {});
