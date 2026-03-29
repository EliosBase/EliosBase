// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/src/EliosPolicyManager.sol";
import "../contracts/src/EliosSafeGuard.sol";
import "../contracts/src/EliosPolicyHook.sol";

contract MockSafe7579Account {
    EliosSafeGuard public immutable guard;
    uint256 public nonce;

    constructor(address guardAddress) payable {
        guard = EliosSafeGuard(guardAddress);
    }

    receive() external payable {}

    function getTransactionHash(
        address to,
        uint256 value,
        bytes memory data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 txNonce
    ) external pure returns (bytes32) {
        return keccak256(
            abi.encode(
                to,
                value,
                data,
                operation,
                safeTxGas,
                baseGas,
                gasPrice,
                gasToken,
                refundReceiver,
                txNonce
            )
        );
    }

    function execGuarded(address payable to, uint256 value, bytes calldata data) external returns (bool success) {
        guard.checkTransaction(
            to,
            value,
            data,
            0,
            0,
            0,
            0,
            address(0),
            payable(address(0)),
            "",
            address(0)
        );

        bytes32 txHash = this.getTransactionHash(
            to,
            value,
            data,
            0,
            0,
            0,
            0,
            address(0),
            address(0),
            nonce
        );

        (success,) = to.call{ value: value }(data);
        guard.checkAfterExecution(txHash, success);
        nonce++;
    }
}

contract MockContractRecipient {
    uint256 public pings;

    function ping() external payable {
        pings++;
    }
}

contract EliosSafe7579Test is Test {
    EliosPolicyManager private manager;
    EliosSafeGuard private guard;
    EliosPolicyHook private hook;
    MockSafe7579Account private safe;
    MockContractRecipient private contractRecipient;
    address payable private recipient;

    address private safeOwner = address(0xA11CE);
    address private policySigner = address(0xBEEF);
    address private sessionKey = address(0xCAFE);
    address private blocklisted = address(0xDEAD);

    function setUp() public {
        manager = new EliosPolicyManager();
        guard = new EliosSafeGuard(address(manager));
        hook = new EliosPolicyHook(address(manager));
        safe = new MockSafe7579Account(address(guard));
        contractRecipient = new MockContractRecipient();
        recipient = payable(makeAddr("recipient"));

        vm.deal(address(safe), 10 ether);

        address[] memory blocked = new address[](1);
        blocked[0] = blocklisted;
        address[] memory allowlisted = new address[](0);

        manager.configureSafe(
            address(safe),
            EliosPolicyManager.PolicyConfigInput({
                owner: safeOwner,
                policySigner: policySigner,
                dailyLimit: uint96(1 ether),
                autoApproveLimit: uint96(0.25 ether),
                reviewThreshold: uint96(0.5 ether),
                timelockThreshold: uint96(1 ether),
                timelockSeconds: 1 days,
                allowContractRecipients: false
            }),
            blocked,
            allowlisted,
            EliosPolicyManager.ModuleConfig({
                adapter: address(0x1001),
                ownerValidator: address(0x1002),
                smartSessionsValidator: address(0x1003),
                compatibilityFallback: address(0x1004),
                hook: address(hook),
                guard: address(guard),
                policyManager: address(manager)
            })
        );

        manager.rotateSessionKey(address(safe), sessionKey, uint64(block.timestamp + 7 days));
    }

    function testDirectExecutionConsumesSpend() public {
        bool success = safe.execGuarded(payable(address(recipient)), 0.25 ether, "");

        assertTrue(success);
        assertEq(recipient.balance, 0.25 ether);
        (, , , , uint192 spentToday) = manager.getSafeWalletState(address(safe));
        assertEq(spentToday, 0.25 ether);
    }

    function testDirectExecutionBlocksContractRecipients() public {
        vm.expectRevert(EliosPolicyManager.ContractRecipientBlocked.selector);
        safe.execGuarded(
            payable(address(contractRecipient)),
            0.1 ether,
            abi.encodeWithSelector(MockContractRecipient.ping.selector)
        );
    }

    function testDirectExecutionEnforcesReviewedIntentApprovalAndTimelock() public {
        bytes32 intentHash = manager.queueReviewedIntent(
            address(safe),
            recipient,
            1 ether,
            keccak256(bytes("reviewed-transfer"))
        );

        vm.expectRevert(EliosPolicyManager.IntentNotApproved.selector);
        safe.execGuarded(payable(address(recipient)), 1 ether, "");

        vm.prank(policySigner);
        manager.approveReviewedIntent(intentHash);

        vm.expectRevert(EliosPolicyManager.TimelockActive.selector);
        safe.execGuarded(payable(address(recipient)), 1 ether, "");

        vm.warp(block.timestamp + 1 days + 1);
        bool success = safe.execGuarded(payable(address(recipient)), 1 ether, "");

        assertTrue(success);
        assertEq(recipient.balance, 1 ether);
        (, , , , , bool approved, bool executed) = manager.reviewedIntents(intentHash);
        assertTrue(approved);
        assertTrue(executed);
    }

    function testDailySpendLimitBlocksFifthAutoApprovedTransfer() public {
        safe.execGuarded(payable(address(recipient)), 0.25 ether, "");
        safe.execGuarded(payable(address(recipient)), 0.25 ether, "");
        safe.execGuarded(payable(address(recipient)), 0.25 ether, "");
        safe.execGuarded(payable(address(recipient)), 0.25 ether, "");

        vm.expectRevert(EliosPolicyManager.SpendLimitExceeded.selector);
        safe.execGuarded(payable(address(recipient)), 0.01 ether, "");
    }

    function testHookAllowsAutoApprovedExecution() public {
        bytes memory hookData;
        vm.prank(address(safe));
        hookData = hook.preCheck(address(0), 0, _encodeExecute(address(recipient), 0.2 ether, ""));

        hook.postCheck(hookData);

        assertEq(manager.getRemainingDailySpend(address(safe)), 0.8 ether);
    }

    function testHookRejectsReviewedTransfers() public {
        vm.prank(address(safe));
        vm.expectRevert(EliosPolicyManager.ReviewedIntentRequired.selector);
        hook.preCheck(address(0), 0, _encodeExecute(address(recipient), 0.6 ether, ""));
    }

    function testHookRejectsBlockedDestination() public {
        vm.prank(address(safe));
        vm.expectRevert(EliosPolicyManager.DestinationBlocked.selector);
        hook.preCheck(address(0), 0, _encodeExecute(blocklisted, 0.1 ether, ""));
    }

    function _encodeExecute(address to, uint256 value, bytes memory data) private pure returns (bytes memory) {
        return abi.encodeWithSelector(
            bytes4(keccak256("execute(bytes32,bytes)")),
            bytes32(0),
            abi.encodePacked(to, value, data)
        );
    }
}
