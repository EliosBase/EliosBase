/**
 * Structured JSON logger for server-side code.
 * Emits structured logs that are parseable by log aggregators (Vercel, Datadog, etc.).
 * Respects LOG_LEVEL env var and automatically redacts common secret patterns.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ??
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Common patterns we never want to log in cleartext
const SECRET_KEYS = [
  'password',
  'secret',
  'token',
  'authorization',
  'auth',
  'api_key',
  'apikey',
  'private_key',
  'privatekey',
  'session',
];

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    // Redact what looks like a bearer/hex secret > 32 chars
    if (/^(Bearer\s+)?[A-Za-z0-9_\-.+/=]{32,}$/.test(value)) return '[REDACTED]';
    if (/^0x[a-fA-F0-9]{40,}$/.test(value) && value.length > 42) return '[REDACTED_HEX]';
    return value;
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.some((s) => key.toLowerCase().includes(s))) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactValue(val);
      }
    }
    return out;
  }
  return value;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const entry = {
    level,
    timestamp: new Date().toISOString(),
    message,
    ...(context ? { context: redactValue(context) as Record<string, unknown> } : {}),
  };

  const serialized = JSON.stringify(entry);

  if (level === 'error') {
    console.error(serialized);
  } else if (level === 'warn') {
    console.warn(serialized);
  } else {
    console.log(serialized);
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),

  /**
   * Create a child logger that automatically includes the given context in every log.
   * Useful for adding request IDs, user IDs, etc. across a code path.
   */
  child(baseContext: Record<string, unknown>) {
    return {
      debug: (msg: string, ctx?: Record<string, unknown>) =>
        emit('debug', msg, { ...baseContext, ...ctx }),
      info: (msg: string, ctx?: Record<string, unknown>) =>
        emit('info', msg, { ...baseContext, ...ctx }),
      warn: (msg: string, ctx?: Record<string, unknown>) =>
        emit('warn', msg, { ...baseContext, ...ctx }),
      error: (msg: string, ctx?: Record<string, unknown>) =>
        emit('error', msg, { ...baseContext, ...ctx }),
    };
  },
};
