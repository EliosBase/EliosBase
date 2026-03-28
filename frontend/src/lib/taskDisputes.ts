const TASK_DISPUTE_SOURCE_PREFIX = 'Task Dispute · ';

export function buildTaskDisputeSource(taskId: string) {
  return `${TASK_DISPUTE_SOURCE_PREFIX}${taskId}`;
}

export function getTaskIdFromDisputeSource(source: string | null | undefined) {
  if (!source?.startsWith(TASK_DISPUTE_SOURCE_PREFIX)) {
    return null;
  }

  return source.slice(TASK_DISPUTE_SOURCE_PREFIX.length) || null;
}
