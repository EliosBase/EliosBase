'use client';

import { Share2 } from 'lucide-react';

interface ShareToWarpcastProps {
  text: string;
  embedUrl?: string;
  className?: string;
}

export default function ShareToWarpcast({ text, embedUrl, className }: ShareToWarpcastProps) {
  function handleShare() {
    const params = new URLSearchParams();
    params.set('text', text);
    if (embedUrl) {
      params.append('embeds[]', embedUrl);
    }
    window.open(
      `https://warpcast.com/~/compose?${params.toString()}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  return (
    <button
      onClick={handleShare}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-purple-500/15 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-300 transition-colors hover:bg-purple-500/20 ${className ?? ''}`}
      title="Share on Warpcast"
    >
      <Share2 size={12} />
      <span>Warpcast</span>
    </button>
  );
}
