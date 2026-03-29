// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { EliosPolicyManager } from "./EliosPolicyManager.sol";

interface IEliosSafe {
    function nonce() external view returns (uint256);
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
        uint256 nonce
    ) external view returns (bytes32);
}

contract EliosSafeGuard {
    error UnsupportedOperation();

    struct PendingExecution {
        address safe;
        address to;
        uint256 value;
        bytes data;
        bytes32 intentHash;
    }

    EliosPolicyManager public immutable manager;

    mapping(bytes32 txHash => PendingExecution execution) public pendingExecutions;

    constructor(address managerAddress) {
        manager = EliosPolicyManager(managerAddress);
    }

    function checkTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory,
        address
    ) external {
        if (operation != 0) revert UnsupportedOperation();

        bytes32 intentHash = manager.validateDirectExecution(msg.sender, to, value, data);
        bytes32 txHash = IEliosSafe(msg.sender).getTransactionHash(
            to,
            value,
            data,
            operation,
            safeTxGas,
            baseGas,
            gasPrice,
            gasToken,
            refundReceiver,
            IEliosSafe(msg.sender).nonce()
        );

        pendingExecutions[txHash] = PendingExecution({
            safe: msg.sender,
            to: to,
            value: value,
            data: data,
            intentHash: intentHash
        });
    }

    function checkAfterExecution(bytes32 txHash, bool success) external {
        PendingExecution memory execution = pendingExecutions[txHash];
        if (execution.safe == address(0)) {
            return;
        }

        delete pendingExecutions[txHash];

        if (!success) {
            return;
        }

        manager.finalizeDirectExecution(
            execution.safe,
            execution.to,
            execution.value,
            execution.data,
            execution.intentHash
        );
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0xe6d7a83a || interfaceId == 0x01ffc9a7;
    }
}
