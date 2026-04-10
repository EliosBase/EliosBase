// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "../contracts/src/EliosStaking.sol";

/**
 * @dev Minimal ERC20 + Permit token used as a stand-in for $ELIOS in
 *      tests. We can't import the real $ELIOS contract here because it
 *      lives on Base mainnet at 0x002B...1b07 — and even if we had its
 *      source, exercising the staking contract requires a token we can
 *      mint freely. The behavior we depend on is the standard ERC20 +
 *      EIP-2612 surface, which OpenZeppelin gives us out of the box.
 */
contract MockEliosToken is ERC20, ERC20Permit {
    constructor() ERC20("Mock Elios", "mELIOS") ERC20Permit("Mock Elios") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/**
 * @dev ERC20 that always reverts on transferFrom. Used to verify that
 *      the staking contract surfaces token-side failures rather than
 *      silently swallowing them.
 */
contract RevertingToken is ERC20 {
    constructor() ERC20("Reverting", "RVT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert("nope");
    }
}

contract EliosStakingTest is Test {
    EliosStaking private staking;
    MockEliosToken private token;

    address private owner = address(0xA1);
    address private staker = address(0xB1);
    address private otherStaker = address(0xB2);
    address private outsider = address(0xBAD);
    address private slashRecipient = address(0xCAFE);

    bytes32 private agentDigest = keccak256("agent-1");
    bytes32 private otherAgent = keccak256("agent-2");

    uint64 private constant COOLDOWN = 7 days;
    uint128 private constant STAKE_AMOUNT = 1_000e18;

    function setUp() public {
        token = new MockEliosToken();
        staking = new EliosStaking(address(token), owner, COOLDOWN);

        // Fund stakers and approve.
        token.mint(staker, 10_000e18);
        token.mint(otherStaker, 10_000e18);

        vm.prank(staker);
        token.approve(address(staking), type(uint256).max);
        vm.prank(otherStaker);
        token.approve(address(staking), type(uint256).max);
    }

    // ─── Constructor ────────────────────────────────────────────

    function testConstructorStoresState() public view {
        assertEq(address(staking.ELIOS()), address(token));
        assertEq(staking.owner(), owner);
        assertEq(staking.unstakeCooldown(), COOLDOWN);
        assertEq(staking.totalStaked(), 0);
        assertEq(staking.totalSlashed(), 0);
    }

    function testConstructorRejectsCooldownAboveMax() public {
        vm.expectRevert(EliosStaking.CooldownTooLong.selector);
        new EliosStaking(address(token), owner, 31 days);
    }

    // ─── Stake ──────────────────────────────────────────────────

    function testStakeStoresPosition() public {
        vm.prank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);

        (address pStaker, uint128 amount, uint64 unlockAt, uint128 slashedTotal) =
            staking.positionOf(agentDigest);

        assertEq(pStaker, staker);
        assertEq(amount, STAKE_AMOUNT);
        assertEq(unlockAt, 0);
        assertEq(slashedTotal, 0);
        assertEq(staking.totalStaked(), STAKE_AMOUNT);
        assertEq(token.balanceOf(address(staking)), STAKE_AMOUNT);
    }

    function testStakeEmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit EliosStaking.Staked(agentDigest, staker, STAKE_AMOUNT, STAKE_AMOUNT);
        vm.prank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);
    }

    function testCannotStakeZero() public {
        vm.prank(staker);
        vm.expectRevert(EliosStaking.ZeroAmount.selector);
        staking.stake(agentDigest, 0);
    }

    function testSameStakerCanTopUp() public {
        vm.startPrank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);
        staking.stake(agentDigest, STAKE_AMOUNT);
        vm.stopPrank();

        (, uint128 amount,, ) = staking.positionOf(agentDigest);
        assertEq(amount, STAKE_AMOUNT * 2);
        assertEq(staking.totalStaked(), STAKE_AMOUNT * 2);
    }

    function testSecondStakerCannotTopUp() public {
        vm.prank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);

        vm.prank(otherStaker);
        vm.expectRevert(EliosStaking.NotStaker.selector);
        staking.stake(agentDigest, STAKE_AMOUNT);
    }

    function testCannotTopUpWhileUnstaking() public {
        vm.startPrank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);
        staking.requestUnstake(agentDigest);

        vm.expectRevert(EliosStaking.AlreadyUnstaking.selector);
        staking.stake(agentDigest, STAKE_AMOUNT);
        vm.stopPrank();
    }

    function testStakeBubblesUpTokenFailure() public {
        RevertingToken bad = new RevertingToken();
        bad.mint(staker, 1_000e18);
        EliosStaking badStaking = new EliosStaking(address(bad), owner, COOLDOWN);

        vm.startPrank(staker);
        bad.approve(address(badStaking), type(uint256).max);
        vm.expectRevert();
        badStaking.stake(agentDigest, 100e18);
        vm.stopPrank();
    }

    // ─── stakeWithPermit ────────────────────────────────────────

    function testStakeWithPermit() public {
        uint256 stakerPk = 0xA11CE;
        address permitStaker = vm.addr(stakerPk);
        token.mint(permitStaker, 5_000e18);

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = token.nonces(permitStaker);
        bytes32 PERMIT_TYPEHASH =
            keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
        bytes32 structHash = keccak256(
            abi.encode(PERMIT_TYPEHASH, permitStaker, address(staking), uint256(STAKE_AMOUNT), nonce, deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(stakerPk, digest);

        vm.prank(permitStaker);
        staking.stakeWithPermit(agentDigest, STAKE_AMOUNT, deadline, v, r, s);

        (address pStaker, uint128 amount,, ) = staking.positionOf(agentDigest);
        assertEq(pStaker, permitStaker);
        assertEq(amount, STAKE_AMOUNT);
    }

    function testStakeWithPermitFallsBackOnConsumedSignature() public {
        // Pre-approve so the permit is technically unnecessary; pass a
        // bogus signature to ensure the catch path still completes the
        // stake using the existing allowance.
        vm.prank(staker);
        token.approve(address(staking), STAKE_AMOUNT);

        vm.prank(staker);
        staking.stakeWithPermit(agentDigest, STAKE_AMOUNT, block.timestamp + 1, 27, bytes32(0), bytes32(0));

        (address pStaker, uint128 amount,, ) = staking.positionOf(agentDigest);
        assertEq(pStaker, staker);
        assertEq(amount, STAKE_AMOUNT);
    }

    // ─── requestUnstake ─────────────────────────────────────────

    function testRequestUnstakeStartsCooldown() public {
        vm.startPrank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);
        staking.requestUnstake(agentDigest);
        vm.stopPrank();

        (,, uint64 unlockAt,) = staking.positionOf(agentDigest);
        assertEq(unlockAt, uint64(block.timestamp) + COOLDOWN);
    }

    function testCannotRequestUnstakeWithoutPosition() public {
        vm.prank(staker);
        vm.expectRevert(EliosStaking.NoPosition.selector);
        staking.requestUnstake(agentDigest);
    }

    function testNonStakerCannotRequestUnstake() public {
        vm.prank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);

        vm.prank(outsider);
        vm.expectRevert(EliosStaking.NotStaker.selector);
        staking.requestUnstake(agentDigest);
    }

    function testCannotDoubleRequestUnstake() public {
        vm.startPrank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);
        staking.requestUnstake(agentDigest);

        vm.expectRevert(EliosStaking.AlreadyUnstaking.selector);
        staking.requestUnstake(agentDigest);
        vm.stopPrank();
    }

    // ─── withdraw ───────────────────────────────────────────────

    function testWithdrawAfterCooldown() public {
        vm.startPrank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);
        staking.requestUnstake(agentDigest);
        vm.stopPrank();

        vm.warp(block.timestamp + COOLDOWN + 1);

        uint256 balanceBefore = token.balanceOf(staker);

        vm.prank(staker);
        staking.withdraw(agentDigest, address(0));

        assertEq(token.balanceOf(staker), balanceBefore + STAKE_AMOUNT);
        assertEq(staking.totalStaked(), 0);

        (address pStaker, uint128 amount,, ) = staking.positionOf(agentDigest);
        assertEq(pStaker, address(0));
        assertEq(amount, 0);
    }

    function testWithdrawToCustomRecipient() public {
        vm.startPrank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);
        staking.requestUnstake(agentDigest);
        vm.stopPrank();

        vm.warp(block.timestamp + COOLDOWN + 1);

        vm.prank(staker);
        staking.withdraw(agentDigest, outsider);

        assertEq(token.balanceOf(outsider), STAKE_AMOUNT);
    }

    function testWithdrawBeforeCooldownReverts() public {
        vm.startPrank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);
        staking.requestUnstake(agentDigest);

        vm.expectRevert(EliosStaking.CooldownNotElapsed.selector);
        staking.withdraw(agentDigest, address(0));
        vm.stopPrank();
    }

    function testWithdrawWithoutRequestReverts() public {
        vm.prank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);

        vm.prank(staker);
        vm.expectRevert(EliosStaking.PositionLocked.selector);
        staking.withdraw(agentDigest, address(0));
    }

    function testNonStakerCannotWithdraw() public {
        vm.startPrank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);
        staking.requestUnstake(agentDigest);
        vm.stopPrank();

        vm.warp(block.timestamp + COOLDOWN + 1);

        vm.prank(outsider);
        vm.expectRevert(EliosStaking.NotStaker.selector);
        staking.withdraw(agentDigest, address(0));
    }

    function testWithdrawNonexistentReverts() public {
        vm.prank(staker);
        vm.expectRevert(EliosStaking.NoPosition.selector);
        staking.withdraw(agentDigest, address(0));
    }

    function testCanReStakeAfterWithdraw() public {
        vm.startPrank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);
        staking.requestUnstake(agentDigest);
        vm.stopPrank();

        vm.warp(block.timestamp + COOLDOWN + 1);

        vm.prank(staker);
        staking.withdraw(agentDigest, address(0));

        // Slot is now empty, a different staker should be able to claim it.
        vm.prank(otherStaker);
        staking.stake(agentDigest, STAKE_AMOUNT);

        (address pStaker,,, ) = staking.positionOf(agentDigest);
        assertEq(pStaker, otherStaker);
    }

    // ─── slash ──────────────────────────────────────────────────

    function testOwnerCanSlash() public {
        vm.prank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);

        uint256 burnBefore = token.balanceOf(staking.BURN_ADDRESS());

        vm.prank(owner);
        staking.slash(agentDigest, 200e18, address(0), keccak256("dispute:task-1"));

        (, uint128 amount,, uint128 slashedTotal) = staking.positionOf(agentDigest);
        assertEq(amount, STAKE_AMOUNT - 200e18);
        assertEq(slashedTotal, 200e18);
        assertEq(staking.totalStaked(), STAKE_AMOUNT - 200e18);
        assertEq(staking.totalSlashed(), 200e18);
        assertEq(token.balanceOf(staking.BURN_ADDRESS()), burnBefore + 200e18);
    }

    function testSlashRoutesToBurnByDefault() public {
        vm.prank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);

        vm.prank(owner);
        staking.slash(agentDigest, 100e18, address(0), bytes32(0));

        assertEq(token.balanceOf(staking.BURN_ADDRESS()), 100e18);
    }

    function testSlashWithCustomRecipient() public {
        vm.prank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);

        vm.prank(owner);
        staking.slash(agentDigest, 150e18, slashRecipient, bytes32(0));

        assertEq(token.balanceOf(slashRecipient), 150e18);
        assertEq(token.balanceOf(staking.BURN_ADDRESS()), 0);
    }

    function testSlashFullyClearsPosition() public {
        vm.prank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);

        vm.prank(owner);
        staking.slash(agentDigest, STAKE_AMOUNT, address(0), bytes32(0));

        (address pStaker, uint128 amount,, uint128 slashedTotal) = staking.positionOf(agentDigest);
        assertEq(pStaker, address(0));
        assertEq(amount, 0);
        assertEq(slashedTotal, 0); // slot deleted on full slash
        assertEq(staking.totalStaked(), 0);
        assertEq(staking.totalSlashed(), STAKE_AMOUNT);
    }

    function testSlashDuringCooldown() public {
        vm.startPrank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);
        staking.requestUnstake(agentDigest);
        vm.stopPrank();

        vm.prank(owner);
        staking.slash(agentDigest, 300e18, address(0), bytes32(0));

        // Cooldown still in effect, but stake reduced.
        (, uint128 amount, uint64 unlockAt,) = staking.positionOf(agentDigest);
        assertEq(amount, STAKE_AMOUNT - 300e18);
        assertGt(unlockAt, 0);

        // Once cooldown elapses, staker withdraws what's left.
        vm.warp(block.timestamp + COOLDOWN + 1);
        uint256 before = token.balanceOf(staker);
        vm.prank(staker);
        staking.withdraw(agentDigest, address(0));
        assertEq(token.balanceOf(staker), before + (STAKE_AMOUNT - 300e18));
    }

    function testSlashEmitsEvent() public {
        vm.prank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);

        vm.expectEmit(true, true, false, true);
        emit EliosStaking.Slashed(
            agentDigest,
            staking.BURN_ADDRESS(),
            100e18,
            STAKE_AMOUNT - 100e18,
            keccak256("reason")
        );
        vm.prank(owner);
        staking.slash(agentDigest, 100e18, address(0), keccak256("reason"));
    }

    function testSlashZeroReverts() public {
        vm.prank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);

        vm.prank(owner);
        vm.expectRevert(EliosStaking.ZeroAmount.selector);
        staking.slash(agentDigest, 0, address(0), bytes32(0));
    }

    function testSlashOverstakedReverts() public {
        vm.prank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);

        vm.prank(owner);
        vm.expectRevert(EliosStaking.InsufficientStake.selector);
        staking.slash(agentDigest, STAKE_AMOUNT + 1, address(0), bytes32(0));
    }

    function testSlashNonexistentReverts() public {
        vm.prank(owner);
        vm.expectRevert(EliosStaking.NoPosition.selector);
        staking.slash(agentDigest, 100e18, address(0), bytes32(0));
    }

    function testNonOwnerCannotSlash() public {
        vm.prank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        staking.slash(agentDigest, 100e18, address(0), bytes32(0));
    }

    // ─── setUnstakeCooldown ─────────────────────────────────────

    function testOwnerCanSetCooldown() public {
        vm.prank(owner);
        staking.setUnstakeCooldown(1 days);
        assertEq(staking.unstakeCooldown(), 1 days);
    }

    function testCannotSetCooldownAboveMax() public {
        vm.prank(owner);
        vm.expectRevert(EliosStaking.CooldownTooLong.selector);
        staking.setUnstakeCooldown(31 days);
    }

    function testNonOwnerCannotSetCooldown() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        staking.setUnstakeCooldown(1 days);
    }

    function testCooldownChangeDoesNotRetroactivelyAffectInflightUnstake() public {
        vm.startPrank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);
        staking.requestUnstake(agentDigest);
        vm.stopPrank();

        (,, uint64 unlockAtBefore,) = staking.positionOf(agentDigest);

        // Owner shortens the cooldown after the request was made.
        vm.prank(owner);
        staking.setUnstakeCooldown(1 days);

        (,, uint64 unlockAtAfter,) = staking.positionOf(agentDigest);
        assertEq(unlockAtAfter, unlockAtBefore);
    }

    // ─── isWithdrawable view ────────────────────────────────────

    function testIsWithdrawableView() public {
        // Empty: not withdrawable.
        assertFalse(staking.isWithdrawable(agentDigest));

        // Locked stake: not withdrawable.
        vm.prank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);
        assertFalse(staking.isWithdrawable(agentDigest));

        // Cooldown started but not elapsed: not withdrawable.
        vm.prank(staker);
        staking.requestUnstake(agentDigest);
        assertFalse(staking.isWithdrawable(agentDigest));

        // Cooldown elapsed: withdrawable.
        vm.warp(block.timestamp + COOLDOWN + 1);
        assertTrue(staking.isWithdrawable(agentDigest));
    }

    // ─── Multi-position isolation ───────────────────────────────

    function testPositionsAreIsolated() public {
        vm.prank(staker);
        staking.stake(agentDigest, STAKE_AMOUNT);
        vm.prank(otherStaker);
        staking.stake(otherAgent, STAKE_AMOUNT * 2);

        (address pStaker1, uint128 amount1,, ) = staking.positionOf(agentDigest);
        (address pStaker2, uint128 amount2,, ) = staking.positionOf(otherAgent);

        assertEq(pStaker1, staker);
        assertEq(amount1, STAKE_AMOUNT);
        assertEq(pStaker2, otherStaker);
        assertEq(amount2, STAKE_AMOUNT * 2);
        assertEq(staking.totalStaked(), STAKE_AMOUNT * 3);

        // Slashing one doesn't touch the other.
        vm.prank(owner);
        staking.slash(agentDigest, 100e18, address(0), bytes32(0));

        (, uint128 amount2After,, ) = staking.positionOf(otherAgent);
        assertEq(amount2After, STAKE_AMOUNT * 2);
    }

    // ─── Fuzz ───────────────────────────────────────────────────

    function testFuzzStakeAndWithdraw(uint128 amount) public {
        vm.assume(amount > 0 && amount <= 10_000e18);

        vm.prank(staker);
        staking.stake(agentDigest, amount);
        assertEq(staking.totalStaked(), amount);

        vm.prank(staker);
        staking.requestUnstake(agentDigest);

        vm.warp(block.timestamp + COOLDOWN + 1);

        uint256 before = token.balanceOf(staker);
        vm.prank(staker);
        staking.withdraw(agentDigest, address(0));

        assertEq(token.balanceOf(staker), before + amount);
        assertEq(staking.totalStaked(), 0);
    }

    function testFuzzSlashAccounting(uint128 stakeAmount, uint128 slashAmount) public {
        vm.assume(stakeAmount > 0 && stakeAmount <= 10_000e18);
        vm.assume(slashAmount > 0 && slashAmount <= stakeAmount);

        vm.prank(staker);
        staking.stake(agentDigest, stakeAmount);

        vm.prank(owner);
        staking.slash(agentDigest, slashAmount, address(0), bytes32(0));

        assertEq(staking.totalStaked(), stakeAmount - slashAmount);
        assertEq(staking.totalSlashed(), slashAmount);
        assertEq(token.balanceOf(staking.BURN_ADDRESS()), slashAmount);

        if (slashAmount < stakeAmount) {
            (, uint128 amount,, uint128 slashedTotal) = staking.positionOf(agentDigest);
            assertEq(amount, stakeAmount - slashAmount);
            assertEq(slashedTotal, slashAmount);
        }
    }

    function testFuzzMultipleSlashesAccumulate(uint128 stakeAmount, uint8 slashCount) public {
        vm.assume(stakeAmount >= 100 && stakeAmount <= 10_000e18);
        vm.assume(slashCount > 0 && slashCount <= 10);

        vm.prank(staker);
        staking.stake(agentDigest, stakeAmount);

        uint128 perSlash = stakeAmount / (uint128(slashCount) + 1);
        vm.assume(perSlash > 0);

        uint128 expectedSlashed = 0;
        for (uint256 i = 0; i < slashCount; i++) {
            vm.prank(owner);
            staking.slash(agentDigest, perSlash, address(0), bytes32(0));
            expectedSlashed += perSlash;
        }

        (, uint128 remaining,, uint128 slashedTotal) = staking.positionOf(agentDigest);
        assertEq(remaining, stakeAmount - expectedSlashed);
        assertEq(slashedTotal, expectedSlashed);
        assertEq(staking.totalSlashed(), expectedSlashed);
    }
}
