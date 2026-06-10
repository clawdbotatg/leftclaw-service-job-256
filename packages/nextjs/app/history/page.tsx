"use client";

import { useEffect, useState } from "react";
import type { NextPage } from "next";
import { ClientOnly } from "~~/components/ClientOnly";

const SETTLER_URL = process.env.NEXT_PUBLIC_SETTLER_URL || "http://localhost:3001";

type HistoryEntry = {
  raceId: number;
  winner: string;
  winnerLobsterId: number;
  timestamp: number;
  proofHash?: string;
  onChain: boolean;
};

const LOBSTER_EMOJIS = ["🦞", "🦀", "🐚", "🌊", "⚡", "🔥", "💎", "👑", "🎯", "🌟", "🏆", "🎪", "🎭", "🎨", "🎲", "🎮"];

const HistoryContent = () => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`${SETTLER_URL}/race/history`);
        if (res.ok) {
          const data = await res.json();
          setHistory(data);
        }
      } catch {
        // settler offline
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  return (
    <div className="flex items-center flex-col grow pt-10">
      <div className="px-5 w-full max-w-3xl">
        <h1 className="text-center text-4xl font-bold mb-2">📜 Race History</h1>
        <p className="text-center text-base-content/70 mb-8">Past race results with on-chain proof hashes</p>

        {loading && (
          <div className="flex justify-center py-20">
            <span className="loading loading-spinner loading-lg" />
          </div>
        )}

        {!loading && history.length === 0 && (
          <div className="text-center py-20 text-base-content/50">
            <div className="text-5xl mb-4">🏁</div>
            <p>No races yet. Start one on the Race page!</p>
          </div>
        )}

        {!loading && history.length > 0 && (
          <div className="space-y-3 mb-10">
            {history
              .slice()
              .sort((a, b) => b.raceId - a.raceId)
              .map(entry => (
                <div key={entry.raceId} className="card bg-base-100 shadow">
                  <div className="card-body py-4">
                    <div className="flex items-center gap-4">
                      <span className="text-2xl font-bold text-base-content/30 w-12">#{entry.raceId}</span>
                      <span className="text-3xl">{LOBSTER_EMOJIS[entry.winnerLobsterId % LOBSTER_EMOJIS.length]}</span>
                      <div className="flex-1">
                        <div className="font-bold">{entry.winner}</div>
                        <div className="text-xs text-base-content/60">
                          {new Date(entry.timestamp * 1000).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {entry.onChain && <span className="badge badge-success badge-sm">On-chain</span>}
                        {entry.proofHash && (
                          <span className="font-mono text-xs text-base-content/40 max-w-[120px] truncate">
                            {entry.proofHash.slice(0, 10)}...
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

const History: NextPage = () => (
  <ClientOnly>
    <HistoryContent />
  </ClientOnly>
);

export default History;
