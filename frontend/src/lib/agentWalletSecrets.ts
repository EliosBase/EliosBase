import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { type Address, type Hex } from 'viem';
import { readRequiredEnv } from '@/lib/env';

type EncryptedSessionKey = {
  address: Address;
  ciphertext: string;
  nonce: string;
  tag: string;
};

function getEncryptionKey() {
  const encoded = readRequiredEnv('AGENT_SESSION_ENCRYPTION_KEY', process.env.AGENT_SESSION_ENCRYPTION_KEY);
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw new Error('AGENT_SESSION_ENCRYPTION_KEY must decode to 32 bytes');
  }
  return key;
}

export function generateEncryptedSessionKey(): EncryptedSessionKey & { privateKey: Hex } {
  const privateKey = `0x${randomBytes(32).toString('hex')}` as Hex;
  const address = privateKeyToAccount(privateKey).address as Address;
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), nonce);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(privateKey.slice(2), 'hex')),
    cipher.final(),
  ]);

  return {
    privateKey,
    address,
    ciphertext: ciphertext.toString('base64'),
    nonce: nonce.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptSessionKey(payload: {
  ciphertext: string;
  nonce: string;
  tag: string;
}): Hex {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(payload.nonce, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return `0x${plaintext.toString('hex')}` as Hex;
}
