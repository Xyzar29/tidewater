// config.js — every shared constant for TIDEWATER lives here: the shape of
// Port Serena's street grid, tuning for cars / police / combat, the named
// places missions point at, and the palette the city is painted with.

export const PITCH = 56;          // distance between neighbouring street centrelines
export const ROAD_W = 14;         // asphalt width of one street
export const BLOCK = PITCH - ROAD_W; // buildable square inside four streets
export const GRID = 3;            // streets run from -GRID..GRID on both axes
export const CITY_EDGE = GRID * PITCH + ROAD_W / 2; // outer kerb line (~175)
export const BEACH_Z = 196;       // sand starts here, sea beyond 224
export const SEA_Z = 224;

export const STEP = 1 / 60;       // fixed simulation step (seconds)
export const START_MONEY = 120;

// Player tuning
export const WALK_SPEED = 4.2;
export const RUN_SPEED = 7.0;
export const PLAYER_RADIUS = 0.55;
export const PLAYER_MAX_HP = 100;

// Car tuning
export const CAR_RADIUS = 1.7;
export const CAR_ACCEL = 9.5;
export const CAR_BRAKE = 16;
export const CAR_DRAG = 0.55;
export const CAR_MAX_SPEED = 30;      // ~108 km/h forwards
export const CAR_MAX_REVERSE = 9;
export const CAR_STEER = 0.62;        // radians of wheel angle at full lock

// Wanted / police tuning
export const MAX_STARS = 5;
export const POLICE_CAP = 6;
export const POLICE_SPEED = 31;       // cruisers are a touch faster than traffic
export const SIGHT_RANGE = 78;        // beyond this the police lose visual contact
export const LOSE_SIGHT_TIME = 9;     // seconds unseen before a star can decay
export const STAR_DECAY_TIME = 7;     // seconds between star drops while hidden
export const BUST_TIME = 2.6;         // seconds stood near police to be busted

// Combat tuning
export const PISTOL_DAMAGE = 34;
export const PISTOL_MAG = 12;
export const PISTOL_RESERVE_START = 96;
export const ENEMY_HP = 100;
export const ENEMY_DAMAGE = 7;        // per landed enemy bullet
export const MELEE_DAMAGE = 40;
export const MELEE_RANGE = 2.1;

// Named places in Port Serena. x grows east, z grows south; north is -z.
export const LANDMARKS = {
  garage:    { x: -150, z: 8,    name: "Dario's Garage" },
  marina:    { x: 148,  z: 208,  name: 'Port Serena Marina' },
  hotel:     { x: 62,   z: 178,  name: 'Serena Hotel' },
  docks:     { x: 178,  z: -30,  name: 'The Docks' },
  warehouse: { x: 172,  z: -64,  name: 'Pier 9 Warehouse' },
  casino:    { x: 104,  z: -152, name: 'Casino Serena' },
  hospital:  { x: -58,  z: -158, name: 'Serena General Hospital' },
  precinct:  { x: 30,   z: -104, name: 'PSPD Precinct' },
  safehouse: { x: -172, z: 118,  name: "Mari's Safehouse" },
};

// Which district a point falls in — the HUD shows this under the health bar.
export function districtAt(x, z) {
  if (z >= 150) return 'BEACHFRONT';
  if (x >= 138) return 'DOCKSIDE';
  if (x <= -118) return 'SUBURBS';
  if (z <= -108) return 'DOWNTOWN';
  return 'MIDTOWN';
}

// Pastel facade colours the buildings pick from (golden-hour Port Serena).
export const FACADE_COLORS = [
  0xf6d8b1, 0xf3c6c6, 0xcfe4f7, 0xfdf3c9, 0xd8ecd2,
  0xf9e2c0, 0xe6d7f2, 0xcfe8e4, 0xfbe3d3, 0xeef0d5,
];

// Civilian car paint jobs.
export const CAR_COLORS = [
  0xd94f3d, 0x3d7bd9, 0xf2f0e6, 0x555f6e, 0xf5b921,
  0x53b06a, 0x8e6cc9, 0xe77fb1, 0x37b6c9, 0xc0c6ce,
];
