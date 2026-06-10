"use client";

import { useState } from "react";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { parseEther, parseUnits } from "viem";
import { useAccount } from "wagmi";
import { ClientOnly } from "~~/components/ClientOnly";
import { useScaffoldReadContract, useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

type BuyMode = "CLAWD" | "ETH" | "USDC";

const HomeContent = () => {
  const { address: connectedAddress } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const [buyMode, setBuyMode] = useState<BuyMode>("CLAWD");
  const [amount, setAmount] = useState("");

  const { data: tokenBalance } = useScaffoldReadContract({
    contractName: "ClawDerby",
    functionName: "tokenBalance",
    args: [connectedAddress],
    watch: true,
  });

  const { data: clawdRate } = useScaffoldReadContract({
    contractName: "ClawDerby",
    functionName: "clawdTokenRate",
  });

  const { data: ethRate } = useScaffoldReadContract({
    contractName: "ClawDerby",
    functionName: "ethTokenRate",
  });

  const { data: usdcRate } = useScaffoldReadContract({
    contractName: "ClawDerby",
    functionName: "usdcTokenRate",
  });

  const { data: maxBet } = useScaffoldReadContract({
    contractName: "ClawDerby",
    functionName: "maxBetTokens",
  });

  const { writeContractAsync: buyWithClawd, isPending: buyingClawd } = useScaffoldWriteContract({
    contractName: "ClawDerby",
  });

  const { writeContractAsync: buyWithEth, isPending: buyingEth } = useScaffoldWriteContract({
    contractName: "ClawDerby",
  });

  const { writeContractAsync: buyWithUsdc, isPending: buyingUsdc } = useScaffoldWriteContract({
    contractName: "ClawDerby",
  });

  const { writeContractAsync: withdraw, isPending: withdrawing } = useScaffoldWriteContract({
    contractName: "ClawDerby",
  });

  const isPending = buyingClawd || buyingEth || buyingUsdc;

  const previewTokens = () => {
    const n = parseFloat(amount);
    if (!n || isNaN(n)) return null;
    if (buyMode === "CLAWD" && clawdRate) return Math.floor(n * Number(clawdRate));
    if (buyMode === "ETH" && ethRate) return Math.floor(n * Number(ethRate));
    if (buyMode === "USDC" && usdcRate) return Math.floor(n * Number(usdcRate));
    return null;
  };

  const handleBuy = async () => {
    const n = parseFloat(amount);
    if (!n || isNaN(n)) {
      notification.error("Enter a valid amount");
      return;
    }
    try {
      if (buyMode === "CLAWD") {
        await buyWithClawd({ functionName: "buyTokensWithCLAWD", args: [parseEther(amount)] });
      } else if (buyMode === "ETH") {
        await buyWithEth({ functionName: "buyTokensWithETH", value: parseEther(amount) });
      } else {
        await buyWithUsdc({ functionName: "buyTokensWithUSDC", args: [parseUnits(amount, 6)] });
      }
      notification.success("Chips purchased!");
      setAmount("");
    } catch (e: unknown) {
      notification.error((e as Error).message ?? "Transaction failed");
    }
  };

  const handleCashout = async () => {
    if (!tokenBalance || tokenBalance === 0n) {
      notification.error("No chips to cash out");
      return;
    }
    try {
      await withdraw({ functionName: "withdrawTokens", args: [tokenBalance] });
      notification.success("Cashed out to CLAWD!");
    } catch (e: unknown) {
      notification.error((e as Error).message ?? "Transaction failed");
    }
  };

  const preview = previewTokens();

  return (
    <div className="flex items-center flex-col grow pt-10">
      <div className="px-5 w-full max-w-2xl">
        <h1 className="text-center text-5xl font-bold mb-2">🦞 Claw Derby</h1>
        <p className="text-center text-base-content/70 mb-8">
          Lobster racing arcade on Base — buy chips, pick your racer, win CLAWD
        </p>

        {connectedAddress && (
          <div className="flex justify-center mb-6">
            <Address address={connectedAddress} chain={targetNetwork} />
          </div>
        )}

        {/* Chip Balance */}
        <div className="card bg-base-100 shadow-xl mb-6">
          <div className="card-body text-center">
            <h2 className="card-title justify-center text-2xl">Your Chips</h2>
            <div className="text-6xl font-bold text-primary my-4">
              {tokenBalance !== undefined ? tokenBalance.toString() : "—"}
            </div>
            <p className="text-base-content/60 text-sm">
              Max bet: {maxBet !== undefined ? maxBet.toString() : "—"} chips
            </p>
            {tokenBalance !== undefined && tokenBalance > 0n && (
              <button className="btn btn-outline btn-sm mt-2" onClick={handleCashout} disabled={withdrawing}>
                {withdrawing ? "Cashing out..." : "Cash out to CLAWD"}
              </button>
            )}
          </div>
        </div>

        {/* Buy Chips */}
        <div className="card bg-base-100 shadow-xl mb-6">
          <div className="card-body">
            <h2 className="card-title text-xl mb-4">Buy Chips</h2>

            <div className="tabs tabs-boxed mb-4">
              {(["CLAWD", "ETH", "USDC"] as BuyMode[]).map(mode => (
                <button
                  key={mode}
                  className={`tab ${buyMode === mode ? "tab-active" : ""}`}
                  onClick={() => {
                    setBuyMode(mode);
                    setAmount("");
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>

            <div className="text-sm text-base-content/60 mb-3">
              {buyMode === "CLAWD" && clawdRate && `1 CLAWD = ${clawdRate.toString()} chips`}
              {buyMode === "ETH" && ethRate && `1 ETH = ${ethRate.toString()} chips`}
              {buyMode === "USDC" && usdcRate && `1 USDC = ${usdcRate.toString()} chips`}
            </div>

            <div className="flex gap-2">
              <input
                type="number"
                placeholder={`Amount in ${buyMode}`}
                className="input input-bordered flex-1"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                min="0"
                step={buyMode === "USDC" ? "0.000001" : "0.0001"}
              />
              <button className="btn btn-primary" onClick={handleBuy} disabled={isPending || !connectedAddress}>
                {isPending ? "Buying..." : "Buy"}
              </button>
            </div>

            {preview !== null && <p className="text-sm text-success mt-2">≈ {preview} chips</p>}
          </div>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-4 mb-10">
          <a href="/race" className="card bg-base-100 shadow hover:shadow-lg transition-shadow cursor-pointer">
            <div className="card-body text-center py-6">
              <div className="text-3xl mb-2">🏁</div>
              <div className="font-bold">Race Now</div>
              <div className="text-xs text-base-content/60">Watch & bet on live races</div>
            </div>
          </a>
          <a href="/roster" className="card bg-base-100 shadow hover:shadow-lg transition-shadow cursor-pointer">
            <div className="card-body text-center py-6">
              <div className="text-3xl mb-2">🦞</div>
              <div className="font-bold">Lobster Roster</div>
              <div className="text-xs text-base-content/60">16 racers with unique stats</div>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
};

const Home: NextPage = () => (
  <ClientOnly>
    <HomeContent />
  </ClientOnly>
);

export default Home;
