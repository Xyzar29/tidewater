# tidewater
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Xyzar29/tidewater/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Xyzar29/tidewater/reward.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**TIDEWATER** is an original 3D open-world crime game set in **Port Serena**, a sun-soaked coastal city of pastel towers, palm-lined beachfront, a marina and quiet suburbs — rendered at golden hour, entirely offline in the browser.

You are **Marisol "Mari" Vega**, a courier turned getaway driver. Fixer **Dario Fuentes** feeds you jobs; **Detective Ruth Calloway** of the Port Serena PD feeds you stars. Work the six-mission story — a timed marina run, a stolen yellow sports car, a dockside cash pickup under heat, a six-checkpoint harbor sprint, a warehouse gunfight against a rival crew, and an armoured cash-van robbery ending in a four-star escape to a waiting boat — or ignore Dario entirely and free-roam.

## Systems

- **Living city** — instanced pastel buildings with lit windows, palm trees, animated sea, marina boats, streetlights and district signs (Marina, Warehouse, Casino, Hospital, Serena Hotel, Dario's Garage, Safehouse)
- **Traffic AI** — lane-following cars that brake for vehicles ahead and pause at the player, plus parked cars you can steal
- **Pedestrians** — sidewalk crowds who cross streets and flee from danger and fast cars
- **Driving & on-foot play** — arcade car physics, smoothed chase camera, pointer-lock mouse look
- **Wanted system (0–5 stars)** — theft, assault, gunfire and reckless hits raise heat; police spawn at the edges, pursue and ram; a BUSTED meter fills while you're stopped near them; stay unseen to decay stars and escape
- **Combat** — melee, a drawable pistol with ammo and reload, rival-crew gunmen who shoot back, WASTED respawn at the hospital for a fee
- **Story & economy** — 6 missions with dialogue, objectives, timers and cash rewards; money persists
- **HUD & minimap** — health, money, wanted stars, objective + timer, notifications, dialogue box, and a live canvas minimap with police blips and mission markers
- **Audio** — fully synthesized WebAudio: engine hum tied to speed, sirens, gunshots, punches, pickups, success stings and a warm ambient loop (M to mute)
- **Saves** — localStorage continue: money, mission progress and position survive a reload

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse (click game to capture) | Look |
| E | Enter / exit car |
| F or Click | Melee |
| Q / Right-click | Draw pistol · Click to shoot · R reload |
| Shift | Run |
| Esc / P | Pause |
| M | Mute |

## Run it

```
node serve.ts
```

Then open http://localhost:8080 — no build step, no network requests at runtime (three.js is vendored, textures are canvas-generated, audio is synthesized). Add `?seed=N` for a reproducible city, or `?shot=cover&seed=1` for the staged screenshot scenes.

---
<sub>Entered on [make.fun](https://make.fun/?ref=86zc8pnt&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
