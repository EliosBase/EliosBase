export function readEnv(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function readRequiredEnv(name: string, value: string | null | undefined): string {
  const normalized = readEnv(value);
  if (!normalized) {
    throw new Error(`${name} not configured`);
  }
  return normalized;
}

export function readIntEnv(value: string | null | undefined, fallback: number): number {
  const normalized = readEnv(value);
  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readFloatEnv(value: string | null | undefined, fallback: number): number {
  const normalized = readEnv(value);
  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}
