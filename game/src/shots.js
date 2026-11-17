// TIDEWATER — deterministic screenshot scenes for ?shot=<name>&seed=N.
// Each scene stages REAL systems (traffic, peds, police, missions), lets the
// simulation run a few seconds, then flags window.__shotReady.

export function setupShot(game, name) {
  const { player, police, missions, traffic, hud } = game;
  game.startGame(true);
  if (name === 'cover') {
    // downtown drive with mission 1 active, traffic + peds around
    player.x = -34; player.z = 17;
    missions.startMission(game.ctx);
    const car = traffic.cars.find(c => !c.parked);
    car.x = -30; car.z = 17; car.heading = Math.PI / 2; car.speed = 9;
    player.enterCar(car);
    player.yaw = -Math.PI / 2;
    hud.notify('MISSION: First Run', 60000);
  } else if (name === 'onfoot') {
    // beachfront on foot among pedestrians, palms + sea, dialogue on screen
    player.x = 20; player.z = 124; player.yaw = 0.35;
    game.peds.peds.slice(0, 6).forEach((p, i) => {
      p.x = 20 + (i - 3) * 3.4; p.z = 118 + (i % 3) * 2; p.state = 'walk';
    });
    hud.showDialogue('Dario Fuentes', 'Mari — the yellow sports car by the Serena Hotel. Bring it home.');
    if (missions.nextIndex === 0) missions.nextIndex = 1;
  } else if (name === 'chase') {
    const car = traffic.cars.find(c => !c.parked);
    car.x = 3; car.z = 17; car.heading = Math.PI / 2; car.speed = 16;
    player.enterCar(car);
    police.setStars(4);
    for (let i = 0; i < 4; i++) police.spawnOne(player.pos);
    police.cars.forEach((c, i) => {
      c.x = player.pos.x - 11 - i * 7; c.z = 17 + (i % 2 ? 3 : -3);
      c.heading = Math.PI / 2; c.speed = 15;
    });
  } else if (name === 'mission') {
    // warehouse gunfight (mission 5) with objective + timer on the HUD
    missions.nextIndex = 4;
    player.x = game.city.landmarks.warehouse.x + 17; player.z = game.city.landmarks.warehouse.z + 25;
    player.yaw = 0.62;
    missions.startMission(game.ctx);
    missions.timer = 90;
    game.combat.gunOut = true;
    hud.notify('MISSION: Cold Trail', 60000);
  }
  // let the world settle, then signal readiness
  setTimeout(() => { window.__shotReady = true; }, 2600);
}
