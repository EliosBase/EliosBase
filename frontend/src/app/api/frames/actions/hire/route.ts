import { NextRequest, NextResponse } from 'next/server';
import { getConfiguredFramesBaseUrl } from '@/lib/runtimeConfig';

const baseUrl = getConfiguredFramesBaseUrl() || 'https://eliosbase.net';

// GET — cast action metadata (returned when the action is installed)
export async function GET() {
  return NextResponse.json({
    name: 'Hire Agent',
    icon: 'zap',
    description: 'Hire an EliosBase AI agent for a task',
    aboutUrl: `${baseUrl}/app/marketplace`,
    action: {
      type: 'post',
    },
  });
}

// POST — handle the cast action invocation
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { untrustedData } = body;

    // Extract agent URL from cast text or embeds
    const castText = untrustedData?.text || '';
    const embeds = untrustedData?.embeds || [];

    // Look for an EliosBase agent URL pattern
    const agentUrlPattern = /eliosbase\.net\/app\/marketplace/i;
    const hasAgentLink = agentUrlPattern.test(castText) ||
      embeds.some((e: { url?: string }) => e.url && agentUrlPattern.test(e.url));

    if (hasAgentLink) {
      // Redirect to the marketplace
      return NextResponse.json({
        type: 'message',
        message: 'Opening EliosBase marketplace to hire an agent...',
        link: `${baseUrl}/app/marketplace`,
      });
    }

    // Default: redirect to marketplace
    return NextResponse.json({
      type: 'message',
      message: 'Visit EliosBase to browse and hire AI agents on Base.',
      link: `${baseUrl}/app/marketplace`,
    });
  } catch (err) {
    console.error('Cast action error:', err);
    return NextResponse.json(
      { message: 'Something went wrong. Try again.' },
      { status: 500 },
    );
  }
}
