'use client';

export function useBasename() {
  // The Base Account SDK no longer exports the basename helper this UI used.
  // Keep the deterministic address fallback until we wire a real resolver.
  return {
    basename: null,
    isLoading: false,
  };
}
