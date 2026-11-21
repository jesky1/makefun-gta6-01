# Caldera Heat

An open-world crime game for the browser, built for the make.fun `gta6-01` bounty.
Caldera Bay is a hot, broke, wide-open island city: six jobs stand between you
and running the place.

## Play

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

Then open the page. WASD / arrow keys move, `E` gets in or out of a car,
`Space` starts / confirms. No build step and no dependencies: the game is
plain Canvas 2D JavaScript and runs fully offline.

## What is in the game

- A 2600x2000 island city with a road grid, low-poly style extruded buildings,
  traffic AI and pedestrians.
- On-foot and driving play with carjacking: moving traffic fights back with
  heat, parked cars are safe.
- Five vehicle types (sedan, taxi, sports, truck, police) with damage and
  burning wrecks that drain health.
- A 0-5 star wanted system: heat from carjacks, hits and missions; police
  spawn, pursue and ram; a bust meter when pinned (respawn at the police
  station, fined) and wasted handling (respawn at the hospital, fined).
- Six chained story missions: First Wheels, Package Run, Taxi Shift,
  Heat Escape, Stash Grab and Caldera King.
- Side systems that keep paying in free roam: taxi fares with tips, cash
  stashes, and spray shops that clear wanted level and repair the car.
- HUD with cash, stars, health and vehicle damage, a live minimap, and
  title / pause / busted / wasted / win screens.

## Tests

```sh
node test/smoke.mjs      # 23 checks: city, vehicles, carjack heat, stars,
                         # police, spray, busted, wasted, stash, determinism
node test/story.mjs      # full story playthrough by the built-in autopilot,
                         # run twice: 7,864 ticks, $2,141, identical both runs
node main.ts             # builds the entry dossier (see MAKEFUN_OUTPUT_DIR)
```

The story test is deterministic: the autopilot navigates the road grid and
completes all six missions with the same tick count and money on every run.
