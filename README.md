# tidewater

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Xyzar29/tidewater/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Xyzar29/tidewater/reward.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**TIDEWATER** is an original 3D open-world crime game that runs entirely offline in a desktop browser — no build step, no downloads at runtime. three.js is vendored into the repo, every texture is drawn on a canvas at boot, and every sound is synthesized live with WebAudio.

Welcome to **Port Serena**: a coastal city at golden hour, all pastel towers, palm-lined beachfront, a working marina and quiet suburbs. You are **Marisol "Mari" Vega**, a courier who starts taking driving jobs from fixer **Dario Fuentes** — while **Detective Ruth Calloway** of the Port Serena PD makes sure every shortcut has a price. Six story jobs carry you from a timed marina delivery to an armoured-van robbery and a four-star escape to a waiting boat; between jobs the city is yours to free-roam.

## What's in the city

- **A living street grid** — instanced pastel buildings with lit windows, signed landmarks (Serena General Hospital, Casino Serena, the Serena Hotel, Dario's Garage, the PSPD precinct, Pier 9 warehouse, Mari's safehouse), palm trees, streetlights, beach umbrellas, an animated sea and bobbing marina boats
- **Traffic with manners** — lane-following drivers who brake for the car ahead, pause at junctions, turn corners and stop for pedestrians; parked cars along every kerb, all of them stealable
- **Pedestrians** — sidewalk crowds who stroll block to block, cross streets, and scatter when shots are fired or cars mount the pavement
- **A full wanted system (0–5 stars)** — theft, collisions, hit-and-runs, brawls and gunfire all feed one heat meter; cruisers spawn out of sight, pursue with prediction, ram and box you in; sit stopped near them and the BUSTED meter fills — break line of sight and the heat bleeds away
- **Combat** — fists, and a pistol with magazines, reserves and reloads; rival-crew gunmen who strafe and shoot back with visible tracers; WASTED sends you to the hospital with a bill, BUSTED to the precinct with a fine
- **Six missions with dialogue, timers and cash rewards**, plus finders-keepers cash pickups for explorers, and a localStorage save so money and story progress survive a reload

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Mouse (click the game to capture) | Look |
| E | Enter / exit any car |
| F or Click (unarmed) | Melee |
| Q | Draw / holster pistol |
| Click (pistol drawn) | Shoot |
| R | Reload |
| Shift | Run |
| Space (in a car) | Brake |
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
