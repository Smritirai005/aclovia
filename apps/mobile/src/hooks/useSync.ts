import { useEffect, useRef, useCallback } from 'react';
import { StudentState, SyncPayload, SyncResponse, FocusSession, TaskUpdate } from '../types';
import {
  getIsOnline, getPendingSessions, getPendingTaskUpdates,
  getLocalState, saveLocalState, syncLamport,
  removeSyncedSessions, clearPendingTaskUpdates,
  CLIENT_ID,
} from '../storage';

const SERVER = 'http://localhost:3001';
const STUDENT_ID = 'student-001';
const SYNC_INTERVAL_MS = 5000; // poll every 5s when online

interface UseSyncOptions {
  onSyncSuccess: (serverState: StudentState) => void;
  onPendingCountChange: (count: number) => void;
}

export function useSync({ onSyncSuccess, onPendingCountChange }: UseSyncOptions) {
  const isSyncing = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    const [sessions, tasks] = await Promise.all([
      getPendingSessions(),
      getPendingTaskUpdates(),
    ]);
    onPendingCountChange(sessions.length + tasks.length);
  }, [onPendingCountChange]);

  const sync = useCallback(async (): Promise<boolean> => {
    if (isSyncing.current) return false;

    const online = await getIsOnline();
    if (!online) return false;

    const [pendingSessions, pendingTaskUpdates] = await Promise.all([
      getPendingSessions(),
      getPendingTaskUpdates(),
    ]);

    // Nothing to sync
    if (pendingSessions.length === 0 && pendingTaskUpdates.length === 0) return true;

    isSyncing.current = true;

    try {
      const current = await getLocalState();
      const payload: SyncPayload = {
        studentId: STUDENT_ID,
        clientId: CLIENT_ID,
        pendingSessions,
        pendingTaskUpdates,
        lastKnownLamport: current?.lamportClock ?? 0,
      };

      const resp = await fetch(`${SERVER}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) throw new Error(`Server error ${resp.status}`);

      const data: SyncResponse = await resp.json();

      // Server is authoritative — replace local state
      await saveLocalState(data.serverState);
      await syncLamport(data.serverState.lamportClock);

      // Only remove sessions the server confirmed it applied
      // (server returns IDs it deduped or applied)
      await removeSyncedSessions(data.confirmedSessionIds);
      await clearPendingTaskUpdates();

      onSyncSuccess(data.serverState);
      await refreshPendingCount();
      return true;
    } catch (err) {
      console.warn('[sync] failed, will retry:', err);
      return false;
    } finally {
      isSyncing.current = false;
    }
  }, [onSyncSuccess, refreshPendingCount]);

  // Auto-sync loop: every 5s when online
  useEffect(() => {
    const interval = setInterval(async () => {
      const online = await getIsOnline();
      if (online) await sync();
    }, SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [sync]);

  return { sync, refreshPendingCount };
}