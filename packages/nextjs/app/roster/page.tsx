"use client";

import type { NextPage } from "next";
import { ClientOnly } from "~~/components/ClientOnly";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

type Lobster = {
  id: bigint;
  name: string;
  speed: number;
  stamina: number;
  aggression: number;
  luck: number;
  trait1: string;
  trait2: string;
  active: boolean;
};

const StatBar = ({ value, label }: { value: number; label: string }) => (
  <div className="mb-1">
    <div className="flex justify-between text-xs mb-0.5">
      <span>{label}</span>
      <span>{value}</span>
    </div>
    <progress className="progress progress-primary w-full h-2" value={value} max={100} />
  </div>
);

const LobsterCard = ({ lobster }: { lobster: Lobster }) => {
  const emojis = ["🦞", "🦀", "🐚", "🌊", "⚡", "🔥", "💎", "👑", "🎯", "🌟", "🏆", "🎪", "🎭", "🎨", "🎲", "🎮"];
  const emoji = emojis[Number(lobster.id) % emojis.length];

  return (
    <div className={`card bg-base-100 shadow-xl ${!lobster.active ? "opacity-50" : ""}`}>
      <div className="card-body">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-4xl">{emoji}</span>
          <div>
            <h3 className="font-bold text-lg leading-tight">{lobster.name}</h3>
            <div className="flex gap-1 mt-1">
              <span className="badge badge-sm badge-outline">{lobster.trait1}</span>
              <span className="badge badge-sm badge-outline">{lobster.trait2}</span>
            </div>
          </div>
          {!lobster.active && <span className="badge badge-error badge-sm ml-auto">Retired</span>}
        </div>
        <StatBar value={lobster.speed} label="Speed" />
        <StatBar value={lobster.stamina} label="Stamina" />
        <StatBar value={lobster.aggression} label="Aggression" />
        <StatBar value={lobster.luck} label="Luck" />
      </div>
    </div>
  );
};

const RosterContent = () => {
  const { data: lobsters, isLoading } = useScaffoldReadContract({
    contractName: "ClawDerby",
    functionName: "getAllLobsters",
    watch: false,
  });

  return (
    <div className="flex items-center flex-col grow pt-10">
      <div className="px-5 w-full max-w-6xl">
        <h1 className="text-center text-4xl font-bold mb-2">🦞 Lobster Roster</h1>
        <p className="text-center text-base-content/70 mb-8">
          16 unique racers — each with speed, stamina, aggression, and luck stats
        </p>

        {isLoading && (
          <div className="flex justify-center py-20">
            <span className="loading loading-spinner loading-lg" />
          </div>
        )}

        {lobsters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-10">
            {(lobsters as readonly Lobster[]).map(lobster => (
              <LobsterCard key={lobster.id.toString()} lobster={lobster} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Roster: NextPage = () => (
  <ClientOnly>
    <RosterContent />
  </ClientOnly>
);

export default Roster;
