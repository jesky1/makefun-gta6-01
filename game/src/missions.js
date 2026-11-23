// The Caldera Heat story: fixer Lucia Mar "Lu" Vane hires runner Rio Salas to
// move a ledger that half of Caldera Bay wants. Six chained jobs, data only —
// the simulation walks the chain. Each target is a POI key or fixed point in
// city.js coordinates; `byCar` jobs must be finished while driving.
export const MISSIONS = [
  {
    id: 'first-ember', title: 'First Ember', giver: 'Lu Vane',
    text: 'Meet Lu at Cafe Ceniza. She has a ledger and a problem.',
    target: 'cafe', byCar: false, reward: 150,
    done: 'Lu slides the ledger over. "No names. Just drive it where I say."',
  },
  {
    id: 'dockside', title: 'Dockside Drop', giver: 'Lu Vane',
    text: 'Take the ledger to the Ember Docks before the tide crew clocks in.',
    target: 'docks', byCar: true, reward: 260,
    done: 'The dockmaster buries the ledger in a crate of engine parts.',
  },
  {
    id: 'stash-run', title: 'Stash Run', giver: 'Lu Vane',
    text: 'A stash waits at the Foundry Row marker. Grab it, whatever it takes.',
    target: { x: 90, z: -84 }, byCar: false, reward: 320,
    done: 'Cash, a key card, and a note: "Spray shop. Now."',
  },
  {
    id: 'fresh-coat', title: 'Fresh Coat', giver: 'Lu Vane',
    text: 'Get the key card to Caldera Spray & Shine — in a car, any car.',
    target: 'spray', byCar: true, reward: 380,
    done: 'The painter swaps your plates and pockets the key card.',
  },
  {
    id: 'quiet-ward', title: 'Quiet Ward', giver: 'Lu Vane',
    text: 'A witness is hiding at St. Ash Hospital. Walk her out, gently.',
    target: 'hospital', byCar: false, reward: 450,
    done: 'The witness vanishes into the night with Lu\'s people.',
  },
  {
    id: 'caldera-heat', title: 'Caldera Heat', giver: 'Lu Vane',
    text: 'Final run: reach the Harborview Overlook and light the signal flare.',
    target: 'overlook', byCar: false, reward: 700,
    done: 'The flare blooms over the bay. Caldera Heat is yours, Rio.',
  },
];
export function missionTargetPos(city, mission) {
  if (typeof mission.target === 'string') {
    const p = city.pois[mission.target];
    return { x: p.x, z: p.z };
  }
  return { x: mission.target.x, z: mission.target.z };
}
