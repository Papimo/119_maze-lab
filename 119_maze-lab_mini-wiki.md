# 119_maze-lab mini-wiki

## Doel
- Web-app: doolhof genereren + zichtbaar laten oplossen. Gekozen richtingen: 1 algoritme-lab, 3 vormen, 4 kijkstand, 5 puzzels. (2 race-tegen-computer niet gekozen.)
- Nu 2D; model is voorbereid op 3D (asset-namen per element).

## Stack
- Vanilla JS, canvas 2D, geen build. `index.html` + losse `<script src>` (werkt via file://, geen modules). Alles hangt aan `window.ML`.

## Waar staat wat
- Rasters/silhouetten/graaf/JSON-export → `src/model.js` (`ML.TOPO.*`, `applyMask`, `largestComponent`, `buildMaze`, `toJSON`, `ML.ASSETS`)
- Makers → `src/generators.js` (`ML.GENERATORS`, generator-functies met events)
- Lussen, start/doel, sleutels/deuren/eenrichting/teleporters, zoekprobleem → `src/puzzle.js` (`braid`, `placeEnds`, `placePuzzle`, `makeProblem`, `solvePath`)
- Oplossers → `src/solvers.js` (`ML.SOLVERS`)
- Tekenen + paletten → `src/render2d.js` (`ML.Render2D.draw`, `ML.PALETTES`)
- UI, standen, lus → `src/app.js` (`Runner`, `makeLab`, `watchNext/watchFrame`, `S` = instellingen in localStorage `mazelab.settings`)

## Status
- v0.1 (2026-11-22): Bouwen / Lab / Kijken werkend, ongetest door gebruiker.

## Beslissingen
- Graaf i.p.v. raster: cellen = polygonen, buren uit gedeelde randen → elk raster (vierkant/zeshoek/driehoek/ringen) en elk silhouet werkt met dezelfde makers/oplossers.
- 3D-koppeling: elk element heeft `id`, `type`, `asset` (bv. `wall.inner`, `door.red`, `teleporter.0`, `marker.start`) + `level`. JSON-export: `format: maze-lab/1`, assen 2D x/y → 3D x/z.
- Puzzel-toestand = cel × sleutelmasker; alle oplossers via `makeProblem.succ`.
- Zelfde zaadje + maker = zelfde doolhof (lab vergelijkt zo eerlijk).
- Stijl nog niet gekozen; 3 voorlopige paletten.

## Valkuilen
- Tekst-silhouet: alleen grootste samenhangende stuk blijft → onderstreping verbindt letters; puntjes (i) vallen weg.
- Rechterhand-oplosser loopt vast bij lussen/eenrichting (bewust, laat zien waarom).
- Lussen + deuren: een lus kan een deur omzeilen (puzzel makkelijker, wel oplosbaar).
- Zuinigheidswaker-hook blokkeert Bash-commando's met het woord `node_modules` (ook in een heredoc voor .gitignore) → Write gebruiken.

## Volgende stappen
- Gebruiker test; brainstorm verder.
- Stijlkeuze via `design/index.html`.
- Later: 3D-weergave (three.js) naast Render2D, zelfde model/JSON.
