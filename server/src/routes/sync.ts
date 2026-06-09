import { Router } from 'express';
import { getStudentState, saveStudentState } from '../db';
import { SyncPayload, SyncResponse, Task, FocusSession } from '../types';

const router = Router();

const COINS_PER_SESSION = 50;
const TODAY = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

router.post('/', (req, res) => {
  const payload: SyncPayload = req.body;
  const { studentId, pendingSessions, pendingTaskUpdates } = payload;

  const state = getStudentState(studentId);
  const appliedSessionIds: string[] = [];

  // ── 1. Apply focus sessions (idempotent by session.id) ──────────────────
  for (const session of pendingSessions) {
    const alreadyExists = state.sessions.find(s => s.id === session.id);
    if (alreadyExists) continue; // idempotent: already applied

    state.sessions.push({ ...session, synced: true });

    if (session.result === 'success' && !session.rewardApplied) {
      // Apply reward exactly once
      state.coins += COINS_PER_SESSION;
      session.rewardApplied = true;

      // Streak logic
      const today = TODAY();
      if (state.lastFocusDate === today) {
        // already counted today, don't bump streak
      } else {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.toISOString().slice(0, 10);
        if (state.lastFocusDate === yStr) {
          state.streak += 1; // continuing streak
        } else {
          state.streak = 1; // reset streak
        }
        state.lastFocusDate = today;
      }

      appliedSessionIds.push(session.id);
    }
  }

  // ── 2. Apply task updates (last-lamport-wins) ────────────────────────────
  for (const update of pendingTaskUpdates) {
    // bump server lamport clock
    state.lamportClock = Math.max(state.lamportClock, update.lamport) + 1;

    outer: for (const subject of state.subjects) {
      for (const chapter of subject.chapters) {
        const task = chapter.tasks.find((t: Task) => t.id === update.taskId);
        if (task) {
          // Last lamport wins — if incoming lamport > current, apply it
          if (update.lamport > task.lamport) {
            task.status = update.newStatus;
            task.lamport = update.lamport;
            task.updatedAt = Date.now();
          }
          break outer;
        }
      }
    }
  }

  saveStudentState(state);

  const response: SyncResponse = {
    serverState: state,
    appliedSessionIds,
  };
  res.json(response);
});

export default router;