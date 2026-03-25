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

    function testLockFundsStoresEscrow() public {
        vm.prank(depositor);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);

        (address storedDepositor, bytes32 storedAgentId, uint256 amount, EliosEscrow.State state) = escrow.getEscrow(taskId);

        assertEq(storedDepositor, depositor);
        assertEq(storedAgentId, agentId);
        assertEq(amount, 1 ether);
        assertEq(uint256(state), uint256(EliosEscrow.State.Locked));
    }

    function testReleaseFundsTransfersValueToRecipient() public {
        vm.prank(depositor);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);

        uint256 recipientBalanceBefore = recipient.balance;

        vm.prank(depositor);
        escrow.releaseFunds(taskId, payable(recipient));

        (, , uint256 amount, EliosEscrow.State state) = escrow.getEscrow(taskId);

        assertEq(recipient.balance, recipientBalanceBefore + 1 ether);
        assertEq(amount, 0);
        assertEq(uint256(state), uint256(EliosEscrow.State.Released));
    }

    function testRefundReturnsFundsToDepositor() public {
        vm.prank(depositor);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);

        uint256 depositorBalanceBefore = depositor.balance;

        vm.prank(depositor);
        escrow.refund(taskId);

        (, , uint256 amount, EliosEscrow.State state) = escrow.getEscrow(taskId);

        assertEq(depositor.balance, depositorBalanceBefore + 1 ether);
        assertEq(amount, 0);
        assertEq(uint256(state), uint256(EliosEscrow.State.Refunded));
    }

    function testNonDepositorCannotReleaseFunds() public {
        vm.prank(depositor);
        escrow.lockFunds{value: 1 ether}(taskId, agentId);

        vm.prank(outsider);
        vm.expectRevert(EliosEscrow.NotAuthorized.selector);
        escrow.releaseFunds(taskId, payable(recipient));
    }
}
