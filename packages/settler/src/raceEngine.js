import { createHash, randomBytes } from "crypto";

// Lobsters registered on-chain (mirrored for race simulation)
export const LOBSTERS = [
  { id: 1, name: "Crimson Crusher", speed: 85, stamina: 70, aggression: 90, luck: 60 },
  { id: 2, name: "Neptune's Fury", speed: 75, stamina: 88, aggression: 65, luck: 72 },
  { id: 3, name: "The Scuttler", speed: 92, stamina: 55, aggression: 70, luck: 83 },
  { id: 4, name: "Iron Claw", speed: 68, stamina: 95, aggression: 85, luck: 52 },
  { id: 5, name: "Lucky Lurker", speed: 72, stamina: 75, aggression: 55, luck: 98 },
  { id: 6, name: "Pincer Pete", speed: 88, stamina: 80, aggression: 78, luck: 54 },
  { id: 7, name: "The Drifter", speed: 65, stamina: 92, aggression: 48, luck: 95 },
  { id: 8, name: "Scarlet Storm", speed: 95, stamina: 60, aggression: 82, luck: 63 },
  { id: 9, name: "Deep Blue Menace", speed: 70, stamina: 85, aggression: 88, luck: 57 },
  { id: 10, name: "Shell Shocked", speed: 80, stamina: 78, aggression: 75, luck: 67 },
  { id: 11, name: "Barnacle Bob", speed: 60, stamina: 98, aggression: 52, luck: 90 },
  { id: 12, name: "The Crusher", speed: 90, stamina: 65, aggression: 95, luck: 50 },
  { id: 13, name: "Snappy McGee", speed: 82, stamina: 72, aggression: 88, luck: 58 },
  { id: 14, name: "Claw Norris", speed: 87, stamina: 83, aggression: 80, luck: 50 },
  { id: 15, name: "Brine Queen", speed: 78, stamina: 90, aggression: 62, luck: 70 },
  { id: 16, name: "Captain Scarlet", speed: 93, stamina: 68, aggression: 72, luck: 67 },
];

export function generateSeedCommit() {
  const seed = randomBytes(32).toString("hex");
  const commit = createHash("sha256").update(seed).digest("hex");
  return { seed, commit };
}

export function runRace(lobsters, seed) {
  // Deterministic pseudo-random from seed
  let state = BigInt("0x" + createHash("sha256").update(seed).digest("hex"));

  const next = () => {
    state = (state * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
    return Number(state & 0xffffn) / 65536;
  };

  // Each lobster gets a score: weighted sum of stats + noise
  const scores = lobsters.map(l => {
    const base = l.speed * 0.35 + l.stamina * 0.25 + l.aggression * 0.20 + l.luck * 0.20;
    const noise = next() * 30; // up to 30 point swing
    return { ...l, score: base + noise, ticks: Math.floor(100 - (base + noise) / 4) };
  });

  scores.sort((a, b) => b.score - a.score);
  const results = scores.map((l, i) => ({ ...l, position: i + 1 }));

  return results;
}

export function computeProofHash(raceId, seed, results) {
  const payload = JSON.stringify({ raceId, seed, results: results.map(r => ({ id: r.id, position: r.position })) });
  return "0x" + createHash("sha256").update(payload).digest("hex");
}
