# Staking Owner — Pre-Launch TODO

The `EliosStaking` contract (see `contracts/src/EliosStaking.sol`) has a
single privileged role: `owner`. The owner can:

1. **Slash** any active stake position (`slash(agentDigest, amount, recipient, reason)`).
2. **Tune the unstake cooldown** within the hard limit of `MAX_COOLDOWN = 30 days`
   (`setUnstakeCooldown(newCooldown)`).
3. **Transfer ownership** via the standard OpenZeppelin `Ownable` flow.

That role is *not* upgradeable. There is no proxy. There is no admin
escape hatch beyond `transferOwnership`. Ownership is the only knob, so
who holds it matters.

## Current state

The deploy script (`script/DeployStaking.s.sol`) defaults the initial
owner to the deployer EOA. This is fine for local + testnet smoke tests
but **must not be the production state**.

When the script runs and detects `owner == deployer`, it prints a
warning pointing here. Do not ignore that warning.

## What needs to happen before mainnet launch

- [ ] **Deploy a multisig** for the EliosBase admin role.
      Recommended: a Safe (https://app.safe.global) on Base mainnet,
      with at least 3 signers and a 2-of-3 (or 3-of-5) threshold.
      Document the signer set in `SECURITY.md` so the community can
      audit it.

- [ ] **Verify the deployed staking contract** on Basescan so the
      multisig signers can read the source they're authorizing
      transactions against.

- [ ] **Transfer ownership** from the deployer EOA to the multisig:

      ```bash
      cast send $STAKING_ADDRESS \
        "transferOwnership(address)" $MULTISIG_ADDRESS \
        --rpc-url base --private-key $DEPLOYER_PRIVATE_KEY
      ```

      Then verify on Basescan that `owner()` returns the multisig.

- [ ] **Burn the deployer key** (or rotate it to a cold wallet that is
      never used to sign anything else). Once ownership has moved to
      the multisig the deployer EOA has no further authority over the
      staking contract, but minimizing the lateral surface is still
      good hygiene.

- [ ] **Document the slashing policy** in `runbooks/`. Specifically:
      what evidence threshold triggers a slash, who in the multisig
      can propose one, what the appeals window is, and where the
      `reason` bytes32 tag should be derived from
      (`keccak256("dispute:{task_id}")` is the suggested convention so
      off-chain indexers can correlate).

- [ ] **Set up monitoring** for `Slashed` and `UnstakeCooldownUpdated`
      events. Both should be rare in steady-state and a misconfigured
      owner is the most likely path to user funds being treated
      unfairly. Pipe them into the on-call Slack channel.

## Why this matters

Staking creates a credible commitment: an agent operator is putting
their own ELIOS up as a bond against bad behavior. That commitment is
only credible if:

1. There exists a real path by which misbehavior leads to slashing.
2. That path cannot be triggered arbitrarily by a single party.

A single EOA holding the slash role fails (2). It would let any
compromise of one wallet wipe out every staked position simultaneously.
A multisig with a thoughtful signer set + a documented dispute policy
gets us to "credible neutral" — which is the only state where staking
is worth the gas to interact with.

## What this contract intentionally does NOT do

For clarity to anyone reviewing this doc:

- It does **not** support multi-staker positions. Only one staker per
  agent. This is a deliberate choice to avoid having to define a fair
  slashing allocation rule across multiple counterparties.

- It does **not** auto-resolve disputes from on-chain evidence. All
  dispute resolution happens off-chain in the EliosBase admin surface.
  The owner is the delegated executor of those decisions.

- It does **not** let the owner pause, drain, or unilaterally withdraw
  positions. The only owner-side mutating actions are `slash` and
  `setUnstakeCooldown`. There is no `pause()`, no `emergencyWithdraw()`,
  no `setStaker()`. This is the floor of trust we ask stakers to extend.

- It does **not** auto-credit slashed tokens to a treasury. Slashed
  tokens default to the burn address (0x...dEaD). The owner can
  override per call when restitution to a specific party (e.g. the
  task buyer in a dispute) is more appropriate.
