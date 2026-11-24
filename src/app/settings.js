// Instellingen S: standaarden, laden, migraties, bewaren. Maakt ML.App (gedeelde ruimte voor src/app/*.js).
(function (ML) {
  'use strict';
  const A = ML.App = {};
  const $ = s => document.querySelector(s);

  // Alle localStorage-sleutels van Maze Lab op één plek (eigenaar-bestand erachter). Nieuwe sleutel → hier bijzetten.
  const KEYS = ML.STORE_KEYS = {
    settings: 'mazelab.settings', // S (dit bestand)
    races: 'mazelab.races',       // kijkcijfers race (app/runner.js)
    daily: 'mazelab.daily',       // dagrecords (play.js)
    calib: 'mazelab.calib',       // ijking moeilijkheid (score.js)
    algos: 'mazelab.algos',       // bibliotheek eigen algoritmes (evo.js; hist[].v = ENGINE_V-stempel via Ev.stampHist, bij openen Evolutie)
    fame: 'mazelab.fame',         // eregalerij (evo.js)
    evo: 'mazelab.evo',           // evolutie-toestand (evoui)
    tour: 'mazelab.tour'          // rondleiding gezien (evoui)
  };
  const STORE = KEYS.settings;
  const S = {
    mode: 'evo', grid: 'square', shape: 'rect', text: 'MAZE', size: 24, levels: 1, torus: false,
    gen: 'backtracker', mix: 75, braid: 0, seed: ML.randomSeed(),
    keys: 0, oneways: 0, teleports: 0, switches: 0, timed: 0, terrain: 0,
    solver: 'bfs', speed: 45, palette: 'maquette', life: true, variant: '', styleV: 1, target: 50,
    compare: 'solvers', panes: 2, swarmN: 100, feet: 'color', under: false, heat: true, raceSel: ['bfs', 'astar', 'dfs', 'wall'],
    paneSel: ['bfs', 'astar', 'dfs', 'wall'], paneGen: ['backtracker', 'prim', 'kruskal', 'wilson'],
    // 2.0
    trails: true, patch: true, rainbow: true, wave: true, glint: true, flow: true, mood: 'dag', vignette: true, bloom: true,
    sound: false, follow: false, view3d: false, cam3d: 'orbit',
    // evolutie
    evoPop: 40, evoMazes: 1, evoGrid: 'square', evoMakers: 'mix', evoSize: 14, evoBraid: 0, evoPuzzle: false, evoSame: false,
    evoMut: 30, evoSpeed: 50, evoClassics: true, evoSeedSaved: false, evoAutoStop: 0, evoAutoSave: false, evoGrow: false, watchMine: false,
    evoMazeMode: 'new', evoSetN: 6, evoColor: 'species', evoFast: 'simple', evoV: 0, evoRuns: 1, evoIslands: 1, evoHunt: [], evoTaskSpeed: 75
  };
  try { Object.assign(S, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* geen opslag */ }
  if (S.mode === 'watch') S.mode = 'build';
  if (/#dna=/.test(location.hash)) S.mode = 'evo'; // gedeelde link → Evolutie (evoui openShared zet hem in de bibliotheek)
  // Migraties: [versieveld, nieuwste versie, ophogen]. Draait als S[veld] < versie; daarna S[veld] = versie.
  // Nieuwe migratie → regel toevoegen (of versie ophogen + stap erbij), standaard in S op de nieuwste versie zetten.
  const MIGRATIONS = [
    ['evoV', 2, S => { S.mode = 'evo'; S.evoMazes = 1; S.evoMazeMode = S.evoSame ? 'fixed' : 'new'; }], // Evolutie 2 = startscherm, 1 groot paneel
    ['styleV', 1, S => { S.palette = 'maquette'; }] // maquette = nieuwe standaardstijl
  ];
  MIGRATIONS.forEach(([k, v, up]) => { if ((S[k] | 0) < v) { up(S); S[k] = v; } });
  ML.V2.S = S;
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* geen opslag */ } };

  Object.assign(A, { $, S, save, STORE, KEYS, MIGRATIONS });
})(window.ML = window.ML || {});
