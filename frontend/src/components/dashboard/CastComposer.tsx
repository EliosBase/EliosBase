'use client';

import { useState } from 'react';
import { CheckCircle, ExternalLink, Loader2, X } from 'lucide-react';
import { useCast } from '@/hooks/useCast';

interface CastComposerProps {
  defaultText?: string;
  embedUrl?: string;
  onClose: () => void;
}

export default function CastComposer({ defaultText, embedUrl, onClose }: CastComposerProps) {
  const [text, setText] = useState(defaultText ?? '');
  const { publish, isPending, isSuccess, error, warpcastUrl, reset } = useCast();

  function handleSubmit() {
    if (!text.trim() || isPending) return;
    publish({ text: text.trim(), embeds: embedUrl ? [embedUrl] : undefined });
  }

  const remaining = 320 - text.length;
  const isOverLimit = remaining < 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-2xl border border-white/10 bg-[#0b0b10] p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)]">
            Cast to Farcaster
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {isSuccess ? (
          <div className="text-center py-6">
            <CheckCircle size={32} className="text-green-400 mx-auto mb-3" />
            <p className="text-sm text-white mb-2">Cast published!</p>
            {warpcastUrl && (
              <a
                href={warpcastUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200 transition-colors"
              >
                View on Warpcast <ExternalLink size={10} />
              </a>
            )}
            <button
              onClick={onClose}
              className="mt-4 block mx-auto px-4 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white hover:bg-white/15 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (error) reset();
              }}
              rows={4}
              maxLength={400}
              placeholder="What's happening on Base?"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none transition focus:border-white/25 resize-none"
            />

            <div className="flex items-center justify-between mt-2">
              <span className={`text-[11px] ${isOverLimit ? 'text-red-400' : 'text-white/30'}`}>
                {remaining} characters remaining
              </span>
              {embedUrl && (
                <span className="text-[10px] text-white/25 truncate max-w-[200px]">
                  Embed: {embedUrl}
                </span>
              )}
            </div>

            {error && (
              <p className="mt-2 text-xs text-red-400">{error}</p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/8 text-white/70 hover:bg-white/12 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending || isOverLimit || !text.trim()}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-purple-500 text-white hover:bg-purple-400 transition-colors disabled:opacity-50"
              >
                {isPending ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> Casting...
                  </span>
                ) : (
                  'Cast'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
