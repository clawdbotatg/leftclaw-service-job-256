// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/ClawDerby.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private _dec;

    constructor(string memory name, string memory sym, uint8 dec) ERC20(name, sym) {
        _dec = dec;
        _mint(msg.sender, 10_000_000 * 10 ** dec);
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract ClawDerbyTest is Test {
    ClawDerby derby;
    MockERC20 clawd;
    MockERC20 usdc;

    address owner = address(this);
    address settler = address(0x1111);
    address player = address(0x2222);
    address player2 = address(0x4444);
    address hacker = address(0x3333);

    uint256 constant CLAWD_RATE = 100; // 100 tokens per CLAWD
    uint256 constant ETH_RATE = 10_000; // 10000 tokens per ETH
    uint256 constant USDC_RATE = 100; // 100 tokens per USDC

    function setUp() public {
        clawd = new MockERC20("CLAWD", "CLAWD", 18);
        usdc = new MockERC20("USDC", "USDC", 6);

        derby = new ClawDerby(
            address(clawd),
            address(usdc),
            settler,
            CLAWD_RATE,
            ETH_RATE,
            USDC_RATE,
            500, // 5% house edge
            10_000 // max bet
        );

        // Fund vault with CLAWD so solvency checks pass
        clawd.approve(address(derby), type(uint256).max);
        derby.fundVaultWithCLAWD(100_000 ether); // backs 10,000,000 tokens

        // Fund house reserve for settler tests
        derby.fundHouseReserve(1_000_000);

        // Fund player with tokens
        clawd.transfer(player, 1000 ether);
        usdc.transfer(player, 10_000 * 1e6);
        vm.deal(player, 100 ether);

        // Player approvals
        vm.startPrank(player);
        clawd.approve(address(derby), type(uint256).max);
        usdc.approve(address(derby), type(uint256).max);
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // Chip Purchases
    // -------------------------------------------------------------------------

    function testBuyWithCLAWD() public {
        uint256 clawdIn = 10 ether; // 10 CLAWD
        uint256 expectedTokens = clawdIn * CLAWD_RATE / 1e18; // 1000 tokens

        vm.prank(player);
        derby.buyTokensWithCLAWD(clawdIn);

        assertEq(derby.tokenBalance(player), expectedTokens, "Token balance mismatch");
        assertEq(derby.totalPlayerTokens(), expectedTokens, "Total player tokens mismatch");
        assertEq(derby.clawVaultClawd(), 100_000 ether + clawdIn, "Vault CLAWD mismatch");
    }

    function testBuyWithETH() public {
        uint256 ethIn = 1 ether;
        uint256 expectedTokens = ethIn * ETH_RATE / 1e18; // 10000 tokens

        vm.prank(player);
        derby.buyTokensWithETH{value: ethIn}();

        assertEq(derby.tokenBalance(player), expectedTokens, "Token balance mismatch");
        assertEq(derby.clawVaultETH(), ethIn, "Vault ETH mismatch");
    }

    function testBuyWithUSDC() public {
        uint256 usdcIn = 100 * 1e6; // 100 USDC
        uint256 expectedTokens = usdcIn * USDC_RATE / 1e6; // 10000 tokens

        vm.prank(player);
        derby.buyTokensWithUSDC(usdcIn);

        assertEq(derby.tokenBalance(player), expectedTokens, "Token balance mismatch");
        assertEq(derby.clawVaultUSDC(), usdcIn, "Vault USDC mismatch");
    }

    function testETHBuyRevertsIfCLAWDReserveInsufficient() public {
        // Deploy tinyDerby with NO initial vault funding
        ClawDerby tinyDerby = new ClawDerby(
            address(clawd),
            address(usdc),
            settler,
            CLAWD_RATE,
            ETH_RATE,
            USDC_RATE,
            500,
            10_000
        );

        // Player buys 1 CLAWD → 100 tokens. vault = 1 CLAWD (backs exactly 100 tokens)
        vm.startPrank(player);
        clawd.approve(address(tinyDerby), type(uint256).max);
        tinyDerby.buyTokensWithCLAWD(1 ether);

        // ETH buy of 0.001 ETH → 10 more tokens → total = 110
        // But vault only has 1 CLAWD (backs 100 tokens) → solvency fails
        vm.expectRevert("CLAWD vault insufficient for ETH buy");
        tinyDerby.buyTokensWithETH{value: 0.001 ether}();
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // Cashout
    // -------------------------------------------------------------------------

    function testCashoutWorks() public {
        // First buy chips
        uint256 clawdIn = 10 ether;
        vm.prank(player);
        derby.buyTokensWithCLAWD(clawdIn);

        uint256 tokens = derby.tokenBalance(player);
        uint256 clawdBefore = clawd.balanceOf(player);

        // Withdraw half
        uint256 withdrawTokens = tokens / 2;
        vm.prank(player);
        derby.withdrawTokens(withdrawTokens);

        uint256 expectedClawd = withdrawTokens * 1e18 / CLAWD_RATE;
        assertEq(derby.tokenBalance(player), tokens - withdrawTokens, "Remaining tokens mismatch");
        assertEq(clawd.balanceOf(player) - clawdBefore, expectedClawd, "CLAWD received mismatch");
    }

    // -------------------------------------------------------------------------
    // Vault Solvency — Owner Cannot Drain Player-Backed CLAWD
    // -------------------------------------------------------------------------

    function testOwnerCannotWithdrawPlayerBackedCLAWD() public {
        // Player buys chips, backing some CLAWD
        vm.prank(player);
        derby.buyTokensWithCLAWD(10 ether); // 1000 tokens, backed by 10 CLAWD

        // Cache vault amount BEFORE expectRevert (view calls count as "next call" in Foundry)
        uint256 vaultAmount = derby.clawVaultClawd();

        // Try to withdraw all vault CLAWD — leaves 0 CLAWD backing 1000 tokens → solvency fails
        vm.expectRevert("Would break solvency");
        derby.withdrawVaultCLAWD(vaultAmount);
    }

    // -------------------------------------------------------------------------
    // Session Settlement
    // -------------------------------------------------------------------------

    function testOnlySettlerCanSettleSession() public {
        vm.prank(hacker);
        vm.expectRevert("Only settler");
        derby.settleSession(player, 100);
    }

    function testSettleSessionGain() public {
        // Player has no chips initially
        uint256 houseBefore = derby.houseTokenReserve();
        uint256 gain = 500;

        vm.prank(settler);
        derby.settleSession(player, int256(gain));

        assertEq(derby.tokenBalance(player), gain, "Player should have gained tokens");
        assertEq(derby.houseTokenReserve(), houseBefore - gain, "House should have lost tokens");
        assertEq(derby.totalPlayerTokens(), gain, "Total player tokens mismatch");
    }

    function testSettleSessionLoss() public {
        // Give player some chips first
        vm.prank(player);
        derby.buyTokensWithCLAWD(10 ether); // 1000 tokens

        uint256 playerBefore = derby.tokenBalance(player);
        uint256 houseBefore = derby.houseTokenReserve();
        uint256 loss = 200;

        vm.prank(settler);
        derby.settleSession(player, -int256(loss));

        assertEq(derby.tokenBalance(player), playerBefore - loss, "Player tokens mismatch");
        assertEq(derby.houseTokenReserve(), houseBefore + loss, "House tokens mismatch");
    }

    function testSettleSessionCannotUnderflowPlayerBalance() public {
        // Player has 100 chips
        vm.prank(settler);
        derby.settleSession(player, 100);

        uint256 playerBalance = derby.tokenBalance(player);
        uint256 houseBefore = derby.houseTokenReserve();

        // Try to take 1000 chips (more than balance) — should only take 100
        vm.prank(settler);
        derby.settleSession(player, -1000);

        assertEq(derby.tokenBalance(player), 0, "Player balance should be 0");
        assertEq(derby.houseTokenReserve(), houseBefore + playerBalance, "House should gain only actual balance");
    }

    // -------------------------------------------------------------------------
    // Pause
    // -------------------------------------------------------------------------

    function testPauseBlocksBuysAndWithdrawals() public {
        derby.pause();

        vm.prank(player);
        vm.expectRevert();
        derby.buyTokensWithCLAWD(1 ether);

        vm.prank(player);
        vm.expectRevert();
        derby.buyTokensWithETH{value: 1 ether}();

        vm.prank(player);
        vm.expectRevert();
        derby.buyTokensWithUSDC(1e6);

        vm.prank(player);
        vm.expectRevert();
        derby.withdrawTokens(1);
    }

    // -------------------------------------------------------------------------
    // Lobster Roster
    // -------------------------------------------------------------------------

    function testLobsterRosterMax16() public {
        // Register 16 lobsters
        for (uint8 i = 0; i < 16; i++) {
            derby.registerLobster(
                string(abi.encodePacked("Lobster ", i)),
                i + 1, i + 1, i + 1, i + 1,
                "trait1", "trait2"
            );
        }

        // 17th should revert
        vm.expectRevert("Max lobsters reached");
        derby.registerLobster("Lobster 17", 50, 50, 50, 50, "t1", "t2");
    }

    function testCannotRetireBelowMinActive() public {
        // Register 8 lobsters (MIN_ACTIVE_LOBSTERS)
        for (uint8 i = 0; i < 8; i++) {
            derby.registerLobster(
                string(abi.encodePacked("Lobster ", i)),
                i + 1, i + 1, i + 1, i + 1,
                "trait1", "trait2"
            );
        }
        // 8 active — trying to retire any should revert
        vm.expectRevert("Would drop below minimum active lobsters");
        derby.retireLobster(1);
    }

    // -------------------------------------------------------------------------
    // Race Proofs
    // -------------------------------------------------------------------------

    function testRaceProofCannotBeOverwritten() public {
        bytes32 proof1 = keccak256("race1proof");
        bytes32 proof2 = keccak256("race1proof_different");

        vm.prank(settler);
        derby.logRaceProof(1, proof1);

        assertEq(derby.raceProofHashes(1), proof1);
        assertTrue(derby.raceProofLogged(1));

        // Second log for same raceId must revert
        vm.prank(settler);
        vm.expectRevert("Proof already logged");
        derby.logRaceProof(1, proof2);
    }
}
