// Vingerafdruk van uitkomsten (Node, geen browser): testscores klassiekers + 3 vaste genomen, zware testbaan,
// doolhoven, fitness op 16 doolhoven, en 6 generaties evolutie (selectie + kinderen, eilanden).
// Vergelijkt met tests/same.ref.json (gemaakt van v2.2.0). Anders = exit 1.
//   node tests/same.js              vergelijken
//   node tests/same.js --ref [rev]  referentie opnieuw maken uit git (standaard v2.2.0)
//   node tests/same.js --update     referentie = huidige code (alleen na bewust ENGINE_V ophogen)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { ROOT, loadCore } = require('./lib');
const REF = path.join(__dirname, 'same.ref.json');
const args = process.argv.slice(2);

function fingerprint(ML) {
  const Ev = ML.Evo, t0 = Date.now();
  // 3 vaste genomen: midden van het bereik, met geheugen/feromoon, en een randgeval
  const fixed = [
    Ev.GENES.map(G => (G.lo + G.hi) / 2),
    Ev.PRESETS[1].genes.map((v, i) => i === 8 ? 2.5 : i === 9 ? -2 : v),
    Ev.GENES.map((G, i) => i % 2 ? G.hi : G.lo)
  ];
  const genes = Ev.PRESETS.map(p => p.genes).concat(fixed);
  const res = { V: Ev.ENGINE_V };
  res.test = genes.map(g => { const t = Ev.testScore(g); return [t.score, t.solved, JSON.stringify(t.per)]; });
  res.heavy = fixed.concat([Ev.PRESETS[0].genes]).map(g => { const h = Ev.heavyScore(g); return [h.score, h.solved, h.per.join(',')]; });
  // doolhoven + fitness
  const rng = ML.makeRng('same');
  for (let i = 0; i < 12; i++) genes.push(Ev.GENES.map(G => G.lo + rng() * (G.hi - G.lo)));
  const os = [{ grid: 'square', size: 14, braid: 0, makers: 'mix' }, { grid: 'mix', size: 14, braid: 20, makers: 'mix' }, { grid: 'square', size: 12, braid: 0, puzzle: true, makers: 'mix' }, { grid: 'mix', size: 10, braid: 10, puzzle: true, makers: 'mix' }];
  res.mz = []; res.fit = [];
  os.forEach((o, k) => { for (let i = 0; i < 4; i++) {
    const mz = Ev.buildMaze(o, 'zz' + k + '|' + i, i, 0.66);
    res.mz.push([mz.ctx.N, mz.ctx.to.length, mz.ctx.opt, mz.m.start, mz.m.goal, mz.m.walls.filter(w => w.open).length].join(','));
    const pop = genes.map((g, j) => ({ genes: g, id: 'a' + j }));
    Ev.evaluate(pop, [mz], 3, 2);
    res.fit.push(pop.map(p => +p.fit.toFixed(9)));
  } });
  // evolutie: id's vast maken (anders tijd/toeval in de zaadjes)
  const er = ML.makeRng('evo-same'), o = { grid: 'mix', size: 10, braid: 10, makers: 'mix' };
  const fix = (pop, g) => pop.forEach((ge, j) => { ge.id = 'g' + g + '_' + j; });
  let pop = Ev.initPop({ pop: 24, classics: true, rng: er }); fix(pop, 0);
  res.evo = [];
  for (let g = 0; g < 6; g++) {
    const mazes = [0, 1, 2, 3].map(i => Ev.buildMaze(o, 'evo|' + g + '|' + i, i, 0.66));
    Ev.evaluate(pop, mazes, g, 1);
    res.evo.push(pop.map(p => p.fit.toFixed(9) + ':' + p.genes.join('/')).join(';'));
    pop = Ev.nextGenIslands(pop, { pop: 24, mut: 0.3, elite: 2, rng: er, gen: g + 1 }, g < 3 ? 1 : 3, 2); fix(pop, g + 1);
  }
  res.ms = Date.now() - t0;
  return res;
}

function compare(a, b) {
  const diff = [];
  if (a.V !== b.V) diff.push(`ENGINE_V ${a.V} → ${b.V} (referentie opnieuw maken met --update als dat bewust is)`);
  for (const k of ['test', 'heavy', 'mz', 'evo']) {
    const n = a[k].filter((x, i) => JSON.stringify(x) !== JSON.stringify(b[k][i])).length;
    if (n) diff.push(`${k}: ${n}/${a[k].length} anders`);
  }
  let df = 0, nf = 0; a.fit.forEach((r, i) => r.forEach((x, j) => { nf++; if (Math.abs(x - b.fit[i][j]) > 1e-9) df++; }));
  if (df) diff.push(`fitness: ${df}/${nf} anders`);
  return diff;
}

if (args[0] === '--ref') {
  const rev = args[1] || 'v2.2.0';
  const ML = loadCore(f => execFileSync('git', ['-C', ROOT, 'show', `${rev}:src/${f}.js`], { encoding: 'utf8', maxBuffer: 1 << 26 }), 'ref');
  const r = fingerprint(ML); r.rev = rev; delete r.ms;
  fs.writeFileSync(REF, JSON.stringify(r));
  console.log(`same: referentie gemaakt uit ${rev} (ENGINE_V ${r.V})`);
} else {
  const cur = fingerprint(loadCore());
  if (args[0] === '--update') { cur.rev = 'werkmap'; const ms = cur.ms; delete cur.ms; fs.writeFileSync(REF, JSON.stringify(cur)); console.log(`same: referentie = huidige code (${ms} ms)`); process.exit(0); }
  if (!fs.existsSync(REF)) { console.log('same: geen referentie; eerst node tests/same.js --ref'); process.exit(1); }
  const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));
  const d = compare(ref, cur);
  console.log(d.length ? `same: ANDERS dan ${ref.rev} — ${d.join(' · ')}` : `same: ok, bit-gelijk aan ${ref.rev} (${cur.ms} ms)`);
  process.exit(d.length ? 1 : 0);
}
