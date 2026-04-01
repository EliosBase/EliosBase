import { NeynarAPIClient } from '@neynar/nodejs-sdk';

let client: NeynarAPIClient | null = null;

function getClient(): NeynarAPIClient {
  if (client) return client;

  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    throw new Error('NEYNAR_API_KEY is not configured');
  }

  client = new NeynarAPIClient({ apiKey });
  return client;
}

export async function createManagedSigner(fid: number) {
  const neynar = getClient();
  const signer = await neynar.createSigner();
  return {
    signerUuid: signer.signer_uuid,
    publicKey: signer.public_key,
    status: signer.status as string,
    signerApprovalUrl: signer.signer_approval_url,
  };
}

export async function checkSignerStatus(signerUuid: string) {
  const neynar = getClient();
  const signer = await neynar.lookupSigner({ signerUuid });
  return {
    signerUuid: signer.signer_uuid,
    status: signer.status as string,
    fid: signer.fid,
  };
}

export async function publishCast(
  signerUuid: string,
  text: string,
  embeds?: string[],
) {
  const neynar = getClient();
  const embedObjects = embeds?.map((url) => ({ url }));
  const result = await neynar.publishCast({
    signerUuid,
    text,
    embeds: embedObjects,
  });
  return {
    castHash: result.cast.hash,
    warpcastUrl: `https://warpcast.com/~/conversations/${result.cast.hash}`,
  };
}

export async function deleteCast(signerUuid: string, castHash: string) {
  const neynar = getClient();
  await neynar.deleteCast({ signerUuid, targetHash: castHash });
}
