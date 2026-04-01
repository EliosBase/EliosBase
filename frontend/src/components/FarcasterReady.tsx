'use client';

import { useEffect } from 'react';

export default function FarcasterReady() {
  useEffect(() => {
    async function init() {
      try {
        const { default: sdk } = await import('@farcaster/frame-sdk');
        await sdk.actions.ready();
      } catch {
        // Not in a Farcaster frame context — ignore
      }
    }
    init();
  }, []);

  return null;
}
