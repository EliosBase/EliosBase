// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/src/EliosEscrow.sol";

contract EliosEscrowTest is Test {
    EliosEscrow private escrow;

    address private depositor = address(0xA11CE);
    address private recipient = address(0xB0B);
    address private outsider = address(0xBAD);
    bytes32 private taskId = keccak256("task-1");
    bytes32 private agentId = keccak256("agent-1");

    function setUp() public {
        escrow = new EliosEscrow();
        vm.deal(depositor, 10 ether);
    }

    // ─── Lock ──────────────────────────────────────────────────

    function testLockFundsStoresEscrow() public {
        vm.prank(depositor);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);

        (address storedDepositor, bytes32 storedAgentId, uint256 amount, uint256 lockedAt, EliosEscrow.State state) = escrow.getEscrow(taskId);

        assertEq(storedDepositor, depositor);
        assertEq(storedAgentId, agentId);
        assertEq(amount, 1 ether);
        assertGt(lockedAt, 0);
        assertEq(uint256(state), uint256(EliosEscrow.State.Locked));
    }

    function testCannotLockZeroValue() public {
        vm.prank(depositor);
        vm.expectRevert(EliosEscrow.InvalidAmount.selector);
        escrow.lockFunds{value: 0}(taskId, agentId);
    }

    function testCannotLockTwice() public {
        vm.prank(depositor);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);

        vm.prank(depositor);
        vm.expectRevert(EliosEscrow.InvalidState.selector);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);
    }

    // ─── Release ───────────────────────────────────────────────

    function testReleaseFundsTransfersValueToRecipient() public {
        vm.prank(depositor);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);

        uint256 recipientBalanceBefore = recipient.balance;

        vm.prank(depositor);
        escrow.releaseFunds(taskId, payable(recipient));

        (, , uint256 amount, , EliosEscrow.State state) = escrow.getEscrow(taskId);

        assertEq(recipient.balance, recipientBalanceBefore + 1 ether);
        assertEq(amount, 0);
        assertEq(uint256(state), uint256(EliosEscrow.State.Released));
    }

    function testOwnerCanReleaseFunds() public {
        vm.prank(depositor);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);

        // Owner (test contract) releases
        escrow.releaseFunds(taskId, payable(recipient));

        (, , , , EliosEscrow.State state) = escrow.getEscrow(taskId);
        assertEq(uint256(state), uint256(EliosEscrow.State.Released));
    }

    function testNonDepositorCannotReleaseFunds() public {
        vm.prank(depositor);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);

        vm.prank(outsider);
        vm.expectRevert(EliosEscrow.NotAuthorized.selector);
        escrow.releaseFunds(taskId, payable(recipient));
    }

    // ─── Refund ────────────────────────────────────────────────

    function testRefundReturnsFundsToDepositor() public {
        vm.prank(depositor);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);

        uint256 depositorBalanceBefore = depositor.balance;

        vm.prank(depositor);
        escrow.refund(taskId);

        (, , uint256 amount, , EliosEscrow.State state) = escrow.getEscrow(taskId);

        assertEq(depositor.balance, depositorBalanceBefore + 1 ether);
        assertEq(amount, 0);
        assertEq(uint256(state), uint256(EliosEscrow.State.Refunded));
    }

    // ─── Dispute ───────────────────────────────────────────────

    function testDepositorCanDisputeEscrow() public {
        vm.prank(depositor);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);

        vm.prank(depositor);
        escrow.disputeEscrow(taskId);

        (, , , , EliosEscrow.State state) = escrow.getEscrow(taskId);
        assertEq(uint256(state), uint256(EliosEscrow.State.Disputed));
    }

    function testOutsiderCannotDispute() public {
        vm.prank(depositor);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);

        vm.prank(outsider);
        vm.expectRevert(EliosEscrow.NotAuthorized.selector);
        escrow.disputeEscrow(taskId);
    }

    function testOwnerCanResolveDisputeFullToRecipient() public {
        vm.prank(depositor);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);

        vm.prank(depositor);
        escrow.disputeEscrow(taskId);

        uint256 recipientBefore = recipient.balance;

        // Owner resolves: 100% to recipient
        escrow.resolveDispute(taskId, payable(recipient), 1 ether);

        assertEq(recipient.balance, recipientBefore + 1 ether);
    }

    function testOwnerCanResolveDisputeSplit() public {
        vm.prank(depositor);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);

        vm.prank(depositor);
        escrow.disputeEscrow(taskId);

        uint256 recipientBefore = recipient.balance;
        uint256 depositorBefore = depositor.balance;

        // Owner resolves: 60/40 split
        escrow.resolveDispute(taskId, payable(recipient), 0.6 ether);

        assertEq(recipient.balance, recipientBefore + 0.6 ether);
        assertEq(depositor.balance, depositorBefore + 0.4 ether);
    }

    function testOutsiderCannotResolveDispute() public {
        vm.prank(depositor);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);

        vm.prank(depositor);
        escrow.disputeEscrow(taskId);

        vm.prank(outsider);
        vm.expectRevert();
        escrow.resolveDispute(taskId, payable(recipient), 1 ether);
    }

    function testCannotResolveNonDisputedEscrow() public {
        vm.prank(depositor);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);

        vm.expectRevert(EliosEscrow.InvalidState.selector);
        escrow.resolveDispute(taskId, payable(recipient), 1 ether);
    }

    // ─── Expired Refund ────────────────────────────────────────

    function testExpiredRefundWorksAfterMaxDuration() public {
        vm.prank(depositor);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);

        uint256 depositorBefore = depositor.balance;

        // Warp past MAX_LOCK_DURATION
        vm.warp(block.timestamp + 31 days);

        // Anyone can trigger expired refund
        vm.prank(outsider);
        escrow.expiredRefund(taskId);

        assertEq(depositor.balance, depositorBefore + 1 ether);
    }

    function testExpiredRefundRevertsBeforeMaxDuration() public {
        vm.prank(depositor);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);

        vm.prank(outsider);
        vm.expectRevert(EliosEscrow.LockNotExpired.selector);
        escrow.expiredRefund(taskId);
    }

    // ─── Fuzz ──────────────────────────────────────────────────

    function testFuzzLockAndRelease(uint96 amount) public {
        vm.assume(amount > 0);
        vm.deal(depositor, uint256(amount));

        vm.prank(depositor);
        escrow.lockFunds{value: amount}(taskId, agentId);

        uint256 recipientBefore = recipient.balance;
        vm.prank(depositor);
        escrow.releaseFunds(taskId, payable(recipient));

        assertEq(recipient.balance, recipientBefore + amount);
    }

    function testFuzzDisputeResolveSplit(uint96 amount, uint96 recipientShare) public {
        vm.assume(amount > 0);
        vm.assume(recipientShare <= amount);
        vm.deal(depositor, uint256(amount));

        vm.prank(depositor);
        escrow.lockFunds{value: amount}(taskId, agentId);

        vm.prank(depositor);
        escrow.disputeEscrow(taskId);

        uint256 recipientBefore = recipient.balance;
        uint256 depositorBefore = depositor.balance;

        escrow.resolveDispute(taskId, payable(recipient), recipientShare);

        assertEq(recipient.balance, recipientBefore + recipientShare);
        assertEq(depositor.balance, depositorBefore + (uint256(amount) - recipientShare));
    }
}
