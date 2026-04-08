'use client';

import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';

async function resolveBasename(address: string): Promise<string | null> {
  try {
    // @ts-expect-error — sub-path export has no type declarations
    const mod = await import('@base-org/account/dist/core/username/getDisplayableUsername');
    const getDisplayableUsername = mod.getDisplayableUsername as (addr: Address) => Promise<string>;
    const name = await getDisplayableUsername(address as Address);
    // getDisplayableUsername returns the truncated address if no basename found
    if (name && !name.startsWith('0x')) {
      return name;
    }
    return null;
  } catch {
    return null;
  }
}

export function useBasename(address: string | undefined) {
  const { data: basename, isLoading } = useQuery({
    queryKey: ['basename', address],
    queryFn: () => resolveBasename(address!),
    enabled: !!address,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: false,
  });

  return {
    basename: basename ?? null,
    isLoading,
  };
}
