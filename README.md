# tidewater

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Xyzar29/tidewater/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Xyzar29/tidewater/reward.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**TIDEWATER** is an original 3D open-world crime game that plays entirely offline in a desktop browser. There is no build step and nothing is fetched at runtime: three.js is vendored into the repo, every texture is painted on a canvas when the game boots, and every sound — engine, siren, gunfire, the ambient synth loop — is synthesized with WebAudio.

The city is **Port Serena**: pastel towers and palm trees, a beachfront promenade, a working marina, dockside warehouses and quiet suburbs, all under a permanent golden-hour sun. You play **Marisol "Mari" Vega**, a courier who starts running jobs for fixer **Dario Fuentes**. Every job pays. Every shortcut is noticed by **Detective Ruth Calloway** of the Port Serena PD.

## What is in the game

- **A city you can cross on foot or by car** — a full street grid with named districts (Downtown, Beachfront, Dockside, Midtown, Suburbs), signed landmarks (Serena General Hospital, PSPD Precinct, Dario's Garage, Serena Hotel, Casino Serena, Pier 9 Warehouse, the marina), instanced buildings with lit windows, palms, streetlights, beach umbrellas, bobbing boats and an animated sea.
- **Traffic and pedestrians** — drivers who follow lanes, brake for the car ahead, pause at junctions and stop for people crossing; parked cars on every kerb. Every car in the city can be stolen and driven.
- **A wanted system from 0 to 5 stars** — theft, hit-and-runs, brawls and gunfire all build heat. Cruisers spawn out of sight, pursue with prediction, and box you in; sit still next to one and the BUSTED meter fills. Break line of sight and the heat bleeds away.
- **Combat** — fists, plus a pistol with magazines, reserves and reloads. Rival crew gunmen strafe and return fire with visible tracers. WASTED costs you a hospital bill; BUSTED costs you a fine and your freedom, briefly.
- **A six-mission story** — a timed marina delivery, a stolen sports car, cash bags on the docks, a checkpoint run, a warehouse shootout over a briefcase, and an armoured-van robbery ending in a four-star escape to a waiting boat. Dialogue, timers, markers and cash rewards throughout, with free roam (and findable cash pickups) in between.
- **HUD and minimap at all times** — health, district, money, wanted stars, objective with distance and timer, ammo, dialogue, and a live radar with traffic dots, police blips and the mission marker.
- **A save that survives reloads** — money, story progress and position persist in localStorage; Continue on the title screen picks up where you left off.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrow keys | Move / drive |
| Mouse (click the game to capture it) | Look |
| E | Enter / exit any car |
| Shift | Run |
| Space | Brake (in a car) |
| Q | Draw / holster the pistol |
| Click | Shoot (pistol drawn) / melee |
| F | Melee |
| R | Reload |
| P | Pause |
| M | Mute |

## Run it

```sh
node serve.ts
```
then open http://localhost:8080

Two optional URL parameters: `?seed=N` rebuilds the exact same city layout and traffic every time, and `?shot=cover` (also `onfoot`, `chase`, `mission`) stages the deterministic scenes the screenshots in `screenshots/` were captured from.

---

<sub>Entered on [make.fun](https://make.fun/?ref=86zc8pnt&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
