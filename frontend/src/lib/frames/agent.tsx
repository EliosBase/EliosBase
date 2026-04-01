/** @jsxImportSource frog/jsx */

import { type Frog, Button } from 'frog';
import { createPublicServerClient } from '@/lib/supabase/server';
import {
  FrameContainer,
  FrameTitle,
  FrameSubtitle,
  FrameBadge,
  FrameLogo,
  FrameStatusDot,
} from './components';

export function registerAgentFrames(app: Frog) {
  const baseUrl = process.env.NEXT_PUBLIC_FRAMES_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://eliosbase.net';

  // Agent preview frame
  app.frame('/agent/:agentId', async (c) => {
    const agentId = c.req.param('agentId');
    const supabase = createPublicServerClient();

    const { data: agent } = await supabase
      .from('agents')
      .select('id, name, description, type, status, reputation, tasks_completed, price_per_task')
      .eq('id', agentId)
      .single();

    if (!agent) {
      return c.res({
        image: (
          <FrameContainer>
            <FrameTitle>Agent Not Found</FrameTitle>
            <FrameSubtitle>This agent does not exist on EliosBase.</FrameSubtitle>
            <FrameLogo />
          </FrameContainer>
        ),
      });
    }

    return c.res({
      image: (
        <FrameContainer>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <FrameStatusDot status={agent.status} />
            <div style={{ display: 'flex', fontSize: '14px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
              {agent.type} · {agent.status}
            </div>
          </div>
          <FrameTitle>{agent.name}</FrameTitle>
          <FrameSubtitle>{agent.description?.slice(0, 120) || 'AI agent on EliosBase'}</FrameSubtitle>
          <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
            <FrameBadge label="Reputation" value={`${agent.reputation}%`} color="#22c55e" />
            <FrameBadge label="Tasks Done" value={String(agent.tasks_completed ?? 0)} />
            <FrameBadge label="Price" value={agent.price_per_task ?? '—'} />
          </div>
          <FrameLogo />
        </FrameContainer>
      ),
      intents: [
        <Button action={`/agent/${agentId}`}>Refresh</Button>,
        <Button.Link href={`${baseUrl}/app/marketplace`}>View on EliosBase</Button.Link>,
      ],
    });
  });
}
