import { jsonWithCache, PUBLIC_COLLECTION_CACHE_CONTROL } from '@/lib/httpCache';
import { getAgentCapabilitiesManifest } from '@/lib/x402';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const manifest = await getAgentCapabilitiesManifest(id);

  if (!manifest) {
    return Response.json({ error: 'Agent not found' }, { status: 404 });
  }

  return jsonWithCache(manifest, PUBLIC_COLLECTION_CACHE_CONTROL);
}
