# Alcovia — Offline-First Study App

Offline-first focus sessions + syllabus tracker with two-device sync and n8n automation.

---

## What this is

Alcovia is a study app for grades 6–12 with two core features:

- **Focus sessions** — start a timer, stay focused, earn coins and streak days. Works fully offline; results sync when you reconnect.
- **Syllabus progress** — tasks inside chapters inside subjects. Tap to cycle status (Not started → In progress → Done). Progress rolls up instantly on-device and syncs later.

Two browser tabs simulate two devices. Both can go offline, make conflicting changes, and reconcile to identical state when they reconnect. A successful session fires exactly one n8n notification regardless of how many devices sync it.

---

## Stack

| Layer | Tech |
|---|---|
| App | TypeScript, React Native (Expo web) |
| Server | TypeScript, Express |
| Storage (client) | AsyncStorage (namespaced per device) |
| Storage (server) | JSON file (`data/db.json`) |
| Automation | n8n Cloud (free tier) |

---

## Repo layout

```
alcovia/
├── apps/
│   └── mobile/
│       ├── App.tsx
│       ├── src/
│       │   ├── types.ts
│       │   ├── storage.ts          ← offline queue + Lamport clock
│       │   ├── context/
│       │   │   └── AppContext.tsx  ← all app logic
│       │   ├── hooks/
│       │   │   ├── useSync.ts      ← auto-sync loop
│       │   │   └── useAppBackground.ts
│       │   └── screens/
│       │       ├── FocusScreen.tsx
│       │       ├── SyllabusScreen.tsx
│       │       └── DevPanel.tsx
├── server/
│   ├── .env
│   ├── src/
│   │   ├── index.ts
│   │   ├── db.ts                   ← JSON file DB + webhook dedup table
│   │   ├── types.ts
│   │   └── routes/
│   │       ├── sync.ts             ← core merge logic
│   │       ├── state.ts
│   │       └── webhook.ts
├── data/                           ← created on first run
│   └── db.json
├── n8n-workflow.json               ← import into n8n
├── DECISIONS.md
└── README.md
```

---

## Prerequisites

- Node.js 18+
- npm
- A free n8n Cloud account → https://app.n8n.cloud

---

## 1. Server setup

```bash
cd server
npm install
```

Create `server/.env`:

```
N8N_WEBHOOK_URL=https://YOUR-NAME.app.n8n.cloud/webhook/alcovia-session
PORT=3001
```

Leave `N8N_WEBHOOK_URL` blank to use the mock sink (logs to terminal). You can fill it in after the n8n step below.

Start the server:

```bash
npm run dev
```

You should see:

```
Alcovia server → http://localhost:3001
n8n webhook URL: (not set — mock mode)
```

---

## 2. App setup

```bash
cd apps/mobile
npm install
npx expo start --web
```

This opens `http://localhost:19006`.

### Simulating two devices

Because two browser tabs share AsyncStorage, each tab needs its own namespace. Use the `?client=` query param:

- **Device A** → `http://localhost:19006/?client=device-a`
- **Device B** → open an incognito window → `http://localhost:19006/?client=device-b`

Each tab now has completely independent local storage and behaves like a real separate device.

---

## 3. n8n setup (free cloud tier)

1. Go to https://app.n8n.cloud and sign up (free)
2. In your dashboard → **"+ New workflow"**
3. Top-right **"..."** menu → **"Import from file"** → select `n8n-workflow.json`
4. The workflow loads with 7 nodes:
   - **Session Webhook** — receives POST from your server
   - **Has sessionId?** — validates the payload
   - **Dedup by sessionId** — checks n8n static data to prevent double-fire
   - **Is duplicate?** — branches on the dedup result
   - **Send notification** — POSTs to your mock sink (or WhatsApp)
   - **Respond OK / Respond duplicate** — returns status to caller
5. Click the **Session Webhook** node → copy the **Production URL**
   (format: `https://yourname.app.n8n.cloud/webhook/alcovia-session`)
6. Paste it into `server/.env` as `N8N_WEBHOOK_URL`
7. Restart the server: `npm run dev`
8. Click **Activate** (toggle top-right of n8n, turns green)

The "Send notification" node hits `http://localhost:3001/webhook/mock-sink` by default, which logs the payload to your server terminal. To send real WhatsApp messages, replace that URL with your AiSensy / Twilio endpoint.

---

## 4. Running the two-device demo

Open two windows side by side:

- Left: `http://localhost:19006/?client=device-a`
- Right (incognito): `http://localhost:19006/?client=device-b`

Go to the **Dev Panel** tab on each. You'll see the client ID, live state, pending queue count, and the n8n webhook counter.

---

## Demo scenarios

### Scenario 1 — offline focus session, idempotent reward

1. Device A: **Dev Panel → Go offline**
2. Device A: **Focus tab → select 1m 🎬 → Start** — wait for it to complete
3. Coins and streak increment locally on device A
4. Device A: **Dev Panel → Go online** → auto-syncs
5. Server applies the reward once. n8n webhook fires. Webhook counter = **1**.
6. Device B: go online → syncs → receives same session → webhook counter stays **1**.

### Scenario 2 — conflicting task edits on two devices

1. Both devices: **Dev Panel → Go offline**
2. Device B: **Syllabus → tap "Linear equations"** until status = **Done**
3. Device A: **Syllabus → tap "Linear equations"** until status = **In progress**
4. Device B: go online → syncs (device B's Lamport is higher → its edit wins)
5. Device A: go online → syncs → receives server state → "Linear equations" = **Done**
6. Device A Dev Panel shows a **Conflicts resolved** warning: `in_progress → done (server lamport wins)`

Both devices now show identical task statuses.

### Scenario 3 — app switch / background during session

1. Start a 1-min session on either device
2. Switch to another tab (or minimise on mobile) within 5 seconds
3. After the 5-second grace period the session is automatically marked `abandoned_app_switch`
4. No coins awarded. Attempt recorded in session history.

### Scenario 4 — crash recovery

1. Start a session on device A
2. Hard-reload the tab while the session is running (Cmd+R / F5)
3. On reload, the app detects the interrupted session in AsyncStorage
4. If enough time passed for it to have completed → marked **success**
5. If not → marked **abandoned_app_switch**

---

## API reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Server health check |
| `GET` | `/state/:studentId` | Get full student state |
| `POST` | `/sync` | Push pending changes, receive authoritative state |
| `POST` | `/sync/reset` | Clear all server state (dev only) |
| `POST` | `/webhook/mock-sink` | Receives n8n notification (logs to terminal) |
| `GET` | `/webhook/fired` | List all webhook-fired session IDs |

### POST /sync payload

```json
{
  "studentId": "student-001",
  "clientId": "device-a",
  "pendingSessions": [ /* FocusSession[] */ ],
  "pendingTaskUpdates": [ /* TaskUpdate[] */ ],
  "lastKnownLamport": 5
}
```

### POST /sync response

```json
{
  "serverState": { /* full StudentState */ },
  "confirmedSessionIds": ["uuid-1", "uuid-2"]
}
```

---

## Sync and conflict resolution

### How it works in one paragraph

Every write (session end, task status change) is appended to a durable **pending queue** in AsyncStorage before touching the network. When online, the client drains the queue via `POST /sync`. The server applies all changes and returns its authoritative state. The client replaces its local state with the server's response. Two devices that both sync end up with identical state because they both converge to the same server state.

### Task conflict resolution — last-Lamport-wins

Each task update carries a **Lamport timestamp**: a monotonically increasing integer that the client ticks on every write. Wall clocks are never used for ordering.

When two devices edit the same task offline:

```
Device A:  task-1 → in_progress  (Lamport 3)
Device B:  task-1 → done         (Lamport 7)
```

The server applies whichever has the higher Lamport. Device B wins. Both devices receive the server's authoritative state on their next sync and agree.

This is deterministic — replaying the same two updates in any order always produces the same result.

### Session idempotency

Each session is assigned a UUID at creation time on the client. The server checks `sessions.find(s => s.id === incoming.id)` before applying any reward. The same UUID arriving from two devices, or re-sent on retry, is applied exactly once.

### Streak idempotency

Streak is guarded by `lastFocusDate` (YYYY-MM-DD). Multiple successful sessions on the same calendar day, from any number of devices, increment the streak only once.

---

## n8n idempotency

The workflow has two independent dedup layers:

1. **Backend** (`db.json` `firedWebhooks` table): checked and written before the HTTP call to n8n. Survives server restarts.
2. **n8n** (`$getWorkflowStaticData`): checked inside the workflow itself. Catches duplicate calls even if the backend table is somehow bypassed.

Both layers key on `sessionId` (the same UUID). Neither uses wall time.

If the backend fires twice for the same session, n8n responds `duplicate_skipped` and sends no notification. The Dev Panel webhook counter stays at 1.

---

## Conflict cases handled

| Scenario | Resolution |
|---|---|
| Same task edited on both devices | Higher Lamport wins |
| Same task, equal Lamport | Current server state preserved (no-op) |
| Task edited on one device, left alone on other | Edit wins (higher Lamport) |
| Same session synced from two devices | Applied once — UUID dedup |
| Session synced, then retried | No-op — UUID already in sessions array |
| n8n webhook called twice for same session | Second call returns `duplicate_skipped` |
| App crashes mid-session | On reload: success if time elapsed ≥ target, else abandoned |
| Network drops mid-sync | Pending queue not cleared; retry on next sync (idempotent) |

---

## What I left out and what I'd do next

**Left out:**
- Real WhatsApp delivery (mock sink used instead — swap the n8n HTTP Request URL to go real)
- Task deletion (updates for deleted tasks are silently discarded with a log)
- More than 2 devices (works in theory — tested with 2)
- Efficient delta sync (full state sent on every sync — fine for this data size)
- Property/fuzz tests for convergence

**Next steps:**
- Outbox pattern with retry for webhook delivery (currently mark-before-fire means a crash between DB write and HTTP call silently drops one notification)
- Break Lamport ties by `clientId` lexicographic order for fully deterministic resolution
- Use session `startedAt` for streak date instead of server wall time
- Swap JSON file DB for SQLite with proper transactions
- Efficient sync: send only events after `lastKnownLamport` rather than full state

---

## Hardcoded values

| Value | Where | Notes |
|---|---|---|
| `studentId = "student-001"` | client + server | Single student per spec |
| `COINS_PER_SESSION = 50` | `sync.ts` | Per successful session |
| `GRACE_PERIOD_MS = 5000` | `useAppBackground.ts` | 5s before background = abandon |
| `SYNC_INTERVAL_MS = 5000` | `useSync.ts` | Auto-sync poll interval |

---

## Troubleshooting

**Both tabs show the same state even offline**
Make sure you're using different `?client=` params and that one tab is incognito. Same-origin tabs share cookies but AsyncStorage is namespaced by the `client` param in this app.

**n8n webhook not firing**
- Check `N8N_WEBHOOK_URL` is set in `server/.env` and server was restarted
- Check the n8n workflow is **Activated** (green toggle)
- Check the Production URL was copied, not the Test URL

**Subjects not loading on first open**
The server seeds subjects on first `GET /state/:studentId`. Make sure the server is running before opening the app. If local state is stale, hit "Reset everything" in the Dev Panel.

**`uuid` not found on web**
```bash
cd apps/mobile && npm install uuid @types/uuid
```