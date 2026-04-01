'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mb-5">
        <span className="text-red-400 text-2xl">!</span>
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">Tasks Error</h2>
      <p className="text-sm text-white/50 max-w-md mb-6">
        {error.message || 'Something went wrong loading this page.'}
      </p>
      <button
        onClick={reset}
        className="px-6 py-2.5 rounded-xl bg-white text-black font-semibold hover:bg-white/90 transition-colors cursor-pointer"
      >
        Try again
      </button>
    </div>
  );
}
