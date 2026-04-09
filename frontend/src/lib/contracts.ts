/**
 * EliosEscrow contract ABI and address configuration.
 * ABI matches contracts/src/EliosEscrow.sol
 */
import { readEnv } from '@/lib/env';

export const ESCROW_ABI = [
  {
    type: 'constructor',
    inputs: [],
    stateMutability: 'nonpayable',
  },
  // ─── Functions ────────────────────────────────────────────
  {
    type: 'function',
    name: 'lockFunds',
    inputs: [
      { name: 'taskId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'agentId', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'releaseFunds',
    inputs: [
      { name: 'taskId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'recipient', type: 'address', internalType: 'address payable' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'refund',
    inputs: [
      { name: 'taskId', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getEscrow',
    inputs: [
      { name: 'taskId', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [
      { name: 'depositor', type: 'address', internalType: 'address' },
      { name: 'agentId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
      { name: 'lockedAt', type: 'uint256', internalType: 'uint256' },
      { name: 'state', type: 'uint8', internalType: 'enum EliosEscrow.State' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'disputeEscrow',
    inputs: [
      { name: 'taskId', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'resolveDispute',
    inputs: [
      { name: 'taskId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'recipient', type: 'address', internalType: 'address payable' },
      { name: 'recipientShare', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'expiredRefund',
    inputs: [
      { name: 'taskId', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'MAX_LOCK_DURATION',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  // ─── Events ───────────────────────────────────────────────
  {
    type: 'event',
    name: 'FundsLocked',
    inputs: [
      { name: 'taskId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'agentId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'depositor', type: 'address', indexed: false, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'FundsReleased',
    inputs: [
      { name: 'taskId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'recipient', type: 'address', indexed: false, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'FundsRefunded',
    inputs: [
      { name: 'taskId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'depositor', type: 'address', indexed: false, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'EscrowDisputed',
    inputs: [
      { name: 'taskId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'initiator', type: 'address', indexed: false, internalType: 'address' },
    ],
  },
  {
    type: 'event',
    name: 'DisputeResolved',
    inputs: [
      { name: 'taskId', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'recipient', type: 'address', indexed: false, internalType: 'address' },
      { name: 'recipientAmount', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'depositor', type: 'address', indexed: false, internalType: 'address' },
      { name: 'depositorAmount', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
  },
  // ─── Errors ───────────────────────────────────────────────
  { type: 'error', name: 'NotAuthorized', inputs: [] },
  { type: 'error', name: 'InvalidAmount', inputs: [] },
  { type: 'error', name: 'InvalidState', inputs: [] },
  { type: 'error', name: 'TransferFailed', inputs: [] },
  { type: 'error', name: 'LockNotExpired', inputs: [] },
  { type: 'error', name: 'InvalidSplit', inputs: [] },
  // ─── Receive/Fallback ────────────────────────────────────
  { type: 'receive', stateMutability: 'payable' },
  { type: 'fallback', stateMutability: 'payable' },
] as const;

export const ESCROW_CONTRACT_ADDRESS = (readEnv(process.env.NEXT_PUBLIC_ESCROW_ADDRESS) ?? '0x') as `0x${string}`;

// ─── USDC Escrow Contract ──────────────────────────────────────────

const USDC_MAINNET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

export const USDC_TOKEN_ADDRESS = (
  readEnv(process.env.NEXT_PUBLIC_USDC_TOKEN_ADDRESS)
    ?? (readEnv(process.env.NEXT_PUBLIC_CHAIN) === 'testnet' ? USDC_SEPOLIA : USDC_MAINNET)
) as `0x${string}`;

export const USDC_TOKEN_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
] as const;

export const USDC_ESCROW_ABI = [
  {
    type: 'constructor',
    inputs: [{ name: '_usdc', type: 'address' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'lockFunds',
    inputs: [
      { name: 'taskId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'agentId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'releaseFunds',
    inputs: [
      { name: 'taskId', type: 'bytes32', internalType: 'bytes32' },
      { name: 'recipient', type: 'address', internalType: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'refund',
    inputs: [
      { name: 'taskId', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getEscrow',
    inputs: [
      { name: 'taskId', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [
      { name: 'depositor', type: 'address' },
      { name: 'agentId', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
      { name: 'lockedAt', type: 'uint256' },
      { name: 'state', type: 'uint8' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'FundsLocked',
    inputs: [
      { name: 'taskId', type: 'bytes32', indexed: true },
      { name: 'agentId', type: 'bytes32', indexed: true },
      { name: 'depositor', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'FundsReleased',
    inputs: [
      { name: 'taskId', type: 'bytes32', indexed: true },
      { name: 'recipient', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'FundsRefunded',
    inputs: [
      { name: 'taskId', type: 'bytes32', indexed: true },
      { name: 'depositor', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  { type: 'error', name: 'NotAuthorized', inputs: [] },
  { type: 'error', name: 'InvalidAmount', inputs: [] },
  { type: 'error', name: 'InvalidState', inputs: [] },
  { type: 'error', name: 'TransferFailed', inputs: [] },
  { type: 'error', name: 'LockNotExpired', inputs: [] },
  { type: 'error', name: 'InvalidSplit', inputs: [] },
] as const;

export const USDC_ESCROW_CONTRACT_ADDRESS = (readEnv(process.env.NEXT_PUBLIC_USDC_ESCROW_ADDRESS) ?? '0x') as `0x${string}`;

// ─── ZK Proof Verifier Contract ────────────────────────────────────

export const VERIFIER_CONTRACT_ADDRESS = (readEnv(process.env.NEXT_PUBLIC_VERIFIER_ADDRESS) ?? '0x') as `0x${string}`;

export const VERIFIER_ABI = [
  {
    type: 'function',
    name: 'verifyTaskProof',
    inputs: [
      { name: 'taskId', type: 'bytes32' },
      { name: '_pA', type: 'uint256[2]' },
      { name: '_pB', type: 'uint256[2][2]' },
      { name: '_pC', type: 'uint256[2]' },
      { name: '_pubSignals', type: 'uint256[1]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'isVerified',
    inputs: [{ name: 'taskId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'taskCommitment',
    inputs: [{ name: 'taskId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'ProofVerified',
    inputs: [
      { name: 'taskId', type: 'bytes32', indexed: true },
      { name: 'commitment', type: 'uint256', indexed: false },
      { name: 'submitter', type: 'address', indexed: false },
    ],
  },
] as const;
