import { Router } from 'express';
import { FocusSession } from '../types';
import { hasWebhookFired, markWebhookFired, getAllFiredWebhooks } from '../db';

const router = Router();

// ── Fire webhook (called from sync route) ────────────────────────────────────
// Idempotency: backed by DB, survives server restart.
// Same session from device A + device B = one webhook, guaranteed.

export async function fireWebhookForSession(
  session: FocusSession,
  currentStreak: number,
  currentCoins: number,
): Promise<void> {
  // Check persistent dedup table first
  if (hasWebhookFired(session.id)) {
    console.log(`[webhook] Already fired for ${session.id.slice(0, 8)}… — skipping`);
    return;
  }

  // Mark BEFORE firing to prevent race conditions (two concurrent syncs)
  // If the HTTP call fails we'll retry on next sync — marking first means
  // we might miss a notification on crash, but never double-fire. Correct choice.
  markWebhookFired(session.id, currentStreak, currentCoins);

  const payload = {
    sessionId:     session.id,
    studentId:     session.studentId,
    targetMinutes: session.targetMinutes,
    coinsEarned:   session.coinsEarned,
    streak:        currentStreak,
    totalCoins:    currentCoins,
    message:       `Streak now ${currentStreak} day${currentStreak !== 1 ? 's' : ''}, +${session.coinsEarned} coins! 🔥`,
    firedAt:       new Date().toISOString(),
  };

  const n8nUrl = process.env.N8N_WEBHOOK_URL;

  if (!n8nUrl) {
    // No n8n URL — use mock sink (logs to console)
    console.log('\n🔔 ========== MOCK NOTIFICATION ==========');
    console.log(JSON.stringify(payload, null, 2));
    console.log('=========================================\n');
    return;
  }

  try {
    const resp = await fetch(n8nUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`n8n returned ${resp.status}`);
    console.log(`[webhook] ✓ Fired to n8n for session ${session.id.slice(0, 8)}…`);
  } catch (err) {
    console.error('[webhook] n8n call failed:', err);
    // NOTE: we already marked it as fired in DB, so we won't retry.
    // In production you'd have a retry queue. Noted in DECISIONS.md.
  }
}

// ── Mock sink — n8n calls this instead of WhatsApp for demo ──────────────────
// POST /webhook/mock-sink
router.post('/mock-sink', (req, res) => {
  console.log('\n📱 ========== N8N → MOCK SINK ==========');
  console.log(JSON.stringify(req.body, null, 2));
  console.log('========================================\n');
  res.json({ ok: true, receivedAt: new Date().toISOString() });
});

// ── Dev panel polling endpoint ────────────────────────────────────────────────
// GET /webhook/fired
router.get('/fired', (_req, res) => {
  const all = getAllFiredWebhooks();
  res.json({
    count: Object.keys(all).length,
    webhooks: Object.values(all),
  });
});

export default router;