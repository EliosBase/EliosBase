const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function parsePagination(
  searchParams: URLSearchParams,
  {
    defaultLimit = DEFAULT_LIMIT,
    maxLimit = MAX_LIMIT,
  }: {
    defaultLimit?: number;
    maxLimit?: number;
  } = {},
) {
  const requestedLimit = parsePositiveInteger(searchParams.get('limit'), defaultLimit);
  const requestedOffset = parsePositiveInteger(searchParams.get('offset'), 0);

  return {
    limit: Math.min(requestedLimit || defaultLimit, maxLimit),
    offset: requestedOffset,
  };
}
