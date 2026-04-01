'use client';

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/providers/AuthProvider';

interface SignerStatus {
  status: 'none' | 'pending_approval' | 'approved' | 'revoked';
  signerUuid?: string;
  signerApprovalUrl?: string;
}

export function useFarcasterSigner() {
  const { session } = useAuthContext();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<SignerStatus>({
    queryKey: ['farcaster-signer'],
    queryFn: async () => {
      const res = await fetch('/api/auth/farcaster/signer');
      return res.json();
    },
    enabled: !!session?.fid,
    refetchInterval: (query) => {
      // Poll every 5s while pending approval
      return query.state.data?.status === 'pending_approval' ? 5000 : false;
    },
  });

  const { mutate: requestSigner, isPending: isRequesting } = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/auth/farcaster/signer', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create signer');
      }
      return res.json() as Promise<SignerStatus>;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['farcaster-signer'], result);
      // Open Warpcast approval deep link
      if (result.signerApprovalUrl) {
        window.open(result.signerApprovalUrl, '_blank', 'noopener,noreferrer');
      }
    },
  });

  const handleRequestSigner = useCallback(() => {
    requestSigner();
  }, [requestSigner]);

  return {
    signerStatus: data?.status ?? 'none',
    signerUuid: data?.signerUuid,
    isLoading,
    isRequesting,
    requestSigner: handleRequestSigner,
  };
}
