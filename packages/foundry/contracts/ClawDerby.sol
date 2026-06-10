// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ClawDerby
 * @notice Lobster racing arcade game on Base. Players buy chips with CLAWD/ETH/USDC,
 *         race via an off-chain settler, and cash out back to CLAWD.
 *         The CLAWD vault must always remain solvent against total player chip balances.
 */
contract ClawDerby is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    IERC20 public clawdToken;
    IERC20 public usdcToken;
    address public settler;

    mapping(address => uint256) public tokenBalance;
    uint256 public totalPlayerTokens;
    uint256 public houseTokenReserve;

    uint256 public clawVaultClawd;
    uint256 public clawVaultETH;
    uint256 public clawVaultUSDC;

    /// @notice Game tokens minted per 1 CLAWD (18 decimals). e.g. 100 = 100 tokens per CLAWD
    uint256 public clawdTokenRate;
    /// @notice Game tokens minted per 1 ETH (18 decimals). e.g. 10000 = 10000 tokens per ETH
    uint256 public ethTokenRate;
    /// @notice Game tokens minted per 1 USDC (6 decimals). e.g. 100 = 100 tokens per USDC
    uint256 public usdcTokenRate;

    uint256 public houseEdgeBps;
    uint256 public maxBetTokens;

    mapping(uint256 => bytes32) public raceProofHashes;
    mapping(uint256 => bool) public raceProofLogged;

    struct Lobster {
        uint256 id;
        string name;
        uint8 speed;
        uint8 stamina;
        uint8 aggression;
        uint8 luck;
        string trait1;
        string trait2;
        bool active;
    }

    mapping(uint256 => Lobster) public lobsters;
    uint256 public lobsterCount;
    uint256 public activeLobsterCount;

    uint256 public constant MAX_LOBSTERS = 16;
    uint256 public constant MIN_ACTIVE_LOBSTERS = 8;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event TokensPurchased(address indexed player, uint256 tokenAmount, string currency);
    event TokensWithdrawn(address indexed player, uint256 tokenAmount, uint256 clawdAmount);
    event SessionSettled(address indexed player, int256 netTokenDelta);
    event RaceProofLogged(uint256 indexed raceId, bytes32 proofHash);
    event LobsterRegistered(uint256 indexed id, string name);
    event LobsterRetired(uint256 indexed id);
    event SettlerUpdated(address indexed newSettler);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address _clawdToken,
        address _usdcToken,
        address _settler,
        uint256 _clawdTokenRate,
        uint256 _ethTokenRate,
        uint256 _usdcTokenRate,
        uint256 _houseEdgeBps,
        uint256 _maxBetTokens
    ) Ownable(msg.sender) {
        require(_clawdToken != address(0), "Zero CLAWD address");
        require(_usdcToken != address(0), "Zero USDC address");
        require(_settler != address(0), "Zero settler address");
        require(_clawdTokenRate > 0 && _ethTokenRate > 0 && _usdcTokenRate > 0, "Rates must be positive");
        require(_houseEdgeBps <= 1000, "Max house edge 10%");

        clawdToken = IERC20(_clawdToken);
        usdcToken = IERC20(_usdcToken);
        settler = _settler;
        clawdTokenRate = _clawdTokenRate;
        ethTokenRate = _ethTokenRate;
        usdcTokenRate = _usdcTokenRate;
        houseEdgeBps = _houseEdgeBps;
        maxBetTokens = _maxBetTokens;
    }

    // -------------------------------------------------------------------------
    // Chip Purchases
    // -------------------------------------------------------------------------

    /// @notice Buy game chips with CLAWD tokens
    function buyTokensWithCLAWD(uint256 clawdAmount) external nonReentrant whenNotPaused {
        require(clawdAmount > 0, "Zero amount");
        uint256 tokens = (clawdAmount * clawdTokenRate) / 1e18;
        require(tokens > 0, "Amount too small");

        // Interaction: transfer CLAWD in
        clawdToken.safeTransferFrom(msg.sender, address(this), clawdAmount);

        // Effects
        clawVaultClawd += clawdAmount;
        tokenBalance[msg.sender] += tokens;
        totalPlayerTokens += tokens;

        // Solvency: vault CLAWD (scaled) must cover all player chips
        require(
            clawVaultClawd * clawdTokenRate >= totalPlayerTokens * 1e18,
            "Vault insolvent"
        );

        emit TokensPurchased(msg.sender, tokens, "CLAWD");
    }

    /// @notice Buy game chips with ETH
    function buyTokensWithETH() external payable nonReentrant whenNotPaused {
        require(msg.value > 0, "Zero ETH");
        uint256 tokens = (msg.value * ethTokenRate) / 1e18;
        require(tokens > 0, "Amount too small");

        // Effects
        clawVaultETH += msg.value;
        tokenBalance[msg.sender] += tokens;
        totalPlayerTokens += tokens;

        // ETH/USDC buys: CLAWD vault must still cover ALL player chips
        require(
            clawVaultClawd * clawdTokenRate >= totalPlayerTokens * 1e18,
            "CLAWD vault insufficient for ETH buy"
        );

        emit TokensPurchased(msg.sender, tokens, "ETH");
    }

    /// @notice Buy game chips with USDC
    function buyTokensWithUSDC(uint256 usdcAmount) external nonReentrant whenNotPaused {
        require(usdcAmount > 0, "Zero amount");
        // usdcAmount is in 6 decimals
        uint256 tokens = (usdcAmount * usdcTokenRate) / 1e6;
        require(tokens > 0, "Amount too small");

        // Interaction: transfer USDC in
        usdcToken.safeTransferFrom(msg.sender, address(this), usdcAmount);

        // Effects
        clawVaultUSDC += usdcAmount;
        tokenBalance[msg.sender] += tokens;
        totalPlayerTokens += tokens;

        // ETH/USDC buys: CLAWD vault must still cover ALL player chips
        require(
            clawVaultClawd * clawdTokenRate >= totalPlayerTokens * 1e18,
            "CLAWD vault insufficient for USDC buy"
        );

        emit TokensPurchased(msg.sender, tokens, "USDC");
    }

    // -------------------------------------------------------------------------
    // Chip Withdrawal (cashout → CLAWD)
    // -------------------------------------------------------------------------

    /// @notice Withdraw chips — paid out in CLAWD
    function withdrawTokens(uint256 tokenAmount) external nonReentrant whenNotPaused {
        require(tokenAmount > 0, "Zero amount");
        require(tokenBalance[msg.sender] >= tokenAmount, "Insufficient chip balance");

        // Calculate CLAWD to send: tokenAmount * 1e18 / clawdTokenRate
        uint256 clawdAmount = (tokenAmount * 1e18) / clawdTokenRate;
        require(clawVaultClawd >= clawdAmount, "Vault has insufficient CLAWD");

        // Effects (CEI: update state before external call)
        tokenBalance[msg.sender] -= tokenAmount;
        totalPlayerTokens -= tokenAmount;
        clawVaultClawd -= clawdAmount;

        // Interaction: send CLAWD to player
        clawdToken.safeTransfer(msg.sender, clawdAmount);

        emit TokensWithdrawn(msg.sender, tokenAmount, clawdAmount);
    }

    // -------------------------------------------------------------------------
    // Session Settlement (settler only)
    // -------------------------------------------------------------------------

    /// @notice Apply race results to player's on-chain chip balance
    /// @param player The player's address
    /// @param netTokenDelta Positive = player won, negative = player lost
    function settleSession(address player, int256 netTokenDelta) external nonReentrant {
        require(msg.sender == settler, "Only settler");
        require(player != address(0), "Zero player address");

        if (netTokenDelta > 0) {
            uint256 gain = uint256(netTokenDelta);
            require(houseTokenReserve >= gain, "House reserve insufficient");
            // Effects
            houseTokenReserve -= gain;
            tokenBalance[player] += gain;
            totalPlayerTokens += gain;
        } else if (netTokenDelta < 0) {
            uint256 loss = uint256(-netTokenDelta);
            // Cap loss at player's actual balance (cannot underflow)
            uint256 actualLoss = loss > tokenBalance[player] ? tokenBalance[player] : loss;
            // Effects
            tokenBalance[player] -= actualLoss;
            totalPlayerTokens -= actualLoss;
            houseTokenReserve += actualLoss;
        }

        emit SessionSettled(player, netTokenDelta);
    }

    /// @notice Log a race proof hash on-chain. Cannot be overwritten.
    function logRaceProof(uint256 raceId, bytes32 proofHash) external {
        require(msg.sender == settler, "Only settler");
        require(!raceProofLogged[raceId], "Proof already logged");

        raceProofHashes[raceId] = proofHash;
        raceProofLogged[raceId] = true;

        emit RaceProofLogged(raceId, proofHash);
    }

    // -------------------------------------------------------------------------
    // Vault Funding (owner only)
    // -------------------------------------------------------------------------

    function fundVaultWithCLAWD(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Zero amount");
        clawdToken.safeTransferFrom(msg.sender, address(this), amount);
        clawVaultClawd += amount;
    }

    function fundVaultWithETH() external payable onlyOwner {
        require(msg.value > 0, "Zero ETH");
        clawVaultETH += msg.value;
    }

    function fundVaultWithUSDC(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Zero amount");
        usdcToken.safeTransferFrom(msg.sender, address(this), amount);
        clawVaultUSDC += amount;
    }

    /// @notice Fund the house token reserve (for covering player wins)
    function fundHouseReserve(uint256 amount) external onlyOwner {
        require(amount > 0, "Zero amount");
        houseTokenReserve += amount;
    }

    // -------------------------------------------------------------------------
    // Vault Withdrawal (owner only)
    // -------------------------------------------------------------------------

    /// @notice Withdraw CLAWD from vault. Solvency check enforced.
    function withdrawVaultCLAWD(uint256 amount) external onlyOwner nonReentrant {
        require(clawVaultClawd >= amount, "Insufficient vault CLAWD");
        uint256 remaining = clawVaultClawd - amount;
        require(
            remaining * clawdTokenRate >= totalPlayerTokens * 1e18,
            "Would break solvency"
        );
        clawVaultClawd -= amount;
        clawdToken.safeTransfer(msg.sender, amount);
    }

    function withdrawVaultETH(uint256 amount) external onlyOwner nonReentrant {
        require(clawVaultETH >= amount, "Insufficient vault ETH");
        clawVaultETH -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "ETH transfer failed");
    }

    function withdrawVaultUSDC(uint256 amount) external onlyOwner nonReentrant {
        require(clawVaultUSDC >= amount, "Insufficient vault USDC");
        clawVaultUSDC -= amount;
        usdcToken.safeTransfer(msg.sender, amount);
    }

    // -------------------------------------------------------------------------
    // Lobster Roster (owner only)
    // -------------------------------------------------------------------------

    function registerLobster(
        string calldata name,
        uint8 speed,
        uint8 stamina,
        uint8 aggression,
        uint8 luck,
        string calldata trait1,
        string calldata trait2
    ) external onlyOwner {
        require(lobsterCount < MAX_LOBSTERS, "Max lobsters reached");
        uint256 id = ++lobsterCount;
        lobsters[id] = Lobster({
            id: id,
            name: name,
            speed: speed,
            stamina: stamina,
            aggression: aggression,
            luck: luck,
            trait1: trait1,
            trait2: trait2,
            active: true
        });
        activeLobsterCount++;
        emit LobsterRegistered(id, name);
    }

    function retireLobster(uint256 id) external onlyOwner {
        require(id > 0 && id <= lobsterCount, "Invalid lobster id");
        require(lobsters[id].active, "Already retired");
        require(activeLobsterCount > MIN_ACTIVE_LOBSTERS, "Would drop below minimum active lobsters");
        lobsters[id].active = false;
        activeLobsterCount--;
        emit LobsterRetired(id);
    }

    function updateLobsterStats(
        uint256 id,
        uint8 speed,
        uint8 stamina,
        uint8 aggression,
        uint8 luck
    ) external onlyOwner {
        require(id > 0 && id <= lobsterCount, "Invalid lobster id");
        Lobster storage l = lobsters[id];
        l.speed = speed;
        l.stamina = stamina;
        l.aggression = aggression;
        l.luck = luck;
    }

    // -------------------------------------------------------------------------
    // Admin Setters (owner only)
    // -------------------------------------------------------------------------

    function setRates(uint256 _clawdRate, uint256 _ethRate, uint256 _usdcRate) external onlyOwner {
        require(_clawdRate > 0 && _ethRate > 0 && _usdcRate > 0, "Rates must be positive");
        clawdTokenRate = _clawdRate;
        ethTokenRate = _ethRate;
        usdcTokenRate = _usdcRate;
    }

    function setSettler(address newSettler) external onlyOwner {
        require(newSettler != address(0), "Zero settler address");
        settler = newSettler;
        emit SettlerUpdated(newSettler);
    }

    function setHouseEdge(uint256 bps) external onlyOwner {
        require(bps <= 1000, "Max 10%");
        houseEdgeBps = bps;
    }

    function setMaxBet(uint256 maxBet) external onlyOwner {
        maxBetTokens = maxBet;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // -------------------------------------------------------------------------
    // View Helpers
    // -------------------------------------------------------------------------

    function getLobster(uint256 id) external view returns (Lobster memory) {
        require(id > 0 && id <= lobsterCount, "Invalid lobster id");
        return lobsters[id];
    }

    function getAllLobsters() external view returns (Lobster[] memory) {
        Lobster[] memory result = new Lobster[](lobsterCount);
        for (uint256 i = 0; i < lobsterCount; i++) {
            result[i] = lobsters[i + 1];
        }
        return result;
    }

    function isSolvent() external view returns (bool) {
        return clawVaultClawd * clawdTokenRate >= totalPlayerTokens * 1e18;
    }

    // -------------------------------------------------------------------------
    // Receive ETH
    // -------------------------------------------------------------------------

    receive() external payable {
        clawVaultETH += msg.value;
    }
}
