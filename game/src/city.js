// Caldera Bay: a deterministic island city built from a junction grid.
// Roads run along the grid lines; blocks between them hold buildings with
// colliders. Six districts, four points of interest, stash crates, parked
// cars and palms are all placed from one fixed seed, so the city is identical
// on every load and in every test.
import { createRng } from './rng.js';

export const GRID_X = [-150, -90, -30, 30, 90, 150];
export const GRID_Z = [-110, -55, 0, 55, 110];
export const ROAD_HALF = 6;
export const CITY_BOUNDS = { minX: -178, maxX: 178, minZ: -138, maxZ: 138 };

const DISTRICTS = [
  { name: 'Ember Docks', tint: [0.45, 0.36, 0.30] },
  { name: 'Neon Flats', tint: [0.36, 0.30, 0.48] },
  { name: 'Old Caldera', tint: [0.48, 0.42, 0.33] },
  { name: 'Palm Heights', tint: [0.30, 0.44, 0.36] },
  { name: 'Foundry Row', tint: [0.44, 0.33, 0.28] },
  { name: 'Harborview', tint: [0.28, 0.38, 0.50] },
];
function districtFor(bx, bz) {
  const col = bx < -60 ? 0 : bx < 60 ? 1 : 2;
  const row = bz < 0 ? 0 : 1;
  return DISTRICTS[row * 3 + col];
}
export function junctionIndex(ix, iz) { return iz * GRID_X.length + ix; }
export function junctionPos(idx) {
  const ix = idx % GRID_X.length, iz = Math.floor(idx / GRID_X.length);
  return { x: GRID_X[ix], z: GRID_Z[iz], ix, iz };
}
export function neighbours(idx) {
  const { ix, iz } = junctionPos(idx);
  const out = [];
  if (ix > 0) out.push(idx - 1);
  if (ix < GRID_X.length - 1) out.push(idx + 1);
  if (iz > 0) out.push(idx - GRID_X.length);
  if (iz < GRID_Z.length - 1) out.push(idx + GRID_X.length);
  return out;
}
export function nearestJunction(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < GRID_X.length * GRID_Z.length; i++) {
    const p = junctionPos(i), d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
// Breadth-first route over the junction graph, as a list of junction indices.
export function route(fromIdx, toIdx) {
  if (fromIdx === toIdx) return [fromIdx];
  const prev = new Map([[fromIdx, -1]]);
  const queue = [fromIdx];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === toIdx) break;
    for (const n of neighbours(cur)) if (!prev.has(n)) { prev.set(n, cur); queue.push(n); }
  }
  if (!prev.has(toIdx)) return [fromIdx];
  const path = [];
  for (let c = toIdx; c !== -1; c = prev.get(c)) path.push(c);
  return path.reverse();
}
export function onRoad(x, z) {
  for (const gx of GRID_X) if (Math.abs(x - gx) <= ROAD_HALF) return true;
  for (const gz of GRID_Z) if (Math.abs(z - gz) <= ROAD_HALF) return true;
  return false;
}

export function createCity() {
  const rng = createRng(0xca1de2a);
  const buildings = [];
  // One to four buildings per block, kept clear of the roads.
  for (let bx = 0; bx < GRID_X.length - 1; bx++) {
    for (let bz = 0; bz < GRID_Z.length - 1; bz++) {
      const x0 = GRID_X[bx] + ROAD_HALF + 3, x1 = GRID_X[bx + 1] - ROAD_HALF - 3;
      const z0 = GRID_Z[bz] + ROAD_HALF + 3, z1 = GRID_Z[bz + 1] - ROAD_HALF - 3;
      const n = rng.int(2, 4);
      for (let i = 0; i < n; i++) {
        const w = rng.range(10, 18), d = rng.range(10, 18);
        const x = rng.range(x0 + w / 2, x1 - w / 2);
        const z = rng.range(z0 + d / 2, z1 - d / 2);
        const h = rng.range(9, 42);
        const dist = districtFor(x, z);
        const shade = rng.range(0.75, 1.2);
        buildings.push({
          x, z, w, d, h,
          color: [dist.tint[0] * shade, dist.tint[1] * shade, dist.tint[2] * shade],
          district: dist.name,
        });
      }
    }
  }
  const pois = {
    cafe: { x: -150, z: -96, name: 'Cafe Ceniza', kind: 'cafe' },
    spray: { x: 104, z: 55, name: 'Caldera Spray & Shine', kind: 'spray' },
    hospital: { x: -104, z: 110, name: 'St. Ash Hospital', kind: 'hospital' },
    police: { x: 30, z: -41, name: 'Caldera Bay Precinct', kind: 'police' },
    docks: { x: 164, z: 110, name: 'Ember Docks', kind: 'docks' },
    overlook: { x: -164, z: 55, name: 'Harborview Overlook', kind: 'overlook' },
  };
  const crates = [];
  for (let i = 0; i < 20; i++) {
    const jx = rng.pick(GRID_X), jz = rng.pick(GRID_Z);
    crates.push({ x: jx + rng.range(9, 15) * (rng.chance(0.5) ? 1 : -1), z: jz + rng.range(9, 15) * (rng.chance(0.5) ? 1 : -1) });
  }
  const carColors = [[0.75, 0.2, 0.16], [0.16, 0.35, 0.75], [0.85, 0.7, 0.2], [0.2, 0.65, 0.35], [0.8, 0.8, 0.85], [0.5, 0.2, 0.6], [0.9, 0.45, 0.1]];
  const parked = [];
  for (let i = 0; i < 16; i++) {
    const along = rng.range(-140, 140);
    const horizontal = rng.chance(0.5);
    const lane = rng.pick(GRID_Z.concat(GRID_X));
    // Park at the kerb of a road: offset by ROAD_HALF-1.6 from the centre line.
    const p = horizontal
      ? { x: along, z: (GRID_Z.includes(lane) ? lane : rng.pick(GRID_Z)) + (ROAD_HALF - 1.7), angle: Math.PI / 2 }
      : { x: (GRID_X.includes(lane) ? lane : rng.pick(GRID_X)) + (ROAD_HALF - 1.7), z: along, angle: 0 };
    parked.push({ x: p.x, z: p.z, angle: p.angle, color: rng.pick(carColors) });
  }
  const palms = [];
  for (let i = 0; i < 36; i++) {
    palms.push({ x: rng.range(-172, 172), z: rng.range(-132, 132), h: rng.range(5, 8) });
  }
  return {
    buildings, pois, crates, parked, palms, districts: DISTRICTS,
    bounds: CITY_BOUNDS, carColors,
  };
}
// Resolve a point out of every building collider it overlaps; returns corrected [x,z].
export function collideBuildings(city, x, z, r) {
  for (const b of city.buildings) {
    const hw = b.w / 2 + r, hd = b.d / 2 + r;
    const dx = x - b.x, dz = z - b.z;
    if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
      const px = hw - Math.abs(dx), pz = hd - Math.abs(dz);
      if (px < pz) x = b.x + (dx >= 0 ? hw : -hw);
      else z = b.z + (dz >= 0 ? hd : -hd);
    }
  }
  return [x, z];
}
