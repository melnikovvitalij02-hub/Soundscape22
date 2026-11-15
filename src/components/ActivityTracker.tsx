import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ACTIVITY_HEARTBEAT_MS, sendActivityHeartbeat } from '@/lib/activityRewards';

export default function ActivityTracker() {
  const { session } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;

    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      sendActivityHeartbeat().catch((err) => console.error('Activity heartbeat failed:', err));
    };

    beat();
    const intervalId = window.setInterval(beat, ACTIVITY_HEARTBEAT_MS);
    document.addEventListener('visibilitychange', beat);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [userId]);

  return null;
}
