import AsyncStorage from '@react-native-async-storage/async-storage';
import { FocusSession, StudentState, TaskUpdate } from '../types';

// ── Client namespace ─────────────────────────────────────────────────────────
// Each browser tab / device gets its own namespace via ?client= query param
// This makes two tabs behave like two real devices (separate AsyncStorage)
function getClientId(): string {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const c = params.get('client');
    if (c) return c;
  }
  return 'device-a';
}

export const CLIENT_ID = getClientId();
const NS = `alcovia:${CLIENT_ID}:`;

const KEYS = {
  state: `${NS}state`,
  pendingSessions: `${NS}pendingSessions`,
  pendingTaskUpdates: `${NS}pendingTaskUpdates`,
  lamport: `${NS}lamport`,
  isOnline: `${NS}isOnline`,
  // crash recovery: store in-flight session so it survives a reload
  activeSession: `${NS}activeSession`,
  activeSessionStart: `${NS}activeSessionStart`,
};

// ── Helpers ──────────────────────────────────────────────────────────────────
async function getJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function setJSON<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

// ── Lamport clock ────────────────────────────────────────────────────────────
// The ONLY time-like thing we use for ordering — never wall clock
export async function getLamport(): Promise<number> {
  return getJSON<number>(KEYS.lamport, 0);
}

export async function tickLamport(): Promise<number> {
  const current = await getLamport();
  const next = current + 1;
  await AsyncStorage.setItem(KEYS.lamport, String(next));
  return next;
}

// Called after a sync — update local clock to max(local, server) + 1
export async function syncLamport(serverLamport: number): Promise<void> {
  const current = await getLamport();
  const next = Math.max(current, serverLamport) + 1;
  await AsyncStorage.setItem(KEYS.lamport, String(next));
}

// ── Local student state ──────────────────────────────────────────────────────
export async function getLocalState(): Promise<StudentState | null> {
  return getJSON<StudentState | null>(KEYS.state, null);
}

export async function saveLocalState(state: StudentState): Promise<void> {
  await setJSON(KEYS.state, state);
}

// ── Pending session queue ────────────────────────────────────────────────────
// Durable: survives app restart. Every session written here BEFORE going to server.
export async function getPendingSessions(): Promise<FocusSession[]> {
  return getJSON<FocusSession[]>(KEYS.pendingSessions, []);
}

export async function addPendingSession(session: FocusSession): Promise<void> {
  const existing = await getPendingSessions();
  // Idempotent insert: if same ID already queued, skip
  if (existing.find(s => s.id === session.id)) return;
  await setJSON(KEYS.pendingSessions, [...existing, session]);
}

// Remove sessions the server has confirmed applied
export async function removeSyncedSessions(confirmedIds: string[]): Promise<void> {
  const existing = await getPendingSessions();
  const remaining = existing.filter(s => !confirmedIds.includes(s.id));
  await setJSON(KEYS.pendingSessions, remaining);
}

export async function clearPendingSessions(): Promise<void> {
  await setJSON(KEYS.pendingSessions, []);
}

// ── Pending task update queue ────────────────────────────────────────────────
// For the same task, we only keep the LATEST update (highest lamport).
// There's no point sending "set to in_progress" if we later set it to "done".
export async function getPendingTaskUpdates(): Promise<TaskUpdate[]> {
  return getJSON<TaskUpdate[]>(KEYS.pendingTaskUpdates, []);
}

export async function addPendingTaskUpdate(update: TaskUpdate): Promise<void> {
  const existing = await getPendingTaskUpdates();
  // Replace any existing update for same taskId with this newer one
  const filtered = existing.filter(u => u.taskId !== update.taskId);
  await setJSON(KEYS.pendingTaskUpdates, [...filtered, update]);
}

export async function clearPendingTaskUpdates(): Promise<void> {
  await setJSON(KEYS.pendingTaskUpdates, []);
}

// ── In-flight session crash recovery ────────────────────────────────────────
// If the app crashes or reloads mid-session, we can detect and fail it gracefully.
export async function saveActiveSession(session: FocusSession): Promise<void> {
  await setJSON(KEYS.activeSession, session);
  await AsyncStorage.setItem(KEYS.activeSessionStart, String(Date.now()));
}

export async function getActiveSession(): Promise<{ session: FocusSession; startedAt: number } | null> {
  const session = await getJSON<FocusSession | null>(KEYS.activeSession, null);
  const startRaw = await AsyncStorage.getItem(KEYS.activeSessionStart);
  if (!session || !startRaw) return null;
  return { session, startedAt: parseInt(startRaw) };
}

export async function clearActiveSession(): Promise<void> {
  await AsyncStorage.multiRemove([KEYS.activeSession, KEYS.activeSessionStart]);
}

// ── Online flag (dev panel controlled) ──────────────────────────────────────
export async function getIsOnline(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.isOnline);
  return val === null ? true : val === 'true';
}

export async function setIsOnline(online: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.isOnline, String(online));
}

// ── Pending counts (for dev panel) ──────────────────────────────────────────
export async function getPendingCount(): Promise<number> {
  const [sessions, tasks] = await Promise.all([
    getPendingSessions(),
    getPendingTaskUpdates(),
  ]);
  return sessions.length + tasks.length;
}