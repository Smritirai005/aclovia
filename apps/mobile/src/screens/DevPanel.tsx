import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useApp, ConflictRecord } from '../context/AppContext';
import { CLIENT_ID } from '../storage';

const SERVER = 'http://localhost:3001';

export function DevPanel() {
  const { state, isOnline, toggleOnline, sync, pendingCount, conflicts } = useApp();
  const [syncing, setSyncing] = useState(false);
  const [webhookCount, setWebhookCount] = useState<number | null>(null);
  const [webhookIds, setWebhookIds] = useState<string[]>([]);

  // Poll webhook fired count from server every 3s
  useEffect(() => {
    const poll = async () => {
      try {
        const resp = await fetch(`${SERVER}/webhook/fired`);
        if (resp.ok) {
          const data = await resp.json();
          setWebhookCount(data.count);
          setWebhookIds(data.sessionIds);
        }
      } catch {
        // server offline — ignore
      }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    await sync();
    setSyncing(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.header}>Dev Panel</Text>
      <Text style={styles.clientId}>Client ID: {CLIENT_ID}</Text>

      {/* ── Online toggle ────────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Network</Text>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: isOnline ? '#22c55e' : '#ef4444' }]} />
          <Text style={styles.statusText}>{isOnline ? 'Online' : 'Offline'}</Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: isOnline ? '#fee2e2' : '#dcfce7' }]}
            onPress={toggleOnline}
          >
            <Text style={{ color: isOnline ? '#dc2626' : '#16a34a', fontWeight: '600' }}>
              {isOnline ? '🔴 Go offline' : '🟢 Go online'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Pending queue ────────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pending queue</Text>
        <View style={styles.bigNumRow}>
          <View style={styles.bigNumBox}>
            <Text style={[styles.bigNum, { color: pendingCount > 0 ? '#f59e0b' : '#22c55e' }]}>
              {pendingCount}
            </Text>
            <Text style={styles.bigLabel}>unsynced changes</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.btn, styles.syncBtn, syncing && { opacity: 0.6 }]}
          onPress={handleSync}
          disabled={syncing}
        >
          {syncing
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.syncBtnText}>⟳ Force sync now</Text>
          }
        </TouchableOpacity>
      </View>

      {/* ── n8n Webhook ──────────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>n8n notifications</Text>
        <Text style={styles.hint}>
          Same session arriving from 2 devices → should fire exactly once
        </Text>
        <View style={styles.bigNumRow}>
          <View style={styles.bigNumBox}>
            <Text style={[styles.bigNum, { color: '#6C63FF' }]}>
              {webhookCount ?? '—'}
            </Text>
            <Text style={styles.bigLabel}>webhooks fired (total)</Text>
          </View>
        </View>
        {webhookIds.slice(-3).map(id => (
          <Text key={id} style={styles.mono}>✓ {id.slice(0, 16)}…</Text>
        ))}
      </View>

      {/* ── Current state dump ──────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current state ({CLIENT_ID})</Text>
        <View style={styles.stateGrid}>
          <StateRow label="Coins" value={state?.coins ?? 0} />
          <StateRow label="Streak" value={`${state?.streak ?? 0} days`} />
          <StateRow label="Sessions" value={state?.sessions.length ?? 0} />
          <StateRow label="Last focus" value={state?.lastFocusDate ?? 'never'} />
          <StateRow label="Lamport" value={state?.lamportClock ?? 0} />
        </View>
      </View>

      {/* ── Conflicts log ────────────────────────────────────────────── */}
      {conflicts.length > 0 && (
        <View style={[styles.card, { borderColor: '#f59e0b', borderWidth: 1.5 }]}>
          <Text style={[styles.cardTitle, { color: '#d97706' }]}>
            ⚠ Conflicts resolved ({conflicts.length})
          </Text>
          <Text style={styles.hint}>
            Server (higher Lamport) wins. Local value was replaced.
          </Text>
          {conflicts.slice(-5).reverse().map((c, i) => (
            <View key={i} style={styles.conflictRow}>
              <Text style={styles.mono}>task: {c.taskId.slice(0, 8)}…</Text>
              <Text style={styles.conflictDetail}>
                local: <Text style={{ color: '#ef4444' }}>{c.localStatus}</Text>
                {' → server: '}
                <Text style={{ color: '#22c55e' }}>{c.resolvedTo}</Text>
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Recent sessions ──────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent sessions</Text>
        {(state?.sessions ?? []).length === 0 && (
          <Text style={styles.hint}>No sessions yet</Text>
        )}
        {(state?.sessions ?? []).slice(-5).reverse().map(s => (
          <View key={s.id} style={styles.sessionRow}>
            <Text style={s.result === 'success' ? styles.successText : styles.failText}>
              {s.result === 'success' ? '✓' : '✗'} {s.result}
            </Text>
            <Text style={styles.sessionMeta}>
              {s.targetMinutes}min · +{s.coinsEarned} coins
              {s.streakDay ? ` · streak day ${s.streakDay}` : ''}
            </Text>
            <Text style={styles.mono}>{s.id.slice(0, 12)}…</Text>
          </View>
        ))}
      </View>

      {/* ── Task status snapshot ─────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Task status snapshot</Text>
        {(state?.subjects ?? []).flatMap(sub =>
          sub.chapters.flatMap(ch =>
            ch.tasks.map(task => (
              <View key={task.id} style={styles.taskSnap}>
                <Text style={styles.taskSnapTitle}>{task.title}</Text>
                <Text style={[
                  styles.taskSnapStatus,
                  task.status === 'done' ? styles.successText
                  : task.status === 'in_progress' ? styles.warnText
                  : styles.mutedText,
                ]}>
                  {task.status} (L:{task.lamport})
                </Text>
              </View>
            ))
          )
        )}
      </View>
    </ScrollView>
  );
}

function StateRow({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.stateRow}>
      <Text style={styles.stateLabel}>{label}</Text>
      <Text style={styles.stateValue}>{String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8', padding: 12 },
  header: { fontSize: 20, fontWeight: '700', marginBottom: 2 },
  clientId: { fontSize: 11, color: '#888', fontFamily: 'monospace', marginBottom: 14 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: '#eee',
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#444', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { fontSize: 12, color: '#888', marginBottom: 8, fontStyle: 'italic' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { flex: 1, fontSize: 15, fontWeight: '600' },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  bigNumRow: { flexDirection: 'row', justifyContent: 'center', marginVertical: 8 },
  bigNumBox: { alignItems: 'center' },
  bigNum: { fontSize: 40, fontWeight: '800' },
  bigLabel: { fontSize: 12, color: '#888' },
  syncBtn: { backgroundColor: '#6C63FF', alignItems: 'center', marginTop: 8, height: 44, justifyContent: 'center' },
  syncBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  stateGrid: { gap: 2 },
  stateRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  stateLabel: { fontSize: 13, color: '#666' },
  stateValue: { fontSize: 13, fontWeight: '600', fontFamily: 'monospace' },
  sessionRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', gap: 2 },
  sessionMeta: { fontSize: 12, color: '#666' },
  successText: { fontSize: 13, fontWeight: '600', color: '#16a34a' },
  failText: { fontSize: 13, fontWeight: '600', color: '#dc2626' },
  warnText: { fontSize: 13, color: '#d97706' },
  mutedText: { fontSize: 13, color: '#aaa' },
  mono: { fontSize: 11, fontFamily: 'monospace', color: '#999' },
  conflictRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#fef3c7' },
  conflictDetail: { fontSize: 12, color: '#666', marginTop: 2 },
  taskSnap: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  taskSnapTitle: { fontSize: 12, color: '#444', flex: 1 },
  taskSnapStatus: { fontSize: 11, fontFamily: 'monospace' },
});