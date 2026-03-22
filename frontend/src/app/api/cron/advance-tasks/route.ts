import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// GET /api/cron/advance-tasks — batch-advance all eligible active tasks
// Can be called by Vercel cron, external scheduler, or manual trigger
export async function GET(req: NextRequest) {
  // Verify cron secret in production
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createServiceClient();

  // Fetch all active tasks
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id')
    .eq('status', 'active');

  if (error || !tasks) {
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }

  const results = [];

  for (const task of tasks) {
    try {
      // Call the individual advance endpoint internally
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      const res = await fetch(`${baseUrl}/api/tasks/${task.id}/advance`, {
        method: 'POST',
      });
      const data = await res.json();
      results.push({ taskId: task.id, ...data });
    } catch (err) {
      results.push({ taskId: task.id, advanced: false, error: String(err) });
    }
  }

  const advanced = results.filter((r) => r.advanced).length;

  return NextResponse.json({
    total: tasks.length,
    advanced,
    results,
  });
}
