// Turbo-snelheid in de browser (gens/s), Eenvoudig en Maximaal. Meet alleen; faalt bij JS-fouten of als turbo niet loopt.
//   node tests/turbo.js [seconden=8] [pop=40] [grootte=14] [simple,max]
const { openPage, fresh, BASE, sleep } = require('./lib');
const [secs = '8', pop = '40', size = '14', which = 'simple,max'] = process.argv.slice(2);
(async () => {
  let fail = 0;
  for (const fast of which.split(',')) {
    const { br, pg, errs } = await openPage({ args: ['--disable-gpu'], viewport: { width: 1400, height: 900 } });
    await fresh(pg, { ...BASE, mode: 'evo', evoFast: fast, evoPop: +pop, evoSize: +size, evoMazeMode: 'new', evoMazes: 1, evoRuns: 1, evoIslands: 1 });
    await sleep(2000);
    await pg.click('#evo-tabs [data-page="evolve"]').catch(() => {});
    await sleep(300);
    await pg.click('[data-turbo="0"]');
    await sleep(+secs * 1000);
    const st = (await pg.textContent('#evo-status')).replace(/\s+/g, ' ');
    const m = st.match(/(\d+)\/s/), gps = m ? +m[1] : 0;
    await pg.click('[data-turbo="0"]').catch(() => {});
    console.log(`turbo ${fast.padEnd(6)} ${String(gps).padStart(4)} gens/s · pop ${pop} · grootte ${size} · ${st.slice(0, 120)}`);
    if (!gps) { console.log('turbo: loopt niet?'); fail++; }
    if (errs.length) { console.log('turbo: JS-fouten\n  ' + errs.join('\n  ')); fail++; }
    await br.close();
  }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('turbo: CRASH', e.message); process.exit(1); });
