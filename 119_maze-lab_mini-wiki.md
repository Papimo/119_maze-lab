# 119_maze-lab mini-wiki

## Doel
- Web-app: doolhof genereren + zichtbaar laten oplossen. Gekozen richtingen: 1 algoritme-lab, 3 vormen, 4 kijkstand, 5 puzzels. (2 race-tegen-computer niet gekozen.)
- Nu 2D; model is voorbereid op 3D (asset-namen per element).

## Stack
- Vanilla JS, canvas 2D, geen build. `index.html` + losse `<script src>` (werkt via file://, geen modules). Alles hangt aan `window.ML`.

## Waar staat wat
- Rasters/silhouetten/graaf/verdiepingen/torus/trappen/JSON-export → `src/model.js` (`ML.TOPO.*`, `makeMaze`, `buildMaze`, `edge`, `toJSON`, `ML.ASSETS`, `ML.TERRAIN`, `ML.Heap`)
- Makers → `src/generators.js` (`ML.GENERATORS`; `gridOnly` = Eller/Sidewinder/Opdelen, alleen `m.sq`, anders terugval)
- Lussen, start/doel, terrein, sleutels/hendels/tijddeuren/eenrichting/teleporters, zoekprobleem → `src/puzzle.js` (`placeTerrain`, `placePuzzle`, `makeProblem` (enc/dec/succ/moves/h), `solvePath` = Dijkstra, `canSolve`, `finishMaze`, `buildFull`)
- Oplossers → `src/solvers.js` (`ML.SOLVERS`, lopers via `P.moves`)
- Moeilijkheid → `src/score.js` (`ML.difficultyParts`, `ML.difficulty`, `ML.calibrate` = ridge naar `PRIOR` op records `mazelab.daily`, cache + weging in localStorage `mazelab.calib`; vanaf 3 dagen; app `recalibrate`, `#calib-text`)
- Deeltjes/curves → `src/fx.js` (`ML.FX`); tijden in `ML.ANIM` (render2d)
- Tekenen + paletten → `src/render2d.js` (`ML.Render2D.draw` → true = blijft bewegen, `stateOf`, `cellAt`). Maquette = palet met `maq`: `floorLayer`/`maqWalls` (cache; tijdens bouwen `live` = goedkoop direct), `lifeFloor`, `endWave`; na de muren `translate(0,-hp/2)` voor alles erboven
- Rustig leven: klok in `Runner.draw` (app.js, `S.life`, ~30 fps); eindscène: `goalFx` zet `vs.endT` → zoom + golf in `draw`
- Kamers & zalen → `src/puzzle.js` `placeRooms` (in `finishMaze`, vóór lussen; `S.variant = 'rooms'`, alleen vierkant)
- Weave → `src/puzzle.js` `placeWeave` (in `finishMaze`, `S.variant = 'weave'`): rand `bridge` (open, `via` = kruiscel, `m.bridges`), kruiscel-zijmuren `lock`; per brug 1 muur dicht op oude route (blijft perfect). Tekenen: render2d `bridgeDecks` + donkere kruiscel. A*-heuristiek: `step` ×2 bij bruggen
- Brede + smalle gangen → `src/model.js` `ML.widenSquare` (in `makeMaze`, `S.variant = 'wide'`, niet bij torus)
- Zelf spelen + Vandaag + records → `src/play.js` (`ML.Daily`, `ML.Play`; localStorage `mazelab.daily`)
- Race → app.js `Runner.race`/`tickRace` (`r.racers`, `S.compare = 'race'`, `makeRace`, `raceInfo`, `S.raceSel`); tekenen render2d `drawRace` (kwadrant per deelnemer, vlag winnaar). Kleuren `ML.RACECOL` (chart.js)
- Grafiek Lab → `src/chart.js` (`ML.Chart.draw`: curves = bezocht per stap, blocks = kartonnen blokjes); app `drawChart` (≤8×/s), verloop `mkHist`/`histPush` (`r.hist`, `racer.hist`)
- UI, standen, lus → `src/app.js` (`Runner` met tick/draw/stepFx/goalFx, `makeLab`, `dailyEnsure`, `findTarget`, `watchNext`, `S` in localStorage `mazelab.settings`)

## Status
- v0.3.0 (2026-11-22): + maquette-stijl, varianten zalen/breed/weave, race in Lab, vergelijkingsgrafiek, ijking moeilijkheid. Ongetest door gebruiker.
- v0.2 (2026-11-22): + verdiepingen, terrein, hendels, tijddeuren, torus, 4 makers, 4 oplossers, animaties, moeilijkheid, tab Vandaag. Ongetest door gebruiker.
- Online: https://papimo.github.io/119_maze-lab/ (GitHub Pages, branch master, repo openbaar).

## Beslissingen
- Graaf i.p.v. raster: cellen = polygonen, buren uit gedeelde randen → elk raster (vierkant/zeshoek/driehoek/ringen) en elk silhouet werkt met dezelfde makers/oplossers.
- 3D-koppeling: elk element heeft `id`, `type`, `asset` (bv. `wall.inner`, `door.red`, `teleporter.0`, `marker.start`) + `level`. JSON-export: `format: maze-lab/1`, assen 2D x/y → 3D x/z.
- Toestand = cel × tijd(mod 6) × hendelbits × sleutelbits als één getal; alle oplossers via `makeProblem.succ`. Tijd tikt per stap (niet per kosten); wachten mag als er tijddeuren zijn.
- Verdiepingen naast elkaar getekend (x-verschuiving `levelDX`); export/heuristiek gebruiken lokale `lc`.
- Zelfde zaadje + maker = zelfde doolhof (lab vergelijkt zo eerlijk).
- Stijl: kartonnen maquette (standaard, migratie via `S.styleV`); oude paletten blijven kiesbaar. Prototype + andere stijlen: `design/index.html`.

## Valkuilen
- Tekst-silhouet: alleen grootste samenhangende stuk blijft → onderstreping verbindt letters; puntjes (i) vallen weg.
- Weave: bruggen pas na het bouwen (in `finishMaze`), dus niet zichtbaar tijdens de bouw-animatie. Alleen vierkant, geen bruggen naast elkaar.
- Rechterhand-oplosser loopt vast bij lussen/eenrichting (bewust, laat zien waarom).
- Lussen + deuren: een lus kan een deur omzeilen (puzzel makkelijker, wel oplosbaar).
- Zuinigheidswaker-hook blokkeert Bash-commando's met het woord `node_modules` of `build` (ook `view-build` in een heredoc) (ook in een heredoc voor .gitignore) → Write gebruiken.

## Volgende stappen
- Gebruiker test: weave, race, grafiek, ijking (allemaal ongetest).
- Later: bol, silhouet uit afbeelding, 3D-weergave (three.js).
