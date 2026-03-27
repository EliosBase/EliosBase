import type { DbActivityEvent, DbSecurityAlert, DbTask } from '@/lib/types/database';

const signerBalanceAlertTitle = 'Proof signer balance low';
const signerBalanceAlertSource = 'Signer Balance Monitor';
const smokeTaskPatterns = [
  /^Smoke E2E\b/i,
  /^Smoke Test\b/i,
];
const smokeActivityPatterns = [
  /\bSmoke E2E\b/i,
  /\bSmoke Test\b/i,
];

function matchesPattern(value: string | null | undefined, patterns: RegExp[]) {
  if (!value) return false;
  return patterns.some((pattern) => pattern.test(value));
}

export function isSmokeTask(row: Pick<DbTask, 'title' | 'description'>) {
  return matchesPattern(row.title, smokeTaskPatterns)
    || row.description === 'Temporary live task to verify the deployed execution pipeline.';
}

export function isPublicActivityEvent(row: Pick<DbActivityEvent, 'message'>) {
  return !matchesPattern(row.message, smokeActivityPatterns);
}

export function dedupeSignerBalanceAlerts<T extends Pick<DbSecurityAlert, 'title' | 'source' | 'resolved'>>(rows: T[]) {
  let hasOpenSignerAlert = false;

  return rows.filter((row) => {
    const isSignerAlert = row.title === signerBalanceAlertTitle && row.source === signerBalanceAlertSource;
    if (!isSignerAlert) return true;
    if (row.resolved) return true;
    if (hasOpenSignerAlert) return false;
    hasOpenSignerAlert = true;
    return true;
  });
}

export function collapseNoisyActivity<T extends Pick<DbActivityEvent, 'message'>>(rows: T[]) {
  let hasSignerBalanceEvent = false;

  return rows.filter((row) => {
    if (!isPublicActivityEvent(row)) {
      return false;
    }

    if (row.message !== `Security alert: ${signerBalanceAlertTitle}`) {
      return true;
    }

    if (hasSignerBalanceEvent) {
      return false;
    }

    hasSignerBalanceEvent = true;
    return true;
  });
}

export function isSignerBalanceAlert(row: Pick<DbSecurityAlert, 'title' | 'source'>) {
  return row.title === signerBalanceAlertTitle && row.source === signerBalanceAlertSource;
}
