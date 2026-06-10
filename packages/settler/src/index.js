import "dotenv/config";
import express from "express";
import cors from "cors";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import db from "./db.js";
import { LOBSTERS, generateSeedCommit, runRace, computeProofHash } from "./raceEngine.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const CONTRACT_ADDRESS = "0x665606FA3a8B2619be800eD5427097678572E929";
const PRIVATE_KEY = process.env.SETTLER_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL || `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;

const CLAWD_DERBY_ABI = parseAbi([
  "function settleSession(address player, int256 netTokenDelta) external",
  "function logRaceProof(uint256 raceId, bytes32 proofHash) external",
  "function tokenBalance(address) view returns (uint256)",
]);

let publicClient;
let walletClient;

if (PRIVATE_KEY) {
  const account = privateKeyToAccount(PRIVATE_KEY);
  publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });
  console.log(`Settler account: ${account.address}`);
} else {
  console.warn("No SETTLER_PRIVATE_KEY — on-chain settlement disabled");
}

// GET /health
app.get("/health", (_req, res) => {
  res.json({ ok: true, onChain: !!walletClient });
});

// GET /race/current
app.get("/race/current", (_req, res) => {
  const row = db.prepare("SELECT * FROM races ORDER BY race_id DESC LIMIT 1").get();
  if (!row) return res.json(null);

  const bets = db.prepare("SELECT * FROM bets WHERE race_id = ?").all(row.race_id);
  const results = row.state === "finished" ? JSON.parse(row.seed_reveal || "null") : null;

  res.json({
    raceId: row.race_id,
    state: row.state,
    lobsters: LOBSTERS.map(l => ({ id: l.id, name: l.name })),
    bets,
    results,
    winner: row.winner_id ? { id: row.winner_id, name: row.winner_name } : null,
    proof: row.proof_hash,
  });
});

// POST /race/start
app.post("/race/start", (_req, res) => {
  const existing = db.prepare("SELECT * FROM races WHERE state IN ('betting','running') LIMIT 1").get();
  if (existing) return res.status(400).json({ error: "Race already in progress" });

  const { seed, commit } = generateSeedCommit();
  const raceId = Date.now();

  db.prepare(
    "INSERT INTO races (race_id, state, seed_commit, seed_reveal, started_at) VALUES (?, 'betting', ?, ?, ?)"
  ).run(raceId, commit, seed, Math.floor(Date.now() / 1000));

  res.json({
    raceId,
    state: "betting",
    commit,
    lobsters: LOBSTERS.map(l => ({ id: l.id, name: l.name })),
  });
});

// POST /race/bet — { player, lobsterId, tokens }
app.post("/race/bet", (req, res) => {
  const { player, lobsterId, tokens } = req.body;
  if (!player || !lobsterId || !tokens || tokens <= 0) {
    return res.status(400).json({ error: "Invalid bet" });
  }

  const race = db.prepare("SELECT * FROM races WHERE state = 'betting' ORDER BY race_id DESC LIMIT 1").get();
  if (!race) return res.status(400).json({ error: "No race in betting phase" });

  const lobster = LOBSTERS.find(l => l.id === Number(lobsterId));
  if (!lobster) return res.status(400).json({ error: "Unknown lobster" });

  db.prepare(
    "INSERT INTO bets (race_id, player, lobster_id, tokens) VALUES (?, ?, ?, ?)"
  ).run(race.race_id, player.toLowerCase(), lobsterId, tokens);

  res.json({ ok: true, raceId: race.race_id });
});

// POST /race/run — run the race, settle bets on-chain
app.post("/race/run", async (_req, res) => {
  const race = db.prepare("SELECT * FROM races WHERE state = 'betting' ORDER BY race_id DESC LIMIT 1").get();
  if (!race) return res.status(400).json({ error: "No race in betting phase" });

  db.prepare("UPDATE races SET state = 'running' WHERE race_id = ?").run(race.race_id);

  const results = runRace(LOBSTERS, race.seed_reveal);
  const winner = results[0];
  const proofHash = computeProofHash(race.race_id, race.seed_reveal, results);

  // Compute payouts: winning bettors get 2x, losers lose their bet
  const bets = db.prepare("SELECT * FROM bets WHERE race_id = ?").all(race.race_id);
  const winBets = bets.filter(b => b.lobster_id === winner.id);
  const loseBets = bets.filter(b => b.lobster_id !== winner.id);

  // Build net deltas per player (wins positive, losses negative)
  const deltas = {};
  for (const b of winBets) {
    deltas[b.player] = (deltas[b.player] || 0) + b.tokens; // win = bet back + equal payout
  }
  for (const b of loseBets) {
    deltas[b.player] = (deltas[b.player] || 0) - b.tokens;
  }

  // Save results
  db.prepare(
    "UPDATE races SET state='finished', finished_at=?, winner_id=?, winner_name=?, proof_hash=?, seed_reveal=? WHERE race_id=?"
  ).run(Math.floor(Date.now() / 1000), winner.id, winner.name, proofHash, JSON.stringify(results), race.race_id);

  // Update payout in bets
  for (const b of bets) {
    const payout = b.lobster_id === winner.id ? b.tokens * 2 : 0;
    db.prepare("UPDATE bets SET payout = ? WHERE id = ?").run(payout, b.id);
  }

  // On-chain: settle each player session + log proof
  if (walletClient) {
    try {
      for (const [player, delta] of Object.entries(deltas)) {
        const hash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: CLAWD_DERBY_ABI,
          functionName: "settleSession",
          args: [player, BigInt(delta)],
        });
        console.log(`settleSession ${player} delta=${delta} tx=${hash}`);
      }

      const proofHashBytes = proofHash;
      const txHash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: CLAWD_DERBY_ABI,
        functionName: "logRaceProof",
        args: [BigInt(race.race_id), proofHashBytes],
      });
      console.log(`logRaceProof raceId=${race.race_id} tx=${txHash}`);

      db.prepare("UPDATE races SET on_chain = 1 WHERE race_id = ?").run(race.race_id);
    } catch (err) {
      console.error("On-chain settlement error:", err.message);
    }
  }

  res.json({
    raceId: race.race_id,
    state: "finished",
    results,
    winner: { id: winner.id, name: winner.name },
    proof: proofHash,
  });
});

// GET /race/history
app.get("/race/history", (_req, res) => {
  const rows = db.prepare("SELECT * FROM races WHERE state = 'finished' ORDER BY race_id DESC LIMIT 50").all();
  const history = rows.map(r => ({
    raceId: r.race_id,
    winner: r.winner_name,
    winnerLobsterId: r.winner_id,
    timestamp: r.finished_at,
    proofHash: r.proof_hash,
    onChain: !!r.on_chain,
  }));
  res.json(history);
});

// GET /race/:raceId/proof
app.get("/race/:raceId/proof", (req, res) => {
  const row = db.prepare("SELECT * FROM races WHERE race_id = ?").get(req.params.raceId);
  if (!row) return res.status(404).json({ error: "Race not found" });
  res.json({
    raceId: row.race_id,
    seedCommit: row.seed_commit,
    seedReveal: row.seed_reveal,
    proofHash: row.proof_hash,
    onChain: !!row.on_chain,
  });
});

// GET /player/:address/session
app.get("/player/:address/session", async (req, res) => {
  const address = req.params.address.toLowerCase();
  if (!publicClient) return res.json({ address, onChainBalance: null });
  try {
    const balance = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CLAWD_DERBY_ABI,
      functionName: "tokenBalance",
      args: [address],
    });
    res.json({ address, onChainBalance: balance.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🦞 Claw Derby settler running on port ${PORT}`);
});
