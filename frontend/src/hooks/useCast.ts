'use client';

import { useMutation } from '@tanstack/react-query';

interface CastResult {
  castHash: string;
  warpcastUrl: string;
}

export function useCast() {
  const { mutate: publish, isPending, isSuccess, error, data, reset } = useMutation<
    CastResult,
    Error,
    { text: string; embeds?: string[] }
  >({
    mutationFn: async ({ text, embeds }) => {
      const res = await fetch('/api/cast/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, embeds }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to publish cast');
      }

      return res.json();
    },
  });

  return {
    publish,
    isPending,
    isSuccess,
    error: error?.message ?? null,
    castHash: data?.castHash,
    warpcastUrl: data?.warpcastUrl,
    reset,
  };
}
