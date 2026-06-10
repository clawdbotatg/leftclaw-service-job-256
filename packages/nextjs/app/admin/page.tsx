"use client";

import { useState } from "react";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { ClientOnly } from "~~/components/ClientOnly";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const AdminContent = () => {
  const { address: connectedAddress } = useAccount();
  const [houseAmount, setHouseAmount] = useState("");
  const [newEdgeBps, setNewEdgeBps] = useState("");
  const [newMaxBet, setNewMaxBet] = useState("");

  const { data: owner } = useScaffoldReadContract({
    contractName: "ClawDerby",
    functionName: "owner",
  });

  const { data: pendingOwner } = useScaffoldReadContract({
    contractName: "ClawDerby",
    functionName: "pendingOwner",
  });

  const { data: paused } = useScaffoldReadContract({
    contractName: "ClawDerby",
    functionName: "paused",
    watch: true,
  });

  const { data: houseReserve } = useScaffoldReadContract({
    contractName: "ClawDerby",
    functionName: "houseTokenReserve",
    watch: true,
  });

  const { data: clawVaultClawd } = useScaffoldReadContract({
    contractName: "ClawDerby",
    functionName: "clawVaultClawd",
    watch: true,
  });

  const { data: totalPlayerTokens } = useScaffoldReadContract({
    contractName: "ClawDerby",
    functionName: "totalPlayerTokens",
    watch: true,
  });

  const { data: isSolvent } = useScaffoldReadContract({
    contractName: "ClawDerby",
    functionName: "isSolvent",
    watch: true,
  });

  const { data: houseEdgeBps } = useScaffoldReadContract({
    contractName: "ClawDerby",
    functionName: "houseEdgeBps",
  });

  const { data: maxBetTokens } = useScaffoldReadContract({
    contractName: "ClawDerby",
    functionName: "maxBetTokens",
  });

  const { writeContractAsync: adminWrite, isPending } = useScaffoldWriteContract({
    contractName: "ClawDerby",
  });

  const isOwner = connectedAddress && owner && connectedAddress.toLowerCase() === (owner as string).toLowerCase();

  const handlePause = async () => {
    try {
      if (paused) {
        await adminWrite({ functionName: "unpause" });
        notification.success("Contract unpaused");
      } else {
        await adminWrite({ functionName: "pause" });
        notification.success("Contract paused");
      }
    } catch (e: unknown) {
      notification.error((e as Error).message);
    }
  };

  const handleFundHouse = async () => {
    const amount = parseInt(houseAmount);
    if (!amount) {
      notification.error("Enter amount");
      return;
    }
    try {
      await adminWrite({ functionName: "fundHouseReserve", args: [BigInt(amount)] });
      notification.success("House reserve funded");
      setHouseAmount("");
    } catch (e: unknown) {
      notification.error((e as Error).message);
    }
  };

  const handleSetEdge = async () => {
    const bps = parseInt(newEdgeBps);
    if (isNaN(bps) || bps < 0 || bps > 10000) {
      notification.error("Enter bps 0–10000");
      return;
    }
    try {
      await adminWrite({ functionName: "setHouseEdge", args: [BigInt(bps)] });
      notification.success("House edge updated");
      setNewEdgeBps("");
    } catch (e: unknown) {
      notification.error((e as Error).message);
    }
  };

  const handleSetMaxBet = async () => {
    const max = parseInt(newMaxBet);
    if (!max) {
      notification.error("Enter max bet");
      return;
    }
    try {
      await adminWrite({ functionName: "setMaxBet", args: [BigInt(max)] });
      notification.success("Max bet updated");
      setNewMaxBet("");
    } catch (e: unknown) {
      notification.error((e as Error).message);
    }
  };

  if (!connectedAddress) {
    return (
      <div className="flex items-center flex-col grow pt-10">
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🔒</div>
          <p>Connect your wallet to access admin</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center flex-col grow pt-10">
      <div className="px-5 w-full max-w-2xl">
        <h1 className="text-center text-4xl font-bold mb-2">⚙️ Admin Panel</h1>
        <p className="text-center text-base-content/70 mb-8">Contract owner controls — ClawDerby management</p>

        {!isOwner && (
          <div className="alert alert-warning mb-6">
            <span>Connected as non-owner. Some actions will revert.</span>
          </div>
        )}

        {/* Contract stats */}
        <div className="card bg-base-100 shadow-xl mb-6">
          <div className="card-body">
            <h2 className="card-title mb-4">Contract Stats</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-base-content/60">Owner</div>
                <div className="font-mono text-xs break-all">{(owner as string) ?? "—"}</div>
              </div>
              {pendingOwner && (pendingOwner as string) !== "0x0000000000000000000000000000000000000000" && (
                <div>
                  <div className="text-base-content/60">Pending Owner</div>
                  <div className="font-mono text-xs break-all">{pendingOwner as string}</div>
                </div>
              )}
              <div>
                <div className="text-base-content/60">House Reserve</div>
                <div className="font-bold">{houseReserve?.toString() ?? "—"} chips</div>
              </div>
              <div>
                <div className="text-base-content/60">Player Tokens</div>
                <div className="font-bold">{totalPlayerTokens?.toString() ?? "—"} chips</div>
              </div>
              <div>
                <div className="text-base-content/60">CLAWD Vault</div>
                <div className="font-bold">
                  {clawVaultClawd ? (Number(clawVaultClawd) / 1e18).toFixed(4) : "—"} CLAWD
                </div>
              </div>
              <div>
                <div className="text-base-content/60">Solvency</div>
                <div className={`font-bold ${isSolvent ? "text-success" : "text-error"}`}>
                  {isSolvent === undefined ? "—" : isSolvent ? "✓ Solvent" : "✗ Insolvent"}
                </div>
              </div>
              <div>
                <div className="text-base-content/60">House Edge</div>
                <div className="font-bold">{houseEdgeBps ? Number(houseEdgeBps) / 100 : "—"}%</div>
              </div>
              <div>
                <div className="text-base-content/60">Max Bet</div>
                <div className="font-bold">{maxBetTokens?.toString() ?? "—"} chips</div>
              </div>
              <div>
                <div className="text-base-content/60">Status</div>
                <div className={`font-bold ${paused ? "text-error" : "text-success"}`}>
                  {paused === undefined ? "—" : paused ? "⏸ Paused" : "▶ Active"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pause / Unpause */}
        <div className="card bg-base-100 shadow-xl mb-4">
          <div className="card-body">
            <h2 className="card-title mb-2">Emergency Controls</h2>
            <button
              className={`btn ${paused ? "btn-success" : "btn-error"} w-full`}
              onClick={handlePause}
              disabled={isPending}
            >
              {isPending ? "Sending..." : paused ? "Unpause Contract" : "Pause Contract"}
            </button>
          </div>
        </div>

        {/* Fund house reserve */}
        <div className="card bg-base-100 shadow-xl mb-4">
          <div className="card-body">
            <h2 className="card-title mb-2">Fund House Reserve</h2>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Chips to add"
                className="input input-bordered flex-1"
                value={houseAmount}
                onChange={e => setHouseAmount(e.target.value)}
                min="1"
              />
              <button className="btn btn-primary" onClick={handleFundHouse} disabled={isPending}>
                Fund
              </button>
            </div>
          </div>
        </div>

        {/* Set house edge */}
        <div className="card bg-base-100 shadow-xl mb-4">
          <div className="card-body">
            <h2 className="card-title mb-2">Set House Edge</h2>
            <p className="text-sm text-base-content/60 mb-2">Basis points (500 = 5%)</p>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Basis points"
                className="input input-bordered flex-1"
                value={newEdgeBps}
                onChange={e => setNewEdgeBps(e.target.value)}
                min="0"
                max="10000"
              />
              <button className="btn btn-primary" onClick={handleSetEdge} disabled={isPending}>
                Set
              </button>
            </div>
          </div>
        </div>

        {/* Set max bet */}
        <div className="card bg-base-100 shadow-xl mb-10">
          <div className="card-body">
            <h2 className="card-title mb-2">Set Max Bet</h2>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Max chips per bet"
                className="input input-bordered flex-1"
                value={newMaxBet}
                onChange={e => setNewMaxBet(e.target.value)}
                min="1"
              />
              <button className="btn btn-primary" onClick={handleSetMaxBet} disabled={isPending}>
                Set
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Admin: NextPage = () => (
  <ClientOnly>
    <AdminContent />
  </ClientOnly>
);

export default Admin;
