// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EliosEscrow
 * @notice Escrow contract for EliosBase AI agent marketplace.
 *         Locks ETH per-task, supports release, refund, disputes, and time-based recovery.
 */
contract EliosEscrow is ReentrancyGuard, Ownable {
    // ─── Types ──────────────────────────────────────────────────
    enum State { None, Locked, Released, Refunded, Disputed }

    struct Escrow {
        address depositor;
        bytes32 agentId;
        uint256 amount;
        uint256 lockedAt;
        State state;
    }

    // ─── Constants ──────────────────────────────────────────────
    uint256 public constant MAX_LOCK_DURATION = 30 days;

    // ─── State ──────────────────────────────────────────────────
    mapping(bytes32 => Escrow) public escrows;

    // ─── Events ─────────────────────────────────────────────────
    event FundsLocked(bytes32 indexed taskId, bytes32 indexed agentId, address depositor, uint256 amount);
    event FundsReleased(bytes32 indexed taskId, address recipient, uint256 amount);
    event FundsRefunded(bytes32 indexed taskId, address depositor, uint256 amount);
    event EscrowDisputed(bytes32 indexed taskId, address initiator);
    event DisputeResolved(bytes32 indexed taskId, address recipient, uint256 recipientAmount, address depositor, uint256 depositorAmount);

    // ─── Errors ─────────────────────────────────────────────────
    error NotAuthorized();
    error InvalidAmount();
    error InvalidState();
    error TransferFailed();
    error LockNotExpired();
    error InvalidSplit();

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Lock ETH in escrow for a task.
     * @param taskId  Unique task identifier (bytes32-encoded string)
     * @param agentId Unique agent identifier (bytes32-encoded string)
     */
    function lockFunds(bytes32 taskId, bytes32 agentId) external payable nonReentrant {
        if (msg.value == 0) revert InvalidAmount();
        if (escrows[taskId].state != State.None) revert InvalidState();

        escrows[taskId] = Escrow({
            depositor: msg.sender,
            agentId: agentId,
            amount: msg.value,
            lockedAt: block.timestamp,
            state: State.Locked
        });

        emit FundsLocked(taskId, agentId, msg.sender, msg.value);
    }

    /**
     * @notice Release escrowed funds to a recipient (agent operator).
     *         Only the original depositor or contract owner can call.
     * @param taskId    The task whose escrow to release
     * @param recipient Address to receive the funds
     */
    function releaseFunds(bytes32 taskId, address payable recipient) external nonReentrant {
        Escrow storage e = escrows[taskId];
        if (e.state != State.Locked) revert InvalidState();
        if (msg.sender != e.depositor && msg.sender != owner()) revert NotAuthorized();

        uint256 amount = e.amount;
        e.state = State.Released;
        e.amount = 0;

        (bool ok, ) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit FundsReleased(taskId, recipient, amount);
    }

    /**
     * @notice Refund escrowed funds back to the depositor.
     *         Only the original depositor or contract owner can call.
     * @param taskId The task whose escrow to refund
     */
    function refund(bytes32 taskId) external nonReentrant {
        Escrow storage e = escrows[taskId];
        if (e.state != State.Locked) revert InvalidState();
        if (msg.sender != e.depositor && msg.sender != owner()) revert NotAuthorized();

        uint256 amount = e.amount;
        address depositor = e.depositor;
        e.state = State.Refunded;
        e.amount = 0;

        (bool ok, ) = payable(depositor).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit FundsRefunded(taskId, depositor, amount);
    }

    /**
     * @notice Open a dispute on a locked escrow.
     *         Only the depositor or contract owner can dispute.
     * @param taskId The task to dispute
     */
    function disputeEscrow(bytes32 taskId) external {
        Escrow storage e = escrows[taskId];
        if (e.state != State.Locked) revert InvalidState();
        if (msg.sender != e.depositor && msg.sender != owner()) revert NotAuthorized();

        e.state = State.Disputed;
        emit EscrowDisputed(taskId, msg.sender);
    }

    /**
     * @notice Resolve a dispute by splitting funds between recipient and depositor.
     *         Only the contract owner can resolve disputes.
     * @param taskId          The disputed task
     * @param recipient       Address to receive the agent's share
     * @param recipientShare  Amount to send to the recipient (agent)
     */
    function resolveDispute(
        bytes32 taskId,
        address payable recipient,
        uint256 recipientShare
    ) external nonReentrant onlyOwner {
        Escrow storage e = escrows[taskId];
        if (e.state != State.Disputed) revert InvalidState();

        uint256 total = e.amount;
        if (recipientShare > total) revert InvalidSplit();

        uint256 depositorShare = total - recipientShare;
        e.state = State.Released;
        e.amount = 0;

        if (recipientShare > 0) {
            (bool ok1, ) = recipient.call{value: recipientShare}("");
            if (!ok1) revert TransferFailed();
        }

        if (depositorShare > 0) {
            (bool ok2, ) = payable(e.depositor).call{value: depositorShare}("");
            if (!ok2) revert TransferFailed();
        }

        emit DisputeResolved(taskId, recipient, recipientShare, e.depositor, depositorShare);
    }

    /**
     * @notice Auto-refund if the escrow has been locked past MAX_LOCK_DURATION.
     *         Anyone can call this to trigger the refund.
     * @param taskId The expired task
     */
    function expiredRefund(bytes32 taskId) external nonReentrant {
        Escrow storage e = escrows[taskId];
        if (e.state != State.Locked) revert InvalidState();
        if (block.timestamp < e.lockedAt + MAX_LOCK_DURATION) revert LockNotExpired();

        uint256 amount = e.amount;
        address depositor = e.depositor;
        e.state = State.Refunded;
        e.amount = 0;

        (bool ok, ) = payable(depositor).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit FundsRefunded(taskId, depositor, amount);
    }

    /**
     * @notice View the escrow state for a task.
     */
    function getEscrow(bytes32 taskId) external view returns (
        address depositor,
        bytes32 agentId,
        uint256 amount,
        uint256 lockedAt,
        State state
    ) {
        Escrow memory e = escrows[taskId];
        return (e.depositor, e.agentId, e.amount, e.lockedAt, e.state);
    }

    // Reject direct ETH sends
    receive() external payable { revert(); }
    fallback() external payable { revert(); }
}
