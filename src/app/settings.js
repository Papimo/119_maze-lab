// Instellingen S: standaarden, laden, migraties, bewaren. Maakt ML.App (gedeelde ruimte voor src/app/*.js).
(function (ML) {
  'use strict';
  const A = ML.App = {};
  const $ = s => document.querySelector(s);

  const STORE = 'mazelab.settings';
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
  if ((S.evoV | 0) < 2) { S.mode = 'evo'; S.evoMazes = 1; S.evoMazeMode = S.evoSame ? 'fixed' : 'new'; S.evoV = 2; } // Evolutie 2 = startscherm, 1 groot paneel
  if (S.styleV !== 1) { S.palette = 'maquette'; S.styleV = 1; } // maquette = nieuwe standaardstijl
  ML.V2.S = S;
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* geen opslag */ } };

  Object.assign(A, { $, S, save, STORE });
})(window.ML = window.ML || {});
