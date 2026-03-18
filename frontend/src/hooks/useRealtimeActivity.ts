'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function useRealtimeActivity() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('activity-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_events' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['activity'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
