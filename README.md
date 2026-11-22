# Maze Lab

Web-app die doolhoven genereert en ze daarna zichtbaar zelf oplost. Werkt direct in de browser: open `index.html` (geen installatie of server nodig).

## Standen
- **Bouwen**: kies een raster (vierkant, zeshoek, driehoek, ringen), een silhouet (cirkel, ring, hart, ster, eigen tekst), een maker-algoritme en de complexiteit (kronkel, lussen). Voeg puzzels toe: sleutels en deuren, eenrichtingspassages, teleporters. Kijk hoe een oplosser stap voor stap de weg zoekt.
- **Lab**: 2–4 panelen naast elkaar om oplossers (zelfde doolhof) of makers (zelfde oplosser) te vergelijken, met ranglijst.
- **Kijken**: schermvullende, eindeloze rustige animatie met steeds een nieuwe vorm en kleuren.

## Algoritmes
- Makers: diepte-eerst, groeiende boom, Prim, Kruskal, Wilson, jagen & doden.
- Oplossers: breedte-eerst, A*, gretig, diepte-eerst, rechterhand langs de muur.

## Export
- **JSON (3D)**: het complete doolhof als graaf, elk element met `id`, `type`, `asset`-naam en `level`, bedoeld om later aan 3D-modellen te koppelen.
- **PNG**: afbeelding van het huidige doolhof.

Sneltoetsen: `N` nieuw · `S` oplossen · spatie pauze · `Esc` stopt de kijkstand.
