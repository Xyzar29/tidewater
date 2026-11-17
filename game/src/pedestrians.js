// TIDEWATER — pedestrians: sidewalk strolling, street crossing, fleeing.

import { CITY, WORLD } from './config.js';
import { roadX, roadZ, collide } from './city.js';

const SHIRTS = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0xf78c6b, 0xffffff, 0x9b5de5];

export function createPersonMesh(shirt, pants) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.3), new THREE.MeshLambertMaterial({ color: shirt }));
  body.position.y = 1.05; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), new THREE.MeshLambertMaterial({ color: 0xe8b98a }));
  head.position.y = 1.62; g.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), new THREE.MeshLambertMaterial({ color: pants || 0x2b3a4a }));
  legs.position.y = 0.36; legs.name = 'legs'; g.add(legs);
  return g;
}

export class PedSystem {
  constructor(scene, rng, colliders) {
    this.peds = []; this.colliders = colliders; this.rng = rng;
    for (let i = 0; i < WORLD.pedCap; i++) {
      const horiz = rng.chance(0.5);
      const lane = rng.int(0, (horiz ? CITY.gridZ : CITY.gridX) - 1);
      const side = rng.chance(0.5) ? 8.2 : -8.2;
      const along = rng.range(-115, 115);
      const p = {
        x: horiz ? along : roadX(lane) + side,
        z: horiz ? roadZ(lane) + side : along,
        heading: rng.range(0, Math.PI * 2), speed: 0, state: 'walk',
        horiz, lane, side, dir: rng.chance(0.5) ? 1 : -1,
        health: 100, dead: false, fleeT: 0, phase: rng.range(0, 6),
        mesh: createPersonMesh(rng.pick(SHIRTS)),
      };
      scene.add(p.mesh); this.peds.push(p);
    }
  }
  spawnAt(x, z, shirt) {
    const p = { x, z, heading: 0, speed: 0, state: 'stand', horiz: true, lane: 0, side: 8, dir: 1, health: 100, dead: false, fleeT: 0, phase: 0, mesh: createPersonMesh(shirt || 0xef476f, 0x22303c), isHero: true };
    this.meshSync(p); return p;
  }
  meshSync(p) { if (p.mesh) { p.mesh.position.set(p.x, 0, p.z); p.mesh.rotation.y = p.heading; } }
  scare(x, z, radius) {
    for (const p of this.peds) {
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz < radius * radius) { p.state = 'flee'; p.fleeT = 2.5; p.heading = Math.atan2(dx, dz); }
    }
  }
  update(dt, dangerPos, t) {
    for (const p of this.peds) {
      if (p.dead) { p.mesh.rotation.x = Math.PI / 2; p.mesh.position.y = 0.2; continue; }
      let speed = 1.6;
      if (p.state === 'flee') {
        p.fleeT -= dt; speed = 5.2;
        if (p.fleeT <= 0) p.state = 'walk';
        p.x += Math.sin(p.heading) * speed * dt; p.z += Math.cos(p.heading) * speed * dt;
      } else {
        // stroll along sidewalk, occasionally cross the street
        if (p.horiz) { p.x += p.dir * speed * dt; p.heading = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2; if (Math.abs(p.x) > 118) p.dir *= -1; }
        else { p.z += p.dir * speed * dt; p.heading = p.dir > 0 ? 0 : Math.PI; if (Math.abs(p.z) > 112) p.dir *= -1; }
        if (this.rng.chance(0.0015)) { p.horiz = !p.horiz; }
        if (dangerPos) {
          const dx = p.x - dangerPos.x, dz = p.z - dangerPos.z;
          if (dx * dx + dz * dz < 30 && dangerPos.fast) { p.state = 'flee'; p.fleeT = 1.6; p.heading = Math.atan2(dx, dz); }
        }
      }
      const pos = { x: p.x, z: p.z }; collide(pos, 0.4, this.colliders); p.x = pos.x; p.z = pos.z;
      p.x = Math.max(-125, Math.min(125, p.x)); p.z = Math.max(-125, Math.min(128, p.z));
      const legs = p.mesh.getObjectByName('legs');
      if (legs) legs.rotation.x = Math.sin(t * 9 + p.phase) * 0.4;
      this.meshSync(p);
    }
  }
}
