// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

contract EliosPolicyManager {
    error Unauthorized();
    error InvalidSafe();
    error InvalidRecipient();
    error InvalidSession();
    error InvalidExecution();
    error SpendLimitExceeded();
    error ReviewedIntentRequired();
    error TimelockActive();
    error IntentNotApproved();
    error ContractRecipientBlocked();
    error DestinationBlocked();

    struct PolicyConfig {
        address owner;
        address policySigner;
        uint96 dailyLimit;
        uint96 autoApproveLimit;
        uint96 reviewThreshold;
        uint96 timelockThreshold;
        uint32 timelockSeconds;
        bool allowContractRecipients;
        bool exists;
    }

    struct ModuleConfig {
        address adapter;
        address ownerValidator;
        address smartSessionsValidator;
        address compatibilityFallback;
        address hook;
        address guard;
        address policyManager;
    }

    struct SessionKeyState {
        address key;
        uint64 validUntil;
        uint64 rotatedAt;
        bool revoked;
    }

    struct SpendWindow {
        uint64 day;
        uint192 spent;
    }

    struct ReviewedIntent {
        address safe;
        address to;
        uint256 value;
        bytes32 noteHash;
        uint64 unlockAt;
        bool approved;
        bool executed;
    }

    struct SafeWalletState {
        PolicyConfig policy;
        ModuleConfig modules;
        SessionKeyState sessionKey;
        SpendWindow spendWindow;
    }

    struct PolicyConfigInput {
        address owner;
        address policySigner;
        uint96 dailyLimit;
        uint96 autoApproveLimit;
        uint96 reviewThreshold;
        uint96 timelockThreshold;
        uint32 timelockSeconds;
        bool allowContractRecipients;
    }

    address public immutable owner;

    mapping(address safe => SafeWalletState state) private safeWallets;
    mapping(address safe => mapping(address destination => bool blocked)) public blockedDestinations;
    mapping(address safe => mapping(address destination => bool allowlisted)) public allowlistedContracts;
    mapping(bytes32 intentHash => ReviewedIntent intent) public reviewedIntents;

    event SafeConfigured(address indexed safe, address indexed walletOwner, address indexed policySigner);
    event ModulesConfigured(address indexed safe, address guard, address hook);
    event SessionKeyRotated(address indexed safe, address indexed sessionKey, uint64 validUntil);
    event SessionKeyRevoked(address indexed safe);
    event ReviewedIntentQueued(bytes32 indexed intentHash, address indexed safe, address indexed to, uint256 value, uint64 unlockAt);
    event ReviewedIntentApproved(bytes32 indexed intentHash, address indexed safe);
    event SpendConsumed(address indexed safe, uint256 value, uint64 day, uint256 spent);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyGuard(address safe) {
        if (msg.sender != safeWallets[safe].modules.guard) revert Unauthorized();
        _;
    }

    modifier onlyHook(address safe) {
        if (msg.sender != safeWallets[safe].modules.hook) revert Unauthorized();
        _;
    }

    function configureSafe(
        address safe,
        PolicyConfigInput calldata config,
        address[] calldata blocked,
        address[] calldata allowlisted,
        ModuleConfig calldata modules
    ) external onlyOwner {
        if (safe == address(0) || config.owner == address(0) || config.policySigner == address(0)) {
            revert InvalidSafe();
        }

        SafeWalletState storage state = safeWallets[safe];
        state.policy = PolicyConfig({
            owner: config.owner,
            policySigner: config.policySigner,
            dailyLimit: config.dailyLimit,
            autoApproveLimit: config.autoApproveLimit,
            reviewThreshold: config.reviewThreshold,
            timelockThreshold: config.timelockThreshold,
            timelockSeconds: config.timelockSeconds,
            allowContractRecipients: config.allowContractRecipients,
            exists: true
        });
        state.modules = modules;

        for (uint256 i = 0; i < blocked.length; i++) {
            blockedDestinations[safe][blocked[i]] = true;
        }

        for (uint256 i = 0; i < allowlisted.length; i++) {
            allowlistedContracts[safe][allowlisted[i]] = true;
        }

        emit SafeConfigured(safe, config.owner, config.policySigner);
        emit ModulesConfigured(safe, modules.guard, modules.hook);
    }

    function configureModules(address safe, ModuleConfig calldata modules) external onlyOwner {
        if (!safeWallets[safe].policy.exists) revert InvalidSafe();
        safeWallets[safe].modules = modules;
        emit ModulesConfigured(safe, modules.guard, modules.hook);
    }

    function rotateSessionKey(address safe, address sessionKey, uint64 validUntil) external onlyOwner {
        if (!safeWallets[safe].policy.exists || sessionKey == address(0)) revert InvalidSession();
        safeWallets[safe].sessionKey = SessionKeyState({
            key: sessionKey,
            validUntil: validUntil,
            rotatedAt: uint64(block.timestamp),
            revoked: false
        });
        emit SessionKeyRotated(safe, sessionKey, validUntil);
    }

    function revokeSessionKey(address safe) external onlyOwner {
        if (!safeWallets[safe].policy.exists) revert InvalidSession();
        safeWallets[safe].sessionKey.revoked = true;
        emit SessionKeyRevoked(safe);
    }

    function queueReviewedIntent(address safe, address to, uint256 value, bytes32 noteHash) external onlyOwner returns (bytes32) {
        PolicyConfig storage policy = safeWallets[safe].policy;
        if (!policy.exists) revert InvalidSafe();

        bytes32 intentHash = _intentHash(safe, to, value);
        ReviewedIntent storage intent = reviewedIntents[intentHash];
        if (intent.safe != address(0) && !intent.executed) revert InvalidExecution();

        uint64 unlockAt = value >= policy.timelockThreshold
            ? uint64(block.timestamp + policy.timelockSeconds)
            : uint64(block.timestamp);

        reviewedIntents[intentHash] = ReviewedIntent({
            safe: safe,
            to: to,
            value: value,
            noteHash: noteHash,
            unlockAt: unlockAt,
            approved: false,
            executed: false
        });

        emit ReviewedIntentQueued(intentHash, safe, to, value, unlockAt);
        return intentHash;
    }

    function approveReviewedIntent(bytes32 intentHash) external {
        ReviewedIntent storage intent = reviewedIntents[intentHash];
        if (intent.safe == address(0)) revert InvalidExecution();

        PolicyConfig storage policy = safeWallets[intent.safe].policy;
        if (msg.sender != owner && msg.sender != policy.policySigner) revert Unauthorized();

        intent.approved = true;
        emit ReviewedIntentApproved(intentHash, intent.safe);
    }

    function validateDirectExecution(address safe, address to, uint256 value, bytes calldata data)
        external
        view
        onlyGuard(safe)
        returns (bytes32)
    {
        PolicyConfig storage policy = safeWallets[safe].policy;
        if (!policy.exists) revert InvalidSafe();

        _validateCommon(policy, safe, to, value, data);
        if (_wouldExceedDailySpend(safe, value)) revert SpendLimitExceeded();

        if (value >= policy.reviewThreshold) {
            bytes32 intentHash = _intentHash(safe, to, value);
            ReviewedIntent storage intent = reviewedIntents[intentHash];
            if (intent.safe != safe || intent.to != to || intent.value != value || intent.executed) {
                revert ReviewedIntentRequired();
            }
            if (!intent.approved) revert IntentNotApproved();
            if (intent.unlockAt > block.timestamp) revert TimelockActive();
            return intentHash;
        }

        if (value > policy.autoApproveLimit) {
            revert ReviewedIntentRequired();
        }

        return bytes32(0);
    }

    function finalizeDirectExecution(address safe, address to, uint256 value, bytes calldata data, bytes32 intentHash)
        external
        onlyGuard(safe)
    {
        PolicyConfig storage policy = safeWallets[safe].policy;
        if (!policy.exists) revert InvalidSafe();

        _validateCommon(policy, safe, to, value, data);
        _consumeSpend(safe, value);

        if (value >= policy.reviewThreshold) {
            ReviewedIntent storage intent = reviewedIntents[intentHash];
            if (intent.safe != safe || intent.executed) revert ReviewedIntentRequired();
            intent.executed = true;
        }
    }

    function previewHookExecution(address safe, address to, uint256 value, bytes calldata data)
        external
        view
        onlyHook(safe)
    {
        PolicyConfig storage policy = safeWallets[safe].policy;
        if (!policy.exists) revert InvalidSafe();

        _validateCommon(policy, safe, to, value, data);
        if (value > policy.autoApproveLimit) revert ReviewedIntentRequired();
        if (_wouldExceedDailySpend(safe, value)) revert SpendLimitExceeded();
    }

    function finalizeHookExecution(address safe, address to, uint256 value, bytes calldata data)
        external
        onlyHook(safe)
    {
        PolicyConfig storage policy = safeWallets[safe].policy;
        if (!policy.exists) revert InvalidSafe();

        _validateCommon(policy, safe, to, value, data);
        if (value > policy.autoApproveLimit) revert ReviewedIntentRequired();
        _consumeSpend(safe, value);
    }

    function getSafeWalletState(address safe) external view returns (
        PolicyConfig memory policy,
        ModuleConfig memory modules,
        SessionKeyState memory sessionKey,
        uint64 spendDay,
        uint192 spentToday
    ) {
        SafeWalletState storage state = safeWallets[safe];
        return (
            state.policy,
            state.modules,
            state.sessionKey,
            state.spendWindow.day,
            state.spendWindow.spent
        );
    }

    function getRemainingDailySpend(address safe) external view returns (uint256) {
        PolicyConfig storage policy = safeWallets[safe].policy;
        if (!policy.exists) revert InvalidSafe();

        SpendWindow memory window = _currentWindow(safe);
        if (window.spent >= policy.dailyLimit) {
            return 0;
        }

        return policy.dailyLimit - window.spent;
    }

    function _validateCommon(PolicyConfig storage policy, address safe, address to, uint256, bytes calldata data) internal view {
        if (to == address(0) || to == safe) revert InvalidRecipient();
        if (blockedDestinations[safe][to]) revert DestinationBlocked();

        bool isInternalModuleTarget = _isInternalModuleTarget(safe, to);

        if (to.code.length > 0 && !isInternalModuleTarget && !policy.allowContractRecipients && !allowlistedContracts[safe][to]) {
            revert ContractRecipientBlocked();
        }

        if (data.length != 0 && !isInternalModuleTarget && !allowlistedContracts[safe][to]) {
            revert InvalidExecution();
        }
    }

    function _isInternalModuleTarget(address safe, address to) internal view returns (bool) {
        ModuleConfig storage modules = safeWallets[safe].modules;

        return to == modules.adapter
            || to == modules.ownerValidator
            || to == modules.smartSessionsValidator
            || to == modules.compatibilityFallback
            || to == modules.hook
            || to == modules.guard
            || to == modules.policyManager;
    }

    function _consumeSpend(address safe, uint256 value) internal {
        SpendWindow storage window = safeWallets[safe].spendWindow;
        uint64 day = uint64(block.timestamp / 1 days);

        if (window.day != day) {
            window.day = day;
            window.spent = 0;
        }

        window.spent += uint192(value);
        emit SpendConsumed(safe, value, day, window.spent);
    }

    function _currentWindow(address safe) internal view returns (SpendWindow memory) {
        SpendWindow memory window = safeWallets[safe].spendWindow;
        uint64 day = uint64(block.timestamp / 1 days);
        if (window.day != day) {
            return SpendWindow({ day: day, spent: 0 });
        }
        return window;
    }

    function _wouldExceedDailySpend(address safe, uint256 value) internal view returns (bool) {
        SpendWindow memory window = _currentWindow(safe);
        return window.spent + value > safeWallets[safe].policy.dailyLimit;
    }

    function _intentHash(address safe, address to, uint256 value) internal pure returns (bytes32) {
        return keccak256(abi.encode(safe, to, value));
    }
}
