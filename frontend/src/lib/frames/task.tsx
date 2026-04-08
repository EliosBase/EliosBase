/** @jsxImportSource frog/jsx */

import { type Frog, Button } from 'frog';
import { createPublicServerClient } from '@/lib/supabase/server';
import { getConfiguredFramesBaseUrl } from '@/lib/runtimeConfig';
import { getTaskPath } from '@/lib/web4Links';
import {
  FrameContainer,
  FrameTitle,
  FrameSubtitle,
  FrameBadge,
  FrameLogo,
  FrameProgressBar,
} from './components';

const TASK_STEPS = ['Submitted', 'Decomposed', 'Assigned', 'Executing', 'ZK Verifying', 'Complete'];

export function registerTaskFrames(app: Frog) {
  const baseUrl = getConfiguredFramesBaseUrl() || 'https://eliosbase.net';

  // Task status frame
  app.frame('/task/:taskId', async (c) => {
    const taskId = c.req.param('taskId');
    const supabase = createPublicServerClient();

    const { data: task } = await supabase
      .from('tasks')
      .select('id, title, description, status, current_step, reward, assigned_agent_name, zk_proof_id')
      .eq('id', taskId)
      .single();

    if (!task) {
      return c.res({
        image: (
          <FrameContainer>
            <FrameTitle>Task Not Found</FrameTitle>
            <FrameSubtitle>This task does not exist on EliosBase.</FrameSubtitle>
            <FrameLogo />
          </FrameContainer>
        ),
      });
    }

    const currentStepIndex = TASK_STEPS.indexOf(task.current_step ?? 'Submitted');
    const proofStatus = task.zk_proof_id
      ? 'Verified'
      : task.current_step === 'ZK Verifying'
        ? 'Verifying...'
        : 'Pending';

    const proofColor = task.zk_proof_id ? '#22c55e' : task.current_step === 'ZK Verifying' ? '#eab308' : 'rgba(255,255,255,0.5)';

    return c.res({
      image: (
        <FrameContainer>
          <div style={{ display: 'flex', fontSize: '14px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
            Task · {task.status}
          </div>
          <FrameTitle>{task.title?.slice(0, 60) || 'Untitled Task'}</FrameTitle>
          <FrameSubtitle>{task.description?.slice(0, 100) || ''}</FrameSubtitle>
          <FrameProgressBar steps={TASK_STEPS} currentIndex={currentStepIndex} />
          <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
            <FrameBadge label="Reward" value={task.reward ?? '—'} />
            <FrameBadge label="Agent" value={task.assigned_agent_name ?? 'Unassigned'} />
            <FrameBadge label="ZK Proof" value={proofStatus} color={proofColor} />
          </div>
          <FrameLogo />
        </FrameContainer>
      ),
      intents: [
        <Button action={`/task/${taskId}`}>Refresh</Button>,
        <Button.Link href={`${baseUrl}${getTaskPath(taskId)}`}>Open Receipt</Button.Link>,
      ],
    });
  });
}
