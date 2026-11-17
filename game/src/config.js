// TIDEWATER — tuning constants and the Port Serena street plan.
// Everything spatial derives from these numbers so the city, the traffic
// graph, the minimap and the missions all agree on where things are.

export const WORLD = {
  pitch: 56,            // distance between neighbouring road centrelines
  roadHalf: 8,          // half the width of a road (roads are 16 m wide)
  blockHalf: 20,        // half the width of a city block between roads
  lines: [-224, -168, -112, -56, 0, 56, 112, 168, 224], // road centrelines
  bound: 272,           // soft world edge for actors
  beachZ: 238,          // sand starts here (south edge of town)
  seaZ: 268,            // water starts here
  seaFar: 460,          // water plane reaches this far south
};

// Fixed story locations, on lots just off the road grid.
export const LANDMARKS = {
  garage:    { x: -196, z: -56,  label: "Dario's Garage" },
  hotel:     { x: -56,  z: 196,  label: 'Serena Hotel' },
  marina:    { x: 196,  z: 232,  label: 'Marina' },
  safehouse: { x: -196, z: -196, label: 'Safehouse' },
  warehouse: { x: 232,  z: 56,   label: 'Warehouse' },
  docks:     { x: 196,  z: 118,  label: 'The Docks' },
  casino:    { x: 56,   z: -196,  label: 'Casino Serena' },
  hospital:  { x: 28,   z: -28,  label: 'Hospital' },
  precinct:  { x: 112,  z: 28,   label: 'PSPD Precinct' },
};

export const TUNE = {
  walkSpeed: 5.2,
  runSpeed: 8.6,
  playerRadius: 0.55,
  carRadius: 2.3,
  trafficCount: 24,
  parkedCount: 13,
  pedCount: 30,
  policeMax: 6,
  interactRange: 4.2,
  pickupCash: 25,
};

export const CAR_TYPES = {
  sedan:    { len: 4.4, wid: 1.9, topSpeed: 30, accel: 11, grip: 3.4 },
  hatch:    { len: 3.9, wid: 1.8, topSpeed: 27, accel: 12, grip: 3.6 },
  sports:   { len: 4.3, wid: 1.9, topSpeed: 42, accel: 19, grip: 4.4 },
  van:      { len: 5.2, wid: 2.1, topSpeed: 23, accel: 8,  grip: 2.8 },
  police:   { len: 4.5, wid: 1.9, topSpeed: 36, accel: 16, grip: 4.0 },
  cashvan:  { len: 5.4, wid: 2.2, topSpeed: 25, accel: 9,  grip: 2.8 },
};

export const CAR_COLORS = [
  0xf2f0eb, 0xd94f3d, 0x3d7bd9, 0x53b06a, 0xf2b13d, 0x9b59c9,
  0x37b8b2, 0xe77fb0, 0x8a8f98, 0x2e3440, 0xff7847, 0x7ec850,
];

export const PASTELS = [
  0xf7e3b0, 0xf9c6a5, 0xf6a8b8, 0xa8d8ea, 0xb8e6c9, 0xfdf6e3,
  0xffd9a0, 0xc3bef0, 0xffe5b4, 0xa0e7e5, 0xffc8dd, 0xd8f3dc,
];

export const DISTRICTS = [
  { name: 'Old Town',   test: (x, z) => z < -140 && x <= 0 },
  { name: 'Casino Row', test: (x, z) => z < -140 && x > 0 },
  { name: 'Downtown',   test: (x, z) => z >= -140 && z < 60 && Math.abs(x) <= 140 },
  { name: 'The Suburbs', test: (x, z) => z < 60 && Math.abs(x) > 140 },
  { name: 'Dockside',   test: (x, z) => z >= 60 && x > 110 },
  { name: 'Beachfront', test: (x, z) => z >= 150 },
  { name: 'Midtown',    test: () => true },
];
