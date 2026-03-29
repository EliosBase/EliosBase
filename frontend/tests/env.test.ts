import { describe, expect, it } from 'vitest';
import { readEnv } from '@/lib/env';

describe('readEnv', () => {
  it('strips escaped trailing newlines from env values', () => {
    expect(readEnv('https://example.test\\n')).toBe('https://example.test');
  });

  it('strips surrounding quotes after normalization', () => {
    expect(readEnv('"quoted-value\\n"')).toBe('quoted-value');
  });
});
