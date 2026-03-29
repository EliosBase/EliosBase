// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import { EliosPolicyManager } from "./EliosPolicyManager.sol";

contract EliosPolicyHook {
    error UnsupportedSelector();
    error UnsupportedCallType();
    error InvalidExecutionCalldata();

    bytes4 private constant EXECUTE_SELECTOR = bytes4(keccak256("execute(bytes32,bytes)"));
    uint8 private constant CALLTYPE_SINGLE = 0x00;

    EliosPolicyManager public immutable manager;

    constructor(address managerAddress) {
        manager = EliosPolicyManager(managerAddress);
    }

    function onInstall(bytes calldata) external pure {}

    function onUninstall(bytes calldata) external pure {}

    function isModuleType(uint256 typeId) external pure returns (bool) {
        return typeId == 4;
    }

    function name() external pure returns (string memory) {
        return "EliosPolicyHook";
    }

    function version() external pure returns (string memory) {
        return "1.0.0";
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7;
    }

    function preCheck(address, uint256, bytes calldata msgData) external view returns (bytes memory) {
        if (msgData.length < 4 || bytes4(msgData[:4]) != EXECUTE_SELECTOR) {
            revert UnsupportedSelector();
        }

        (bytes32 execMode, bytes memory executionCalldata) = abi.decode(msgData[4:], (bytes32, bytes));
        if (uint8(bytes1(execMode)) != CALLTYPE_SINGLE) {
            revert UnsupportedCallType();
        }

        (address to, uint256 value, bytes memory data) = _decodeSingleExecution(executionCalldata);
        manager.previewHookExecution(msg.sender, to, value, data);
        return abi.encode(msg.sender, to, value, data);
    }

    function postCheck(bytes calldata hookData) external {
        (address safe, address to, uint256 value, bytes memory data) = abi.decode(hookData, (address, address, uint256, bytes));
        manager.finalizeHookExecution(safe, to, value, data);
    }

    function _decodeSingleExecution(bytes memory executionCalldata)
        private
        pure
        returns (address to, uint256 value, bytes memory data)
    {
        if (executionCalldata.length < 52) {
            revert InvalidExecutionCalldata();
        }

        assembly {
            to := shr(96, mload(add(executionCalldata, 32)))
            value := mload(add(executionCalldata, 52))
        }

        uint256 dataLength = executionCalldata.length - 52;
        data = new bytes(dataLength);
        for (uint256 i = 0; i < dataLength; i++) {
            data[i] = executionCalldata[i + 52];
        }
    }
}
