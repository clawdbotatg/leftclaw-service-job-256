"use client";

import { useEffect, useState } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { ClientOnly } from "~~/components/ClientOnly";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const SETTLER_URL = process.env.NEXT_PUBLIC_SETTLER_URL || "http://localhost:3001";

type RaceState = "idle" | "betting" | "running" | "finished";

type RacerResult = {
  id: number;
  name: string;
  position: number;
  ticks: number;
};

type RaceData = {
  raceId: number;
  state: RaceState;
  lobsters: Array<{ id: number; name: string }>;
  results?: RacerResult[];
  winner?: { id: number; name: string };
  proof?: string;
};

const LOBSTER_EMOJIS = ["🦞", "🦀", "🐚", "🌊", "⚡", "🔥", "💎", "👑", "🎯", "🌟", "🏆", "🎪", "🎭", "🎨", "🎲", "🎮"];

const stateLabel: Record<RaceState, string> = {
  idle: "No active race",
  betting: "Betting open",
  running: "Race in progress",
  finished: "Race finished",
};

const RaceContent = () => {
  const { address: connectedAddress } = useAccount();
  const [race, setRace] = useState<RaceData | null>(null);
  const [betLobsterId, setBetLobsterId] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState("");
  const [betting, setBetting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);

  const { data: tokenBalance } = useScaffoldReadContract({
    contractName: "ClawDerby",
    functionName: "tokenBalance",
    args: [connectedAddress],
    watch: true,
  });

  const fetchCurrentRace = async () => {
    try {
      const res = await fetch(`${SETTLER_URL}/race/current`);
      if (res.ok) {
        const data = await res.json();
        setRace(data);
      }
    } catch {
      // settler offline
    }
  };

  useEffect(() => {
    fetchCurrentRace();
    const interval = setInterval(fetchCurrentRace, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleStartRace = async () => {
    setStarting(true);
    try {
      const res = await fetch(`${SETTLER_URL}/race/start`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRace(data);
      notification.success("Race started! Place your bets.");
    } catch (e: unknown) {
      notification.error((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const handleBet = async () => {
    if (!connectedAddress || betLobsterId === null) {
      notification.error("Select a lobster and connect wallet");
      return;
    }
    const amount = parseInt(betAmount);
    if (!amount || amount <= 0) {
      notification.error("Enter bet amount");
      return;
    }
    setBetting(true);
    try {
      const res = await fetch(`${SETTLER_URL}/race/bet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player: connectedAddress, lobsterId: betLobsterId, tokens: amount }),
      });
      if (!res.ok) throw new Error(await res.text());
      notification.success(`Bet placed on lobster #${betLobsterId}!`);
      setBetAmount("");
    } catch (e: unknown) {
      notification.error((e as Error).message);
    } finally {
      setBetting(false);
    }
  };

  const handleRunRace = async () => {
    setRunning(true);
    try {
      const res = await fetch(`${SETTLER_URL}/race/run`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRace(data);
      notification.success(`🏆 Winner: ${data.winner?.name}!`);
    } catch (e: unknown) {
      notification.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex items-center flex-col grow pt-10">
      <div className="px-5 w-full max-w-3xl">
        <h1 className="text-center text-4xl font-bold mb-2">🏁 Race Track</h1>

        {connectedAddress && (
          <div className="text-center text-base-content/70 mb-6">
            Your chips:{" "}
            <span className="font-bold text-primary">{tokenBalance !== undefined ? tokenBalance.toString() : "—"}</span>
          </div>
        )}

        {/* Race status */}
        <div className="card bg-base-100 shadow-xl mb-6">
          <div className="card-body">
            <div className="flex items-center justify-between mb-4">
              <h2 className="card-title">{race ? `Race #${race.raceId}` : "No Race"}</h2>
              <span
                className={`badge ${race?.state === "betting" ? "badge-success" : race?.state === "finished" ? "badge-neutral" : "badge-warning"}`}
              >
                {race ? stateLabel[race.state] : "Idle"}
              </span>
            </div>

            {(!race || race.state === "finished") && (
              <button className="btn btn-primary w-full" onClick={handleStartRace} disabled={starting}>
                {starting ? "Starting..." : "Start New Race"}
              </button>
            )}

            {race?.state === "betting" && (
              <button className="btn btn-secondary w-full mt-2" onClick={handleRunRace} disabled={running}>
                {running ? "Racing..." : "🏁 Run Race"}
              </button>
            )}
          </div>
        </div>

        {/* Bet panel */}
        {race?.state === "betting" && race.lobsters && (
          <div className="card bg-base-100 shadow-xl mb-6">
            <div className="card-body">
              <h2 className="card-title mb-4">Place Your Bet</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {race.lobsters.map(l => (
                  <button
                    key={l.id}
                    className={`btn btn-sm ${betLobsterId === l.id ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setBetLobsterId(l.id)}
                  >
                    {LOBSTER_EMOJIS[l.id % LOBSTER_EMOJIS.length]} {l.name.split(" ")[0]}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Chips to bet"
                  className="input input-bordered flex-1"
                  value={betAmount}
                  onChange={e => setBetAmount(e.target.value)}
                  min="1"
                />
                <button className="btn btn-primary" onClick={handleBet} disabled={betting || !connectedAddress}>
                  {betting ? "Betting..." : "Bet"}
                </button>
              </div>
              {betLobsterId !== null && (
                <p className="text-sm text-base-content/60 mt-1">
                  Selected: {LOBSTER_EMOJIS[betLobsterId % LOBSTER_EMOJIS.length]}{" "}
                  {race.lobsters.find(l => l.id === betLobsterId)?.name}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        {race?.state === "finished" && race.results && (
          <div className="card bg-base-100 shadow-xl mb-6">
            <div className="card-body">
              <h2 className="card-title mb-4">🏆 Winner: {race.winner?.name}</h2>
              <div className="space-y-2">
                {race.results
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map(r => (
                    <div key={r.id} className="flex items-center gap-3">
                      <span className="text-lg font-bold w-6">{r.position}.</span>
                      <span className="text-xl">{LOBSTER_EMOJIS[r.id % LOBSTER_EMOJIS.length]}</span>
                      <span className="flex-1">{r.name}</span>
                      <span className="text-xs text-base-content/60">{r.ticks} ticks</span>
                    </div>
                  ))}
              </div>
              {race.proof && (
                <div className="mt-4 p-3 bg-base-200 rounded-lg">
                  <p className="text-xs font-mono break-all text-base-content/60">Proof: {race.proof}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="alert alert-info mb-6">
          <span className="text-sm">
            Race engine runs locally. Start the settler backend (packages/settler) to enable live racing.
          </span>
        </div>
      </div>
    </div>
  );
};

const Race: NextPage = () => (
  <ClientOnly>
    <RaceContent />
  </ClientOnly>
);

export default Race;
