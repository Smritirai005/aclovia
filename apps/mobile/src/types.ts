// Shared between client and server

export type TaskStatus = 'not_started' | 'in_progress' | 'done';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  lamport: number;       // logical clock — NOT wall time
  updatedAt: number;     // unix ms, informational only
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

export type SessionResult = 'success' | 'abandoned_give_up' | 'abandoned_app_switch';

export interface FocusSession {
  id: string;           // stable UUID — idempotency key everywhere
  studentId: string;
  targetMinutes: number;
  startedAt: number;    // unix ms
  endedAt?: number;
  result?: SessionResult;
  coinsEarned: number;
  streakDay?: number;   // what day streak was at when this fired
  synced: boolean;      // has server confirmed this?
  rewardApplied: boolean; // server: have we applied coins/streak for this?
}

export interface StudentState {
  studentId: string;
  coins: number;
  streak: number;        // current focus streak in days
  lastFocusDate?: string; // YYYY-MM-DD
  subjects: Subject[];
  sessions: FocusSession[];
  lamportClock: number;  // server's clock for this student
}

// What a client sends during sync
export interface SyncPayload {
  studentId: string;
  clientId: string;      // which device (tab A or tab B)
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

// What server sends back
export interface SyncResponse {
  serverState: StudentState;
  appliedSessionIds: string[];
}