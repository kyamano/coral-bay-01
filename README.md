# coral-bay-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kyamano/coral-bay-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kyamano/coral-bay-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Coral Bay** — an original open-world crime game that runs in a desktop browser from static files only: no build step, no network requests, just `game/index.html` and its ES modules.

## The game

Coral Bay is a sun-soaked coastal city of six-by-five blocks — diners, banks, barbers, jewel shops, towers, a park, parking lots — with a palm beach, a promenade and a pier to the east. You arrive with $25 and a contact: **Mara Voss** of the Coral Diner, who is sitting on the Tide Ledger, a book of every debt on the bay.

- **Explore on foot and by car** — WASD/arrows, Shift to run, E/F to get into any parked car (witnessed theft is a crime), H to honk, headlights after dusk.
- **Traffic and citizens** — AI cars hold their lanes, brake, turn at junctions and honk back; 40+ pedestrians stroll, flee gunfire, and occasionally meet a bumper.
- **A five-star wanted system** — witnessed crimes raise heat; CBPD cruisers chase and ram, foot officers shoot from three stars, roadblocks appear at four. Break line of sight to cool down, or get cornered and fill the arrest meter: BUSTED. Health zero is WASTED. Both cost you cash and a trip to the safehouse.
- **Combat and cash** — mouse-aimed pistol with tracers, reloads and damage for people, officers and cars. Wrecked cruisers, downed officers and finished jobs drop glowing $25 pickups.
- **A six-mission story, "The Tide Ledger"** — first theft, a ledger pickup, a 95-second delivery, stopping the fixer's fleeing car, escaping a police sweep, and a five-star finale run to the harbourmaster at the pier. Plus the repeatable **Beach Sprint**: four checkpoint rings on the promenade in 62 seconds.
- **A full HUD** — health, cash, wanted stars, a game clock that turns dawn gold, noon glare, sunset coral and night blue over the city, objectives with timers, and a live minimap (traffic, flashing police, cash, objective ring) with a legend.
- **Start, pause, save** — title screen with New Game / Continue, pause menu, busted/wasted screens, and a localStorage save (money, mission progress, position, health, clock).
- **Synthesised sound** — engine, sirens, gunfire, crashes, horns and pickups are all WebAudio; no audio files. M mutes.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

Any static file server pointed at `game/` works just as well.

## Layout

- `main.ts` — the entry program: copies `game/` and `screenshots/` to the output and writes the dossier with `vendor/makefun-game.ts`.
- `game/src/` — the game itself, one job per file: `config` (tuning), `random` (seeded RNG), `input`, `audio` (WebAudio synth), `city` (the seeded city), `vehicles` (driving + traffic), `pedestrians`, `police` (wanted system), `combat` (shooting + pickups), `missions` (the Tide Ledger + Beach Sprint), `render` (world + lighting), `hud` (HUD, minimap, screens), `shots` (deterministic screenshot scenes), `main` (state + loop).
- `tools/take-screenshots.mjs` — serves the game, stages the four `?shot=` scenes in headless Chromium, and writes `screenshots/`.
- `screenshots/` — four real renders of the game: a 3-star downtown chase (cover), the city on foot, Mara's first dialogue, and a 5-star sunset chase at a roadblock.

Everything — city, characters, vehicles, names, story, art and sound — is original to this entry.

---

<sub>Entered on [make.fun](https://make.fun/?ref=kyamano&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
