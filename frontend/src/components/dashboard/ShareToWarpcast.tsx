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
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-purple-300 bg-purple-500/10 border border-purple-500/15 hover:bg-purple-500/20 transition-colors ${className ?? ''}`}
      title="Share on Warpcast"
    >
      <Share2 size={10} />
      <span>Warpcast</span>
    </button>
  );
}
