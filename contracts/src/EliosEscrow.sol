// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EliosEscrow
 * @notice Minimal escrow contract for EliosBase AI agent marketplace.
 *         Locks ETH per-task, releases to agent operator on completion, or refunds depositor.
 */
contract EliosEscrow {
    // ─── Types ──────────────────────────────────────────────────
    enum State { None, Locked, Released, Refunded }

    struct Escrow {
        address depositor;
        bytes32 agentId;
        uint256 amount;
        State state;
    }

    // ─── State ──────────────────────────────────────────────────
    address public immutable owner;
    mapping(bytes32 => Escrow) public escrows;

    // ─── Events ─────────────────────────────────────────────────
    event FundsLocked(bytes32 indexed taskId, bytes32 indexed agentId, address depositor, uint256 amount);
    event FundsReleased(bytes32 indexed taskId, address recipient, uint256 amount);
    event FundsRefunded(bytes32 indexed taskId, address depositor, uint256 amount);

    // ─── Errors ─────────────────────────────────────────────────
    error NotAuthorized();
    error InvalidAmount();
    error InvalidState();
    error TransferFailed();

    // ─── Reentrancy guard ───────────────────────────────────────
    uint256 private _locked = 1;
    modifier nonReentrant() {
        require(_locked == 1, "ReentrancyGuard: reentrant call");
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor() {
        owner = msg.sender;
    }

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
        if (msg.sender != e.depositor && msg.sender != owner) revert NotAuthorized();

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
        if (msg.sender != e.depositor && msg.sender != owner) revert NotAuthorized();

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
        State state
    ) {
        Escrow memory e = escrows[taskId];
        return (e.depositor, e.agentId, e.amount, e.state);
    }

    // Reject direct ETH sends
    receive() external payable { revert(); }
    fallback() external payable { revert(); }
}
