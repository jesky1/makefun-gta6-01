// Caldera Heat — every tuning number in one place.
// The world is a fixed-size coastal city measured in world units; the
// renderer uses a 1280x720 logical canvas and a camera, so no rule here
// depends on the player's screen.

export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;

export const CITY = {
  width: 2600,
  height: 2000,
  block: 260,      // city grid pitch: one block plus its road
  road: 92,        // road width inside each pitch
  margin: 60,      // water / sand border around the island
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 178,
  startMoney: 120,
  startHealth: 100,
  regenDelay: 6,       // seconds without damage before health trickles back
  regenRate: 4,        // health per second while regenerating
  enterRange: 52,      // how close to a car door you must be to get in
};

export const VEHICLE_TYPES = {
  sedan:  { label: 'Sedan',  maxSpeed: 332, accel: 3.4, grip: 5.2, health: 120, seats: 4 },
  taxi:   { label: 'Taxi',   maxSpeed: 322, accel: 3.3, grip: 5.2, health: 120, seats: 4 },
  sports: { label: 'Sports', maxSpeed: 438, accel: 4.6, grip: 6.0, health: 100, seats: 2 },
  truck:  { label: 'Truck',  maxSpeed: 262, accel: 2.6, grip: 4.4, health: 190, seats: 2 },
  police: { label: 'Police', maxSpeed: 398, accel: 4.1, grip: 5.8, health: 170, seats: 4 },
};

export const CAR_COLORS = [
  '#c94f42', '#3f7fbf', '#e0a83c', '#58a05c', '#d8d8dc',
  '#7a4fa3', '#2fa3a0', '#e2703a', '#8a8f98', '#34558b',
];
export const TAXI_COLOR = '#f5b921';
export const POLICE_COLOR = '#20242e';

export const HEAT = {
  perStar: 100,        // heat points per wanted star
  maxStars: 5,
  decayRate: 3.2,      // heat per second once you stop committing crimes
  decayDelay: 7,       // quiet seconds before decay starts
  carjack: 55,
  jackMoving: 110,
  hitPed: 130,
  hitCar: 26,
  hitPolice: 85,
  stash: 40,
  missionAlarm: 300,
};

export const POLICE = {
  maxActive: 6,
  spawnGap: 2.4,       // seconds between reinforcements
  spawnDist: 640,      // spawn this far from the player, off screen
  bustRange: 64,
  bustFill: 0.55,      // bust meter per second while they have you pinned
  bustDrain: 0.8,
  ramDamage: 5,
};

export const SPRAY = { fee: 100, range: 74 };

export const TAXI = {
  baseFare: 24,
  perUnit: 0.055,      // fare dollars per world unit of trip distance
  tipWindow: 0.012,    // seconds per unit for a tip-eligible trip
  tip: 18,
};

export const STASH = { reward: 90, count: 5 };

export const PENALTY = { wastedRate: 0.10, wastedMin: 40, bustedRate: 0.15, bustedMin: 60 };

export const MISSION_REWARDS = [150, 300, 220, 260, 200, 500];

export const BEST_KEY = 'caldera-heat.best';
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
