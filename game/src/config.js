// TIDEWATER — central tuning constants for Port Serena.
// Every gameplay number lives here so the rest of the code stays declarative.

export const CITY = {
  blockSize: 34,          // metres per city block (road + plots)
  roadWidth: 12,
  gridX: 7,               // blocks east-west
  gridZ: 6,               // blocks north-south (south edge is the beach)
  beachZ: 118,            // z beyond this is sand / sea
  seaZ: 150,
};

export const PLAYER = {
  walkSpeed: 7.5,
  runSpeed: 11,
  radius: 0.55,
  maxHealth: 100,
  startMoney: 120,
  startPos: { x: -40, z: 20 },
};

export const CAR = {
  accel: 26,
  brake: 34,
  maxSpeed: 34,
  maxReverse: 10,
  turnRate: 1.9,
  grip: 8,
};

export const WANTED = {
  decaySeconds: 26,       // unseen time needed to drop one star
  bustedFillRate: 0.55,   // per second while stopped near police
  bustedDrainRate: 0.8,
  policeByStars: [0, 2, 3, 4, 5, 6],
};

export const PRICES = {
  hospitalFee: 150,
  bustedFine: 200,
};

export const MISSION_REWARDS = [400, 650, 800, 900, 1100, 2000];

export const WORLD = {
  trafficCap: 22,
  pedCap: 28,
  dayColor: 0xffe3b3,
};
