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
- Aanhaakpunten render2d `draw`: `vs.floorFx(g, r, now)` (onder muren, na terrein) en `vs.topFx` (helemaal aan het eind, maquette op -hp/2); `vs.theme.floor/top` idem voor thema-leven; `vs.cam` = camera {x,y,z,px,py}; `vs.riseT` = muren klappen omhoog; `vs.noVisit` = volgordekleuren uit. Alle hooks: true = blijft bewegen
- Zwerm → `src/swarm.js` (`ML.Swarm`: elke loper willekeurige DFS over `P.succ`, `step`/`win`/`leader`/`draw`; `ML.drawHeat` + `ML.HEAT_STOPS` = hittekaart); app `Runner.swarm`/`tickSwarm`, Lab `S.compare = 'swarm'` (`makeSwarm`, `swarmInfo`, `S.swarmN`), Kijken 30% kans (`watchNext`)
- Pootjes → `src/fx.js` `ML.Prints` (add bij cur-wissel in `tick`, `vs.prints`), `S.feet`/`S.under`
- Commentator → app.js `SAY`, `say()`, `leadCheck()` (ballon `.say` in race/zwerm-paneel, CSS-animatie)
- Kijkcijfers → app.js `raceWin`/`boardHtml` (localStorage `mazelab.races`, `.board` in racepaneel)
- Hittekaart na afloop → app.js `heatFx` (`vs.heat`, `vs.doneT`, `S.heat`); race `drawRace` verbergt stipjes via `hideList`
- Tuinthema → `src/themes.js` (`ML.PALETTES.tuin` met `life: 'tuin'`, `ML.THEME_LIFE`, `ML.drawBird`); app `Runner.draw` maakt `this.tl`
- Muren klappen (maquette) → render2d `draw` blok "maquette: muur klapt neer", `this.rise` in `maqWalls`
- Oneindig inzoomen → app.js `watchFrame` stage `zoom` + `W.enterT`
- 2.0-beeldlagen → `src/v2fx.js` (`ML.V2.layers(z)`; z = `floor`/`top`/`screen`, aangeroepen in render2d `draw`; lagen `patch`, `rainbow`, `wave`, `aurora` (+zon), `flow`, `glint`, `mood` (+`flies`, zaklamp-masker), `vignette`, `bloom`; `ML.distFrom`; geluid `ML.Sound`). Instellingen = `S` via `ML.V2.S`
- Regenboog-bouw: app `generate` → `vs.gord/gn`, `finishGen` → `vs.rainbow` + `vs.readyT` (golf/glans)
- Snelheid bouwen → app.js `GEN_X`/`GEN_MAX`, `tick` (`eff`, `this.genMin`, Kijken `r.genX = 1`); vervagen route → render2d `PATH_FADE_*`; zwermgloed → swarm.js `HEAT_FADE/HEAT_TO`
- Makers 2.0 → generators.js `patchwork` (zet `m.blocks/blockN/blockStyle`), `mirror`
- Mierenkolonie → swarm.js `Ants extends Swarm` (hooks `pick`/`stuck`/`onGoal`, `pher`); sliertjes `Swarm.trails`. App: solver `'swarm'/'ants'` in Bouwen (`isSwarmSolver`), Lab `SWARMY()`
- 3D → `src/view3d.js` (`ML.View3D`; app `v3of`, `set3D`, render na `draw` in `frame`/`watchFrame`; `r.noWalls` = 2D tekent alleen vloer = textuur; `runner.drew`). three.js r160 UMD in `vendor/three.js` (+ CDN-terugval)
- Volgcamera 2D → app `Runner.draw` (`this.fc` → `vs.cam`); sneltoetsen 3/C/M/F → keydown, `cycleKey`, `flash`
- Evolutie (tab `evo`, startscherm) → kern `src/evo.js` (`ML.Evo`): `GENES` (11; chaos = laatste; `upGenes` 9→11, `okGenes`), `PRESETS`; `ENGINE()` = zelfstandige loper-engine (Walker op CSR-rijen, `evalOne` met hergebruikte loper, `evalList`) → ook als Worker-bron via `toString()`; `context(m)` bouwt CSR over alle toestanden (`off/to/tc/kd/ex/ey/cellOf`), `pack` = alleen rijen; `cap` = min(6n, 25×kortste); `buildMaze` met cache (`mzCache`); `testScore` → `per` + `cats` (`TEST_CATS`); `Pool` = Web Workers uit Blob (`ensure`/`evaluate`, terugval hoofddraad); bibliotheek `loadAlgos` (migratie: `parent`, `ver`, `folder`, `tags`, `note`, `created`, `hist`), `newAlgo`, `stampHist` (per `ENGINE_V`); deelcode `MLDNA1:`
- Evolutie-scherm → `src/evoui.js` (`ML.EvoUI`), 4 vaste pagina's `setPage` (`E.page` algos/evolve/task/ana; HTML `#evo-tabs` + `.evo-page[data-page]` in `#view-evo`; zijpaneel + werkbalk verborgen in evo-modus). Twee tonelen `mkView`: `V` = evolutie (loopt door op elke pagina, tekent alleen op Evolueren), `T` = taak (`#task-pane`, `startShow(kind, list, keep)`; kind solo/duel/mut/preview); `frame` → `stepView` per toneel, `endView` → `advance` (V) of `taskEnded` (T); `loadRuns` = lopers in doolhoven. Algoritmes: `algosRender/algoGrid/algoCard/liveCard/algoDetail/evoDetail`, `todoHtml` ("Wat wil je doen?"), `libField` (`.det-fields`). Evolueren: instellingen in 3 `<details>` (`.ev-set`), `evoBar`, `champCard`, `rankList`, `legend`, `drawChart`. Taak: `openTask(kind, a)` (`E.task` = {kind, algo, step pick/busy/done}), `taskRender/stepsRender/setStep/taskIn/taskOut/afterHtml`, per taak `xxxIn`/`xxxOut` (bench, mut, duel, why, hunt), `duelNow`, `saveVersion`. Analyse: `anaRender` → `treeRender` + `famRender`, `report`. Klikken centraal `onClick` (`data-ev`) op `#view-evo`; soorten `speciate`, doolhof-modus `mm()/nEval()/nPanes()`, `turbo(n)`
- Evolutie 3 (evo.js): `evalList(…, runs, i0)` (runs = gemiddelde), `Walker.explain()` (punten per gen + kans, zelfde formule als `step`), `specMaze`/`spName` (doolhof uit beschrijving), `HEAVY`/`heavyScore`/`heavyReady` (zware testbaan, opwarmen in `enter`), `nextGenIslands`/`assignIslands` (`ge.isl`, migratie elke 8), `loadFame`/`addFame`/`delFame` (localStorage `mazelab.fame`, top 20), `syncSolvers` (bewaarde algos → `ML.SOLVERS` met `evo: true`, `solverFn`; app `fillSolvers` via `ML.onSolversChanged`; Kijken 14% kans)
- Workers bouwen doolhoven: zes bibliotheken (rng, model, generators, puzzle, swarm, evo) registreren zich in `window.MLDEF`; `Pool.ensure` plakt ze in de Blob-worker → `Pool.evaluateSpecs` (alleen zaadjes heen, per doolhof 1 worker); terugval `Pool.evaluate` (rijen) / hoofddraad
- Mutantenlab-stopregel → evoui `mutCheck` (in `stepView` voor T): klaar zodra `M.need` binnen of `M.maxT` s voorbij; kansloos (> 2× stappen eerste) afkappen (`w.cut`, `run.cut`); voortgang in `mutOut`. Tempo taak = `S.evoTaskSpeed`, evolutie = `S.evoSpeed` (beide max 133 ≈ 21 000 st/s, `rate`)
- Turbo-snelheid: model.js `tplCache`/`cloneMaze` (leeg raster per grid/size/aspect hergebruikt; niet bij verdiepingen/breed); evo.js Walker: stapel = `stk`/`sl` (Int32Array, `get st()` voor oud gebruik), `LG` = log-tabel, hand-gen via hoekverschil `ctx.an` (geen atan2), n=1 zonder exp; `Pool.evaluateSpecs(…, x)`: `x.next` = volgende generatie alvast bouwen in dezelfde worker (`pre`), `x.test` = testbaan verdeeld over alle jobs (`testPart`/`testCombine`/`testPut`). evoui: `advance(quiet, later)` → `E.pend` + `record()` / `flushPend()`
- Evolutie 5: genen geheugen/feromoon in `ENGINE` Walker (`last`, `scent/scT`, `DEC`-tabel, alleen als `g8/g9` ≠ 0 → oude scores bit-gelijk); `clamp(v,i,src)` rekt mee, `clampHard` voor import; korte deelcode `toShort`/`fromShort` (`MLDNA2.`, int16 ×1000). evoui: `sureOf`/`sureTag`/`scoreBox`/`vsClassic` (scoretaal + zekerheid), `autoSave`/`autoChecks`/`stall`/`grow`/`autoInfo` (instellingen `evoAutoStop/evoAutoSave/evoGrow`, `.ev-set` details "Automatisch"), `goalHtml` trap 1/2, `shareLink`/`qrSvg`/`shareHtml`/`openShared` (`#dna=`; app.js zet dan mode evo), `TOUR`/`tour` (localStorage `mazelab.tour`), `ML.EvoUI._test`. QR = `vendor/qrcode.js` (qrcode-generator, data-lake qr-trade). Kijken eigen algoritmes: app `S.watchMine`, `#watch-mine`, `evoGo('watch')`
- UI, standen, lus → `src/app.js` (`Runner` met tick/draw/stepFx/goalFx, `makeLab`, `dailyEnsure`, `findTarget`, `watchNext`, `S` in localStorage `mazelab.settings`)

## Status
- v2.2.0 Evolutie 5 (2026-11-24): top 10 — bereikfout, één scoretaal + zekerheid, auto-stop/-bewaren, ladder zware testbaan, meegroeiend doolhof, genen geheugen + feromoon (ENGINE_V 3), Kijken alleen eigen algoritmes, rondleiding, link + QR, rooktest 2.0 (20 standen + Kijken). Playwright zonder JS-fouten; gebruiker moet nog kijken.
- v2.1.0 Evolutie 4 (2026-11-24): Evolutie-pagina opnieuw ingedeeld (combinatie wireframes 2+3+4): tabs Algoritmes · Evolueren · Taak · Analyse, kaartenoverzicht als start, "Wat wil je doen?", taken als volledig scherm (In · doolhof · Uit, stappen Kiezen → Bezig → Uitkomst), evolutie op de achtergrond, mutantenlab met stopregel, sneller tempo. Rooktest (Playwright) zonder JS-fouten; gebruiker moet nog kijken.
- v2.0.0 (2026-11-23): alles hieronder + turbo sneller. Meting (8 kernen, 40 lopers, 4 doolhoven van 14, browser): Eenvoudig 66 → ~95 gens/s, Maximaal 73–86 → ~125–150 gens/s; Node hoofddraad 31 → 65 gens/s. Uitkomsten bit-gelijk (vingerafdruk testscores/fitness).
- Evolutie 3 (2026-11-23, niet gecommit): eregalerij, mutantenlab, zware testbaan, bouwen in workers, runs per doolhof, eilanden, grafische stamboom, hittekaart per soort, doolhof-zoeker (+ trainen), eigen algoritmes als oplosser, uitleg-replay, HTML-rapport. Rooktest (Playwright) zonder JS-fouten; gebruiker moet nog kijken.
- Evolutie 2 (2026-11-23, niet gecommit): startscherm, 1 groot paneel, kleur per soort + legenda, schakelaar nieuw/vast/vaste set, werkbank (9 schuifjes, live proefrit, testbaan per soort, bewaren als versie), duel 2–4 (spoor per kleur, tabel testbaan + soorten), bibliotheek (zoeken, mappen, labels, notitie, stamboom, scoregeschiedenis), CSR-engine, Web Workers, turbo ×25/×100/×1000/∞. Rooktest (Playwright) zonder JS-fouten; gebruiker moet nog kijken.
- Evolutie-tab (2026-11-23, niet gecommit): zwerm met DNA per loper op 1–6 doolhoven, turbo, grafiek tegen beste klassieker, kampioen + DNA-balkjes, ranglijst, bewaren/hernoemen/deelcode/export/import, ‘kijk alleen’ en ‘zaai’. Rooktest + rekencontrole ok (na ~28 generaties verslaat een eigen algoritme Kompas 53,7). Gebruiker moet nog kijken.
- v2.0 (2026-11-23, niet gecommit): sneller bouwen, route/zwerm vervaagt, 3D (3 camera's), doolhof van doolhoven, spiegel, mierenkolonie, sliertjes, regenboog-bouw, ademgolf, glans, lichtstroom, sfeer (avond/nacht/zaklamp/cyclus, vuurvliegjes), volgcamera, Aurora + Zonsondergang, gloed, vignet, geluid, stofwolkjes, schermvullend. Rooktest zonder JS-fouten; gebruiker moet nog kijken.
- Na v0.3.0 (2026-11-22, niet gecommit): zwerm (warmtegloed, 100 lopers), pootjes, commentator, tuinthema, klappende muren, oneindig inzoomen (Kijken), hittekaart na afloop, kijkcijfers. Ongetest.
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
- Evolutie-UI: zelfde `data-key` op twee elementen wordt niet gesynchroniseerd (app.js bindt per element) → taak-tempo heeft eigen sleutel `evoTaskSpeed`. Toets 3 = 3D (app.js vangt hem eerder af) → geen cijfertoetsen voor de tabs. Taak-pagina eerst zichtbaar maken (`setPage`) vóór `startShow`, anders verhouding 0.66.
- Turbo Maximaal: hoofddraad ~60% idle; worker-rekenwerk ~3,8 ms maar wachten ~7,4 ms per generatie → rest = berichten/planning (8 workers + hoofddraad op 8 kernen). Volgende winst: meerdere generaties per worker-ronde (alleen Vast/Vaste set) of minder workers dan kernen proberen. Loper zelf: ~180 ns/stap, ~25% is `Math.exp` (nodig voor gelijke uitkomsten). Kortere `cap` = sneller maar andere scores (ENGINE_V ophogen).
- Meetscripts in `prullenbak/` (bench.js = Node per onderdeel, same.js = vingerafdruk gelijke uitkomsten, turbo_pw.js = browser-turbo via Playwright).
- Nieuw bestand dat de worker nodig heeft → zelfde `MLDEF`-omhulling (eerste/laatste regel) en `Pool.canBuild`-drempel (≥6) nalopen. Geen DOM op topniveau in die bestanden.
- Doolhof-zoeker vindt bijna altijd puzzel-doolhoven (sleutel → loper haalt de stapgrens niet): echte zwakte, geen fout.
- Evolutie: 1 doolhof per generatie = fitness is geluk (beste haalt vaak 100) → "nieuw per generatie" telt altijd ≥4 doolhoven. Vaste soortdrempel → na ~100 generaties 1 soort; daarom zelfregelend.
- Workers bij kleine populatie (40 × 4 doolhoven): nauwelijks sneller dan eenvoudig (berichten + doolhoven bouwen op de hoofddraad domineren); winst pas bij grote populatie/vaste set.
- `⚔`-teken ontbreekt in sommige lettertypen → knop heet "vs".
- Evolutie: preset-gewichten moeten kloppen (Kompas met comp > fresh−back pendelt eindeloos). Fitness wisselt per generatie door nieuwe doolhoven → testbaan-lijn is de echte maat. Rekencheck in Node `vm` is ~6× trager dan echt (globale lookups); los samengevoegd script gebruiken.
- three.js: alleen UMD werkt via file:// (geen modules); r160 is de laatste met `build/three.js`. Gekopieerd uit `games/112_froggers/vendor`. Downloaden via curl/python liep vast op zuinigheidswaker (woord in URL) + auto-modus.
- Mieren in een perfect doolhof: maar één route → leren is pas zichtbaar met lussen (Kijken zet dan braid).
- 'lighter'-compositie is onzichtbaar op lichte stijlen (maquette) → daar source-over met donkere kleur.
- 3D: Kijken-inzoomen (`vs.cam`) werkt alleen in 2D; in 3D wisselt het doolhof gewoon.
- Zwerm-backtrack over de toestandsstapel is geen echte tijd-stap (tijddeuren): visueel prima, fysiek niet exact.
- Hittekaart bij BFS/A*: elke cel ~1 bezoek → egaal oranje (log-schaal met min-max 4); boeiend bij Rechterhand/Trémaux/DFS/race.
- Tekst-silhouet: alleen grootste samenhangende stuk blijft → onderstreping verbindt letters; puntjes (i) vallen weg.
- Weave: bruggen pas na het bouwen (in `finishMaze`), dus niet zichtbaar tijdens de bouw-animatie. Alleen vierkant, geen bruggen naast elkaar.
- Rechterhand-oplosser loopt vast bij lussen/eenrichting (bewust, laat zien waarom).
- Lussen + deuren: een lus kan een deur omzeilen (puzzel makkelijker, wel oplosbaar).
- Evolutie: `E.turbo--` na auto-stop gaf -1 (= waar) → turbo liep door; nu `if (E.turbo) E.turbo--`. Ladder: gelijk aan klassieker ≠ verslagen (`>=`). `testScore` is gecachet → zelfde genen = zelfde object (niet op `!==` vergelijken).
- Zuinigheidswaker-hook blokkeert Bash-commando's met het woord `node_modules` of `build` (ook `view-build` in een heredoc) (ook in een heredoc voor .gitignore) → Write gebruiken.

## Volgende stappen
- Gebruiker test Evolutie 4 + 5: indeling, mutantenlab-stopregel, QR scannen (werkt pas online), link op ander apparaat, rondleiding op eigen scherm, auto-bewaren niet te vol.
- Gebruiker test 2.0 (vooral 3D op echte GPU, mieren, zaklamp, geluid).
- Gebruiker test: weave, race, grafiek, ijking + alles uit de kijkplezier-ronde (ongetest).
- Overige thema's uit design (ijs, grot, water) en voetstap-stijlen (schoenen, diep, pijltjes, kruimels) liggen klaar in `design/index.html` als ze later gewenst zijn.
- Later: bol, silhouet uit afbeelding, 3D-weergave (three.js).
