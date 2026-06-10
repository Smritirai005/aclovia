import { Router, Request, Response } from 'express';
import { getStudentState, saveStudentState } from '../db';
import { SyncPayload, SyncResponse, Task, FocusSession } from '../types';
import { fireWebhookForSession } from './webhook';

const router = Router();

const COINS_PER_SESSION = 50;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

router.post('/', async (req: Request, res: Response) => {
  const payload: SyncPayload = req.body;
  const { studentId, pendingSessions, pendingTaskUpdates } = payload;

  // Load current server state
  const state = getStudentState(studentId);

  // IDs of sessions this sync call confirmed (returned to client for queue cleanup)
  const confirmedSessionIds: string[] = [];

  // ── 1. Apply focus sessions (idempotent by session.id) ────────────────────
  //
  // Idempotency guarantee: the same session.id can arrive from multiple devices
  // or be replayed on retry — we check the full sessions array and skip if seen.
  // Rewards (coins, streak) are ONLY applied if rewardApplied is false on the
  // stored session, preventing double-counting even if somehow two sessions with
  // the same ID were stored (belt + suspenders).
  //
  for (const incomingSession of pendingSessions) {
    const existingSession = state.sessions.find(s => s.id === incomingSession.id);

    if (existingSession) {
      // Already stored — still confirm it so client clears its queue
      confirmedSessionIds.push(incomingSession.id);
      continue;
    }

    // New session — store it
    const storedSession: FocusSession = {
      ...incomingSession,
      synced: true,
      rewardApplied: false, // will set below if we apply rewards
    };

    if (incomingSession.result === 'success') {
      // Apply reward exactly once, atomically with storing the session
      state.coins += COINS_PER_SESSION;
      storedSession.coinsEarned = COINS_PER_SESSION;
      storedSession.rewardApplied = true;

      // ── Streak logic ──────────────────────────────────────────────────────
      // Rule: one streak increment per calendar day, regardless of how many
      // successful sessions happen that day (or how many devices sync).
      // We use a "lastFocusDate" (YYYY-MM-DD) as the idempotency key for streaks.
      const today = todayStr();
      const yesterday = yesterdayStr();

      if (state.lastFocusDate === today) {
        // Already incremented today — don't increment again
        // (second session on same day, or same session from second device)
      } else if (state.lastFocusDate === yesterday) {
        // Continuing a streak
        state.streak += 1;
        state.lastFocusDate = today;
      } else {
        // Streak broken or first ever
        state.streak = 1;
        state.lastFocusDate = today;
      }

      storedSession.streakDay = state.streak;

      // Fire n8n webhook (async, non-blocking)
      // Idempotency handled inside fireWebhookForSession by session.id
      fireWebhookForSession(storedSession, state.streak, state.coins).catch(err =>
        console.error('[webhook] failed:', err),
      );
    }

    state.sessions.push(storedSession);
    confirmedSessionIds.push(incomingSession.id);
  }

  // ── 2. Apply task updates (last-lamport-wins) ─────────────────────────────
  //
  // Conflict resolution strategy:
  // Each task update carries a Lamport timestamp (a logical counter, never wall time).
  // The update with the HIGHER Lamport timestamp wins.
  //
  // Why Lamport, not wall clock?
  //   Device clocks can be wrong by minutes. Lamport clocks can't go backwards —
  //   they only increment. The student who made a change "later" in causal order
  //   always has a higher Lamport value.
  //
  // Edge cases handled:
  //   - Same update arriving twice: lamport tie → current state preserved (no-op)
  //   - Concurrent edits from two devices: highest lamport wins
  //   - Update for a deleted task: silently skipped (task not found)
  //
  for (const update of pendingTaskUpdates) {
    // Advance server's Lamport clock: server clock = max(server, incoming) + 1
    state.lamportClock = Math.max(state.lamportClock, update.lamport) + 1;

    let found = false;
    outer: for (const subject of state.subjects) {
      for (const chapter of subject.chapters) {
        const task = chapter.tasks.find((t: Task) => t.id === update.taskId);
        if (task) {
          found = true;
          if (update.lamport > task.lamport) {
            // Incoming is newer in causal order → apply it
            task.status = update.newStatus;
            task.lamport = update.lamport;
            task.updatedAt = Date.now();
          } else {
            // Current task is newer or same → keep current (discard incoming)
            console.log(
              `[sync] Discarding stale update for task ${update.taskId}: ` +
              `incoming lamport ${update.lamport} <= stored ${task.lamport}`,
            );
          }
          break outer;
        }
      }
    }

    if (!found) {
      // Task was deleted on server (not implemented in Phase 1, but handle gracefully)
      console.log(`[sync] Task ${update.taskId} not found — discarding update`);
    }
  }

  // Save state
  saveStudentState(state);

  const response: SyncResponse = {
    serverState: state,
    // Phase 1 used appliedSessionIds — rename to confirmedSessionIds for clarity
    confirmedSessionIds,
    appliedSessionIds: confirmedSessionIds, // keep for backwards compat
  };

  res.json(response);
});

export default router;