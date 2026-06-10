# DECISIONS.md

## Data / sync model

Every write (task update, session end) is stored in a local AsyncStorage
pending queue before touching the network. The queue is durable — it survives
app restarts. Sync drains the queue when a connection is available.

Each client has its own namespaced storage (`alcovia:<clientId>:`), so two
browser tabs behave as two independent devices with separate local state.

### Logical clock

Every task update carries a **Lamport timestamp** — a monotonically increasing
integer, never a wall clock. Wall clocks on different devices can diverge by
minutes; Lamport clocks cannot go backwards and encode causal order correctly.

On each write the client ticks its local counter by 1. After a sync the client
sets its clock to `max(local, server) + 1`.

## Conflict resolution

### Task status conflicts (same task edited on two devices)

Strategy: **last-lamport-wins**.

The update with the higher Lamport timestamp is applied; the lower one is
discarded. The server is the single point of serialisation — whichever device's
update arrives with the higher Lamport value "happened later" in causal order.

This is deterministic and produces the same result regardless of arrival order:
replaying the same two updates always resolves to the same winner.

Edge cases:
- **Tie** (same Lamport, same taskId): current state is preserved — no-op.
- **Stale update** (device A's Lamport < stored Lamport): discarded and logged.
- **Task deleted on server**: update silently skipped (task not found).

### Focus session conflicts (same session from two devices)

Each session has a stable UUID generated on the client at creation time. The
server's sessions array is checked for that ID before applying any rewards.
The second (and any subsequent) arrival of the same ID is confirmed back to the
client (so it clears its queue) but no rewards are applied again.

This means coins and streak are **applied exactly once**, regardless of how
many devices sync the same session.

### Why two devices always converge

1. Server state is **authoritative** — after every sync the client replaces its
   local state with the full server state.
2. The server applies task updates in **Lamport order** — the highest Lamport
   always wins, deterministically.
3. Session rewards are **idempotent by UUID** — no session ID is ever applied
   twice.
4. After both devices sync, they both receive the same server state and render
   identically.

## Idempotency: backend

- Sessions: `state.sessions.find(s => s.id === incoming.id)` guards every
  reward application. UUID generated once on the client; used as the
  idempotency key everywhere downstream.
- Webhooks: `hasWebhookFired(sessionId)` checks a **persisted** table in
  `db.json` before firing. Marked fired **before** the HTTP call to prevent
  race conditions between two concurrent syncs.

## Idempotency: n8n

The n8n workflow has a second, independent dedup layer using n8n's
`$getWorkflowStaticData('global')`. Even if the backend fires the webhook
twice (e.g. server restart between `markWebhookFired` and the HTTP call
completing), n8n will catch the duplicate and respond `duplicate_skipped`
without sending a notification.

The same `sessionId` is the key at both layers. Deduplication does not rely
on wall time, arrival order, or any mutable state outside these two tables.

## Tradeoff I made

**Mark-before-fire for webhooks.** I mark the session as fired in the DB
*before* making the HTTP call to n8n. This means if the server crashes
between the DB write and the HTTP call completing, that session's notification
is silently dropped — the student never gets it.

The alternative (mark-after-fire) risks double-firing if the server restarts
after the HTTP call but before the DB write, which is a worse user experience
(duplicate notifications) than a missed one.

A production fix would be an outbox pattern with a retry queue. Noted as
future work.

## What could still break

1. **Lamport ties from two devices** editing the same task in the same
   "tick". Unlikely in practice (the client ticks before every write) but
   theoretically possible if two clients start at lamport=0 and both write
   before syncing. Resolution: the update that arrives at the server first wins
   (non-deterministic). Fix: break ties by clientId lexicographic order.

2. **Server clock for streaks uses wall time**. If the server's clock is wrong
   by more than a day, streak logic misbehaves. Fix: use the session's
   `startedAt` timestamp from the client instead.

3. **n8n static data is in-memory**. If the n8n cloud worker restarts, the
   dedup table is cleared and a previously fired session could fire again.
   The backend DB is the primary guard; n8n is a belt-and-suspenders layer.

4. **No partial sync recovery**. If the network drops mid-sync (after server
   applies but before client receives the response), the client will re-send
   the same pending items on the next sync. The server handles this correctly
   (idempotent), but the client will see its pending count drop only on the
   second sync.