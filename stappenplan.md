# Stappenplan naar v3 — 3 chats tegelijk (opgesteld 2026-11-24, na v2.2.0)

## Spelregels (gelden voor alle chats)
- Zelfde map, géén branches. Elke chat raakt **alleen zijn eigen bestanden** (tabel hieronder). Iets nodig in andermans bestand → onderaan dit bestand bij "Verzoeken" zetten, niet zelf aanpassen.
- Committen: alleen eigen bestanden (`git add <paden>`, nooit `-A`), als Claude. Niet taggen/pushen; dat doet de laatste chat per fase (release-skill).
- Na elke stap: `node --check` + rooktest (`tests/`, zodra C die heeft). Klaar → vinkje hieronder.
- Wiki niet aanpassen; leerpunten onder "Leerpunten" hieronder (worden bij release in de wiki gezet).

## Bezit per chat
| Chat | Eigen bestanden |
|---|---|
| A · Modulair + opruimen | `src/evoui.js` → `src/evo/*.js`, `index.html` |
| B · Snelheid rekenen | `src/evo.js` (engine, Pool, testbaan) |
| C · Tests + app.js | `tests/` (nieuw), `src/app.js` → `src/app/*.js`, `prullenbak/` meetscripts |

## Fase 1 (parallel)
### A · evoui.js opsplitsen
- [x] A1 (4f365a2) `src/evo/`: state, view (panelen/frame/stepView), draw, evolve, algos, share (+ tour), ana (eregalerij/stamboom/rapport), task (taak-algemeen), tasks/{bench,duel,mut,hunt,why}, main (init/enter/key/onClick/setPage; laadt als laatste). Elk bestand eigen IIFE; `U = ML.EvoUI._`: namen uit state.js direct destructuren, uit andere modules via `let` + `U.link(...)` (main roept alle links aan na laden). Export per module = `Object.assign(U, {...})`. `A` is nu vaste `const A = {}` (init: `Object.assign`). Oude evoui.js → `prullenbak/evoui-v2.2.js`.
- [x] A2 (48867f9) `U.ACTIONS[naam](c)`, elke module meldt eigen acties aan (`Object.assign(U.ACTIONS, {...})` onderaan); `task-<soort>` → `'task-*'`; c = { e, b, act, id, a, mine, algos }.
- [x] A3 (7bf4419) `mutSure` weg → `sureOf(as, bs, scale)` (mutantenlab scale 1; 'maybe' bij n<3 meldt "nog te weinig doolhoven"); `mutMake` via `Ev.clamp(v,i,src)` (zelfde uitkomst); mutantenlab-uitslag toont `scoreBox` van de winnaar t.o.v. origineel (testbaan).
- [x] A4 (7bf4419) Weg: `E.autoN`, `view.name`, `sign`-alias. `evoSame` staat alleen in app/settings.js → verzoek aan C. Rooktest (`tests/run.sh` + eigen vergelijking met v2.2.0): deterministische teksten gelijk, geen JS-fouten.
### B · Turbo en testbaan sneller (uitkomsten bit-gelijk, tenzij ENGINE_V omhoog)
- [x] B1 (4528e15) Anders opgelost: meerdere generaties per worker-ronde loont niet (selectie heeft álle fitness nodig → 1 worker doet dan alles, 8× trager). Echte rem was de testbaan: elke generatie opnieuw in de workers, ook als die al in de cache stond → nu overgeslagen. Plus werk in W gelijke stukken (was `floor(W/M)` per doolhof → bij 6 doolhoven maar 6 van 8 workers bezig). Gens/s (pop 40, 8 kernen, meetpagina zonder UI): Nieuw-4 89 → 119–142, Vast-1 172 → 605–750, Vast-4 110 → 182–192. Uitkomsten bit-gelijk (`tests/same.js`, `tests/workers.js`).
- [x] B2 Gemeten: 7 workers in 3 van 4 standen trager dan 8 → `workers = kernen` blijft.
- [x] B3 (4528e15) `Ev.testScoreAsync(genes)` / `Ev.heavyScoreAsync(genes)` → Promise, zelfde uitkomst als `testScore`/`heavyScore` (zelfde cache). Zware doolhoven worden per worker lui gebouwd (doolhof i → worker i % W). Hoofddraad blokkeert max ~11 ms, klaar in ~0,4 s. Inbouwen = verzoek aan A.
- [ ] B4 Deels (4528e15): `Walker`-alias weg (export = `ENG.Walker`, zelfde klasse), `evaluateSpecs` kan doolhof-zoeker-specs `{ sp, i, asp }` → `Pool.evaluate` alleen nog zonder bouwen-in-workers. Wacht op A: `get st()` (gebruikt in evoui) en hunt via `evaluateSpecs` — zie Verzoeken.
### C · Vaste tests + app.js opsplitsen
- [x] C1 (024ad87) **Gebruik: `tests/run.sh` (snel, ~1 min) of `tests/run.sh alles` (~6 min, vóór release).** Los: `node tests/same.js` (ref = v2.2.0; na bewust ENGINE_V omhoog: `--update`), `node tests/turbo.js [sec] [pop] [grootte]`, `node tests/smoke.js --shots` (plaatjes in tests/out). `tests/`: `smoke.js` (alle standen uit 2.0 + Evolutie-pagina's/taken, fouten = exit 1), `same.js` (vingerafdruk testscores klassiekers + 3 vaste genomen), `workers.js` (worker == hoofddraad), `turbo.js` (gens/s). `tests/run.sh` draait alles; Playwright uit `tools/22_Dreamtop`. Scripts via Write (zuinigheidswaker!).
- [ ] C2 Release-check: `tests/run.sh` aanroepen vanuit de release-skill (verzoek aan gebruiker/00_rules).
- [x] C3 (c50befa) Gesplitst in `src/app/{settings,runner,lab,daily,watch,main}.js`, gedeelde ruimte `ML.App` (eerder geladen = destructuren, later geladen = `A.naam()`). Getest via kopie index.html (rooktest + Vandaag/toetsen ok). **Wacht op A (script-tags)**; daarna verhuist C `src/app.js` naar prullenbak. Oorspronkelijk: `app.js` (56 KB) splitsen: `app/settings.js` (S, standaarden, migraties op één plek), `app/lab.js` (Lab/race/zwerm), `app/watch.js` (Kijken), `app/daily.js`, `app/main.js`. Script-tags = verzoek aan A (index.html).
- [x] C4 (d983f2a) `ML.STORE_KEYS` (alle 8 sleutels + eigenaar-bestand) en `MIGRATIONS`-tabel in `app/settings.js`; ENGINE_V-stempel blijft `Ev.stampHist` (evo.js), staat in het overzicht. Opslag-sleutels + migraties centraal (`styleV`, `evoV`, `ENGINE_V`-stempel) in `app/settings.js`.

## Fase 2 (parallel, na fase 1 + release v2.3.0)
- A · Visueel Evolutie: eerst `design/index.html` met 4–6 richtingen (maquette-kaarten, karton-grafiek met mijlpalen, soort-dieren, record-moment), gebruiker kiest; daarna bouwen + mobiele layout (tabs onderaan, 1 paneel).
- B · Tekenen sneller: `render2d.js` vaste lagen cachen bij 6 panelen, lopers op aparte laag; `Math.exp`-tabel in loper (ENGINE_V 4, testscores opnieuw stempelen).
- C · DNA-paspoort (nieuw bestand `src/evo/passport.js`, inhaken via verzoek aan A) + data-lake-oogst voorstellen (loper-engine, worker-pool uit Blob, scorevak met zekerheid).

## Verzoeken (andermans bestand)
- C3 → A (index.html): `<script src="src/app.js"></script>` vervangen door, in deze volgorde: `src/app/settings.js`, `runner.js`, `lab.js`, `daily.js`, `watch.js`, `main.js` (alle zes na evoui-scripts, net als nu app.js). Daarna `tests/run.sh` en even melden hier; C verhuist dan src/app.js.
- C2 → gebruiker/00_rules: release-skill laten kijken of een project `tests/run.sh` heeft en dan `tests/run.sh alles` draaien vóór commit/tag (stoppen bij exit ≠ 0).
- ✓ C3 → A gedaan (a085c0b): script-tags `src/app/*` in index.html, `tests/run.sh` ALLES OK. C mag `src/app.js` verhuizen.
- ✓ B3 → A deels gedaan (a085c0b): `record()` → `heavyScoreAsync` + `champCard()`. **Niet** het opwarmen in `enter`: `heavyReady()` kijkt naar `heavySet` op de hoofddraad; async (workers) vult die nooit → zware scores verdwijnen overal uit de UI (ladder trap 2, kaarten, ranglijst). B: als `heavyReady` ook "alle zware scores van de klassiekers in `heavyCache`" accepteert, kan het opwarmen async → verzoek terug aan A. `testScoreAsync` in lijsten nog niet (testscores staan vrijwel altijd al in de cache).
- ✓ B4 → A gedaan (a085c0b): spoor via `w.stk`/`w.sl` (draw.js); zoeker-turbo via `evaluateSpecs` met `{ sp, i, asp: HUNT_ASP }` (getest: Maximaal + zoeker-set, geen fouten). B mag `get st()` weg.
- A4 → C (app/settings.js): `evoSame` in de standaard-instellingen is dood (alleen nog gelezen in de migratie `evoV < 2`); standaard weghalen, migratie laten staan.
- B3 → A: kampioen-scores niet meer synchroon. In `record()`: `heavy: Ev.heavyReady() ? Ev.heavyScore(...)` → `Ev.heavyScoreAsync(best.genes).then(h => { if (E.champ && E.champ.id === best.id) { E.champ.heavy = h.score; champCard(); } })`; idem opwarmen (`EV().heavyScore(EV().PRESETS[0].genes)` in enter) → `heavyScoreAsync`. Waar een testscore nog niet in de cache staat en niet meteen nodig is (lijsten, stamboom, mutantenlab): `testScoreAsync` + later hertekenen.
- B4 → A: (1) trail tekenen: `for (const st of w.st)` → `const S = w.stk; for (let q = 0; q < w.sl; q++) { const st = S[q]; …` (daarna haal ik `get st()` weg). (2) turbo bij doolhof-zoeker: `mm() !== 'hunt' && P.evaluateSpecs(E.pop, specsFor(g0), …)` → altijd `evaluateSpecs`, met voor hunt `specs = huntSet().map((sp, i) => ({ sp, i, asp: HUNT_ASP }))` (i = volgorde, zelfde zaadjes als `huntMazes`).

## Leerpunten
- (C) Tests: `tests/run.sh` (snel) na elke stap; `MAZE_URL=file://…/kopie.html node tests/smoke.js` test een kopie van index.html (met `<base href>` naar de projectmap) → script-tags uitproberen zonder index.html aan te raken.
- (C) Losse IIFE-bestanden met gedeelde closure-variabelen: `let`-variabelen die opnieuw toegewezen worden kun je niet destructuren → vaste array + `length = 0` (panes) of een functie (`dailyRunner()`).
- (B) Turbo meten zonder UI: meetpagina die alleen rng/model/generators/puzzle/swarm/evo laadt en de turbolus nabootst (evaluateSpecs → nextGenIslands); hoofddraad ~0,5–1 ms per generatie, rest = wachten op workers. Meetruis ±15% per run.
- (B) Fitness uit workers was niet bit-gelijk bij >1 doolhof (optellen in aankomstvolgorde) → workers sturen losse scores (`evalRaw`), hoofddraad telt op in vaste volgorde.
- (A) src/evo: nieuwe functie → in de `Object.assign(U, {...})`-regel van zijn bestand zetten; import-regels bovenaan zijn afgeleid (gebruikte namen uit andere modules). Vergeten import = "x is not defined" pas bij aanroep → na elke verplaatsing rooktest. main.js moet ook zijn eigen namen in U zetten vóór `U.links.forEach`.
- (A) Rooktest-valkuil: klik op een al geselecteerde kaart (`data-ev="sel"`) deselecteert → eerst kijken of `.sel` er al op zit. Knop in dichte `<details>` (bv. `#evo-mm`) → klikken via `el.click()` in evaluate.
- (B) Nieuwe functie die de worker via `E.xxx` aanroept → ook in de `ML.Evo`-export zetten (in de worker is `E = ML.Evo`); anders `onerror` → stil terugvallen op de hoofddraad (`Pool.broken`).
