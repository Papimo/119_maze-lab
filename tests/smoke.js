// Rooktest (browser, geen 3D): 20 standen uit 2.0, Kijken, Evolutie-pagina's en alle taken.
// Fout = JS-fout of ontbrekend onderdeel → exit 1.   node tests/smoke.js [--shots] [--quick]
const path = require('path');
const { openPage, fresh, BASE, sleep, shotDir } = require('./lib');
const SHOTS = process.argv.includes('--shots'), QUICK = process.argv.includes('--quick');
const CASES = [
  ['bouwen-maquette-dfs', { mode: 'build', palette: 'maquette', gen: 'backtracker', solver: 'dfs' }],
  ['bouwen-zwerm', { mode: 'build', palette: 'maquette', solver: 'swarm' }],
  ['bouwen-mieren-lussen', { mode: 'build', palette: 'neon', solver: 'ants', braid: 25 }],
  ['bouwen-tuin-astar', { mode: 'build', palette: 'tuin', solver: 'astar' }],
  ['bouwen-aurora-nacht', { mode: 'build', palette: 'aurora', mood: 'nacht', solver: 'bfs' }],
  ['bouwen-zaklamp', { mode: 'build', palette: 'maquette', mood: 'zaklamp', solver: 'tremaux' }],
  ['bouwen-cyclus-zon', { mode: 'build', palette: 'zon', mood: 'cyclus', solver: 'wall' }],
  ['bouwen-patchwork', { mode: 'build', gen: 'patchwork', solver: 'dfs' }],
  ['bouwen-spiegel', { mode: 'build', gen: 'mirror', solver: 'astar' }],
  ['bouwen-weave', { mode: 'build', variant: 'weave', gen: 'backtracker', solver: 'astar' }],
  ['bouwen-zalen', { mode: 'build', variant: 'rooms', solver: 'bfs' }],
  ['bouwen-breed', { mode: 'build', variant: 'wide', solver: 'dfs' }],
  ['bouwen-zeshoek-puzzel', { mode: 'build', grid: 'hex', keys: 2, teleports: 1, timed: 1, solver: 'astar' }],
  ['bouwen-ringen-verdiep', { mode: 'build', grid: 'polar', levels: 2, solver: 'bfs' }],
  ['bouwen-volgcamera', { mode: 'build', follow: true, solver: 'dfs' }],
  ['lab-oplossers', { mode: 'lab', compare: 'solvers', panes: 4 }],
  ['lab-race', { mode: 'lab', compare: 'race', panes: 4 }],
  ['lab-zwerm', { mode: 'lab', compare: 'swarm' }],
  ['lab-mieren', { mode: 'lab', compare: 'ants' }],
  ['vandaag', { mode: 'daily' }]
];
const ALGO = JSON.stringify([{ id: 'rook1', name: 'Rook Vos', genes: [8, 0, 4, 1.5, 0, 0, 0, 0, -3, 0, 0], born: 5 }]);

(async () => {
  const { br, pg, errs } = await openPage();
  const out = SHOTS ? shotDir() : null;
  const shot = async n => { if (out) await pg.screenshot({ path: path.join(out, n + '.png') }); };
  const bad = [];
  // één stap: fouten van die stap tellen, ontbrekend onderdeel (time-out) ook
  async function step(name, fn) {
    const e0 = errs.length; let msg = '';
    try { msg = (await fn()) || ''; } catch (e) { errs.push('stap: ' + e.message.split('\n')[0]); }
    const ne = errs.slice(e0);
    console.log(name.padEnd(26), ne.length ? 'FOUT ' + ne.join(' | ') : 'ok', msg ? '· ' + String(msg).replace(/\s+/g, ' ').slice(0, 70) : '');
    if (ne.length) bad.push(name);
  }
  const click = (sel, t = 4000) => pg.click(sel, { timeout: t });

  // 1. Bouwen, Lab, Vandaag
  for (const [name, cfg] of QUICK ? CASES.filter((_, i) => i % 4 === 0) : CASES) await step(name, async () => {
    await fresh(pg, { ...BASE, ...cfg }); await sleep(2000);
    const btn = await pg.$('#btn-solve');
    if (btn && await btn.isVisible()) await btn.click();
    await sleep(QUICK ? 2000 : 4000);
    await shot('v2-' + name);
    return pg.evaluate(() => (document.querySelector('#score, .pane-stats, #daily-info') || {}).textContent || '');
  });

  // 2. Kijken (3 doolhoven) + alleen eigen algoritmes
  await step('kijken', async () => {
    await fresh(pg, { ...BASE, mode: 'build' }); await sleep(1500);
    await click('[data-mode="watch"]');
    let info = '';
    for (let i = 0; i < (QUICK ? 1 : 3); i++) { await sleep(4000); info = await pg.$eval('#watch-info', e => e.textContent); }
    await click('#watch-mine'); await sleep(2000);
    await shot('v2-kijken');
    await pg.keyboard.press('Escape');
    return info;
  });

  // 3. Evolutie: rondleiding, pagina's, turbo, taken
  await step('evo-rondleiding', async () => {
    await pg.evaluate(a => { localStorage.clear(); localStorage.setItem('mazelab.algos', a); localStorage.setItem('mazelab.settings', JSON.stringify({ styleV: 1, evoV: 2, sound: false, view3d: false, mode: 'evo' })); }, ALGO);
    await pg.reload(); await sleep(2500);
    if (!(await pg.$('#evo-tour'))) throw new Error('rondleiding ontbreekt');
    for (let i = 0; i < 3 && await pg.$('#evo-tour'); i++) { await click('#evo-tour .btn.primary'); await sleep(250); }
    if (await pg.$('#evo-tour')) await click('#evo-tour [data-ev="tour-end"]');
    return 'migratie: ' + await pg.evaluate(() => ML.Evo.loadAlgos().map(a => a.name + ' ' + a.genes.length + ' genen').join());
  });
  for (const pg_ of ['algos', 'evolve', 'task', 'ana']) await step('evo-pagina-' + pg_, async () => {
    await click(`#evo-tabs [data-page="${pg_}"]`); await sleep(500);
    const vis = await pg.$eval(`.evo-page[data-page="${pg_}"]`, e => !!e.offsetParent || getComputedStyle(e).display !== 'none');
    if (!vis) throw new Error('pagina niet zichtbaar');
    await shot('evo-' + pg_);
  });
  await step('evo-turbo-x25', async () => {
    await click('#evo-tabs [data-page="evolve"]'); await sleep(300);
    await click('[data-turbo="25"]');
    for (let i = 0; i < 30; i++) { await sleep(500); if (!/Turbo/.test(await pg.$eval('#evo-status', e => e.textContent))) break; }
    return pg.$eval('#evo-status', e => e.textContent);
  });
  await step('evo-kaart-delen', async () => {
    await click('#evo-tabs [data-page="algos"]'); await sleep(300);
    await click('#algo-grid .acard:has-text("Rook Vos")'); await sleep(400);
    await click('#algo-det [data-ev="share"]'); await sleep(300);
    if (!(await pg.$('.share .qr svg'))) throw new Error('geen QR');
    return pg.$eval('#algo-det .evo-score', e => e.innerText);
  });
  // taken: openen vanaf de kaart, starten, even laten lopen
  const TASKS = [['bench', null], ['mut', '[data-ev="mut-go"]'], ['duel', '[data-ev="duel-start"]'], ['why', '[data-ev="why-play"]'], ['hunt', '[data-ev="hunt-go"]']];
  for (const [t, go] of TASKS) await step('evo-taak-' + t, async () => {
    await click('#evo-tabs [data-page="algos"]'); await sleep(300);
    if (!(await pg.$('#algo-grid .acard.sel:has-text("Rook Vos")'))) { await click('#algo-grid .acard:has-text("Rook Vos")'); await sleep(300); }
    await click(`#algo-det [data-ev="task-${t}"]`); await sleep(800);
    let note = '';
    if (go) { const b = await pg.$(go); if (!b) throw new Error('startknop ontbreekt: ' + go); if (await b.isDisabled()) note = 'start uit'; else await b.click(); }
    await sleep(QUICK ? 2500 : 5000);
    await shot('evo-taak-' + t);
    if (t === 'hunt' && go) await pg.click(go).catch(() => {}); // zoeker stoppen
    return note || await pg.evaluate(() => (document.querySelector('#task-pane') || {}).innerText || '').then(s => s.slice(0, 60));
  });
  await step('evo-analyse', async () => { await click('#evo-tabs [data-page="ana"]'); await sleep(800); await shot('evo-ana'); });

  console.log(bad.length ? `smoke: ${bad.length} FOUT (${bad.join(', ')})` : 'smoke: ok, geen JS-fouten');
  await br.close();
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('smoke: CRASH', e.message); process.exit(1); });
