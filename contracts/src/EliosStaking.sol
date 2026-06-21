// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EliosStaking
 * @notice Non-custodial $ELIOS staking contract for the EliosBase agent
 *         marketplace. Each agent (identified by an off-chain
 *         keccak256(agentId) digest) can have at most one active stake
 *         position. Stakers may withdraw their stake after a fixed
 *         cooldown, and the contract owner may slash positions in response
 *         to disputes resolved against the agent.
 *
 *         Slashed tokens default to the burn address (0x...dEaD), so the
 *         narrative for misbehavior is "supply shrinks". The owner can
 *         override the recipient per slash call when restitution to a
 *         specific party is more appropriate.
 *
 *         The contract is intentionally immutable: there is no proxy and
 *         no upgrade hatch. If a bug is found, deploy v2 and migrate state
 *         off-chain.
 *
 *         Slashing is owner-only because the dispute resolution flow lives
 *         off-chain in the EliosBase admin surface. The owner is expected
 *         to be a multisig before mainnet launch — see STAKING_OWNER_TODO.
 */
contract EliosStaking is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ─── Types ──────────────────────────────────────────────────

    struct Position {
        address staker;          // who deposited the stake
        uint128 amount;          // current liquid stake (slashed amount has already been removed)
        uint64 unlockAt;         // 0 = locked, >0 = cooldown initiated, withdraw allowed at unlockAt
        uint128 slashedTotal;    // historical slash amount (for transparency / passport display)
    }

    // ─── Constants ──────────────────────────────────────────────

    /// @notice Default destination for slashed tokens — Ethereum's
    ///         conventional burn address. The owner can override per call.
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    /// @notice Hard upper bound on the cooldown the owner can configure.
    ///         Prevents an owner from setting a cooldown so long it
    ///         effectively traps stakers' funds forever.
    uint64 public constant MAX_COOLDOWN = 30 days;

    // ─── Immutable state ────────────────────────────────────────

    IERC20 public immutable ELIOS;

    // ─── Mutable state ──────────────────────────────────────────

    /// @notice Length of the unstake cooldown, in seconds. Mutable so the
    ///         owner can shorten it if a longer-than-needed cooldown is
    ///         hurting participation. Bounded by MAX_COOLDOWN.
    uint64 public unstakeCooldown;

    /// @notice Per-agent stake position keyed by keccak256 of the
    ///         off-chain agent id. Off-chain code computes the digest the
    ///         same way (`keccak256(abi.encodePacked(agentId))`) so the
    ///         indexer can match events back to Supabase rows.
    mapping(bytes32 => Position) private _positions;

    /// @notice Cumulative ELIOS currently held by the contract that
    ///         belongs to active or unstaking positions. Tracked
    ///         explicitly so the contract can defend against accidental
    ///         direct transfers and detect accounting drift.
    uint256 public totalStaked;

    /// @notice Cumulative slashed ELIOS, across all positions and all
    ///         time. Public for transparency / dashboards.
    uint256 public totalSlashed;

    // ─── Events ─────────────────────────────────────────────────

    event Staked(
        bytes32 indexed agentDigest,
        address indexed staker,
        uint128 amount,
        uint128 newTotal
    );
    event UnstakeRequested(
        bytes32 indexed agentDigest,
        address indexed staker,
        uint64 unlockAt
    );
    event Withdrawn(
        bytes32 indexed agentDigest,
        address indexed staker,
        address indexed to,
        uint128 amount
    );
    event Slashed(
        bytes32 indexed agentDigest,
        address indexed recipient,
        uint128 amount,
        uint128 remaining,
        bytes32 reason
    );
    event UnstakeCooldownUpdated(uint64 oldCooldown, uint64 newCooldown);

    // ─── Errors ─────────────────────────────────────────────────

    error ZeroAmount();
    error PositionLocked();
    error CooldownNotElapsed();
    error CooldownTooLong();
    error NotStaker();
    error NoPosition();
    error InsufficientStake();
    error AlreadyUnstaking();

    // ─── Constructor ────────────────────────────────────────────

    /**
     * @param eliosToken Address of the deployed $ELIOS ERC20 on the same
     *                   chain as this contract.
     * @param initialOwner Address that may slash positions and tune the
     *                     cooldown. Should be a multisig in production.
     * @param initialCooldown Initial unstake cooldown in seconds.
     */
    constructor(address eliosToken, address initialOwner, uint64 initialCooldown)
        Ownable(initialOwner)
    {
        if (initialCooldown > MAX_COOLDOWN) revert CooldownTooLong();
        ELIOS = IERC20(eliosToken);
        unstakeCooldown = initialCooldown;
    }

    // ─── Staker actions ─────────────────────────────────────────

    /**
     * @notice Deposit ELIOS as a stake against a specific agent. The
     *         caller must have already approved this contract for
     *         `amount` (or use {stakeWithPermit}).
     *
     *         A position can only have one staker at a time. If the
     *         position already exists and the caller is the existing
     *         staker, the new amount is added to the existing stake. If
     *         the caller is *not* the existing staker, the call reverts —
     *         we do not allow multi-party staking on a single agent
     *         because slashing would have no fair allocation rule.
     *
     *         Adding to an existing position is rejected while the
     *         position is unstaking. The staker must withdraw, then
     *         re-stake. This prevents a "topping-up" attack where an
     *         operator who has just initiated cooldown adds more stake to
     *         immediately re-lock funds without serving a fresh cooldown.
     *
     * @param agentDigest keccak256 of the off-chain agent id (bytes)
     * @param amount      ELIOS amount in 18-decimal units
     */
    function stake(bytes32 agentDigest, uint128 amount) external nonReentrant {
        _stake(agentDigest, amount);
    }

    /**
     * @notice Same as {stake} but consumes an EIP-2612 permit signature in
     *         the same transaction so the staker doesn't need a separate
     *         `approve()` call. Useful because $ELIOS is an
     *         ERC20Permit token.
     *
     *         If the permit fails (e.g. front-running consumes the
     *         signature first), the call falls back to relying on the
     *         existing allowance — this matches the OpenZeppelin
     *         convention and avoids gratuitous reverts when permit was
     *         already consumed.
     */
    function stakeWithPermit(
        bytes32 agentDigest,
        uint128 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        try IERC20Permit(address(ELIOS)).permit(msg.sender, address(this), amount, deadline, v, r, s) {
            // permit consumed; fall through
        } catch {
            // signature already used or otherwise invalid; rely on
            // pre-existing allowance below
        }
        _stake(agentDigest, amount);
    }

    /**
     * @notice Begin the unstake cooldown for the caller's position.
     *         After `unstakeCooldown` seconds the caller may call
     *         {withdraw} to receive the (possibly slashed) remainder.
     *
     *         While unstaking, the position is still slashable. This is
     *         intentional: a misbehaving operator should not be able to
     *         escape consequence by initiating cooldown the moment a
     *         dispute is filed.
     */
    function requestUnstake(bytes32 agentDigest) external {
        Position storage p = _positions[agentDigest];
        if (p.amount == 0) revert NoPosition();
        if (msg.sender != p.staker) revert NotStaker();
        if (p.unlockAt != 0) revert AlreadyUnstaking();

        uint64 unlockAt = uint64(block.timestamp) + unstakeCooldown;
        p.unlockAt = unlockAt;

        emit UnstakeRequested(agentDigest, msg.sender, unlockAt);
    }

    /**
     * @notice Withdraw the (post-slash) remainder of an unstaking
     *         position. Only callable by the original staker, only after
     *         the cooldown has fully elapsed.
     *
     *         Sets the position to all zeros so the slot can be re-used
     *         for a fresh stake by the same or a different staker. The
     *         historical `slashedTotal` is intentionally cleared on
     *         withdraw — it represented the slashes incurred by the
     *         position that just exited, not the agent forever. Off-chain
     *         indexers retain the `Slashed` events for permanent history.
     *
     * @param to Recipient address. Defaults to the staker if `address(0)`.
     */
    function withdraw(bytes32 agentDigest, address to) external nonReentrant {
        Position storage p = _positions[agentDigest];
        if (p.amount == 0) revert NoPosition();
        if (msg.sender != p.staker) revert NotStaker();
        if (p.unlockAt == 0) revert PositionLocked();
        if (block.timestamp < p.unlockAt) revert CooldownNotElapsed();

        uint128 amount = p.amount;
        address recipient = to == address(0) ? msg.sender : to;

        // Effects: clear the slot before any external interaction.
        delete _positions[agentDigest];
        totalStaked -= amount;

        ELIOS.safeTransfer(recipient, amount);

        emit Withdrawn(agentDigest, msg.sender, recipient, amount);
    }

    // ─── Owner actions ──────────────────────────────────────────

    /**
     * @notice Slash a portion of a position. Only callable by the owner
     *         (the EliosBase admin multisig). Slashed tokens are sent to
     *         `recipient`, defaulting to the burn address when
     *         `recipient` is address(0).
     *
     *         The slash applies even if the position is already in
     *         cooldown. If the slash brings the position to zero, the
     *         slot is fully deleted so the staker has nothing left to
     *         withdraw — this is correct: a fully slashed position has
     *         lost everything it staked.
     *
     * @param agentDigest Position to slash
     * @param amount      Amount in 18-decimal ELIOS units to slash
     * @param recipient   Override destination for slashed tokens; pass
     *                    address(0) to burn (the default)
     * @param reason      Free-form 32-byte reason tag for off-chain
     *                    indexing (e.g. keccak256("dispute:task-123"))
     */
    function slash(
        bytes32 agentDigest,
        uint128 amount,
        address recipient,
        bytes32 reason
    ) external nonReentrant onlyOwner {
        if (amount == 0) revert ZeroAmount();
        Position storage p = _positions[agentDigest];
        if (p.amount == 0) revert NoPosition();
        if (amount > p.amount) revert InsufficientStake();

        // Effects.
        uint128 remaining = p.amount - amount;
        p.amount = remaining;
        // We deliberately do NOT cap slashedTotal — it can keep
        // accumulating across multiple slashes against the same position.
        p.slashedTotal += amount;
        totalStaked -= amount;
        totalSlashed += amount;

        address dest = recipient == address(0) ? BURN_ADDRESS : recipient;

        // Cache staker before potentially deleting the slot.
        bytes32 cachedDigest = agentDigest;
        if (remaining == 0) {
            // Position is fully slashed. Wipe the slot so a fresh
            // staker can start clean. The Slashed event below is the
            // canonical record; we don't need on-chain residue.
            delete _positions[agentDigest];
        }

        // Interaction.
        ELIOS.safeTransfer(dest, amount);

        emit Slashed(cachedDigest, dest, amount, remaining, reason);
    }

    /**
     * @notice Update the unstake cooldown. Only the owner can call.
     *         Bounded by MAX_COOLDOWN to protect stakers from being
     *         indefinitely trapped.
     *
     *         Existing in-flight unstake requests are NOT retroactively
     *         re-timed: their `unlockAt` was set at the moment the
     *         request was made and stays fixed. New requests use the new
     *         cooldown.
     */
    function setUnstakeCooldown(uint64 newCooldown) external onlyOwner {
        if (newCooldown > MAX_COOLDOWN) revert CooldownTooLong();
        emit UnstakeCooldownUpdated(unstakeCooldown, newCooldown);
        unstakeCooldown = newCooldown;
    }

    // ─── Views ──────────────────────────────────────────────────

    function positionOf(bytes32 agentDigest)
        external
        view
        returns (address staker, uint128 amount, uint64 unlockAt, uint128 slashedTotal)
    {
        Position memory p = _positions[agentDigest];
        return (p.staker, p.amount, p.unlockAt, p.slashedTotal);
    }

    /**
     * @notice True iff the staker is allowed to call {withdraw} for this
     *         position right now. Convenience for off-chain UI.
     */
    function isWithdrawable(bytes32 agentDigest) external view returns (bool) {
        Position memory p = _positions[agentDigest];
        return p.amount > 0 && p.unlockAt != 0 && block.timestamp >= p.unlockAt;
    }

    // ─── Internals ──────────────────────────────────────────────

    function _stake(bytes32 agentDigest, uint128 amount) internal {
        if (amount == 0) revert ZeroAmount();

        Position storage p = _positions[agentDigest];

        if (p.amount == 0) {
            // Fresh position.
            p.staker = msg.sender;
            p.amount = amount;
            // unlockAt and slashedTotal default to 0.
        } else {
            // Position exists; only the same staker may top up, and only
            // while the position is not unstaking.
            if (msg.sender != p.staker) revert NotStaker();
            if (p.unlockAt != 0) revert AlreadyUnstaking();
            // Safe because totalStaked is bounded by ELIOS total supply
            // (1e9 * 1e18) which fits comfortably in uint128.
            p.amount += amount;
        }

        totalStaked += amount;

        // Pull the tokens. Using safeTransferFrom protects against
        // non-standard ERC20s; ELIOS itself is well-behaved but we want
        // the contract to remain reusable for future tokens.
        ELIOS.safeTransferFrom(msg.sender, address(this), amount);

        emit Staked(agentDigest, msg.sender, amount, p.amount);
    }
}
