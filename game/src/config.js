// config.js — world layout, tuning constants and landmark data for TIDEWATER.
// Everything spatial about Port Serena lives here so the other systems agree.

export const STEP = 1 / 60; // fixed simulation step (seconds)

// Street grid. Roads are 16 m wide, centred on these coordinates.
export const ROADS_X = [-270, -180, -90, 0, 90, 180, 270];
export const ROADS_Z = [-270, -180, -90, 0, 90, 180];
export const BEACH_ROAD_Z = 232; // east-west promenade road along the sand
export const ROAD_HALF = 8;
export const LANE = 3.4; // lane offset from a road centreline

// Playable bounds. South of the promenade: sand, then sea (blocked).
export const BOUNDS = { minX: -322, maxX: 322, minZ: -322, maxSandZ: 292 };
export const SEA_Z = 296;

// Named places. x/z are street-level marker points in front of each building.
export const LANDMARKS = {
  safehouse: { x: -225, z: -182, name: "Mari's Safehouse" },
  garage: { x: 135, z: 86, name: "Dario's Garage" },
  hotel: { x: 45, z: 222, name: 'Serena Hotel' },
  casino: { x: 225, z: -2, name: 'Casino Serena' },
  warehouse: { x: 225, z: 178, name: 'Pier 9 Warehouse' },
  hospital: { x: -225, z: -94, name: 'Serena General Hospital' },
  precinct: { x: 45, z: -182, name: 'PSPD Precinct' },
  marina: { x: 282, z: 216, name: 'Port Serena Marina' },
  pier: { x: 282, z: 246, name: 'Marina Pier' },
};

// Where the yellow sports car waits in mission 2 (parked on the promenade).
export const SPORTS_SPOT = { x: 62, z: 228.6, heading: Math.PI / 2 };

// Cash-bag pickup points for mission 3, around the dockside blocks.
export const CASH_BAGS = [
  { x: 252, z: 150 },
  { x: 262, z: 196 },
  { x: 196, z: 118 },
];

// Checkpoint gates for mission 4, run in this order.
export const CHECKPOINTS = [
  { x: 90, z: 180 },
  { x: 270, z: 90 },
  { x: 180, z: -90 },
  { x: 0, z: -180 },
  { x: -180, z: -90 },
  { x: -90, z: 90 },
];

// Population caps (brief performance budget).
export const CAPS = { traffic: 24, parked: 22, peds: 30, police: 6 };

// Wanted / police tuning.
export const WANTED = {
  heatPerStar: 100, // heat points per star
  decayDelay: 6, // seconds unseen before heat starts to bleed off
  decayRate: 9, // heat per second while hidden
  bustedTime: 2.6, // seconds stopped near police to be busted
  spawnDist: 82, // metres from the player where cruisers appear
};

// Player tuning.
export const PLAYER = {
  walkSpeed: 4.3,
  runSpeed: 7.6,
  radius: 0.55,
  startMoney: 120,
  hospitalFeeRate: 0.1,
};

// Car tuning by body type.
export const CAR_TYPES = {
  sedan: { topSpeed: 25, accel: 13, grip: 3.4, len: 4.3, wid: 1.9 },
  hatch: { topSpeed: 22, accel: 12, grip: 3.6, len: 3.8, wid: 1.8 },
  wagon: { topSpeed: 23, accel: 11.5, grip: 3.3, len: 4.6, wid: 1.95 },
  sports: { topSpeed: 34, accel: 19, grip: 4.2, len: 4.2, wid: 1.9 },
  van: { topSpeed: 19, accel: 9, grip: 2.8, len: 5.2, wid: 2.1 },
  police: { topSpeed: 29, accel: 16, grip: 3.8, len: 4.5, wid: 1.95 },
};

export const CAR_COLORS = [
  0xf2f0eb, 0xd94f3d, 0x3d7bd9, 0x53b06a, 0xf2b13d, 0x8a5fc0,
  0x3fc1c9, 0xe77fb0, 0x9aa3ab, 0x2f3542, 0xff7f50, 0x7bc47f,
];

// Pastel building palette for the sun-soaked look.
export const BUILDING_TINTS = [
  0xf6e3c5, 0xf3cfb3, 0xeec9d2, 0xcfe4ee, 0xd8ecd2, 0xf7efd2,
  0xe8d8f0, 0xd2e6e0, 0xf9e0b8, 0xe6ecf5, 0xf5d7c4, 0xdcead8,
];
