// Gedeeld voor de tests: paden, Playwright zoeken, kern-bibliotheken in Node laden, browserpagina met foutenvanger.
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const URL = process.env.MAZE_URL || 'file://' + path.join(ROOT, 'index.html'); // MAZE_URL = andere pagina testen (bv. kopie met nieuwe script-tags)
// kern zonder DOM (dezelfde zes die de worker krijgt)
const CORE = ['rng', 'model', 'generators', 'puzzle', 'swarm', 'evo'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Playwright uit tools/22_Dreamtop: vanaf hier omhoog zoeken (map blijft verplaatsbaar)
function playwright() {
  for (let d = ROOT; d !== path.dirname(d); d = path.dirname(d)) {
    const p = path.join(d, 'tools', '22_Dreamtop', 'node_modules', 'playwright');
    if (fs.existsSync(p)) return require(p);
  }
  throw new Error('Playwright niet gevonden (tools/22_Dreamtop)');
}

// kern laden in Node; read(f) geeft de broncode van src/<f>.js (standaard: werkmap)
function loadCore(read, tag) {
  read = read || (f => fs.readFileSync(path.join(ROOT, 'src', f + '.js'), 'utf8'));
  const store = {};
  globalThis.window = globalThis;
  globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, clear: () => { for (const k in store) delete store[k]; } };
  globalThis.navigator = { hardwareConcurrency: 8 };
  delete globalThis.ML; delete globalThis.MLDEF;
  // één samengevoegd bestand (vm is ~6× trager door globale lookups); vaste naam, wordt steeds overschreven
  const tmp = path.join(os.tmpdir(), `maze-lab-core-${tag || 'cur'}.js`);
  fs.writeFileSync(tmp, CORE.map(read).join('\n'));
  delete require.cache[tmp];
  require(tmp);
  return globalThis.ML;
}

// browser + pagina; errs verzamelt pagina- en consolefouten
async function openPage(o = {}) {
  const { chromium } = playwright();
  const br = await chromium.launch({ args: o.args || [] });
  const pg = await br.newPage({ viewport: o.viewport || { width: 1400, height: 900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.goto(URL);
  return { br, pg, errs };
}
// opslag leegmaken, instellingen zetten, herladen
async function fresh(pg, settings, extra) {
  await pg.evaluate(([s, x]) => {
    localStorage.clear(); localStorage.setItem('mazelab.tour', '1');
    localStorage.setItem('mazelab.settings', JSON.stringify(s));
    for (const k in x || {}) localStorage.setItem(k, x[k]);
  }, [settings, extra || null]);
  await pg.reload();
}
const BASE = { styleV: 1, evoV: 2, speed: 90, sound: false, view3d: false };
const shotDir = () => { const d = path.join(__dirname, 'out'); fs.mkdirSync(d, { recursive: true }); return d; };

module.exports = { ROOT, URL, CORE, sleep, playwright, loadCore, openPage, fresh, BASE, shotDir };
