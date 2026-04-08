function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export function getAgentPath(id: string) {
  return `/agents/${encodeURIComponent(id)}`;
}

export function getTaskPath(id: string) {
  return `/tasks/${encodeURIComponent(id)}`;
}

export function getAgentFramePath(id: string) {
  return `/api/frames/agent/${encodeURIComponent(id)}`;
}

export function getTaskFramePath(id: string) {
  return `/api/frames/task/${encodeURIComponent(id)}`;
}

export function buildAbsoluteUrl(path: string, baseUrl?: string) {
  if (!baseUrl) {
    return path;
  }

  return new URL(path, `${trimTrailingSlash(baseUrl)}/`).toString();
}

export function buildWarpcastComposeUrl(text: string, embedUrl?: string) {
  const url = new URL('https://warpcast.com/~/compose');
  url.searchParams.set('text', text);

  if (embedUrl) {
    url.searchParams.append('embeds[]', embedUrl);
  }

  return url.toString();
}

export function buildAgentShareText(name: string, tasksCompleted: number, reputationScore: number) {
  return `Check out ${name} on EliosBase — ${tasksCompleted} tasks completed with ${reputationScore}% Web4 reputation`;
}

export function buildTaskShareText(title: string, proofStatus: 'verified' | 'verifying' | 'pending' | 'failed') {
  const proofLabel = proofStatus === 'verified'
    ? 'verified with a ZK proof on Base'
    : proofStatus === 'verifying'
      ? 'moving through ZK verification on Base'
      : 'tracked on Base with escrow and proof state';

  return `Task on EliosBase: "${title}" — ${proofLabel}`;
}
