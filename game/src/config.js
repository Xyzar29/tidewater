// config.js — the tuning sheet for Port Serena.
//
// Everything that more than one system needs to agree on lives here: the
// street grid, the landmarks the story visits, how fast heat builds, and the
// caps that keep the frame rate honest. Numbers are in metres and seconds.

// --- the street grid -------------------------------------------------------
// Roads sit on a regular lattice. Avenues run north-south (constant x),
// streets run east-west (constant z). Between them sit square city blocks.
export const PITCH = 84;            // distance between neighbouring roads
export const ROAD_W = 18;           // asphalt width
export const BLOCK = PITCH - ROAD_W; // buildable square inside one cell
export const AVENUES = [-252, -168, -84, 0, 84, 168, 252];
export const STREETS = [-252, -168, -84, 0, 84, 168, 252];
export const BEACH_ROAD_X = 306;    // the coast road, east of the last avenue
export const SAND_X = 292;          // sand starts here…
export const WATER_X = 348;         // …and the sea starts here
export const CITY_MIN = -300;
export const CITY_MAX = 300;

// Block centres (the buildable squares between roads).
export const BLOCK_CENTRES = [];
for (let i = -3; i <= 2; i++) BLOCK_CENTRES.push(i * PITCH + PITCH / 2);

// --- places the story cares about ------------------------------------------
// x/z are world positions on the block the landmark building sits on.
export const LANDMARKS = {
  hospital:  { name: 'Serena General Hospital', x: -210, z: -210, sign: 'HOSPITAL' },
  casino:    { name: 'Casino Serena',           x: 210,  z: -210, sign: 'CASINO SERENA' },
  hotel:     { name: 'Serena Hotel',            x: 210,  z: -42,  sign: 'SERENA HOTEL' },
  garage:    { name: "Dario's Garage",          x: 42,   z: 210,  sign: "DARIO'S GARAGE" },
  precinct:  { name: 'PSPD Precinct',           x: -42,  z: -42,  sign: 'PSPD' },
  warehouse: { name: 'Pier 9 Warehouse',        x: 210,  z: 210,  sign: 'PIER 9' },
  safehouse: { name: "Mari's Safehouse",        x: -210, z: 126,  sign: 'SAFEHOUSE' },
  marina:    { name: 'Port Serena Marina',      x: 330,  z: 286,  sign: 'MARINA' },
};

// Where Mari starts the game, on foot, near Dario's first marker.
export const SPAWN = { x: 20, z: 168, heading: 0 };
// The gold story marker in free roam (Dario waits by his garage).
export const STORY_MARKER = { x: 42, z: 176 };
// The yellow sports car from "Hot Wheels", parked by the Serena Hotel.
export const SPORTS_CAR_SPOT = { x: 261, z: -30, heading: Math.PI / 2 };
// The getaway boat that ends "Last Tide".
export const BOAT_SPOT = { x: 352, z: 286 };

// --- people and traffic caps ------------------------------------------------
export const MAX_TRAFFIC = 24;
export const MAX_PARKED = 34;
export const MAX_PEDS = 30;
export const MAX_POLICE = 6;

// --- wanted tuning ----------------------------------------------------------
// Heat is a 0..500 meter; every 100 points is one star.
export const HEAT_PER_STAR = 100;
export const MAX_STARS = 5;
export const HEAT_DECAY_PER_SEC = 9;      // while unseen
export const HEAT_DECAY_DELAY = 4;        // seconds unseen before decay starts
export const BUST_TIME = 2.6;             // seconds stopped near police to fill the meter

// Crime price list, in heat points.
export const CRIMES = {
  stealCar: 55,        // police.js rounds a witnessed fresh theft up to a full star
  hitCar: 12,
  hitPed: 45,
  melee: 30,
  gunshot: 35,
  shotHit: 25,
  missionTheft: 100,   // scripted: exactly one star
  missionTwoStar: 200,
  missionFourStar: 400,
};

// --- player / economy -------------------------------------------------------
export const PLAYER_HP = 100;
export const WALK_SPEED = 3.4;
export const RUN_SPEED = 6.4;
export const HOSPITAL_FEE = 200;
export const START_MONEY = 120;
export const PISTOL_MAG = 12;
export const PISTOL_RESERVE_START = 48;

// --- save game --------------------------------------------------------------
export const SAVE_KEY = 'tidewater-save-v1';
