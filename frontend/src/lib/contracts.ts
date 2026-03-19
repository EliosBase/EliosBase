/**
 * EliosEscrow contract ABI and address configuration.
 * ABI matches contracts/src/EliosEscrow.sol
 */

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
      { name: 'state', type: 'uint8', internalType: 'enum EliosEscrow.State' },
    ],
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
  // ─── Errors ───────────────────────────────────────────────
  { type: 'error', name: 'NotAuthorized', inputs: [] },
  { type: 'error', name: 'InvalidAmount', inputs: [] },
  { type: 'error', name: 'InvalidState', inputs: [] },
  { type: 'error', name: 'TransferFailed', inputs: [] },
  // ─── Receive/Fallback ────────────────────────────────────
  { type: 'receive', stateMutability: 'payable' },
  { type: 'fallback', stateMutability: 'payable' },
] as const;

export const ESCROW_CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '0x') as `0x${string}`;
