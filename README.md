# tidewater

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Xyzar29/tidewater/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Xyzar29/tidewater/reward.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**TIDEWATER** is an original 3D open-world crime game that runs entirely offline in a desktop browser. No build step, no downloads at runtime: three.js is vendored in the repo, every texture is painted on a canvas at boot, and every sound — engines, sirens, gunfire, the ambient synth loop — is synthesized live with WebAudio.

Welcome to **Port Serena**, a sun-drenched coastal city of pastel towers, palm-lined promenades, a working marina, dockside warehouses and quiet suburbs, all of it under a permanent golden-hour sun. You are **Marisol "Mari" Vega**, a courier with a talent for driving who starts taking jobs from fixer **Dario Fuentes**. The work pays well. It is also noticed — by **Detective Ruth Calloway** of the Port Serena PD, who has made Mari her personal project.

## What's in the game

- **A whole city, on foot or by car** — a full street grid across five districts (Downtown, Midtown, Beachfront, Dockside, Suburbs) with signed landmarks: Dario's Garage, the Serena Hotel, Pier 9 Warehouse, Casino Serena, Serena General Hospital, the PSPD Precinct and the marina. Buildings are instanced with lit windows; palms, streetlights, beach umbrellas, bobbing boats and an animated sea dress the coast.
- **Living traffic and pedestrians** — drivers hold their lane, brake for the car ahead, pause at junctions and stop for people crossing. Pedestrians stroll the sidewalks and scatter when things get loud. Every car in the city can be stolen and driven.
- **A 0–5 star wanted system** — theft, hit-and-runs, ramming and gunfire all raise heat. Cruisers spawn out of sight, hunt with predicted intercepts and try to box you in; get caught standing next to one and the BUSTED meter fills. Break line of sight long enough and the heat bleeds away, star by star.
- **Combat** — fists, and a pistol with magazines, reserves and reloads. The rival crew in the warehouse job strafes and returns fire with visible tracers. WASTED means a hospital bill; BUSTED means a fine and a trip to the precinct.
- **A six-mission story** — a timed marina delivery, a stolen yellow sports car, cash bags on the docks, a checkpoint run against the clock, a warehouse shootout over a briefcase, and an armoured-van robbery that ends in a four-star escape to a waiting boat. Dialogue, timers, gold markers and cash rewards throughout, plus free roam (and findable cash stashes) in between.
- **HUD and radar at all times** — health, district, money, wanted stars, the current objective with distance and countdown, ammo, dialogue, and a live minimap with traffic dots, flashing police blips and the mission marker.
- **A save that survives reloads** — money, story progress and position persist in localStorage. Continue on the title screen picks up right where you left off.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrow keys | Move / drive |
| Mouse (click the game to capture it, or drag) | Look |
| E | Enter / exit any car |
| Shift | Run |
| Space | Brake (in a car) |
| Q | Draw / holster the pistol |
| Click / F | Shoot (pistol drawn) / melee |
| R | Reload |
| P | Pause |
| M | Mute |

Useful URL parameters: `?seed=N` grows the exact same city and traffic every visit, and `?shot=cover` (also `onfoot`, `chase`, `mission`) stages the deterministic scenes the screenshots in `screenshots/` were captured from.

## Run it

```sh
node serve.ts
```
then open http://localhost:8080

---

<sub>Entered on [make.fun](https://make.fun/?ref=86zc8pnt&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
