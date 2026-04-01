/** @jsxImportSource frog/jsx */

import { type Frog, Button } from 'frog';
import { createPublicServerClient } from '@/lib/supabase/server';
import { parseEther } from 'frog';
import { ESCROW_ABI } from '@/lib/contracts';
import {
  FrameContainer,
  FrameTitle,
  FrameSubtitle,
  FrameBadge,
  FrameLogo,
} from './components';

export function registerEscrowFrames(app: Frog) {
  const baseUrl = (process.env.NEXT_PUBLIC_FRAMES_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://eliosbase.net').trim();
  const escrowAddress = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as `0x${string}` | undefined;

  // Escrow lock preview frame — shows task + agent info with "Lock Escrow" button
  app.frame('/escrow/:taskId', async (c) => {
    const taskId = c.req.param('taskId');
    const supabase = createPublicServerClient();

    const { data: task } = await supabase
      .from('tasks')
      .select('id, title, reward, assigned_agent_id, assigned_agent_name, status')
      .eq('id', taskId)
      .single();

    if (!task) {
      return c.res({
        image: (
          <FrameContainer>
            <FrameTitle>Task Not Found</FrameTitle>
            <FrameSubtitle>Cannot lock escrow for a non-existent task.</FrameSubtitle>
            <FrameLogo />
          </FrameContainer>
        ),
      });
    }

    if (!task.assigned_agent_id) {
      return c.res({
        image: (
          <FrameContainer>
            <FrameTitle>No Agent Assigned</FrameTitle>
            <FrameSubtitle>This task needs an agent before escrow can be locked.</FrameSubtitle>
            <FrameLogo />
          </FrameContainer>
        ),
        intents: [
          <Button.Link href={`${baseUrl}/app/marketplace`}>Find an Agent</Button.Link>,
        ],
      });
    }

    return c.res({
      image: (
        <FrameContainer>
          <div style={{ display: 'flex', fontSize: '14px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
            Lock Escrow on Base
          </div>
          <FrameTitle>{task.title?.slice(0, 50) || 'Task'}</FrameTitle>
          <FrameSubtitle>Lock ETH into the EliosBase escrow contract for this task.</FrameSubtitle>
          <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
            <FrameBadge label="Amount" value={task.reward ?? '—'} color="#22c55e" />
            <FrameBadge label="Agent" value={task.assigned_agent_name ?? 'Unknown'} />
            <FrameBadge label="Status" value={task.status ?? '—'} />
          </div>
          <FrameLogo />
        </FrameContainer>
      ),
      intents: [
        <Button.Transaction target={`/escrow/${taskId}/tx`}>Lock Escrow</Button.Transaction>,
        <Button.Link href={`${baseUrl}/app/tasks`}>View on EliosBase</Button.Link>,
      ],
    });
  });

  // Transaction handler — returns the calldata for lockFunds()
  app.transaction('/escrow/:taskId/tx', async (c) => {
    const taskId = c.req.param('taskId');
    const supabase = createPublicServerClient();

    const { data: task } = await supabase
      .from('tasks')
      .select('id, reward, assigned_agent_id')
      .eq('id', taskId)
      .single();

    if (!task || !task.assigned_agent_id || !escrowAddress) {
      throw new Error('Task, agent, or escrow contract not found');
    }

    // Parse reward string (e.g. "0.01 ETH") to wei
    const rewardNum = task.reward?.replace(/[^0-9.]/g, '') || '0';

    // Convert IDs to bytes32
    const taskIdBytes32 = stringToBytes32(taskId);
    const agentIdBytes32 = stringToBytes32(task.assigned_agent_id);

    return c.contract({
      abi: ESCROW_ABI,
      chainId: 'eip155:8453',
      functionName: 'lockFunds',
      to: escrowAddress,
      args: [taskIdBytes32, agentIdBytes32],
      value: parseEther(rewardNum),
    });
  });
}

function stringToBytes32(value: string): `0x${string}` {
  const hex = Buffer.from(value).toString('hex').padEnd(64, '0').slice(0, 64);
  return `0x${hex}`;
}
