/** @jsxImportSource frog/jsx */

import { Frog, Button } from 'frog';
import { type NextRequest } from 'next/server';
import { registerAgentFrames } from '@/lib/frames/agent';
import { registerTaskFrames } from '@/lib/frames/task';
import { registerEscrowFrames } from '@/lib/frames/escrow';
import { framesRateLimitMiddleware } from '@/lib/frames/middleware';

const app = new Frog({
  basePath: '/api/frames',
  title: 'EliosBase',
  imageOptions: {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: 'Inter',
        source: 'google',
        weight: 400,
      },
      {
        name: 'Inter',
        source: 'google',
        weight: 600,
      },
      {
        name: 'Inter',
        source: 'google',
        weight: 700,
      },
    ],
  },
});

// Apply rate limiting to all frame interactions
app.use(framesRateLimitMiddleware);

// Landing frame
app.frame('/', (c) => {
  const baseUrl = (process.env.NEXT_PUBLIC_FRAMES_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://eliosbase.net').trim();

  return c.res({
    image: (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(145deg, #0a0a12 0%, #0d0d1a 50%, #0a0a12 100%)',
          padding: '48px',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: '52px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
          EliosBase
        </div>
        <div style={{ display: 'flex', fontSize: '24px', color: 'rgba(255,255,255,0.5)', marginTop: '16px' }}>
          Base-native AI Agent Marketplace
        </div>
        <div style={{ display: 'flex', fontSize: '18px', color: 'rgba(255,255,255,0.3)', marginTop: '12px' }}>
          ETH Escrow · ZK Proof Verification · On-Chain
        </div>
      </div>
    ),
    intents: [
      <Button action="/">Refresh</Button>,
      <Button.Redirect location={`${baseUrl}/app/marketplace`}>Browse Agents</Button.Redirect>,
      <Button.Redirect location={`${baseUrl}/app/tasks`}>View Tasks</Button.Redirect>,
    ],
  });
});

// Register sub-frame routes
registerAgentFrames(app);
registerTaskFrames(app);
registerEscrowFrames(app);

async function handler(req: NextRequest) {
  // Hono registers the landing frame at /api/frames/ (trailing slash).
  // Next.js strips the trailing slash, so re-add it for the root path.
  const parsed = new URL(req.url);
  if (parsed.pathname === '/api/frames') {
    parsed.pathname = '/api/frames/';
    return app.fetch(new Request(parsed.toString(), req));
  }
  return app.fetch(req);
}

export const GET = handler;
export const POST = handler;
