export type TaskStatus = 'not_started' | 'in_progress' | 'done';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  lamport: number;
  updatedAt: number;
}

export interface Chapter {
  id: string;
  title: string;
  tasks: Task[];
}

export interface Subject {
  id: string;
  title: string;
  chapters: Chapter[];
}

export type SessionResult =
  | 'success'
  | 'abandoned_give_up'
  | 'abandoned_app_switch';

export interface FocusSession {
  id: string;
  studentId: string;
  targetMinutes: number;
  startedAt: number;
  endedAt?: number;
  result?: SessionResult;
  coinsEarned: number;
  streakDay?: number;
  synced: boolean;
  rewardApplied: boolean;
}

export interface StudentState {
  studentId: string;
  coins: number;
  streak: number;
  lastFocusDate?: string; // YYYY-MM-DD — idempotency key for streak
  subjects: Subject[];
  sessions: FocusSession[];
  lamportClock: number;
}

export interface SyncPayload {
  studentId: string;
  clientId: string;
  pendingSessions: FocusSession[];
  pendingTaskUpdates: TaskUpdate[];
  lastKnownLamport: number;
}

export interface TaskUpdate {
  taskId: string;
  newStatus: TaskStatus;
  lamport: number;
  clientId: string;
}

export interface SyncResponse {
  serverState: StudentState;
  confirmedSessionIds: string[]; // client removes these from pending queue
  appliedSessionIds: string[];   // backwards compat alias
}