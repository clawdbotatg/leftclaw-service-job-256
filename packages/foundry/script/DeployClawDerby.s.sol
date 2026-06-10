// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DeployHelpers.s.sol";
import "../contracts/ClawDerby.sol";

/**
 * @notice Deploy script for ClawDerby — Lobster Racing Arcade
 *
 * Deployment order:
 * 1. Deploy ClawDerby (deployer is initial owner + initial settler)
 * 2. Register 16 lobsters
 * 3. Fund house reserve (1,000,000 tokens to cover initial player wins)
 * 4. Transfer ownership to client wallet (Ownable2Step — client must call acceptOwnership)
 *
 * Usage:
 *   yarn deploy --file DeployClawDerby.s.sol --network base
 *
 * After deploy, the client must call acceptOwnership() on the contract.
 * The owner should then call setSettler(backendSettlerAddress) with the
 * actual backend settler wallet.
 *
 * Rates (adjustable via setRates after deploy):
 *   clawdTokenRate = 100  → 100 game tokens per 1 CLAWD
 *   ethTokenRate = 10000  → 10000 game tokens per 1 ETH
 *   usdcTokenRate = 100   → 100 game tokens per 1 USDC
 */
contract DeployClawDerby is ScaffoldETHDeploy {
    // On-chain addresses (Base mainnet)
    address constant CLAWD_TOKEN = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;
    address constant USDC_TOKEN = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // Client wallet — will receive contract ownership
    address constant CLIENT = 0xFE968dE21eb0E77d5877477C31a04A3075c0086E;

    function run() external ScaffoldEthDeployerRunner {
        // Deploy ClawDerby
        ClawDerby derby = new ClawDerby(
            CLAWD_TOKEN,
            USDC_TOKEN,
            deployer, // initial settler = deployer (owner sets real settler after deploy)
            100,      // clawdTokenRate: 100 game tokens per 1 CLAWD
            10000,    // ethTokenRate: 10000 game tokens per 1 ETH
            100,      // usdcTokenRate: 100 game tokens per 1 USDC (6 dec)
            500,      // houseEdgeBps: 5%
            10000     // maxBetTokens: 10000 chips max bet
        );

        // Fund house reserve with initial chips for covering player wins
        derby.fundHouseReserve(1_000_000);

        // Register all 16 lobsters
        _registerLobsters(derby);

        // Transfer ownership to client (Ownable2Step — client calls acceptOwnership)
        derby.transferOwnership(CLIENT);

        console.log("ClawDerby deployed at:", address(derby));
        console.log("Ownership transfer initiated to:", CLIENT);
        console.log("Client must call acceptOwnership() to complete transfer");
        console.log("Owner must call setSettler(backendAddress) after accepting ownership");
    }

    function _registerLobsters(ClawDerby derby) internal {
        derby.registerLobster("Crimson Crusher",    90, 75, 85, 60, "Ironclad",          "Berserker");
        derby.registerLobster("Sheldon the Swift",  95, 65, 50, 80, "Lightning Dash",    "Agile");
        derby.registerLobster("Baron Von Claw",     70, 90, 80, 55, "Noble Blood",       "Endurance");
        derby.registerLobster("Lucky Pincer",       65, 70, 55, 99, "Fortune's Favorite","Clutch");
        derby.registerLobster("The Iron Tide",      75, 95, 70, 50, "Unstoppable",       "Wave Form");
        derby.registerLobster("Neon Snapper",       88, 60, 65, 77, "Electrified",       "Speed Burst");
        derby.registerLobster("Duchess Claw",       72, 82, 58, 88, "Royal Grace",       "Elegant");
        derby.registerLobster("Rusty Rampage",      82, 78, 95, 45, "Battle Scarred",    "Rage Mode");
        derby.registerLobster("Pearl Runner",       91, 68, 45, 86, "Pearl White",       "Smooth Glide");
        derby.registerLobster("The Kraken Jr.",     68, 88, 90, 64, "Legendary Spawn",   "Tentacle Whip");
        derby.registerLobster("Sapphire Snap",      85, 72, 62, 81, "Crystal Focus",     "Precision");
        derby.registerLobster("Ol' Barnacle",       60, 99, 68, 73, "Weathered",         "Never Say Die");
        derby.registerLobster("Blitz Claw",         98, 55, 75, 72, "Afterburner",       "Sprint King");
        derby.registerLobster("Madame Pincer",      78, 85, 72, 85, "Cunning",           "Strategic");
        derby.registerLobster("The Undertow",       73, 92, 78, 57, "Deep Current",      "Relentless");
        derby.registerLobster("Captain Scarlet",    86, 76, 83, 68, "Sea Captain",       "Veteran");
    }
}
