// Worker == hoofddraad (browser): zelfde populatie op dezelfde doolhoven via Pool.evaluateSpecs (bouwen in workers)
// en via evaluate op de hoofddraad; fitness moet gelijk zijn. Ook de testbaan-verdeling (x.test). Anders = exit 1.
const { openPage, fresh, BASE, sleep } = require('./lib');
(async () => {
  const { br, pg, errs } = await openPage();
  await fresh(pg, { ...BASE, mode: 'build', evoFast: 'max' });
  await sleep(1500);
  const r = await pg.evaluate(async () => {
    const Ev = ML.Evo, mk = Ev['build' + 'Maze'], out = [];
    if (!Ev.Pool.ensure()) return { fail: 'Pool start niet (broken=' + Ev.Pool.broken + ')' };
    if (!Ev.Pool.canBuild) return { fail: 'Pool kan niet bouwen (MLDEF < 6)' };
    const cases = [
      { grid: 'square', size: 14, braid: 10, puzzle: false, makers: 'mix' },
      { grid: 'mix', size: 12, braid: 0, puzzle: true, makers: 'mix' },
      { grid: 'hex', size: 10, braid: 30, puzzle: false, makers: 'mix' }
    ];
    for (let c = 0; c < cases.length; c++) {
      const o = cases[c], pop = Ev.initPop({ pop: 20, classics: true, rng: ML.makeRng('w' + c) });
      pop.forEach((g, i) => { g.id = 'w' + c + '_' + i; g.genes[8] = (i % 5) - 2; g.genes[9] = 2 - (i % 4); });
      const specs = [0, 1, 2].map(i => ({ o, sd: 'cmp' + c + '|' + i, i, asp: 0.66 }));
      const a = pop.map(g => ({ ...g, genes: g.genes.slice() })), b = pop.map(g => ({ ...g, genes: g.genes.slice() }));
      let tw = null; const test = c === 0 ? Ev.PRESETS[2].genes.slice() : null;
      const p = Ev.Pool.evaluateSpecs(a, specs, 7, c + 1, () => specs.map(s => mk(s.o, s.sd, s.i, s.asp)), test ? { test, onTest: t => { tw = t; } } : undefined);
      if (!p) return { fail: 'evaluateSpecs gaf null' };
      await p;
      Ev.evaluate(b, specs.map(s => mk(s.o, s.sd, s.i, s.asp)), 7, c + 1);
      const bad = a.filter((g, i) => Math.abs(g.fit - b[i].fit) > 1e-12 || g.ok !== b[i].ok).length;
      let tdiff = '';
      if (test) { const th = Ev.testScore(test); tdiff = !tw ? 'testbaan: geen uitkomst uit workers' : (tw.score !== th.score || JSON.stringify(tw.per) !== JSON.stringify(th.per)) ? `testbaan ${tw.score} ≠ ${th.score}` : ''; }
      out.push({ grid: o.grid, puzzle: o.puzzle, bad, n: a.length, tdiff, broken: Ev.Pool.broken });
    }
    return { out, size: Ev.Pool.size() };
  });
  let fail = 0;
  if (r.fail) { console.log('workers: FOUT', r.fail); fail++; }
  else r.out.forEach(x => {
    const ok = !x.bad && !x.tdiff && !x.broken; if (!ok) fail++;
    console.log(`workers ${x.grid}${x.puzzle ? '+puzzel' : ''}: ${ok ? 'ok' : 'ANDERS'} (${x.n - x.bad}/${x.n} gelijk${x.tdiff ? ', ' + x.tdiff : ''}${x.broken ? ', pool kapot' : ''}) · ${r.size} workers`);
  });
  if (errs.length) { console.log('workers: JS-fouten\n  ' + errs.join('\n  ')); fail++; }
  await br.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('workers: CRASH', e.message); process.exit(1); });
