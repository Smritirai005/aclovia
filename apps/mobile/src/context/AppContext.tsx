import React, {
  createContext, useContext, useEffect, useState, useRef, useCallback,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  getLocalState, saveLocalState, addPendingSession, addPendingTaskUpdate,
  getIsOnline, setIsOnline, tickLamport, saveActiveSession,
  getActiveSession, clearActiveSession, CLIENT_ID, getPendingCount,
} from '../storage';
import { StudentState, FocusSession, TaskStatus, TaskUpdate } from '../types';
import { useAppBackground } from '../hooks/useAppBackground';
import { useSync } from '../hooks/useSync';

const SERVER = 'http://localhost:3001';
const STUDENT_ID = 'student-001';
const COINS_PER_SESSION = 50;

export interface ConflictRecord {
  taskId: string;
  localStatus: TaskStatus;
  serverStatus: TaskStatus;
  resolvedTo: TaskStatus;
  resolvedAt: number;
}

interface AppContextValue {
  state: StudentState | null;
  isOnline: boolean;
  activeSession: FocusSession | null;
  elapsedSeconds: number;
  pendingCount: number;
  conflicts: ConflictRecord[];
  toggleOnline: () => Promise<void>;
  startSession: (targetMinutes: number) => Promise<void>;
  giveUpSession: () => Promise<void>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  sync: () => Promise<boolean>;
}

const AppContext = createContext<AppContextValue>(null as any);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StudentState | null>(null);
  const [isOnline, setOnlineState] = useState(true);
  const [activeSession, setActiveSession] = useState<FocusSession | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSessionRef = useRef<FocusSession | null>(null);
  activeSessionRef.current = activeSession;

  // ── Sync hook ──────────────────────────────────────────────────────────────
  const { sync, refreshPendingCount } = useSync({
    onSyncSuccess: (serverState) => {
      // Detect any conflicts between what server resolved vs what we had locally
      setState(prev => {
        if (!prev) return serverState;

        const newConflicts: ConflictRecord[] = [];

        for (const subject of prev.subjects) {
          for (const chapter of subject.chapters) {
            for (const localTask of chapter.tasks) {
              const serverSubject = serverState.subjects.find(s => s.id === subject.id);
              const serverChapter = serverSubject?.chapters.find(c => c.id === chapter.id);
              const serverTask = serverChapter?.tasks.find(t => t.id === localTask.id);

              if (serverTask && serverTask.status !== localTask.status) {
                newConflicts.push({
                  taskId: localTask.id,
                  localStatus: localTask.status,
                  serverStatus: serverTask.status,
                  resolvedTo: serverTask.status, // server wins
                  resolvedAt: Date.now(),
                });
              }
            }
          }
        }

        if (newConflicts.length > 0) {
          setConflicts(prev => [...prev, ...newConflicts]);
        }

        return serverState;
      });
    },
    onPendingCountChange: setPendingCount,
  });

  // ── Background detection ───────────────────────────────────────────────────
  useAppBackground(
    activeSession !== null,
    useCallback((reason) => {
      abandonSession(reason);
    }, []), // eslint-disable-line react-hooks/exhaustive-deps
    5000,
  );

  // ── Init: load local state, recover crashed sessions ──────────────────────
  useEffect(() => {
    (async () => {
      const online = await getIsOnline();
      setOnlineState(online);

      // Check for a crash-recovered in-flight session
      const inFlight = await getActiveSession();
      if (inFlight) {
        const elapsedMs = Date.now() - inFlight.startedAt;
        const targetMs = inFlight.session.targetMinutes * 60 * 1000;

        if (elapsedMs >= targetMs) {
          // Session would have completed while app was closed — mark success
          console.log('[recovery] Session completed while closed, marking success');
          await finalizeSession({ ...inFlight.session, result: 'success', coinsEarned: COINS_PER_SESSION });
        } else {
          // App crashed mid-session — mark as abandoned_app_switch
          console.log('[recovery] Session interrupted by crash/reload, marking abandoned');
          await finalizeSession({ ...inFlight.session, result: 'abandoned_app_switch', coinsEarned: 0 });
        }
        await clearActiveSession();
      }

      // Load local state
      let s = await getLocalState();
      if (!s) {
        try {
          const resp = await fetch(`${SERVER}/state/${STUDENT_ID}`);
          if (resp.ok) {
            s = await resp.json();
            if (s) await saveLocalState(s);
          }
        } catch {
          // Server unreachable on first load — start with empty state
        }
        if (!s) {
          s = {
            studentId: STUDENT_ID,
            coins: 0,
            streak: 0,
            subjects: [],
            sessions: [],
            lamportClock: 0,
          };
          await saveLocalState(s);
        }
      }

      setState(s);
      const count = await getPendingCount();
      setPendingCount(count);

      // Immediately sync if online
      if (online) {
        setTimeout(sync, 1000);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Session: start ─────────────────────────────────────────────────────────
  const startSession = async (targetMinutes: number) => {
    if (activeSession) return; // already running

    const session: FocusSession = {
      id: uuidv4(),
      studentId: STUDENT_ID,
      targetMinutes,
      startedAt: Date.now(),
      coinsEarned: 0,
      synced: false,
      rewardApplied: false,
    };

    // Persist to storage so a crash/reload can detect it
    await saveActiveSession(session);
    setActiveSession(session);
    setElapsedSeconds(0);

    timerRef.current = setInterval(() => {
      setElapsedSeconds(prev => {
        const next = prev + 1;
        if (next >= targetMinutes * 60) {
          // Timer completed — success
          // Use ref to get current session object
          const current = activeSessionRef.current;
          if (current) {
            clearInterval(timerRef.current!);
            timerRef.current = null;
            finalizeSession({
              ...current,
              endedAt: Date.now(),
              result: 'success',
              coinsEarned: COINS_PER_SESSION,
            });
          }
        }
        return next;
      });
    }, 1000);
  };

  // ── Session: finalize (success or fail) ───────────────────────────────────
  const finalizeSession = async (completed: FocusSession) => {
    // Stop timer if still running
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setActiveSession(null);
    setElapsedSeconds(0);
    await clearActiveSession();

    // Optimistic local update — apply rewards locally immediately
    setState(prev => {
      if (!prev) return prev;
      let updated = { ...prev, sessions: [...prev.sessions, completed] };

      if (completed.result === 'success') {
        updated.coins = prev.coins + COINS_PER_SESSION;
        // Optimistic streak increment — server will correct if wrong
        const today = new Date().toISOString().slice(0, 10);
        if (prev.lastFocusDate !== today) {
          updated.streak = prev.streak + 1;
          updated.lastFocusDate = today;
        }
      }

      saveLocalState(updated); // fire and forget
      return updated;
    });

    // Queue for server sync (survives offline)
    await addPendingSession(completed);
    await refreshPendingCount();

    // Sync if online
    const online = await getIsOnline();
    if (online) {
      setTimeout(sync, 300);
    }
  };

  // ── Session: give up ──────────────────────────────────────────────────────
  const giveUpSession = async () => {
    const current = activeSessionRef.current;
    if (!current) return;
    await finalizeSession({
      ...current,
      endedAt: Date.now(),
      result: 'abandoned_give_up',
      coinsEarned: 0,
    });
  };

  // ── Session: abandon (background) ─────────────────────────────────────────
  const abandonSession = async (reason: 'abandoned_app_switch') => {
    const current = activeSessionRef.current;
    if (!current) return;
    await finalizeSession({
      ...current,
      endedAt: Date.now(),
      result: reason,
      coinsEarned: 0,
    });
  };

  // ── Task update ───────────────────────────────────────────────────────────
  const updateTaskStatus = async (taskId: string, status: TaskStatus) => {
    const lamport = await tickLamport();
    const update: TaskUpdate = {
      taskId,
      newStatus: status,
      lamport,
      clientId: CLIENT_ID,
    };

    // Optimistic local update — instant UI response
    setState(prev => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        subjects: prev.subjects.map(sub => ({
          ...sub,
          chapters: sub.chapters.map(ch => ({
            ...ch,
            tasks: ch.tasks.map(t =>
              t.id === taskId
                ? { ...t, status, lamport, updatedAt: Date.now() }
                : t,
            ),
          })),
        })),
      };
      saveLocalState(updated);
      return updated;
    });

    await addPendingTaskUpdate(update);
    await refreshPendingCount();

    const online = await getIsOnline();
    if (online) {
      setTimeout(sync, 300);
    }
  };

  // ── Toggle online/offline ─────────────────────────────────────────────────
  const toggleOnline = async () => {
    const next = !isOnline;
    await setIsOnline(next);
    setOnlineState(next);
    if (next) {
      // Just reconnected — sync immediately
      setTimeout(sync, 500);
    }
  };

  return (
    <AppContext.Provider value={{
      state,
      isOnline,
      activeSession,
      elapsedSeconds,
      pendingCount,
      conflicts,
      toggleOnline,
      startSession,
      giveUpSession,
      updateTaskStatus,
      sync,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);