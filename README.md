# tidewater

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Xyzar29/tidewater/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Xyzar29/tidewater/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**TIDEWATER** is an original 3D open-world crime game set in **Port Serena**, a sun-soaked coastal city of pastel towers, palm-lined beachfront, a marina and quiet suburbs — rendered at golden hour, playable entirely offline in a desktop browser. No build step, no network requests at runtime: three.js is vendored, textures are drawn on canvas at boot, and every sound is synthesized with WebAudio.

You are **Marisol "Mari" Vega**, a courier turned getaway driver. Fixer **Dario Fuentes** feeds you jobs; **Detective Ruth Calloway** of the Port Serena PD feeds you stars. Work the six-mission story — a timed marina run, a stolen yellow sports car, a dockside cash pickup under heat, a six-checkpoint harbor sprint, a warehouse gunfight against a rival crew, and an armoured cash-van robbery ending in a four-star escape to a waiting boat — or ignore Dario entirely and free-roam: steal cars, chase stunt cash, and see how long you can stay ahead of the PSPD.

## Systems

- **Living city** — instanced pastel buildings with lit windows, palm trees, an animated sea, marina boats, streetlights and signed landmarks (Hospital, Casino Serena, Serena Hotel, Dario's Garage, PSPD precinct, Pier 9 warehouse), plus named districts announced as you cross the city
- **Traffic AI** — lane-following cars on the road graph that brake for vehicles ahead, pause at junctions and stop for pedestrians, plus parked cars along every kerb
- **Pedestrians** — sidewalk crowds who stroll, cross streets, and flee from danger, gunfire and fast cars
- **Driving & on-foot play** — arcade car physics with building/car collision, a smoothed chase camera, pointer-lock mouse look, and any car stealable with E
- **Wanted system (0–5 stars)** — theft, crashes, hit-and-runs, melee and gunfire all feed one heat meter; patrol cars spawn at the edge of view, pursue and ram; a BUSTED meter fills while you're stopped near them; break line of sight to bleed heat away star by star
- **Combat** — melee, a drawable pistol with magazine/reserve ammo and reloads, tracer fire both ways, rival-crew gunmen who strafe and shoot back, WASTED respawn at the hospital for a fee, BUSTED respawn at the precinct for a fine
- **Story & economy** — 6 missions with intro dialogue, staged objectives, timers and cash rewards; money persists, and found-cash pickups reward exploring
- **HUD & minimap** — health, money, wanted stars, objective + countdown, notifications, dialogue box, BUSTED meter, and a live canvas minimap with police blips, traffic and the mission marker
- **Audio** — fully synthesized: engine hum tied to speed, two-tone sirens, gunshots, punches, pickups, success stings and a warm ambient arpeggio loop (M to mute)
- **Saves** — localStorage continue: money, mission progress and position survive a reload

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse (click game to capture) | Look |
| E | Enter / exit car |
| F or Click | Melee |
| Q | Draw / holster pistol · Click to shoot · R reload |
| Shift | Run |
| Space (in car) | Brake |
| P | Pause |
| M | Mute |

## Run it

```sh
node serve.ts
```
then open http://localhost:8080

Add `?seed=N` for a reproducible city, or `?shot=cover&seed=1` (also `onfoot`, `chase`, `mission`) for the staged screenshot scenes used to make the images in `screenshots/`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=86zc8pnt&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
