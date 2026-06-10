import { Router, Request, Response } from 'express';
import { getStudentState, saveStudentState, resetAll } from '../db';
import { SyncPayload, SyncResponse, Task, FocusSession } from '../types';
import { fireWebhookForSession } from './webhook';

const router = Router();

const COINS_PER_SESSION = 50;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// POST /sync
router.post('/', async (req: Request, res: Response) => {
  const payload: SyncPayload = req.body;
  const { studentId, pendingSessions, pendingTaskUpdates } = payload;

  const state = getStudentState(studentId);
  const confirmedSessionIds: string[] = [];

  // ── 1. Apply focus sessions (idempotent by session.id) ────────────────────
  for (const incoming of pendingSessions) {
    const exists = state.sessions.find(s => s.id === incoming.id);

    if (exists) {
      // Already applied — confirm so client clears its queue
      confirmedSessionIds.push(incoming.id);
      continue;
    }

    const stored: FocusSession = { ...incoming, synced: true, rewardApplied: false };

    if (incoming.result === 'success') {
      state.coins += COINS_PER_SESSION;
      stored.coinsEarned = COINS_PER_SESSION;
      stored.rewardApplied = true;

      const today = todayStr();
      const yesterday = yesterdayStr();

      if (state.lastFocusDate === today) {
        // Same day — streak already incremented, don't bump again
      } else if (state.lastFocusDate === yesterday) {
        state.streak += 1;
        state.lastFocusDate = today;
      } else {
        state.streak = 1;
        state.lastFocusDate = today;
      }

      stored.streakDay = state.streak;

      // Fire webhook — idempotent, won't double-fire
      fireWebhookForSession(stored, state.streak, state.coins).catch(
        err => console.error('[webhook] error:', err),
      );
    }

    state.sessions.push(stored);
    confirmedSessionIds.push(incoming.id);
  }

  // ── 2. Apply task updates (last-lamport-wins) ─────────────────────────────
  for (const update of pendingTaskUpdates) {
    state.lamportClock = Math.max(state.lamportClock, update.lamport) + 1;

    outer: for (const subject of state.subjects) {
      for (const chapter of subject.chapters) {
        const task = chapter.tasks.find((t: Task) => t.id === update.taskId);
        if (task) {
          if (update.lamport > task.lamport) {
            task.status = update.newStatus;
            task.lamport = update.lamport;
            task.updatedAt = Date.now();
          } else {
            console.log(`[sync] Stale update for ${update.taskId} — discarding`);
          }
          break outer;
        }
      }
    }
  }

  saveStudentState(state);

  const response: SyncResponse = {
    serverState: state,
    confirmedSessionIds,
    appliedSessionIds: confirmedSessionIds,
  };
  res.json(response);
});

// POST /sync/reset — dev panel "reset everything" button
router.post('/reset', (_req, res) => {
  resetAll();
  res.json({ ok: true });
});

export default router;