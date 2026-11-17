// config.js — TIDEWATER tuning: the street grid, district map, landmarks and
// the shared mutable run state every system reads and writes.
export const STREETS = [-180, -120, -60, 0, 60, 120, 180]; // road centre lines, both axes
export const ROAD_HALF = 8;          // roads are 16 m wide
export const BLOCK_HALF = 22;        // building plots live within ±22 m of a block centre
export const CITY_EDGE = 204;        // the built city stops here; sand and sea beyond +z
export const BEACH_Z = 210;
export const SEA_Z = 246;

export const CFG = {
  walkSpeed: 5.4, runSpeed: 8.8,
  playerRadius: 0.55, playerHp: 100,
  trafficCount: 24, parkedCount: 22, pedCount: 30,
  bustedRange: 11.5, bustedFill: 0.5, bustedDecay: 0.45,
  seenRange: 80, starHeat: 100,
  pickupValue: 25, startMoney: 120,
};

// Reachable target points (on streets / open ground) next to each landmark.
export const LANDMARKS = {
  garage:    { x: -150, z: -127, name: "Dario's Garage" },
  hotel:     { x: 30,   z: 127,  name: 'Serena Hotel' },
  hotelCar:  { x: 46,   z: 114,  name: 'Hotel forecourt' },
  warehouse: { x: 150,  z: 130,  name: 'Pier 9 Warehouse' },
  casino:    { x: -30,  z: -127, name: 'Casino Serena' },
  vanSpot:   { x: -6,   z: -114, name: 'Casino kerb' },
  hospital:  { x: -127, z: 30,   name: 'Serena General Hospital' },
  precinct:  { x: 97,   z: -60,  name: 'PSPD Precinct' },
  safehouse: { x: -90,  z: 113,  name: 'Safehouse' },
  marina:    { x: 118,  z: 220,  name: 'Port Serena Marina' },
  boat:      { x: 132,  z: 240,  name: 'Escape boat' },
};

export function districtAt(x, z) {
  if (z >= BEACH_Z - 4) return 'MARINA';
  if (x >= 108 && z >= 54) return 'DOCKSIDE';
  if (z >= 114) return 'BEACHFRONT';
  if (Math.abs(x) <= 108 && z <= -54) return 'DOWNTOWN';
  if (x <= -108) return 'SUBURBS';
  return 'MIDTOWN';
}

// Shared run state. S is the one object every system agrees on.
export const S = {
  screen: 'boot',        // title | playing | paused | busted | wasted | complete | ending
  time: 0, seed: 7,
  money: CFG.startMoney, hp: CFG.playerHp,
  wanted: 0, heat: 0, unseen: 0, bustedMeter: 0,
  missionIndex: 0,       // next mission Dario will offer
  inCar: null, drawn: false, muted: false,
  shotMode: null, autopilot: null,
  lastShotCrime: -9,
};
