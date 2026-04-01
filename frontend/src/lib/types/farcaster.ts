export interface FarcasterUser {
  fid: number;
  username: string;
  pfpUrl?: string;
}

export interface FarcasterSigner {
  signerUuid: string;
  publicKey: string;
  status: 'pending_approval' | 'approved' | 'revoked';
  approvedAt?: string;
}

export interface CastPublishRequest {
  text: string;
  embeds?: string[];
}

export interface CastPublishResponse {
  castHash: string;
  warpcastUrl: string;
}
